import type { StationContent } from "@/lib/contracts/station";
import type { TranscriptMessage } from "./transcript";
import { normalize, salientStems } from "./text-utils.ts";

/**
 * Closing & teach-back — pillar 6 (reference: ITB S8, AS mark items 14-15).
 *
 * The standardized patient NEVER prompts for teach-back (enforced in the
 * prompt). Detection here drives the encounter state machine and records the
 * end state for Phase-2 scoring. Per the reference, closing WITHOUT teach-back
 * is a silent critical fail — the candidate can still end; the deficiency is
 * recorded, not announced.
 *
 * IMPORTANT: the recorded end state stores only coverage BOOLEANS, never the
 * verbatim mustCover text — that text is examiner-only and the attempt row
 * (engine_config) is candidate-readable.
 */

// Unambiguous closing-protocol phrases only (avoid bare words like "contact"
// or "follow up" that appear mid-encounter).
const CLOSING_MARKERS = [
  "before you go", "before we finish", "before we end", "before we wrap",
  "to summarise", "to summarize", "to sum up", "in summary",
  "let me recap", "to recap", "let's recap", "just to go over everything",
  "the main things to remember", "the key things to remember",
  "any questions before you", "any questions before we",
  "take this leaflet", "here's a leaflet", "here is a leaflet",
  "arrange a follow-up", "arrange a follow up", "follow-up appointment",
  "book a follow-up", "see you again in", "next appointment is",
];

// Genuine teach-back INVITATIONS only. Deliberately excludes history-style or
// counselling questions ("what have you taken", "what will you tell",
// "so what's the plan") that would falsely clear the safety-critical gate.
const TEACHBACK_MARKERS = [
  "in your own words", "tell me back", "tell it back", "say that back",
  "repeat back", "repeat it back", "can you tell me what you", "explain back",
  "can you summarise", "can you summarize", "just so i know it's clear",
  "just to check you've understood", "just to check you understood",
  "just to make sure you've got", "just to make sure you understand",
  "how would you explain", "walk me through what you", "recap it for me",
  "tell me what you understood", "tell me what you'll do", "tell me how you'll",
];

function anyMarker(text: string, markers: string[]): boolean {
  const n = normalize(text);
  return markers.some((m) => n.includes(normalize(m)));
}

export type ClosingState = {
  closingStarted: boolean;
  teachBackDone: boolean;
  /** Per-mustCover-item coverage, aligned to station order. No text. */
  mustCoverCovered: boolean[];
  coveredCount: number;
  totalMustCover: number;
};

export function evaluateClosing(
  content: StationContent,
  candidateMessages: string[],
): ClosingState {
  const closingStarted = candidateMessages.some((m) => anyMarker(m, CLOSING_MARKERS));
  const teachBackDone = candidateMessages.some((m) => anyMarker(m, TEACHBACK_MARKERS));

  const allStems = new Set<string>();
  for (const m of candidateMessages) for (const s of salientStems(m)) allStems.add(s);

  const mustCoverCovered = content.closing.mustCover.map((item) => {
    const itemStems = [...salientStems(item)];
    if (itemStems.length === 0) return false;
    const hits = itemStems.filter((s) => allStems.has(s)).length;
    return hits >= Math.ceil(itemStems.length / 2);
  });

  return {
    closingStarted,
    teachBackDone,
    mustCoverCovered,
    coveredCount: mustCoverCovered.filter(Boolean).length,
    totalMustCover: content.closing.mustCover.length,
  };
}

export type EncounterPhase = "gathering" | "closing" | "ended";

export function derivePhase(
  transcript: TranscriptMessage[],
  completed: boolean,
  closingStarted: boolean,
): EncounterPhase {
  if (completed) return "ended";
  return closingStarted ? "closing" : "gathering";
}

/** End state persisted on the attempt (engine_config, candidate-readable) —
 *  booleans and counts only, no examiner text. */
export type EncounterEndState = {
  closingStarted: boolean;
  teachBackDone: boolean;
  mustCoverCovered: boolean[];
  coveredCount: number;
  totalMustCover: number;
  /** Reference rule: closing without teach-back is a silent critical fail. */
  teachBackMissedCriticalFail: boolean;
};

export function buildEndState(closing: ClosingState): EncounterEndState {
  return {
    closingStarted: closing.closingStarted,
    teachBackDone: closing.teachBackDone,
    mustCoverCovered: closing.mustCoverCovered,
    coveredCount: closing.coveredCount,
    totalMustCover: closing.totalMustCover,
    teachBackMissedCriticalFail: !closing.teachBackDone,
  };
}
