import "server-only";

import type { AttemptMode } from "@/lib/contracts/db";
import { stationContentSchema, type StationContent } from "@/lib/contracts/station";
import { parseTranscript, type TranscriptMessage } from "@/lib/engine/transcript";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "./user-guard";

export type EncounterState = {
  attemptId: string;
  userId: string;
  mode: AttemptMode;
  tier: 1 | 2 | 3;
  sampledQuestionIds: string[];
  content: StationContent;
  transcript: TranscriptMessage[];
  completed: boolean;
  station: { code: string; title: string; version: number };
};

/**
 * Loads everything the encounter engine needs for an attempt the caller
 * owns. Ownership is proven by an RLS read through the USER client; the
 * examiner-only version content is then resolved with the admin client
 * (server-side only — never serialized to the browser wholesale).
 */
export async function loadEncounterForOwner(
  attemptId: string,
): Promise<EncounterState | null> {
  const { userId } = await requireUser();
  const supabase = await createClient();

  const { data: attempt, error } = await supabase
    .from("attempts")
    .select("id, user_id, mode, transcript, engine_config, completed_at, station_version_id")
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw new Error(`loadEncounter: ${error.message}`);
  if (!attempt) return null;

  const admin = createAdminClient();
  const { data: version, error: verErr } = await admin
    .from("station_versions")
    // stations ↔ station_versions have TWO FKs (parent station_id + the
    // composite current_version pointer), so the embed must name the parent
    // FK explicitly or PostgREST errors on ambiguity.
    .select("version, content, stations!station_versions_station_id_fkey(code, title)")
    .eq("id", attempt.station_version_id)
    .single();
  if (verErr) throw new Error(`loadEncounter version: ${verErr.message}`);

  const parsed = stationContentSchema.safeParse(version.content);
  if (!parsed.success) throw new Error("loadEncounter: stored content fails contract");

  const config = (attempt.engine_config ?? { tier: 2, sampledQuestionIds: [] }) as {
    tier: 1 | 2 | 3;
    sampledQuestionIds: string[];
  };
  const stationRow = version.stations as unknown as { code: string; title: string };

  return {
    attemptId: attempt.id,
    userId,
    mode: attempt.mode as AttemptMode,
    tier: config.tier,
    sampledQuestionIds: config.sampledQuestionIds,
    content: parsed.data,
    transcript: parseTranscript(attempt.transcript),
    completed: attempt.completed_at !== null,
    station: {
      code: stationRow.code,
      title: stationRow.title,
      version: version.version,
    },
  };
}

/** Appends one message to the attempt transcript (server-authored `at`). */
export async function appendTranscriptMessage(
  attemptId: string,
  userId: string,
  role: "candidate" | "patient",
  text: string,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("append_transcript_message", {
    p_attempt: attemptId,
    p_user: userId,
    p_role: role,
    p_text: text,
  });
  if (error) throw new Error(`appendTranscript: ${error.message}`);
}

export class AlreadyCompletedError extends Error {
  constructor() {
    super("This encounter has already ended");
    this.name = "AlreadyCompletedError";
  }
}

/** Completes the attempt, recording the server-authored end state. */
export async function completeAttempt(
  attemptId: string,
  userId: string,
  endState: unknown,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("complete_attempt", {
    p_attempt: attemptId,
    p_user: userId,
    p_end_state: endState,
  });
  if (error) {
    if (error.message.includes("already_completed")) throw new AlreadyCompletedError();
    if (error.message.includes("not_owner") || error.message.includes("attempt_not_found")) {
      throw new Error("Attempt not found");
    }
    throw new Error(`completeAttempt: ${error.message}`);
  }
}
