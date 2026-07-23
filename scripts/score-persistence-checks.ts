/**
 * Versioned score persistence checks — run with: npm run checks:score-persist
 *
 * Live DB, service-role. Proves the of-record policy WITHOUT any model call, by
 * driving the record_attempt_score RPC with synthetic score payloads:
 *   1. first score → version 1, of-record, mirrored to the attempt
 *   2. re-score (no promote) → new version, of-record UNCHANGED (record kept)
 *   3. re-score with promote → new version becomes of-record, re-mirrored
 *   4. candidates cannot touch attempt_scores (no read, no write)
 * Creates throwaway data; cleans up after itself.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  } catch {
    // rely on process env
  }
}
loadEnvLocal();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

const STAMP = Date.now();
const cleanup: Array<() => Promise<void>> = [];

function content() {
  return {
    patient: { name: "Score Patient", age: 40, gender: "male", presentation: "x", personaNotes: "" },
    openingStatement: "Hello.",
    difficultyTiers: {
      tier1: { concealmentLevel: "explicit", description: "a" },
      tier2: { concealmentLevel: "partial", description: "b" },
      tier3: { concealmentLevel: "concealed", description: "c" },
    },
    withheldFacts: [],
    questionPool: [
      { id: "qs1", category: "safety", text: "s1?", expectedElements: [], checkIn: true },
      { id: "ql1", category: "lifestyle", text: "l1?", expectedElements: [], checkIn: false },
    ],
    jargonBank: [],
    closing: { teachBackRequired: true, mustCover: ["x"] },
    scoring: {
      domains: [
        { key: "clinical-reasoning", weight: 20 }, { key: "safety", weight: 20 },
        { key: "professionalism", weight: 20 }, { key: "communication", weight: 20 },
        { key: "structure", weight: 20 },
      ],
      passThreshold: 65,
      criticalFlags: [{ id: "cf", description: "flag" }],
    },
    bridge: { miniCases: [], mcqs: [], pearls: [], frameworks: [] },
  };
}

const ds = (n: number) => ({ "clinical-reasoning": n, safety: n, professionalism: n, communication: n, structure: n });

async function record(
  attemptId: string,
  userId: string,
  agg: number,
  crit: boolean,
  bridge: boolean,
  tag: string,
  promote = false,
): Promise<{ version: number; ofRecord: boolean }> {
  const { data, error } = await service.rpc("record_attempt_score", {
    p_attempt: attemptId,
    p_user: userId,
    p_domain_scores: ds(agg),
    p_aggregate: agg,
    p_critical_failed: crit,
    p_bridge_triggered: bridge,
    p_detail: { tag },
    p_model: `test-${tag}`,
    p_promote: promote,
  });
  if (error) throw new Error(error.message);
  return data as { version: number; ofRecord: boolean };
}

async function attemptRow(id: string) {
  const { data } = await service
    .from("attempts")
    .select("aggregate, critical_failed, scoring_model, score_detail")
    .eq("id", id)
    .single();
  return data!;
}

async function scoreRows(attemptId: string) {
  const { data } = await service
    .from("attempt_scores")
    .select("version, is_of_record, aggregate, scoring_model")
    .eq("attempt_id", attemptId)
    .order("version");
  return data ?? [];
}

async function main(): Promise<void> {
  console.log("\nVersioned score persistence checks (live)\n");

  // ---- setup: enabled station + candidate + a COMPLETED attempt ----
  const { data: spec } = await service.from("specialties").select("id").limit(1).single();
  const { data: stationId, error: stErr } = await service.rpc("create_station_draft", {
    p_code: `SCK-${STAMP}`, p_title: "score check", p_specialty: spec!.id,
    p_levels: ["resident"], p_content: content(), p_created_by: null,
  });
  if (stErr) throw new Error(stErr.message);
  cleanup.push(async () => { await service.from("stations").delete().eq("id", stationId); });
  await service.rpc("set_station_status", { p_station: stationId, p_next: "enabled" });
  const { data: version } = await service
    .from("station_versions").select("id").eq("station_id", stationId).single();

  const email = `score-check-${STAMP}@example.com`;
  const password = `pw-${STAMP}!x`;
  const { data: userData, error: userErr } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (userErr) throw new Error(userErr.message);
  const userId = userData.user!.id;
  cleanup.push(async () => {
    await service.from("attempts").delete().eq("user_id", userId);
    await service.auth.admin.deleteUser(userId);
  });
  await service.from("profiles").insert({ id: userId, role: "candidate", training_level: "resident" });

  const { data: attempt, error: attErr } = await service
    .from("attempts")
    .insert({
      user_id: userId,
      station_version_id: version!.id,
      mode: "exam",
      transcript: [],
      completed_at: new Date().toISOString(),
      engine_config: { tier: 2, sampledQuestionIds: ["qs1", "ql1"] },
    })
    .select("id")
    .single();
  if (attErr) throw new Error(attErr.message);
  const attemptId = attempt!.id;

  // ---- 1. first score → version 1, of-record, mirrored ----
  const v1 = await record(attemptId, userId, 70, false, false, "v1");
  check("first score → version 1, of-record", v1.version === 1 && v1.ofRecord === true);
  check("first score mirrored to attempt (aggregate 70)", (await attemptRow(attemptId)).aggregate === 70);

  // ---- 2. re-score without promote → new version, record UNCHANGED ----
  const v2 = await record(attemptId, userId, 88, false, false, "v2");
  check("re-score → version 2, NOT of-record", v2.version === 2 && v2.ofRecord === false);
  const afterV2 = await attemptRow(attemptId);
  check("re-score does NOT change the of-record result (attempt still 70)", afterV2.aggregate === 70,
    `attempt.aggregate=${afterV2.aggregate}`);
  check("re-score did not re-mirror the model", afterV2.scoring_model === "test-v1");
  const rowsAfterV2 = await scoreRows(attemptId);
  check("two versions stored; of-record still v1",
    rowsAfterV2.length === 2 && rowsAfterV2.filter((r) => r.is_of_record).length === 1
      && rowsAfterV2.find((r) => r.is_of_record)!.version === 1);

  // ---- 3. promote a re-score → becomes of-record, re-mirrored ----
  const v3 = await record(attemptId, userId, 40, true, true, "v3", true);
  check("promote → version 3, of-record", v3.version === 3 && v3.ofRecord === true);
  const afterV3 = await attemptRow(attemptId);
  check("promote DOES change the of-record result (attempt now 40, critical)",
    afterV3.aggregate === 40 && afterV3.critical_failed === true && afterV3.scoring_model === "test-v3");
  const rowsAfterV3 = await scoreRows(attemptId);
  check("exactly one of-record row, and it is v3",
    rowsAfterV3.filter((r) => r.is_of_record).length === 1
      && rowsAfterV3.find((r) => r.is_of_record)!.version === 3);
  check("three versions retained (history preserved)", rowsAfterV3.length === 3);

  // ---- 4. candidates cannot touch attempt_scores ----
  const candidate = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await candidate.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(signInErr.message);

  const { data: candRead } = await candidate.from("attempt_scores").select("id").eq("attempt_id", attemptId);
  check("candidate cannot READ attempt_scores (admin-only RLS)", (candRead ?? []).length === 0);

  const { error: candInsert } = await candidate.from("attempt_scores").insert({
    attempt_id: attemptId, version: 99, is_of_record: true, aggregate: 100,
  });
  check("candidate cannot INSERT attempt_scores", !!candInsert);

  const { data: candUpdate } = await candidate.from("attempt_scores")
    .update({ aggregate: 100 }).eq("attempt_id", attemptId).select("id");
  check("candidate cannot UPDATE attempt_scores", (candUpdate ?? []).length === 0);

  // ---- 5. RPC still guards completion ----
  const { data: openAttempt } = await service
    .from("attempts")
    .insert({ user_id: userId, station_version_id: version!.id, mode: "exam", transcript: [] })
    .select("id")
    .single();
  let notCompleted = false;
  const { error: openErr } = await service.rpc("record_attempt_score", {
    p_attempt: openAttempt!.id, p_user: userId, p_domain_scores: ds(50), p_aggregate: 50,
    p_critical_failed: false, p_bridge_triggered: false, p_detail: {}, p_model: "x", p_promote: false,
  });
  notCompleted = !!openErr && openErr.message.includes("not_completed");
  check("RPC refuses to score an un-completed attempt", notCompleted, openErr?.message ?? "");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Checks errored:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const fn of cleanup.reverse()) {
      try { await fn(); } catch (err) { console.error("cleanup:", err instanceof Error ? err.message : err); }
    }
  });
