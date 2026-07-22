import type { WithheldFact } from "@/lib/contracts/station";
import { hasQuestion, normalize, salientStems } from "./text-utils.ts";

/**
 * Progressive disclosure — pillar 4 (reference: ITB S3, AS S2).
 *
 * Enforcement is in CODE, recomputed each turn from the candidate's messages:
 * a withheld fact is disclosable only once its own rule has been triggered by
 * some candidate turn. The prompt builder then includes ONLY unlocked facts,
 * so the model is never handed a fact it must keep back — it cannot leak what
 * it wasn't given. Triggers are re-evaluated every turn (not "remembered").
 *
 * Detection is deterministic and keyword/lexicon-based (matching the
 * reference's "released when the candidate asks the matching question").
 * Very obliquely phrased triggers that share no salient word with the fact
 * may not fire — a known, documented limit of pure-code enforcement.
 */

// Empathy OR an explicit invitation to open up (both create the space the
// "empathy-triggered" rule describes).
const EMPATHY_MARKERS = [
  "i'm sorry", "i am sorry", "so sorry", "that must be", "that sounds",
  "i understand", "i can understand", "i can imagine", "i can only imagine",
  "take your time", "no rush", "i'm here", "i am here", "here for you",
  "here with you", "it's okay", "it's ok", "that's understandable",
  "understandable", "i hear you", "i can see", "must be hard",
  "must be scary", "must be frightening", "must be difficult",
  "must be worrying", "must be frightening", "i appreciate",
];

// Specific invitations to share feelings/concerns/what they've read. Avoids
// bare "is there anything" which matches routine clinical questions
// ("is there anything that makes it worse?").
const OPEN_SPACE_MARKERS = [
  "what's on your mind", "whats on your mind", "on your mind",
  "any concerns about", "anything worrying you", "what's worrying you",
  "whats worrying you", "what are you worried about", "what worries you",
  "your worries", "your fears", "what have you heard about",
  "what did you read", "read anything about", "read anything online",
  "how are you feeling about", "how do you feel about", "what are you afraid",
  "what's frightening you", "tell me your concerns", "what are your concerns",
  "what's scaring you", "what is scaring you", "is there anything worrying",
  "anything you'd like to share", "anything you want to tell me",
];

const EXAMINATION_MARKERS = [
  "examine", "examination", "have a look at your", "take a look at your",
  "let me look at your", "let me check your", "check your", "listen to your",
  "feel your", "palpate", "auscultate", "assess your", "physical exam",
  "let me examine", "i'd like to examine", "i would like to examine",
  "blood pressure", "look at your back", "look at your", "test your",
];

function anyMarker(text: string, markers: string[]): boolean {
  const n = normalize(text);
  return markers.some((m) => n.includes(normalize(m)));
}

function directQuestionTargets(message: string, fact: WithheldFact): boolean {
  if (!hasQuestion(message)) return false;
  const factStems = [...salientStems(fact.fact)];
  const msgStems = salientStems(message);
  const overlap = factStems.filter((s) => msgStems.has(s)).length;
  // Require TWO shared salient terms so a single common word (e.g. a drug
  // name) doesn't unlock an unrelated fact; single-keyword facts fall back
  // to a one-term match.
  return factStems.length <= 1 ? overlap >= 1 : overlap >= 2;
}

function isTriggered(message: string, fact: WithheldFact): boolean {
  switch (fact.disclosureRule) {
    case "empathy-triggered":
      return anyMarker(message, EMPATHY_MARKERS) || anyMarker(message, OPEN_SPACE_MARKERS);
    case "examination":
      return anyMarker(message, EXAMINATION_MARKERS);
    case "direct-question":
    default:
      return directQuestionTargets(message, fact);
  }
}

/** Returns the set of withheld-fact ids currently disclosable, given all
 *  candidate turns so far. Once triggered, a fact stays unlocked. */
export function evaluateDisclosure(
  withheldFacts: WithheldFact[],
  candidateMessages: string[],
): Set<string> {
  const unlocked = new Set<string>();
  for (const fact of withheldFacts) {
    if (candidateMessages.some((m) => isTriggered(m, fact))) {
      unlocked.add(fact.id);
    }
  }
  return unlocked;
}
