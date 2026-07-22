/**
 * Attempt-start core — shared by the server action and scripted checks.
 * Deliberately NOT "server-only": callers inject the (service-role) client.
 * Auth/authorization happens in the callers; this module enforces the
 * DOMAIN rules: enabled stations only, level/specialty eligibility,
 * one-time sampling, resume-instead-of-duplicate.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttemptMode, TrainingLevel } from "@/lib/contracts/db";
import type { StationContent } from "@/lib/contracts/station";
import { sampleQuestions } from "./sampling.ts";

/** AI Dial default: the tier follows the candidate's training level
 *  (reference AS S0: Basic / Intermediate / Advanced-concealed). */
export function levelToTier(level: TrainingLevel | null): 1 | 2 | 3 {
  switch (level) {
    case "student":
      return 1;
    case "physician":
      return 3;
    case "resident":
    default:
      return 2;
  }
}

export const TIER_LABELS: Record<1 | 2 | 3, string> = {
  1: "Tier 1 · Basic (explicit)",
  2: "Tier 2 · Intermediate",
  3: "Tier 3 · Advanced (concealed)",
};

export type AttemptStartErrorCode =
  | "station_not_found"
  | "station_not_enabled"
  | "level_mismatch"
  | "specialty_mismatch";

export class AttemptStartError extends Error {
  readonly code: AttemptStartErrorCode;
  constructor(code: AttemptStartErrorCode, message: string) {
    super(message);
    this.name = "AttemptStartError";
    this.code = code;
  }
}

export type StartAttemptInput = {
  userId: string;
  stationId: string;
  mode: AttemptMode;
  profile: {
    training_level: TrainingLevel | null;
    specialty_id: string | null;
  };
};

export type StartAttemptResult = {
  attemptId: string;
  resumed: boolean;
  tier: 1 | 2 | 3;
  sampledQuestionIds: string[];
};

export async function startAttemptCore(
  admin: SupabaseClient,
  input: StartAttemptInput,
): Promise<StartAttemptResult> {
  const { data: station, error: stationErr } = await admin
    .from("stations")
    .select("id, status, specialty_id, training_levels, current_version")
    .eq("id", input.stationId)
    .maybeSingle();
  if (stationErr) throw new Error(`startAttempt station: ${stationErr.message}`);
  if (!station) {
    throw new AttemptStartError("station_not_found", "Station not found");
  }
  if (station.status !== "enabled" || station.current_version === null) {
    throw new AttemptStartError(
      "station_not_enabled",
      "This station is not currently available",
    );
  }
  if (
    input.profile.training_level &&
    station.training_levels.length > 0 &&
    !station.training_levels.includes(input.profile.training_level)
  ) {
    throw new AttemptStartError(
      "level_mismatch",
      "This station is not offered for your training level",
    );
  }
  if (
    input.profile.specialty_id &&
    station.specialty_id !== input.profile.specialty_id
  ) {
    throw new AttemptStartError(
      "specialty_mismatch",
      "This station belongs to a different specialization",
    );
  }

  const { data: version, error: versionErr } = await admin
    .from("station_versions")
    .select("id, content")
    .eq("station_id", station.id)
    .eq("version", station.current_version)
    .single();
  if (versionErr) throw new Error(`startAttempt version: ${versionErr.message}`);

  // Resume an incomplete attempt on the same version — starting again must
  // NEVER re-roll the sampled set.
  const { data: existing, error: existingErr } = await admin
    .from("attempts")
    .select("id, engine_config")
    .eq("user_id", input.userId)
    .eq("station_version_id", version.id)
    .is("completed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingErr) throw new Error(`startAttempt existing: ${existingErr.message}`);
  if (existing) {
    const config = existing.engine_config as {
      tier: 1 | 2 | 3;
      sampledQuestionIds: string[];
    };
    return {
      attemptId: existing.id,
      resumed: true,
      tier: config.tier,
      sampledQuestionIds: config.sampledQuestionIds,
    };
  }

  const content = version.content as StationContent;
  const sampled = sampleQuestions(content.questionPool);
  const tier = levelToTier(input.profile.training_level);

  // Seed the transcript with the patient's scripted opening so a refresh
  // resumes the same encounter from turn one.
  const openingSeed = content.openingStatement
    ? [
        {
          role: "patient",
          text: content.openingStatement,
          at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
        },
      ]
    : [];

  const { data: attempt, error: insertErr } = await admin
    .from("attempts")
    .insert({
      user_id: input.userId,
      station_version_id: version.id,
      mode: input.mode,
      engine_config: { tier, sampledQuestionIds: sampled.map((q) => q.id) },
      transcript: openingSeed,
    })
    .select("id")
    .single();
  if (insertErr) throw new Error(`startAttempt insert: ${insertErr.message}`);

  return {
    attemptId: attempt.id,
    resumed: false,
    tier,
    sampledQuestionIds: sampled.map((q) => q.id),
  };
}
