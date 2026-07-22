/**
 * Versioning proof — run with: node scripts/version-proof.ts
 *
 * Proves, against the live database:
 *   1. enabling publishes v1; an attempt then references v1;
 *   2. editing the ENABLED station creates v2 (v1 untouched);
 *   3. enabling again bumps current_version to 2;
 *   4. the v1-referencing attempt STILL resolves: FK intact, v1 row
 *      present with its ORIGINAL content;
 *   5. v1 is immutable while referenced (update AND delete rejected).
 *
 * Creates throwaway data, cleans up after itself.
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

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

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

function gateValidContent(marker: string) {
  return {
    patient: { name: "Proof Patient", age: 50, gender: "female", presentation: marker, personaNotes: "" },
    openingStatement: "Hello doctor.",
    difficultyTiers: {
      tier1: { concealmentLevel: "explicit", description: "t1" },
      tier2: { concealmentLevel: "partial", description: "t2" },
      tier3: { concealmentLevel: "concealed", description: "t3" },
    },
    withheldFacts: [],
    questionPool: [
      { id: "qs", category: "safety", text: "safety?", expectedElements: ["x"], checkIn: true },
      { id: "ql", category: "lifestyle", text: "lifestyle?", expectedElements: ["y"], checkIn: false },
    ],
    jargonBank: [],
    closing: { teachBackRequired: true, mustCover: ["follow-up"] },
    scoring: {
      domains: [
        { key: "clinical-reasoning", weight: 20 }, { key: "safety", weight: 20 },
        { key: "professionalism", weight: 20 }, { key: "communication", weight: 20 },
        { key: "structure", weight: 20 },
      ],
      passThreshold: 65,
      criticalFlags: [{ id: "cf", description: "misses red flag" }],
    },
    bridge: { miniCases: [], mcqs: [], pearls: [], frameworks: [] },
  };
}

const STAMP = Date.now();
const cleanup: Array<() => Promise<void>> = [];

async function main(): Promise<void> {
  console.log("Versioning proof\n");

  const { data: spec } = await service.from("specialties").select("id").limit(1).single();

  // --- create + enable v1 ---
  const { data: stationId, error: createErr } = await service.rpc("create_station_draft", {
    p_code: `PROOF-${STAMP}`,
    p_title: "Versioning proof station",
    p_specialty: spec!.id,
    p_levels: ["resident"],
    p_content: gateValidContent("V1-MARKER"),
    p_created_by: null,
  });
  if (createErr) throw new Error(`create: ${createErr.message}`);
  cleanup.push(async () => {
    await service.from("stations").delete().eq("id", stationId);
  });

  const { data: cv1, error: enable1Err } = await service.rpc("set_station_status", {
    p_station: stationId,
    p_next: "enabled",
  });
  check("enable publishes v1 (current_version=1)", !enable1Err && cv1 === 1, enable1Err?.message ?? `got ${cv1}`);

  const { data: v1row } = await service
    .from("station_versions")
    .select("id, version")
    .eq("station_id", stationId)
    .eq("version", 1)
    .single();

  // --- attempt referencing v1 ---
  const { data: userData, error: userErr } = await service.auth.admin.createUser({
    email: `proof-${STAMP}@example.com`,
    password: `pw-${STAMP}!x`,
    email_confirm: true,
  });
  if (userErr || !userData.user) throw new Error(`user: ${userErr?.message}`);
  const userId = userData.user.id;
  cleanup.push(async () => {
    await service.auth.admin.deleteUser(userId);
  });
  await service.from("profiles").insert({ id: userId, role: "candidate" });

  const { data: attempt, error: attErr } = await service
    .from("attempts")
    .insert({ user_id: userId, station_version_id: v1row!.id, mode: "exam" })
    .select("id")
    .single();
  if (attErr) throw new Error(`attempt: ${attErr.message}`);
  cleanup.push(async () => {
    await service.from("attempts").delete().eq("id", attempt!.id);
  });
  check("attempt created referencing v1", !!attempt);

  // --- edit the ENABLED station -> must create v2 ---
  const { data: savedVersion, error: saveErr } = await service.rpc("save_station_version", {
    p_station: stationId,
    p_code: `PROOF-${STAMP}`,
    p_title: "Versioning proof station (edited)",
    p_specialty: spec!.id,
    p_levels: ["resident"],
    p_content: gateValidContent("V2-MARKER"),
    p_expected_version: 1,
  });
  check("editing enabled station creates v2", !saveErr && savedVersion === 2, saveErr?.message ?? `got v${savedVersion}`);

  const { data: v1after } = await service
    .from("station_versions")
    .select("content")
    .eq("id", v1row!.id)
    .single();
  check(
    "v1 content untouched by the edit",
    (v1after!.content as { patient: { presentation: string } }).patient.presentation === "V1-MARKER",
  );

  const { data: stationMid } = await service
    .from("stations")
    .select("status, current_version")
    .eq("id", stationId)
    .single();
  check(
    "station stays enabled at v1 while v2 is an unpublished draft",
    stationMid!.status === "enabled" && stationMid!.current_version === 1,
    JSON.stringify(stationMid),
  );

  // --- publish v2 ---
  const { data: cv2, error: enable2Err } = await service.rpc("set_station_status", {
    p_station: stationId,
    p_next: "enabled",
  });
  check("re-enabling bumps current_version to 2", !enable2Err && cv2 === 2, enable2Err?.message ?? `got ${cv2}`);

  // --- THE CHECKPOINT PROOF: the v1 attempt still resolves ---
  const { data: resolved, error: resolveErr } = await service
    .from("attempts")
    .select("id, station_versions(version, content, station_id)")
    .eq("id", attempt!.id)
    .single();
  const resolvedVersion = resolved?.station_versions as unknown as {
    version: number;
    content: { patient: { presentation: string } };
    station_id: string;
  } | null;
  check(
    "attempt referencing v1 STILL resolves after v2 is enabled",
    !resolveErr &&
      resolvedVersion?.version === 1 &&
      resolvedVersion?.content.patient.presentation === "V1-MARKER" &&
      resolvedVersion?.station_id === stationId,
    resolveErr?.message ?? JSON.stringify(resolvedVersion?.version),
  );

  // --- immutability of the referenced version ---
  const { error: mutateErr } = await service
    .from("station_versions")
    .update({ content: gateValidContent("TAMPERED") })
    .eq("id", v1row!.id);
  check(
    "v1 (attempt-referenced) rejects UPDATE (immutability trigger)",
    !!mutateErr && mutateErr.message.includes("immutable"),
    mutateErr?.message ?? "update went through!",
  );

  const { error: deleteErr } = await service
    .from("station_versions")
    .delete()
    .eq("id", v1row!.id);
  check(
    "v1 (attempt-referenced) rejects DELETE",
    !!deleteErr,
    deleteErr ? "" : "delete went through!",
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Proof errored:", err instanceof Error ? err.message : err);
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
