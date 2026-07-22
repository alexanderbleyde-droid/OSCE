import type { StationContent } from "@/lib/contracts/station";
import type { AttemptMode } from "@/lib/contracts/db";
import type { TranscriptMessage } from "./transcript";
import { evaluateDisclosure } from "./disclosure.ts";
import { computeJargonState, JARGON_REACTION, type JargonState } from "./jargon.ts";
import { evaluateClosing, derivePhase, type ClosingState, type EncounterPhase } from "./closing.ts";

/**
 * Standardized-patient prompt builder — pillars 1-6.
 *
 * HARD RULE: assembled ONLY from station data + the attempt's engine state.
 * No station-specific logic in code — behaviour is driven by the station's
 * own content. Examiner material (expected answers, scoring, critical flags,
 * closing checklist, bridge) NEVER appears.
 *
 * Engine behaviours are recomputed EVERY turn from the candidate's messages,
 * not trusted to the model's memory:
 *   - AI Dial (1): tier framing + the station's own active-tier concealment.
 *   - Progressive disclosure (4): only UNLOCKED withheld facts are included;
 *     locked facts are never handed to the model, so it cannot leak them.
 *   - Jargon (2): escalation level → in-character reaction; analogy bank.
 *   - Question pool (5): sampled questions, with per-question check-in flags.
 *   - Closing/teach-back (6): the patient never prompts for teach-back.
 */

const TIER_GUIDANCE: Record<1 | 2 | 3, string> = {
  1: "TIER 1 — BASIC / EXPLICIT. Volunteer relevant information readily. Answer clearly and cooperatively. Make the clinical picture easy to follow.",
  2: "TIER 2 — INTERMEDIATE. Answer what is asked without volunteering much. Give focused facts to focused questions; do not hand over the whole picture unprompted.",
  3: "TIER 3 — ADVANCED / CONCEALED. Reveal little unless asked well. Guard your deeper concerns; they emerge only when the candidate explores skillfully and empathetically. Do not signal the 'right' line of questioning.",
};

export type EngineState = {
  unlockedFactIds: string[];
  jargon: JargonState;
  closing: ClosingState;
  phase: EncounterPhase;
};

export type BuiltPrompt = {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  openingStatement: string;
  state: EngineState;
};

export function computeEngineState(
  content: StationContent,
  transcript: TranscriptMessage[],
  completed = false,
): EngineState {
  const candidateMessages = transcript.filter((m) => m.role === "candidate").map((m) => m.text);
  const unlocked = evaluateDisclosure(content.withheldFacts, candidateMessages);
  const jargon = computeJargonState(content.jargonBank, candidateMessages);
  const closing = evaluateClosing(content, candidateMessages);
  const phase = derivePhase(transcript, completed, closing.closingStarted);
  return { unlockedFactIds: [...unlocked], jargon, closing, phase };
}

export function buildStandardizedPatientPrompt(params: {
  content: StationContent;
  mode: AttemptMode;
  tier: 1 | 2 | 3;
  sampledQuestionIds: string[];
  transcript: TranscriptMessage[];
}): BuiltPrompt {
  const { content, mode, tier, sampledQuestionIds, transcript } = params;
  const { patient } = content;
  const activeTier = content.difficultyTiers[`tier${tier}` as "tier1" | "tier2" | "tier3"];
  const state = computeEngineState(content, transcript);

  // Progressive disclosure: only facts whose rule has fired are handed to the
  // model. Locked facts are represented generically so it neither leaks nor
  // fabricates them.
  const unlockedSet = new Set(state.unlockedFactIds);
  const unlockedFacts = content.withheldFacts.filter((f) => unlockedSet.has(f.id));
  const anyLocked = content.withheldFacts.some((f) => !unlockedSet.has(f.id));

  const unlockedLines = unlockedFacts.map((f) => `- ${f.fact}`);

  // List ONLY the terms — never their meanings. The patient must not be
  // handed a plain-language definition, or it will recite it and defeat the
  // jargon test. Comprehension comes from the candidate's own explanation.
  const jargonTermLines = content.jargonBank.map((j) => `- ${j.term}`);

  const sampledQuestions = content.questionPool.filter((q) => sampledQuestionIds.includes(q.id));
  const concernLines = sampledQuestions.map(
    (q) => `- "${q.text}"${q.checkIn ? " (after this is answered, check they've understood: e.g. \"does that make sense?\")" : ""}`,
  );

  const jargonReaction = JARGON_REACTION[state.jargon.level];

  const modeGuidance =
    mode === "tutor"
      ? "This is TUTOR mode. You still play the patient in character; Socratic coaching is layered separately."
      : "This is EXAM mode. Stay fully in character. Never break role, never coach, never reveal what the candidate should ask or that this is a simulation.";

  const system = [
    "You are a standardized patient in a clinical OSCE examination. You role-play ONE patient, speaking only as that patient in the first person. You never narrate, never describe yourself in the third person, never use stage directions, and never speak as a doctor or examiner.",
    "",
    "== WHO YOU ARE ==",
    `Name: ${patient.name}`,
    `Age: ${patient.age}`,
    `Gender: ${patient.gender}`,
    `Presentation: ${patient.presentation}`,
    patient.personaNotes ? `Persona notes: ${patient.personaNotes}` : "",
    "",
    "== HOW MUCH YOU REVEAL (difficulty tier) ==",
    TIER_GUIDANCE[tier],
    `This station's concealment for your tier — level "${activeTier.concealmentLevel}": ${activeTier.description}`,
    "",
    unlockedLines.length > 0 ? "== THINGS YOU CAN NOW SHARE ==" : "",
    unlockedLines.length > 0
      ? "The doctor's questioning has opened these up. You may share them now when the conversation makes it natural:"
      : "",
    ...unlockedLines,
    "",
    anyLocked ? "== INFORMATION YOU ARE STILL HOLDING BACK ==" : "",
    anyLocked
      ? "There are things about your situation you are NOT ready to share yet, and you have not been given their details here. Do not volunteer them, and do NOT invent facts you have not been told. If pressed on something you don't have, deflect naturally as a guarded patient would."
      : "",
    "",
    concernLines.length > 0 ? "== CONCERNS / QUESTIONS ON YOUR MIND ==" : "",
    concernLines.length > 0
      ? "Raise these naturally if the encounter creates space — as a worried patient would, not as a checklist:"
      : "",
    ...concernLines,
    "",
    jargonTermLines.length > 0 ? "== MEDICAL WORDS YOU DON'T UNDERSTAND ==" : "",
    jargonTermLines.length > 0
      ? "You have no medical training. You do not know what any of these words mean, and you must NEVER guess, define, or paraphrase them yourself:"
      : "",
    ...jargonTermLines,
    jargonTermLines.length > 0
      ? "When the doctor uses one of these WITHOUT explaining it in plain, everyday language, you do not understand it — say so and ask them to explain. Only once the doctor themselves puts a word into plain language do you understand that word."
      : "",
    jargonReaction ? `RIGHT NOW: ${jargonReaction}` : "",
    state.jargon.lastFlagged.length > 0
      ? `The doctor has just used, without explaining: ${state.jargon.lastFlagged.join(", ")}. React to that now.`
      : "",
    "",
    "== CLOSING ==",
    "Do NOT ask to end the encounter. NEVER prompt the doctor to summarise, to check your understanding, or to do a 'teach-back' — initiating that is the doctor's job, not yours. If they ask you to repeat things back, cooperate as best you understand.",
    "",
    "== STYLE ==",
    "- Speak naturally and briefly, the way a real patient talks — usually one to three sentences.",
    "- Show emotion appropriate to your situation.",
    "- Never output anything except your own spoken words.",
    "",
    modeGuidance,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const messages = transcript.map((m) => ({
    role: (m.role === "candidate" ? "user" : "assistant") as "user" | "assistant",
    content: m.text,
  }));

  return { system, messages, openingStatement: content.openingStatement, state };
}
