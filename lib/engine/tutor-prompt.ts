import type { StationContent } from "@/lib/contracts/station";
import type { TranscriptMessage } from "./transcript";

/**
 * Tutor-mode Socratic coach — pillar 3 (reference: AS S8).
 *
 * SILENCE IS THE DEFAULT: most turns get no coaching. The coach speaks only
 * when the most recent exchange shows a clear miss (directive/dismissive/
 * jargon/skipped emotion) or a pivotal reveal the trainee is sliding past —
 * otherwise it emits the [SILENT] sentinel. When it does speak, it interjects
 * at a natural pause with ONE short guiding QUESTION — never the answer, never
 * mid-exchange. It coaches on PROCESS and communication (the generic scoring-
 * domain focus areas), NOT the station's answer key: it is given the domain
 * KEYS as areas to watch, never the withheld facts / expected answers /
 * mustCover checklist, so no examiner material can reach the trainee.
 *
 * The after-encounter directive feedback (reveal the construct, map to the
 * mark scheme, explain bridges) belongs to scoring — Phase 2.
 */

export const TUTOR_SILENT = "[SILENT]";

const DOMAIN_LABELS: Record<string, string> = {
  "clinical-reasoning": "clinical reasoning and structure",
  safety: "safety and safety-netting",
  professionalism: "professionalism, empathy and rapport",
  communication: "plain-language communication and checking understanding",
  structure: "a logical, well-organised consultation",
};

export function buildTutorCoachPrompt(params: {
  content: StationContent;
  transcript: TranscriptMessage[];
}): { system: string; messages: { role: "user"; content: string }[] } {
  const { content, transcript } = params;
  const focus = content.scoring.domains
    .map((d) => DOMAIN_LABELS[d.key] ?? d.key)
    .join("; ");

  const system = [
    "You are a clinical-skills TUTOR quietly observing a trainee doctor practise an OSCE consultation with a simulated patient. You are NOT the patient and NOT an examiner.",
    "",
    "== SILENCE IS THE DEFAULT ==",
    `MOST TURNS DESERVE NO COACHING. A good trainee handles most exchanges well, and always-on coaching becomes noise that drowns out the moments that matter. So your DEFAULT is to say nothing: reply with EXACTLY "${TUTOR_SILENT}" and nothing else. Silence is the norm; a nudge is the rare exception. When in doubt, stay silent.`,
    "",
    "== COACH ONLY WHEN ==",
    "Look ONLY at the MOST RECENT exchange and coach if — and only if — one of these is CLEARLY true:",
    "(a) CLEAR MISS — the trainee's last turn was directive or dismissive, used unexplained jargon, talked over the patient, or skipped an emotion the patient had just shown; OR",
    "(b) PIVOTAL REVEAL — the patient just disclosed something pivotal (a fear, a red-flag symptom, a safety-critical fact) that the trainee is at risk of sliding past without exploring.",
    `If the trainee's turn was appropriate and the conversation is flowing, neither is true — output "${TUTOR_SILENT}".`,
    "",
    "== HOW TO COACH SOCRATICALLY (only when you do) ==",
    "- Interject only at a natural pause, never mid-exchange.",
    "- Ask ONE short guiding QUESTION that helps the trainee notice it themselves. NEVER give the answer, never tell them what to say, never state the clinical facts for them.",
    '- Good style: "What do you think this patient most needs from you right now?" · "They looked confused when you used that word — how else could you put it?" · "Is there anything about safety you\'d want them to leave with?"',
    "- Keep it to one or two short sentences, warm and constructive.",
    `- Areas worth watching in this encounter: ${focus}. Nudge toward these WITHOUT naming the specific answers.`,
    "",
    `The patient is ${content.patient.name}, aged ${content.patient.age}, presenting with: ${content.patient.presentation}.`,
  ].join("\n");

  const convo = transcript
    .filter((m) => m.role === "candidate" || m.role === "patient")
    .map((m) => `${m.role === "candidate" ? "DOCTOR" : "PATIENT"}: ${m.text}`)
    .join("\n");

  const messages = [
    {
      role: "user" as const,
      content: `Consultation so far:\n${convo}\n\nJudge ONLY the most recent exchange against the coach-only criteria. If it shows a clear miss, or a pivotal reveal the trainee is sliding past, give ONE short Socratic nudge. Otherwise — the default — reply ${TUTOR_SILENT}.`,
    },
  ];

  return { system, messages };
}
