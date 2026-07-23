import type { StationContent } from "@/lib/contracts/station";
import type { TranscriptMessage } from "@/lib/engine/transcript";
import { computeJargonState } from "../engine/jargon.ts";
import { evaluateClosing, buildEndState } from "../engine/closing.ts";
import type { ScoringFacts } from "./assemble.ts";

/**
 * Deterministic scoring facts — the parts CODE owns, never the model.
 *
 * Teach-back completion comes from the authoritative end state recorded at
 * finish (complete_attempt); jargon count is recomputed from the transcript
 * with the same engine detector the encounter used. These override the model
 * in assembleScore, so a good-sounding transcript can never talk its way out
 * of a missed teach-back or a jargon critical fail.
 */

export type PersistedEndState = {
  teachBackMissedCriticalFail?: boolean;
} | null | undefined;

export function deriveScoringFacts(
  content: StationContent,
  transcript: TranscriptMessage[],
  endState: PersistedEndState,
): ScoringFacts {
  const candidateMessages = transcript
    .filter((m) => m.role === "candidate")
    .map((m) => m.text);

  const jargon = computeJargonState(content.jargonBank, candidateMessages);

  // Prefer the recorded end state (authoritative at finish); fall back to a
  // recompute if an older attempt lacks it.
  const teachBackMissed =
    typeof endState?.teachBackMissedCriticalFail === "boolean"
      ? endState.teachBackMissedCriticalFail
      : buildEndState(evaluateClosing(content, candidateMessages)).teachBackMissedCriticalFail;

  return {
    teachBackMissed,
    jargonCount: jargon.count,
    jargonCritical: jargon.count >= 4,
    jargonDisengaged: jargon.count === 3,
  };
}
