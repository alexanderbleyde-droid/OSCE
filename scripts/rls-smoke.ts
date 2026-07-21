/**
 * RLS smoke test — run with: npm run rls:smoke
 * (Node 24 strips types natively; no build step needed.)
 *
 * Proves, against the real database:
 *   1. anon has no access to anything
 *   2. a candidate CANNOT see a draft station (only enabled ones)
 *   3. a candidate CANNOT read or update another user's attempt
 *   plus positive controls (enabled station visible, own attempt readable)
 *   and a role-escalation check (candidate cannot set own role=admin).
 *
 * Creates throwaway users/stations via service role, cleans up after itself.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// --- tiny .env.local loader (no extra dependency) ---
function loadEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  } catch {
    // .env.local absent — rely on process env
  }
}
loadEnvLocal();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON_KEY || !SERVICE_KEY) {
  console.error(
    "Missing env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (put them in .env.local)",
  );
  process.exit(1);
}

const service = createClient(URL, SERVICE_KEY, {
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

async function makeUser(
  email: string,
  password: string,
): Promise<{ id: string; client: SupabaseClient }> {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  const client = createClient(URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw new Error(`signIn ${email}: ${signInError.message}`);
  return { id: data.user.id, client };
}

const STAMP = Date.now();
const cleanup: Array<() => Promise<void>> = [];

async function main(): Promise<void> {
  console.log("RLS smoke test\n");

  // --- fixtures (service role bypasses RLS) ---
  const candidateA = await makeUser(`rls-smoke-a-${STAMP}@example.com`, `pw-A-${STAMP}!x`);
  const candidateB = await makeUser(`rls-smoke-b-${STAMP}@example.com`, `pw-B-${STAMP}!x`);
  cleanup.push(async () => {
    await service.auth.admin.deleteUser(candidateA.id);
    await service.auth.admin.deleteUser(candidateB.id);
  });

  for (const id of [candidateA.id, candidateB.id]) {
    const { error } = await service.from("profiles").insert({ id, role: "candidate" });
    if (error) throw new Error(`profile insert: ${error.message}`);
  }

  const { data: spec, error: specError } = await service
    .from("specialties")
    .select("id")
    .eq("name", "Physical Medicine & Rehabilitation")
    .single();
  if (specError || !spec) throw new Error(`specialty lookup: ${specError?.message}`);

  const content = {
    patient: { name: "Test Patient", age: 44, gender: "female", presentation: "test", personaNotes: "" },
    openingStatement: "Hello doctor.",
    difficultyTiers: {
      tier1: { concealmentLevel: "explicit", description: "t1" },
      tier2: { concealmentLevel: "partial", description: "t2" },
      tier3: { concealmentLevel: "concealed", description: "t3" },
    },
    withheldFacts: [],
    questionPool: [
      { id: "q1", category: "safety", text: "s?", expectedElements: [], checkIn: false },
      { id: "q2", category: "lifestyle", text: "l?", expectedElements: [], checkIn: false },
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
      criticalFlags: [{ id: "cf1", description: "test flag" }],
    },
    bridge: { miniCases: [], mcqs: [], pearls: [], frameworks: [] },
  };

  async function makeStation(code: string, status: "draft" | "enabled") {
    const { data: st, error: stErr } = await service
      .from("stations")
      .insert({ code, title: `${code} station`, specialty_id: spec!.id, training_levels: ["resident"] })
      .select("id")
      .single();
    if (stErr || !st) throw new Error(`station insert: ${stErr?.message}`);
    const { data: ver, error: verErr } = await service
      .from("station_versions")
      .insert({ station_id: st.id, version: 1, content })
      .select("id")
      .single();
    if (verErr || !ver) throw new Error(`version insert: ${verErr?.message}`);
    const { error: updErr } = await service
      .from("stations")
      .update({ current_version: 1, status })
      .eq("id", st.id);
    if (updErr) throw new Error(`station update: ${updErr.message}`);
    return { stationId: st.id, versionId: ver.id };
  }

  const draft = await makeStation(`RLS-DRAFT-${STAMP}`, "draft");
  const enabled = await makeStation(`RLS-ENABLED-${STAMP}`, "enabled");
  cleanup.push(async () => {
    await service.from("attempts").delete().in("station_version_id", [draft.versionId, enabled.versionId]);
    await service.from("stations").delete().in("id", [draft.stationId, enabled.stationId]);
  });

  // Candidate A starts their own attempt through the client path (RLS +
  // column grants must allow this).
  const { data: attemptA, error: attErr } = await candidateA.client
    .from("attempts")
    .insert({ user_id: candidateA.id, station_version_id: enabled.versionId, mode: "exam" })
    .select("id")
    .single();
  if (attErr || !attemptA) throw new Error(`candidate attempt insert (should be allowed): ${attErr?.message}`);

  // --- 1. anonymous access ---
  const anon = createClient(URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  for (const table of ["stations", "station_versions", "attempts", "profiles", "specialties"]) {
    const { data, error } = await anon.from(table).select("*").limit(1);
    check(`anon blocked from ${table}`, !!error || (data ?? []).length === 0,
      error ? `` : `got ${data?.length} rows`);
  }

  // --- 2. candidate vs stations ---
  const { data: visibleStations } = await candidateA.client
    .from("stations")
    .select("id, code, status")
    .in("id", [draft.stationId, enabled.stationId]);
  const codes = (visibleStations ?? []).map((s) => s.id);
  check("candidate blocked from DRAFT station", !codes.includes(draft.stationId),
    "draft station visible to candidate!");
  check("candidate sees ENABLED station (positive control)", codes.includes(enabled.stationId),
    "enabled station not visible — policies may be over-restrictive");

  // station_versions.content is the examiner pack (answer key) — candidates
  // must not read ANY version row, enabled or not.
  const { data: anyVersion } = await candidateA.client
    .from("station_versions")
    .select("id")
    .in("id", [draft.versionId, enabled.versionId]);
  check("candidate blocked from ALL station_versions (answer key)", (anyVersion ?? []).length === 0,
    "examiner content readable by candidate!");

  const { data: embedded } = await candidateA.client
    .from("attempts")
    .select("id, station_versions(content)")
    .eq("user_id", candidateA.id);
  const leakedContent = (embedded ?? []).some(
    (row) => (row as { station_versions: unknown }).station_versions != null,
  );
  check("candidate blocked from answer key via attempts embedding", !leakedContent,
    "content leaked through PostgREST resource embedding!");

  // --- 3. attempts isolation ---
  const { data: ownAttempt } = await candidateA.client
    .from("attempts")
    .select("id")
    .eq("id", attemptA.id);
  check("candidate A reads own attempt (positive control)", (ownAttempt ?? []).length === 1);

  const { data: foreignAttempt } = await candidateB.client
    .from("attempts")
    .select("id")
    .eq("id", attemptA.id);
  check("candidate B blocked from A's attempt (read)", (foreignAttempt ?? []).length === 0,
    "another user's attempt is readable!");

  const { data: foreignUpdate } = await candidateB.client
    .from("attempts")
    .update({ transcript: [{ tampered: true }] })
    .eq("id", attemptA.id)
    .select("id");
  check("candidate B blocked from A's attempt (write)", (foreignUpdate ?? []).length === 0,
    "another user's attempt is writable!");

  // --- 4. grade tampering (scoring columns are server-authored) ---
  const { error: selfScoreInsert } = await candidateA.client
    .from("attempts")
    .insert({
      user_id: candidateA.id,
      station_version_id: enabled.versionId,
      mode: "exam",
      aggregate: 100,
      critical_failed: false,
    });
  check("candidate cannot INSERT self-scored attempt", !!selfScoreInsert,
    "aggregate/critical_failed insertable by candidate!");

  const { error: selfScoreUpdate } = await candidateA.client
    .from("attempts")
    .update({ aggregate: 100, domain_scores: { safety: 100 } })
    .eq("id", attemptA.id);
  check("candidate cannot UPDATE own scores", !!selfScoreUpdate,
    "scoring columns updatable by candidate!");

  const { data: transcriptUpdate, error: transcriptErr } = await candidateA.client
    .from("attempts")
    .update({ transcript: [{ role: "candidate", content: "hello" }] })
    .eq("id", attemptA.id)
    .select("id");
  check("candidate CAN update own transcript (positive control)",
    !transcriptErr && (transcriptUpdate ?? []).length === 1, transcriptErr?.message ?? "");

  // --- 5. past-attempt reportability: station METADATA stays visible after
  //        disable; version content stays hidden ---
  const { error: disableErr } = await service
    .from("stations")
    .update({ status: "disabled" })
    .eq("id", enabled.stationId);
  if (disableErr) throw new Error(`disable station: ${disableErr.message}`);

  const { data: attemptedStation } = await candidateA.client
    .from("stations")
    .select("id, title, status")
    .eq("id", enabled.stationId);
  check("candidate still sees METADATA of attempted+disabled station",
    (attemptedStation ?? []).length === 1,
    "attempt history would show opaque UUIDs");

  const { data: otherView } = await candidateB.client
    .from("stations")
    .select("id")
    .eq("id", enabled.stationId);
  check("candidate WITHOUT attempt no longer sees disabled station",
    (otherView ?? []).length === 0);

  // --- 6. role escalation ---
  const { error: escalationError } = await candidateA.client
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", candidateA.id);
  check("candidate cannot self-promote to admin", !!escalationError,
    "role column was updatable by a candidate!");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("\nSmoke test errored:", err instanceof Error ? err.message : err);
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
