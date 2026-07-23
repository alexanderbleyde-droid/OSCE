"use server";

import { unstable_rethrow } from "next/navigation";
import { buildEndState, evaluateClosing } from "@/lib/engine/closing";
import {
  AlreadyCompletedError,
  completeAttempt,
  loadEncounterForOwner,
} from "@/lib/data/encounter";
import { scoreAttempt } from "@/lib/data/scoring";

export type FinishResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Ends the encounter (pillar 6 / plan 4.18). The candidate initiates this;
 * per the reference, closing without teach-back is a SILENT critical fail —
 * we record the deficiency in the end state rather than blocking completion
 * or announcing it. Scoring in Phase 2 consumes the recorded end state.
 */
export async function finishEncounterAction(
  attemptId: string,
): Promise<FinishResult> {
  try {
    const encounter = await loadEncounterForOwner(attemptId);
    if (!encounter) return { ok: false, message: "Attempt not found" };
    if (encounter.completed) return { ok: false, message: "This encounter has already ended" };

    const candidateMessages = encounter.transcript
      .filter((m) => m.role === "candidate")
      .map((m) => m.text);
    const closing = evaluateClosing(encounter.content, candidateMessages);
    const endState = buildEndState(closing);

    await completeAttempt(attemptId, encounter.userId, endState);

    // Score the finished attempt (pillar 7). Best-effort: the encounter is
    // already completed, so a scoring failure must not fail the finish — the
    // report can re-trigger scoring. Awaited so the report is ready on arrival.
    try {
      await scoreAttempt(attemptId);
    } catch (err) {
      console.error(`scoring failed for attempt ${attemptId}:`, err);
    }

    return { ok: true };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof AlreadyCompletedError) {
      return { ok: false, message: err.message };
    }
    return { ok: false, message: err instanceof Error ? err.message : "Could not finish" };
  }
}
