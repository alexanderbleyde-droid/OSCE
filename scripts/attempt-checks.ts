/**
 * Attempt-start checks — run with: npm run checks:attempt
 *   1. sampling constraints (pure, 500 iterations)
 *   2. live: start creates attempt with server-authored engine_config
 *   3. live: re-start resumes, NEVER re-rolls
 *   4. live: draft station denied (engine) + RLS insert denied (candidate)
 *   5. live: candidate cannot tamper with engine_config (column grants)
 *   6. live: level mismatch denied
 * Creates throwaway data; cleans up after itself.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { sampleQuestions } from "../lib/engine/sampling.ts";
import { startAttemptCore, AttemptStartError, levelToTier } from "../lib/engine/attempts.ts";

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
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---------- 1. sampling (pure) ----------
const pool = [
  { id: "s1", category: "safety" as const },
  { id: "s2", category: "safety" as const },
  { id: "l1", category: "lifestyle" as const },
  { id: "l2", category: "lifestyle" as const },
  { id: "l3", category: "lifestyle" as const },
  { id: "g1", category: "general" as const },
  { id: "g2", category: "general" as const },
];
let sizeOk = true;
let safetyOk = true;
let lifestyleOk = true;
let uniqueOk = true;
const sizes = new Set<number>();
for (let i = 0; i < 500; i++) {
  const s = sampleQuestions(pool);
  sizes.add(s.length);
  if (s.length < 2 || s.length > 3) sizeOk = false;
  if (!s.some((q) => q.category === "safety")) safetyOk = false;
  if (!s.some((q) => q.category === "lifestyle")) lifestyleOk = false;
  if (new Set(s.map((q) => q.id)).size !== s.length) uniqueOk = false;
}
check("sampling: always 2-3 questions (500 runs)", sizeOk);
check("sampling: always >=1 safety", safetyOk);
check("sampling: always >=1 lifestyle", lifestyleOk);
check("sampling: no duplicates", uniqueOk);
check("sampling: both sizes 2 and 3 occur", sizes.has(2) && sizes.has(3), [...sizes].join(","));
check("sampling: tiny pool returns whole pool", sampleQuestions(pool.slice(0, 1)).length === 1);
check("tier mapping student/resident/physician -> 1/2/3",
  levelToTier("student") === 1 && levelToTier("resident") === 2 && levelToTier("physician") === 3 && levelToTier(null) === 2);

// ---------- live checks ----------
const STAMP = Date.now();
const cleanup: Array<() => Promise<void>> = [];

function content(marker: string) {
  return {
    patient: { name: "Check Patient", age: 40, gender: "male", presentation: marker, personaNotes: "" },
    openingStatement: "Hello.",
    difficultyTiers: {
      tier1: { concealmentLevel: "explicit", description: "a" },
      tier2: { concealmentLevel: "partial", description: "b" },
      tier3: { concealmentLevel: "concealed", description: "c" },
    },
    withheldFacts: [],
    questionPool: [
      { id: "qs1", category: "safety", text: "s1?", expectedElements: [], checkIn: true },
      { id: "qs2", category: "safety", text: "s2?", expectedElements: [], checkIn: false },
      { id: "ql1", category: "lifestyle", text: "l1?", expectedElements: [], checkIn: false },
      { id: "qg1", category: "general", text: "g1?", expectedElements: [], checkIn: false },
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

async function makeStation(code: string, enable: boolean): Promise<string> {
  const { data: spec } = await service.from("specialties").select("id").limit(1).single();
  const { data: id, error } = await service.rpc("create_station_draft", {
    p_code: code, p_title: `${code} station`, p_specialty: spec!.id,
    p_levels: ["resident"], p_content: content(code), p_created_by: null,
  });
  if (error) throw new Error(error.message);
  if (enable) {
    const { error: e } = await service.rpc("set_station_status", { p_station: id, p_next: "enabled" });
    if (e) throw new Error(e.message);
  }
  cleanup.push(async () => {
    await service.from("stations").delete().eq("id", id);
  });
  return id as string;
}

async function main(): Promise<void> {
  console.log("\nAttempt-start checks (live)\n");

  const enabledId = await makeStation(`CHK-EN-${STAMP}`, true);
  const draftId = await makeStation(`CHK-DR-${STAMP}`, false);

  const email = `attempt-check-${STAMP}@example.com`;
  const password = `pw-${STAMP}!x`;
  const { data: userData, error: userErr } = await service.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (userErr) throw new Error(userErr.message);
  const userId = userData.user!.id;
  cleanup.push(async () => {
    await service.from("attempts").delete().eq("user_id", userId);
    await service.auth.admin.deleteUser(userId);
  });
  await service.from("profiles").insert({ id: userId, role: "candidate", training_level: "resident" });

  const profile = { training_level: "resident" as const, specialty_id: null };

  // 2. start creates attempt with engine config
  const first = await startAttemptCore(service, {
    userId, stationId: enabledId, mode: "exam", profile,
  });
  check("start: attempt created (not resumed)", !first.resumed);
  check("start: tier follows training level (resident -> 2)", first.tier === 2);
  check("start: 2-3 sampled ids persisted", first.sampledQuestionIds.length >= 2 && first.sampledQuestionIds.length <= 3);
  const sampledCats = first.sampledQuestionIds.map((qid) =>
    qid.startsWith("qs") ? "safety" : qid.startsWith("ql") ? "lifestyle" : "general",
  );
  check("start: sampled set includes safety + lifestyle",
    sampledCats.includes("safety") && sampledCats.includes("lifestyle"), sampledCats.join(","));

  // 3. re-start resumes with the SAME set (no re-roll)
  const second = await startAttemptCore(service, {
    userId, stationId: enabledId, mode: "exam", profile,
  });
  check("re-start: resumes the same attempt", second.resumed && second.attemptId === first.attemptId);
  check("re-start: sampled set identical (no re-roll)",
    JSON.stringify(second.sampledQuestionIds) === JSON.stringify(first.sampledQuestionIds));

  // 3b. cross-mode: resume is MODE-AWARE. Choosing tutor while an exam attempt
  // is in flight must create a SEPARATE tutor attempt, not resume the exam one.
  // Each mode then resumes its own attempt, keeping its own (once-rolled) set.
  const tutorStart = await startAttemptCore(service, {
    userId, stationId: enabledId, mode: "tutor", profile,
  });
  check("cross-mode: tutor request does NOT resume the in-flight exam attempt",
    !tutorStart.resumed && tutorStart.attemptId !== first.attemptId);

  const tutorResume = await startAttemptCore(service, {
    userId, stationId: enabledId, mode: "tutor", profile,
  });
  check("cross-mode: tutor re-start resumes its OWN attempt, no re-roll",
    tutorResume.resumed
      && tutorResume.attemptId === tutorStart.attemptId
      && JSON.stringify(tutorResume.sampledQuestionIds) === JSON.stringify(tutorStart.sampledQuestionIds));

  const examResumeAgain = await startAttemptCore(service, {
    userId, stationId: enabledId, mode: "exam", profile,
  });
  check("cross-mode: exam re-start still resumes the ORIGINAL exam attempt (per-attempt no re-roll)",
    examResumeAgain.resumed
      && examResumeAgain.attemptId === first.attemptId
      && JSON.stringify(examResumeAgain.sampledQuestionIds) === JSON.stringify(first.sampledQuestionIds));

  const { data: liveRows, error: liveErr } = await service
    .from("attempts")
    .select("id, mode")
    .eq("user_id", userId)
    .is("completed_at", null);
  if (liveErr) throw new Error(liveErr.message);
  const liveModes = (liveRows ?? []).map((r) => r.mode).sort();
  check("cross-mode: exactly two in-flight attempts coexist (one exam, one tutor)",
    liveRows?.length === 2 && JSON.stringify(liveModes) === JSON.stringify(["exam", "tutor"]),
    `rows: ${JSON.stringify(liveRows)}`);

  // 4a. draft station denied by the engine
  let draftDenied = false;
  try {
    await startAttemptCore(service, { userId, stationId: draftId, mode: "exam", profile });
  } catch (err) {
    draftDenied = err instanceof AttemptStartError && err.code === "station_not_enabled";
  }
  check("draft station: engine denies start", draftDenied);

  // 4b. draft station denied by RLS even on direct insert
  const candidate = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await candidate.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(signInErr.message);

  const { data: draftVersion } = await service
    .from("station_versions").select("id").eq("station_id", draftId).single();
  const { error: rlsErr } = await candidate.from("attempts").insert({
    user_id: userId, station_version_id: draftVersion!.id, mode: "exam",
  });
  check("draft station: RLS denies direct candidate insert", !!rlsErr);

  // 5. engine_config is tamper-proof for candidates
  const { error: tamperErr } = await candidate
    .from("attempts")
    .update({ engine_config: { tier: 1, sampledQuestionIds: [] } })
    .eq("id", first.attemptId);
  check("engine_config: candidate UPDATE denied (column grant)", !!tamperErr,
    tamperErr ? "" : "engine config was client-writable!");

  const { error: insertCfgErr } = await service
    .from("station_versions").select("id").eq("station_id", enabledId).single()
    .then(async ({ data: v }) => candidate.from("attempts").insert({
      user_id: userId, station_version_id: v!.id, mode: "exam",
      engine_config: { tier: 1, sampledQuestionIds: [] },
    }));
  check("engine_config: candidate INSERT-with-config denied", !!insertCfgErr);

  // 6. level mismatch denied
  let levelDenied = false;
  try {
    await startAttemptCore(service, {
      userId, stationId: enabledId, mode: "exam",
      profile: { training_level: "student", specialty_id: null },
    });
  } catch (err) {
    levelDenied = err instanceof AttemptStartError && err.code === "level_mismatch";
  }
  check("level mismatch: engine denies start", levelDenied);

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
      try {
        await fn();
      } catch (err) {
        console.error("cleanup:", err instanceof Error ? err.message : err);
      }
    }
  });
