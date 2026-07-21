/**
 * Seed throwaway DEMO draft stations for checkpoint browsing.
 *   node scripts/seed-demo-stations.ts          — create 3 demo drafts
 *   node scripts/seed-demo-stations.ts --clean  — remove all DEMO- stations
 *
 * Demo stations are prefixed "DEMO-" and safe to delete at any time.
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

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const service = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function demoContent(name: string, presentation: string) {
  return {
    patient: {
      name,
      age: 52,
      gender: "female",
      presentation,
      personaNotes: "Demo persona — throwaway seed data.",
    },
    openingStatement: "Thanks for seeing me, doctor.",
    difficultyTiers: {
      tier1: { concealmentLevel: "explicit", description: "Everything volunteered readily." },
      tier2: { concealmentLevel: "partial", description: "Key facts emerge on focused questioning." },
      tier3: { concealmentLevel: "concealed", description: "Construct must be recognised unprompted." },
    },
    withheldFacts: [
      {
        id: "wf1",
        fact: "Night pain wakes the patient twice a week.",
        disclosureRule: "direct-question",
        tier: 2,
      },
    ],
    questionPool: [
      {
        id: "q-safety-1",
        category: "safety",
        text: "Is there anything I should watch out for at home?",
        expectedElements: ["Red-flag safety netting"],
        checkIn: true,
      },
      {
        id: "q-lifestyle-1",
        category: "lifestyle",
        text: "Will I still be able to keep up my usual activities?",
        expectedElements: ["Activity modification advice"],
        checkIn: false,
      },
    ],
    jargonBank: [
      { term: "contraindicated", plainAnalogy: "something your body can't safely handle — like mixing bleach and ammonia" },
    ],
    closing: {
      teachBackRequired: true,
      mustCover: ["Follow-up plan", "When to seek urgent help"],
    },
    scoring: {
      domains: [
        { key: "clinical-reasoning", weight: 20 },
        { key: "safety", weight: 20 },
        { key: "professionalism", weight: 20 },
        { key: "communication", weight: 20 },
        { key: "structure", weight: 20 },
      ],
      passThreshold: 65,
      criticalFlags: [{ id: "cf1", description: "Fails to safety-net red flags" }],
    },
    bridge: { miniCases: [], mcqs: [], pearls: [], frameworks: [] },
  };
}

const DEMOS = [
  {
    code: "DEMO-PMR-001",
    title: "Chronic low back pain — first consultation",
    specialty: "Physical Medicine & Rehabilitation",
    training_levels: ["student", "resident"],
    patient: ["Margaret Ellis", "Six months of worsening low back pain."],
  },
  {
    code: "DEMO-IM-002",
    title: "New type 2 diabetes — breaking the news",
    specialty: "Internal Medicine",
    training_levels: ["resident"],
    patient: ["Josef Braun", "Routine bloods show HbA1c of 68 mmol/mol."],
  },
  {
    code: "DEMO-EM-003",
    title: "Anticoagulation counselling after first DVT",
    specialty: "Emergency Medicine",
    training_levels: ["resident", "physician"],
    patient: ["Amara Diallo", "Confirmed proximal DVT, starting a DOAC."],
  },
];

async function clean(): Promise<void> {
  const { data: demoStations, error } = await service
    .from("stations")
    .select("id, code")
    .like("code", "DEMO-%");
  if (error) throw new Error(error.message);
  if (!demoStations?.length) {
    console.log("No DEMO- stations found.");
    return;
  }
  const ids = demoStations.map((s) => s.id);
  const { error: attErr } = await service
    .from("attempts")
    .delete()
    .in(
      "station_version_id",
      (
        await service.from("station_versions").select("id").in("station_id", ids)
      ).data?.map((v) => v.id) ?? [],
    );
  if (attErr) throw new Error(attErr.message);
  const { error: delErr } = await service.from("stations").delete().in("id", ids);
  if (delErr) throw new Error(delErr.message);
  console.log(`Removed ${ids.length} DEMO- stations (${demoStations.map((s) => s.code).join(", ")})`);
}

async function seed(): Promise<void> {
  for (const demo of DEMOS) {
    const { data: existing } = await service
      .from("stations")
      .select("id")
      .eq("code", demo.code)
      .maybeSingle();
    if (existing) {
      console.log(`SKIP  ${demo.code} (already exists)`);
      continue;
    }

    const { data: spec, error: specErr } = await service
      .from("specialties")
      .select("id")
      .eq("name", demo.specialty)
      .single();
    if (specErr || !spec) throw new Error(`specialty '${demo.specialty}': ${specErr?.message}`);

    const { data: station, error: stErr } = await service
      .from("stations")
      .insert({
        code: demo.code,
        title: demo.title,
        specialty_id: spec.id,
        training_levels: demo.training_levels,
        status: "draft",
      })
      .select("id")
      .single();
    if (stErr || !station) throw new Error(`station ${demo.code}: ${stErr?.message}`);

    const { error: verErr } = await service.from("station_versions").insert({
      station_id: station.id,
      version: 1,
      content: demoContent(demo.patient[0], demo.patient[1]),
    });
    if (verErr) throw new Error(`version for ${demo.code}: ${verErr.message}`);

    const { error: updErr } = await service
      .from("stations")
      .update({ current_version: 1 })
      .eq("id", station.id);
    if (updErr) throw new Error(`current_version for ${demo.code}: ${updErr.message}`);

    console.log(`SEEDED  ${demo.code} — ${demo.title} [draft, v1]`);
  }
}

const isClean = process.argv.includes("--clean");
(isClean ? clean() : seed())
  .then(() => console.log("Done."))
  .catch((err) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
