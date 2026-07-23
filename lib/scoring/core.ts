import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttemptMode } from "../contracts/db.ts";
import { stationContentSchema } from "../contracts/station.ts";
import { parseTranscript } from "../engine/transcript.ts";
import { deriveScoringFacts } from "./facts.ts";
import { assembleScore, type ScoreResult } from "./assemble.ts";
import { runRubric } from "./rubric.ts";

/**
 * Scoring orchestrator core — shared by the server wrapper (lib/data/scoring)
 * and the scoring script. Deliberately NOT `server-only`: the caller injects
 * the (service-role) Supabase client, exactly like startAttemptCore. Loads the
 * completed attempt, derives deterministic facts, runs the AI rubric, assembles
 * the authoritative score, and persists it via the score_attempt RPC.
 *
 * Bump SCORER_VERSION when the scoring logic changes, so stored results are
 * versioned and a re-run is attributable.
 */
export const SCORER_VERSION = 1;

export type ScoreAttemptOutcome =
  | { ok: true; result: ScoreResult; model: string; version: number; ofRecord: boolean }
  | { ok: false; reason: "attempt_not_found" | "not_completed" | "bad_content" };

export async function scoreAttemptCore(
  admin: SupabaseClient,
  attemptId: string,
  opts: { promote?: boolean } = {},
): Promise<ScoreAttemptOutcome> {
  const { data: attempt, error } = await admin
    .from("attempts")
    .select("id, user_id, mode, transcript, engine_config, completed_at, station_version_id")
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw new Error(`scoreAttempt load: ${error.message}`);
  if (!attempt) return { ok: false, reason: "attempt_not_found" };
  if (!attempt.completed_at) return { ok: false, reason: "not_completed" };

  const { data: version, error: verErr } = await admin
    .from("station_versions")
    .select("content")
    .eq("id", attempt.station_version_id)
    .single();
  if (verErr) throw new Error(`scoreAttempt version: ${verErr.message}`);

  const parsed = stationContentSchema.safeParse(version.content);
  if (!parsed.success) return { ok: false, reason: "bad_content" };
  const content = parsed.data;

  const config = (attempt.engine_config ?? {}) as {
    tier?: 1 | 2 | 3;
    endState?: { teachBackMissedCriticalFail?: boolean } | null;
  };
  const tier = (config.tier ?? 2) as 1 | 2 | 3;
  const transcript = parseTranscript(attempt.transcript);
  const facts = deriveScoringFacts(content, transcript, config.endState ?? null);

  const { result: rubric, model } = await runRubric({
    content,
    transcript,
    facts,
    tier,
    mode: attempt.mode as AttemptMode,
  });

  // Belt-and-braces: the rubric schema already requires exactly the station's
  // domain keys, but never trust the model's shape — fail closed (re-scorable)
  // rather than silently scoring an un-graded domain 0.
  const rubricKeys = new Set(rubric.domains.map((d) => d.key));
  const missing = content.scoring.domains.filter((d) => !rubricKeys.has(d.key));
  if (missing.length > 0 || rubricKeys.size !== rubric.domains.length) {
    throw new Error(`scoreAttempt: rubric did not grade all domains exactly once (missing: ${missing.map((d) => d.key).join(", ") || "none"})`);
  }

  const score = assembleScore(content, rubric, facts, tier);

  const { data: recorded, error: writeErr } = await admin.rpc("record_attempt_score", {
    p_attempt: attempt.id,
    p_user: attempt.user_id,
    p_domain_scores: score.domainScores,
    p_aggregate: score.aggregate,
    p_critical_failed: score.criticalFailed,
    p_bridge_triggered: score.bridgeTriggered,
    p_detail: {
      scorerVersion: SCORER_VERSION,
      passed: score.passed,
      passThreshold: content.scoring.passThreshold,
      domains: score.domains,
      triggeredFlags: score.triggeredFlags,
      bridgeReasons: score.bridgeReasons,
      constructScores: score.constructScores,
    },
    p_model: model,
    p_promote: opts.promote ?? false,
  });
  if (writeErr) throw new Error(`scoreAttempt write: ${writeErr.message}`);
  const meta = (recorded ?? { version: 0, ofRecord: false }) as { version: number; ofRecord: boolean };

  return { ok: true, result: score, model, version: meta.version, ofRecord: meta.ofRecord };
}
