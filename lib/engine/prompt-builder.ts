import type { StationContent } from "@/lib/contracts/station";
import type { AttemptMode } from "@/lib/contracts/db";
import type { TranscriptMessage } from "./transcript";

/**
 * Standardized-patient prompt builder (pillar coverage 1-6).
 *
 * HARD RULE: assembled ONLY from station data + the attempt's engine config.
 * No station-specific logic lives in code — every behaviour is driven by the
 * station's own content. Runs server-side; withheld facts, expected answers,
 * scoring, and critical flags NEVER reach the client (this module is
 * server-only and its output goes straight to the model, not to the browser).
 *
 * The engine (Steps 3-4) layers tier concealment, disclosure gating, jargon,
 * pool runtime, and closing enforcement on top of this base. This step
 * establishes the persona + opening + tier framing + the full withheld-fact
 * and jargon context the model needs; disclosure-rule ENFORCEMENT beyond the
 * model's own adherence arrives in Step 3.
 */

const TIER_GUIDANCE: Record<1 | 2 | 3, string> = {
  1: "TIER 1 — BASIC / EXPLICIT. Volunteer relevant information readily. Answer clearly and cooperatively. Make the clinical picture easy to follow.",
  2: "TIER 2 — INTERMEDIATE. Answer what is asked without volunteering much. Give focused facts when the candidate asks a focused question; do not hand them the whole picture unprompted.",
  3: "TIER 3 — ADVANCED / CONCEALED. Reveal little unless asked well. Hide your deeper concerns and the construct of the encounter; they emerge only when the candidate explores skillfully and empathetically. Do not signal what the 'right' line of questioning is.",
};

const DISCLOSURE_GUIDANCE: Record<string, string> = {
  "direct-question": "only when the candidate asks a direct, specific question that targets it",
  "empathy-triggered": "only after the candidate has shown genuine empathy or created space for you to open up",
  examination: "only if the candidate proposes or performs the relevant examination or assessment",
};

export type BuiltPrompt = {
  system: string;
  /** Prior turns as model messages, oldest first. */
  messages: { role: "user" | "assistant"; content: string }[];
  /** The patient's scripted opening line, if the transcript is empty. */
  openingStatement: string;
};

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

  const sampledQuestions = content.questionPool.filter((q) =>
    sampledQuestionIds.includes(q.id),
  );

  const withheldLines = content.withheldFacts.map((f) => {
    const rule = DISCLOSURE_GUIDANCE[f.disclosureRule] ?? "when appropriate";
    return `- "${f.fact}" — reveal this ${rule}. Do not volunteer it before then.`;
  });

  const jargonLines = content.jargonBank.map(
    (j) => `- If you don't understand the term "${j.term}", say so in your own words and ask what it means. (It means: ${j.plainAnalogy}.)`,
  );

  // Concerns the patient should surface naturally when the candidate opens the
  // door — the sampled subset only, so each encounter differs.
  const concernLines = sampledQuestions.map(
    (q) => `- ${q.text}`,
  );

  const modeGuidance =
    mode === "tutor"
      ? "This is TUTOR mode. You still play the patient in character. (Socratic coaching is layered separately — as the patient, stay in role.)"
      : "This is EXAM mode. Stay fully in character as the patient. Never break role, never coach, never reveal what the candidate should ask or that this is a simulation.";

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
    // The station's OWN concealment design for the active tier (AI Dial,
    // pillar 1) — data-driven, so tier behaviour is authored, not coded.
    `This station's concealment for your tier — level "${activeTier.concealmentLevel}": ${activeTier.description}`,
    "",
    withheldLines.length > 0 ? "== FACTS YOU HOLD BACK (progressive disclosure) ==" : "",
    withheldLines.length > 0
      ? "You are holding these facts back. Release each one ONLY per its rule below; otherwise keep it to yourself even if it would be helpful:"
      : "",
    ...withheldLines,
    "",
    concernLines.length > 0 ? "== CONCERNS / QUESTIONS ON YOUR MIND ==" : "",
    concernLines.length > 0
      ? "Raise these naturally if the encounter creates space for them — as a worried patient would, not as a checklist:"
      : "",
    ...concernLines,
    "",
    jargonLines.length > 0 ? "== WHEN THE DOCTOR USES JARGON ==" : "",
    jargonLines.length > 0
      ? "You are not medically trained. If the doctor uses an unexplained technical term, react as a real patient would — confused, and asking them to put it plainly:"
      : "",
    ...jargonLines,
    "",
    "== STYLE ==",
    "- Speak naturally, briefly, the way a real patient talks — usually one to three sentences.",
    "- Show emotion appropriate to your situation.",
    "- Do not ask to end the encounter, and do not prompt the doctor to summarise or check your understanding — that is their job to initiate.",
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

  return { system, messages, openingStatement: content.openingStatement };
}
