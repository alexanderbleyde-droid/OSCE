/**
 * Score finished attempts (pillar 7). Service-role; runs the real AI rubric.
 *
 *   node scripts/score-attempt.ts --attempt <uuid>
 *   node scripts/score-attempt.ts --station TEST-001   (all completed attempts)
 *   node scripts/score-attempt.ts --all                (every completed attempt)
 *   ... add --promote to make a re-score the new score of record.
 *
 * A re-score stores a new non-record version; the of-record score (from Finish)
 * is preserved unless --promote is passed.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { scoreAttemptCore } from "../lib/scoring/core.ts";

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
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY (needed for the rubric model)");
  process.exit(1);
}

const service = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

type Row = { id: string; mode: string; completed_at: string | null; scored_at: string | null };

async function attemptsForStation(code: string): Promise<Row[]> {
  const { data: station } = await service.from("stations").select("id").eq("code", code).maybeSingle();
  if (!station) return [];
  const { data: versions } = await service.from("station_versions").select("id").eq("station_id", station.id);
  const vids = (versions ?? []).map((v) => v.id);
  if (vids.length === 0) return [];
  const { data } = await service
    .from("attempts")
    .select("id, mode, completed_at, scored_at")
    .in("station_version_id", vids)
    .not("completed_at", "is", null)
    .order("created_at");
  return (data ?? []) as Row[];
}

async function allCompleted(): Promise<Row[]> {
  const { data } = await service
    .from("attempts")
    .select("id, mode, completed_at, scored_at")
    .not("completed_at", "is", null)
    .order("created_at");
  return (data ?? []) as Row[];
}

async function main(): Promise<void> {
  const one = arg("--attempt");
  const station = arg("--station");
  const all = process.argv.includes("--all");
  const promote = process.argv.includes("--promote");

  let rows: Row[];
  if (one) rows = [{ id: one, mode: "?", completed_at: "?", scored_at: null }];
  else if (station) rows = await attemptsForStation(station);
  else if (all) rows = await allCompleted();
  else {
    console.error("Usage: --attempt <uuid> | --station <code> | --all");
    process.exit(1);
  }

  if (rows.length === 0) {
    console.log("No completed attempts matched.");
    return;
  }

  console.log(`Scoring ${rows.length} attempt(s)…\n`);
  for (const row of rows) {
    process.stdout.write(`• ${row.id} (${row.mode})… `);
    try {
      const outcome = await scoreAttemptCore(service, row.id, { promote });
      if (!outcome.ok) {
        console.log(`SKIPPED (${outcome.reason})`);
        continue;
      }
      const r = outcome.result;
      const verdict = r.passed ? "PASS" : "FAIL";
      const crit = r.criticalFailed ? " · CRITICAL FAIL" : "";
      const bridge = r.bridgeTriggered ? ` · bridge[${r.bridgeReasons.join("; ")}]` : "";
      const rec = outcome.ofRecord ? "OF RECORD" : "stored (record unchanged)";
      console.log(`${verdict} ${r.aggregate}%${crit}${bridge}  [v${outcome.version} · ${rec}]`);
      console.log(`    domains: ${r.domains.map((d) => `${d.key} ${d.score}`).join(" · ")}`);
      if (r.triggeredFlags.length > 0) {
        console.log(`    flags: ${r.triggeredFlags.map((f) => `${f.id}(${f.source})`).join(", ")}`);
      }
      console.log(`    model: ${outcome.model}`);
    } catch (err) {
      console.log(`ERROR — ${err instanceof Error ? err.message : err}`);
    }
  }
}

main().catch((err) => {
  console.error("score-attempt failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
