import type { JargonEntry } from "@/lib/contracts/station";
import { containsTerm, normalize, salientStems, sentences } from "./text-utils.ts";

/**
 * Jargon detection & escalation — pillar 2 (reference: ITB S9, AS S9).
 *
 * A flagged term is "unexplained" when the candidate uses it WITHOUT a
 * same-sentence plain-language translation. Matching is case-insensitive and
 * morphology-aware ("titrate / titrating / titrated"). Escalation per the
 * reference: 1st unexplained → confusion (no penalty), 2nd → mild frustration,
 * 3rd → disengagement (communication capped), 4th+ → teach-back fails /
 * communication critical fail. Self-correction resets the counter; multiple
 * new flags in the same turn do not reset.
 */

export type JargonLevel = "none" | "confusion" | "frustration" | "disengagement" | "critical";

// Strong explanation phrases only — no short filler like "or in" / "as in"
// (which match inside "for instance", "as in the past", etc).
const EXPLANATION_CUES = [
  "which means", "that means", "meaning", "in other words", "in plain",
  "basically", "essentially", "so it's like", "it's like", "like when",
  "that is to say", "what i mean is", "put simply", "simply put",
  "in simple terms", "to put it simply", "which is basically", "in everyday terms",
]
  .map((c) => c.toLowerCase())
  .filter((c) => c.trim().length > 0);

function hasExplanationCue(normalizedSentence: string): boolean {
  return EXPLANATION_CUES.some((c) => {
    const nc = c.replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim();
    return nc.length > 0 && normalizedSentence.includes(nc);
  });
}

/** A term is "explained" in a sentence when it appears alongside a
 *  plain-language cue OR a NEAR-COMPLETE paraphrase of its own analogy.
 *  Incidental shared words (e.g. "dose" near "titrate") must NOT count as an
 *  explanation, or the escalation counter silently stalls. */
function explainsTerm(sentence: string, entry: JargonEntry): boolean {
  if (!containsTerm(sentence, entry.term)) return false;
  if (hasExplanationCue(normalize(sentence))) return true;
  const analogyStems = salientStems(entry.plainAnalogy);
  if (analogyStems.size === 0) return false;
  const sentStems = salientStems(sentence);
  let overlap = 0;
  for (const s of analogyStems) if (sentStems.has(s)) overlap += 1;
  // Require most of the analogy's content words — a genuine paraphrase, not a
  // couple of coincidental overlaps.
  const needed = Math.max(2, Math.ceil(analogyStems.size * 0.75));
  return overlap >= needed;
}

/** Terms in `message` used without a same-sentence explanation. */
export function detectUnexplainedJargon(
  jargonBank: JargonEntry[],
  message: string,
): JargonEntry[] {
  const out: JargonEntry[] = [];
  const sents = sentences(message);
  for (const entry of jargonBank) {
    for (const sent of sents) {
      if (!containsTerm(sent, entry.term)) continue;
      if (!explainsTerm(sent, entry)) out.push(entry);
      break; // count a term at most once per message
    }
  }
  return out;
}

/** Terms this message explains (cue or analogy paraphrase). */
function termsExplainedIn(jargonBank: JargonEntry[], message: string): Set<string> {
  const sents = sentences(message);
  const out = new Set<string>();
  for (const entry of jargonBank) {
    if (sents.some((s) => explainsTerm(s, entry))) out.add(entry.term);
  }
  return out;
}

export type JargonState = {
  count: number;
  level: JargonLevel;
  /** Terms flagged in the most recent candidate turn (drives the reply). */
  lastFlagged: string[];
};

export function levelForCount(count: number): JargonLevel {
  if (count <= 0) return "none";
  if (count === 1) return "confusion";
  if (count === 2) return "frustration";
  if (count === 3) return "disengagement";
  return "critical";
}

/** Walks the candidate turns in order, accumulating unexplained-jargon count
 *  with self-correction resets. */
export function computeJargonState(
  jargonBank: JargonEntry[],
  candidateMessages: string[],
): JargonState {
  let count = 0;
  let flaggedTerms = new Set<string>();
  let lastFlagged: string[] = [];
  for (const message of candidateMessages) {
    // Self-correction resets BEFORE counting new flags in the same turn — but
    // only when the candidate explains a term they had previously used
    // unexplained (explaining an unrelated term does not reset).
    if (count > 0) {
      const explained = termsExplainedIn(jargonBank, message);
      if ([...flaggedTerms].some((t) => explained.has(t))) {
        count = 0;
        flaggedTerms = new Set<string>();
      }
    }
    const flagged = detectUnexplainedJargon(jargonBank, message);
    lastFlagged = flagged.map((f) => f.term);
    for (const f of flagged) flaggedTerms.add(f.term);
    count += flagged.length;
  }
  return { count, level: levelForCount(count), lastFlagged };
}

export const JARGON_REACTION: Record<JargonLevel, string> = {
  none: "",
  confusion:
    "This is the 1st unexplained medical word. Show mild, polite confusion — you didn't quite follow that word — and ask the doctor to say it in plain language. Do not pretend to understand.",
  frustration:
    "The doctor has now used 2 unexplained medical words. You are finding this genuinely harder to follow and are becoming mildly frustrated. Say so directly — e.g. that there are a lot of technical words — and ask them again to use plain, everyday language. Do NOT be as easy-going as before.",
  disengagement:
    "The doctor has used 3 unexplained medical words. You are losing confidence and starting to disengage. Keep your replies shorter and flatter, show that you are struggling to follow any of this, and say plainly that you're finding it hard to keep up. Do not be warm or curious.",
  critical:
    "The doctor has used 4 or more unexplained medical words. You are lost and have largely given up trying to follow. Your replies are short and withdrawn; you make clear you don't really understand what is happening and could not repeat any of it back. Your trust is low.",
};
