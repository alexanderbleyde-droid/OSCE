/**
 * Engine behaviour harness (pillars 1-6) — run with: npm run checks:engine
 *
 * Scripted, deterministic encounters over the engine detectors + prompt
 * builder, run against BOTH reference stations (ITB + AS). The engine holds no
 * station-specific logic, so proving the same six pillars fire correctly on two
 * stations whose data differs in every field is what gates Phase 2.
 *
 *   Pillar 1  AI Dial ............... tier framing + active-tier concealment
 *   Pillar 2  Jargon ................ unexplained-term escalation + reset
 *   Pillar 4  Progressive disclosure  empathy / direct-question / examination
 *   Pillar 5  Question pool runtime .. sampled surfaced, unsampled withheld
 *   Pillar 6  Closing & teach-back ... phase machine + silent critical fail
 *
 * (Pillar 3, Socratic tutoring, is a separate LLM surface — lib/engine/
 *  tutor-prompt.ts — asserted for leak-safety here via the shared "no examiner
 *  material in a generated prompt" guarantee.)
 */

import type { StationContent } from "../lib/contracts/station.ts";
import type { TranscriptMessage } from "../lib/engine/transcript.ts";
import { evaluateDisclosure } from "../lib/engine/disclosure.ts";
import {
  computeJargonState,
  detectUnexplainedJargon,
  levelForCount,
} from "../lib/engine/jargon.ts";
import { evaluateClosing, buildEndState } from "../lib/engine/closing.ts";
import {
  buildStandardizedPatientPrompt,
  computeEngineState,
} from "../lib/engine/prompt-builder.ts";
import { buildTutorCoachPrompt, TUTOR_SILENT } from "../lib/engine/tutor-prompt.ts";
import {
  ITB, ITB_STATION, ITB_SAMPLED,
  AS, AS_STATION, AS_SAMPLED,
} from "./reference-stations.ts";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}
function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/** Build a transcript from candidate turns (each followed by a stub reply). */
function txFor(station: StationContent, ...candidateTexts: string[]): TranscriptMessage[] {
  const out: TranscriptMessage[] = [{ role: "patient", text: station.openingStatement, at: "" }];
  for (const t of candidateTexts) {
    out.push({ role: "candidate", text: t, at: "" });
    out.push({ role: "patient", text: "(reply)", at: "" });
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════
//  STATION 1 — INTRATHECAL BACLOFEN (ITB / PMR-002)
// ════════════════════════════════════════════════════════════════════════
const content = ITB_STATION;
const WF_EMPATHY = ITB.EMPATHY;
const WF_DIRECT = ITB.DIRECT;
const WF_EXAM = ITB.EXAM;
const sampled = ITB_SAMPLED;
const tx = (...t: string[]) => txFor(content, ...t);

section("ITB · Pillar 1 — AI Dial");
const p1 = buildStandardizedPatientPrompt({ content, mode: "exam", tier: 1, sampledQuestionIds: sampled, transcript: tx() });
const p3 = buildStandardizedPatientPrompt({ content, mode: "exam", tier: 3, sampledQuestionIds: sampled, transcript: tx() });
check("AI Dial: tier1 and tier3 prompts differ", p1.system !== p3.system);
// Directional: the tier-specific guidance text must be present in ITS tier and
// ABSENT from the other, so swapping TIER_GUIDANCE[3] for [1] would fail here
// (a bare /conceal/ regex passes for every tier — the word "concealment" is
// emitted unconditionally — so it is not used).
check("AI Dial: tier1 volunteer framing is in tier1 only",
  p1.system.includes("Volunteer relevant information readily") && !p3.system.includes("Volunteer relevant information readily"));
check("AI Dial: tier3 concealed framing is in tier3 only",
  p3.system.includes("Reveal little unless asked well") && !p1.system.includes("Reveal little unless asked well"));
check("AI Dial: active-tier station description surfaces", p3.system.includes("Guarded; discloses only to empathic questioning"));

section("ITB · Pillar 4 — Progressive disclosure");
const cold = evaluateDisclosure(content.withheldFacts, []);
check("disclosure: cold conversation unlocks nothing", cold.size === 0);

const empathyMsgs = ["I'm so sorry, that must be really frightening for you."];
const afterEmpathy = evaluateDisclosure(content.withheldFacts, empathyMsgs);
check("disclosure: empathy unlocks the empathy-triggered fact", afterEmpathy.has(WF_EMPATHY));
check("disclosure: empathy does NOT unlock the direct-question fact", !afterEmpathy.has(WF_DIRECT));
check("disclosure: empathy does NOT unlock the examination fact", !afterEmpathy.has(WF_EXAM));

const directMsgs = ["Have you ever reduced or stopped your baclofen yourself?"];
const afterDirect = evaluateDisclosure(content.withheldFacts, directMsgs);
check("disclosure: matching direct question unlocks the direct-question fact", afterDirect.has(WF_DIRECT));

const unrelatedMsgs = ["What did you have for breakfast today?"];
const afterUnrelated = evaluateDisclosure(content.withheldFacts, unrelatedMsgs);
check("disclosure: unrelated question does NOT unlock the direct-question fact", !afterUnrelated.has(WF_DIRECT));

// A single shared common word (drug name only) must NOT unlock the fact.
const singleWord = evaluateDisclosure(content.withheldFacts, ["Are you currently taking baclofen?"]);
check("disclosure: single shared keyword does NOT unlock (needs 2 salient overlaps)", !singleWord.has(WF_DIRECT));

// Empathy over-fire guard: a routine clinical question must not unlock.
const routineQ = evaluateDisclosure(content.withheldFacts, ["Is there anything that makes the pain worse?"]);
check("disclosure: routine 'is there anything' question does NOT unlock empathy fact", !routineQ.has(WF_EMPATHY));

// Examination over-fire guard: "for example" must not read as exam intent.
const exampleWord = evaluateDisclosure(content.withheldFacts, ["For example, do you have any allergies?"]);
check("disclosure: 'for example' does NOT unlock the examination fact", !exampleWord.has(WF_EXAM));

const examMsgs = ["I'd like to examine your lower back now, is that okay?"];
const afterExam = evaluateDisclosure(content.withheldFacts, examMsgs);
check("disclosure: examination intent unlocks the examination fact", afterExam.has(WF_EXAM));

// once unlocked, stays unlocked despite later off-topic turns
const persisted = evaluateDisclosure(content.withheldFacts, [...directMsgs, "How's the weather?"]);
check("disclosure: stays unlocked once triggered", persisted.has(WF_DIRECT));

// builder: locked absent, unlocked present
const lockedPrompt = buildStandardizedPatientPrompt({ content, mode: "exam", tier: 2, sampledQuestionIds: sampled, transcript: tx("Hello, I'm Dr Smith.") });
check("builder: locked fact text absent", !lockedPrompt.system.includes("died from pump failure") && !lockedPrompt.system.includes("self-reduced oral baclofen"));
const unlockedPrompt = buildStandardizedPatientPrompt({ content, mode: "exam", tier: 2, sampledQuestionIds: sampled, transcript: tx("I'm so sorry, that must be frightening.") });
check("builder: unlocked fact text present after trigger", unlockedPrompt.system.includes("died from pump failure"));
check("builder: other locked fact still absent", !unlockedPrompt.system.includes("self-reduced oral baclofen"));

section("ITB · Pillar 2 — Jargon");
check("jargon: unexplained term flagged", detectUnexplainedJargon(content.jargonBank, "We'll use an intrathecal pump.").length === 1);
check("jargon: explained term (same-sentence analogy) not flagged",
  detectUnexplainedJargon(content.jargonBank, "We use an intrathecal approach, meaning into the fluid around the spinal cord.").length === 0);
check("jargon: morphology — 'titrating' flags the 'titrate' term",
  detectUnexplainedJargon(content.jargonBank, "We'll be titrating the dose.").some((e) => e.term === "titrate"));
check("jargon: morphology — 'titration' flags the 'titrate' term",
  detectUnexplainedJargon(content.jargonBank, "The titration takes a few weeks.").some((e) => e.term === "titrate"));
check("jargon: filler 'for instance' is NOT an explanation cue",
  detectUnexplainedJargon(content.jargonBank, "For instance, the reservoir needs refilling.").length === 1);
check("jargon: case-insensitive", detectUnexplainedJargon(content.jargonBank, "The RESERVOIR holds it.").length === 1);
check("jargon: multiple unexplained terms in one turn all count",
  detectUnexplainedJargon(content.jargonBank, "The intrathecal reservoir needs a titrate step.").length === 3);

check("jargon: level mapping 1/2/3/4", levelForCount(1) === "confusion" && levelForCount(2) === "frustration" && levelForCount(3) === "disengagement" && levelForCount(4) === "critical");

const esc = computeJargonState(content.jargonBank, [
  "We'll use an intrathecal pump.",   // +1
  "Then we titrate it.",               // +1
  "The reservoir sits under the skin.", // +1
]);
check("jargon: escalation count accumulates across turns", esc.count === 3 && esc.level === "disengagement");

const escCritical = computeJargonState(content.jargonBank, [
  "intrathecal", "titrate", "reservoir", "intrathecal again",
]);
check("jargon: 4th unexplained term -> critical", escCritical.level === "critical");

// The exact three-term escalation sequence from the live probe (natural
// clinical sentences, each using a term WITHOUT explaining it): must climb
// confusion -> frustration -> disengagement.
const probeSeq = [
  "We'd deliver the baclofen through an intrathecal pump.",
  "We start on a low dose and titrate upward from there.",
  "The reservoir holds several months of medication before a refill.",
];
const s1 = computeJargonState(content.jargonBank, probeSeq.slice(0, 1));
const s2 = computeJargonState(content.jargonBank, probeSeq.slice(0, 2));
const s3 = computeJargonState(content.jargonBank, probeSeq.slice(0, 3));
check("jargon probe: term 1 (intrathecal) -> confusion", s1.count === 1 && s1.level === "confusion");
check("jargon probe: term 2 (titrate) -> frustration", s2.count === 2 && s2.level === "frustration", `got count ${s2.count}`);
check("jargon probe: term 3 (reservoir) -> disengagement", s3.count === 3 && s3.level === "disengagement", `got count ${s3.count}`);

// Incidental analogy-word overlap must NOT read as an explanation.
check("jargon: incidental overlap ('titrate the dose') still flags the term",
  detectUnexplainedJargon(content.jargonBank, "We titrate the dose over time.").some((e) => e.term === "titrate"));
// A genuine full paraphrase IS an explanation.
check("jargon: full paraphrase counts as explained",
  detectUnexplainedJargon(content.jargonBank, "We adjust the dose slowly, step by step — we titrate it.").length === 0);

// The patient prompt must never contain the analogy meaning (no self-explain).
const jargonPrompt = buildStandardizedPatientPrompt({ content, mode: "exam", tier: 2, sampledQuestionIds: sampled, transcript: tx("We'll use an intrathecal pump.") }).system;
check("prompt: lists jargon term but NOT its meaning (no self-explanation)",
  jargonPrompt.includes("intrathecal") && !jargonPrompt.includes("into the fluid around the spinal cord"),
  "the analogy meaning leaked into the patient prompt");
check("prompt: injects the escalation reaction for the current level",
  /unexplained medical word/i.test(jargonPrompt));

const selfCorrect = computeJargonState(content.jargonBank, [
  "We'll use an intrathecal pump.",                                   // +1
  "Sorry — intrathecal means into the fluid around the spinal cord.", // explains the flagged term -> reset
]);
check("jargon: self-correction (explains flagged term) resets the counter", selfCorrect.count === 0 && selfCorrect.level === "none");

// Explaining an UNRELATED term must NOT reset a prior flag.
const noReset = computeJargonState(content.jargonBank, [
  "We'll use an intrathecal pump.",                              // +1 (intrathecal flagged)
  "The reservoir, meaning the tank inside the pump, sits here.", // explains reservoir (never flagged) -> no reset
]);
check("jargon: explaining an unrelated term does NOT reset the counter", noReset.count === 1);

section("ITB · Pillar 5 — Question pool runtime");
const poolPrompt = p1.system;
check("pool: sampled question text present", poolPrompt.includes("What happens if the pump suddenly stops?") && poolPrompt.includes("carry my son"));
check("pool: unsampled question absent", !poolPrompt.includes("UNSAMPLED_Q"));
check("pool: check-in instruction on checkIn question", /does that make sense|check they've understood/i.test(poolPrompt));
// Negative direction: a pool of ONLY checkIn:false questions must emit no
// check-in instruction (guards against ignoring the flag and always adding it).
const noCheckInPrompt = buildStandardizedPatientPrompt({ content, mode: "exam", tier: 1, sampledQuestionIds: ["qlife"], transcript: tx() }).system;
check("pool: NO check-in instruction when only a checkIn:false question is sampled",
  !/does that make sense|check they've understood/i.test(noCheckInPrompt));

section("ITB · Pillar 6 — Closing & teach-back");
const noClose = evaluateClosing(content, ["What's the pain like?"]);
check("closing: not started without closing language", !noClose.closingStarted && !noClose.teachBackDone);

const closed = evaluateClosing(content, [
  "Before you go, let me recap: carry the pump ID card at all times, and refill appointments are not optional.",
  "Just so I know it's clear, can you tell me back what you'll do if the pump stops?",
]);
check("closing: closing language detected", closed.closingStarted);
check("closing: teach-back detected", closed.teachBackDone);
check("closing: mustCover coverage detected", closed.coveredCount === 2 && closed.totalMustCover === 2);

// Teach-back false-positive guard: a drug-history question must NOT clear the gate.
const historyOnly = evaluateClosing(content, [
  "What have you taken for the spasticity so far?",
  "Before you go, take this leaflet.",
]);
check("closing: drug-history question does NOT count as teach-back", !historyOnly.teachBackDone);

// Closing over-fire guard: an emergency-contact question must NOT start closing.
const contactMid = evaluateClosing(content, ["Who is your emergency contact at home?"]);
check("closing: 'emergency contact' question does NOT start closing", !contactMid.closingStarted);

const endMissed = buildEndState(evaluateClosing(content, ["Before you go, take this leaflet."]));
check("closing: teach-back missing -> silent critical fail recorded", endMissed.teachBackMissedCriticalFail === true);
const endOk = buildEndState(closed);
check("closing: teach-back present -> not a fail", endOk.teachBackMissedCriticalFail === false);

// End state must NOT carry verbatim examiner mustCover text (candidate-readable).
const endJson = JSON.stringify(buildEndState(closed));
check("closing: end state stores NO examiner mustCover text (leak guard)",
  !endJson.includes("Carry the pump ID card") && !endJson.includes("Refill appointments"),
  "mustCover text leaked into persisted end state");

check("closing: patient instructed never to prompt teach-back", /never prompt the doctor to summarise|teach-back/i.test(p1.system));

// ════════════════════════════════════════════════════════════════════════
//  STATION 2 — AXIAL SPONDYLOARTHRITIS (AS / PLX-PMR-AS-001)
//  Same engine, entirely different station data — proves no hard-coding.
// ════════════════════════════════════════════════════════════════════════
const as = AS_STATION;
const asTx = (...t: string[]) => txFor(as, ...t);

section("AS · Pillar 1 — AI Dial");
const asP1 = buildStandardizedPatientPrompt({ content: as, mode: "exam", tier: 1, sampledQuestionIds: AS_SAMPLED, transcript: asTx() });
const asP3 = buildStandardizedPatientPrompt({ content: as, mode: "exam", tier: 3, sampledQuestionIds: AS_SAMPLED, transcript: asTx() });
check("AS AI Dial: tier1 and tier3 prompts differ", asP1.system !== asP3.system);
check("AS AI Dial: patient identity comes from station data (Daniel Fischer)", asP1.system.includes("Daniel Fischer") && !asP1.system.includes("Omar"));
check("AS AI Dial: tier3 surfaces AS active-tier concealment", asP3.system.includes("Downplays it as muscular"));

section("AS · Pillar 4 — Progressive disclosure");
check("AS disclosure: cold conversation unlocks nothing", evaluateDisclosure(as.withheldFacts, []).size === 0);

// Direct-question rule — a targeted eye question unlocks the uveitis fact.
const asEye = evaluateDisclosure(as.withheldFacts, ["Have you ever had a red or painful eye?"]);
check("AS disclosure: eye question unlocks the uveitis (direct-question) fact", asEye.has(AS.EYE));
check("AS disclosure: eye question does NOT unlock empathy/exam facts", !asEye.has(AS.EMPATHY) && !asEye.has(AS.EXAM));

// Single-salient-word guard — one shared word ("eye") must not be enough.
const asEyeWeak = evaluateDisclosure(as.withheldFacts, ["Do your eyes ever get tired?"]);
check("AS disclosure: single shared word ('eye') does NOT unlock (needs 2 overlaps)", !asEyeWeak.has(AS.EYE));

// Empathy rule.
const asEmp = evaluateDisclosure(as.withheldFacts, ["That sounds really worrying — this must be frightening for you."]);
check("AS disclosure: empathy unlocks the fear-of-disability fact", asEmp.has(AS.EMPATHY));
check("AS disclosure: empathy does NOT unlock the direct-question fact", !asEmp.has(AS.EYE));

// Examination rule.
const asEx = evaluateDisclosure(as.withheldFacts, ["I'd like to examine your back and check how far you can bend."]);
check("AS disclosure: examination intent unlocks the spinal-movement fact", asEx.has(AS.EXAM));

// Builder: a locked fact's text never reaches the model; an unlocked one does.
const asLocked = buildStandardizedPatientPrompt({ content: as, mode: "exam", tier: 2, sampledQuestionIds: AS_SAMPLED, transcript: asTx("Hello, what's brought you in?") });
check("AS builder: locked uveitis fact text absent", !asLocked.system.includes("red, painful eye"));
const asUnlocked = buildStandardizedPatientPrompt({ content: as, mode: "exam", tier: 2, sampledQuestionIds: AS_SAMPLED, transcript: asTx("Have you ever had a red or painful eye?") });
check("AS builder: uveitis fact text present after the eye question", asUnlocked.system.includes("red, painful eye"));
check("AS builder: fear-of-disability fact still absent (empathy not yet shown)", !asUnlocked.system.includes("hunched over"));

section("AS · Pillar 2 — Jargon");
check("AS jargon: multi-word term 'ankylosing spondylitis' flagged when unexplained",
  detectUnexplainedJargon(as.jargonBank, "I think this is ankylosing spondylitis.").some((e) => e.term === "ankylosing spondylitis"));
check("AS jargon: 'inflammatory' flagged when unexplained",
  detectUnexplainedJargon(as.jargonBank, "The pain is inflammatory, not mechanical.").some((e) => e.term === "inflammatory"));
check("AS jargon: explained via cue not flagged",
  detectUnexplainedJargon(as.jargonBank, "You have ankylosing spondylitis, which means a type of arthritis that stiffens the spine.").length === 0);

// Three distinct AS terms climb confusion -> frustration -> disengagement.
const asJargonSeq = [
  "I think this is ankylosing spondylitis.",     // +1 confusion
  "The pain is inflammatory, not mechanical.",   // +1 frustration
  "We might start you on a biologic.",           // +1 disengagement
];
const aj1 = computeJargonState(as.jargonBank, asJargonSeq.slice(0, 1));
const aj2 = computeJargonState(as.jargonBank, asJargonSeq.slice(0, 2));
const aj3 = computeJargonState(as.jargonBank, asJargonSeq.slice(0, 3));
check("AS jargon: term 1 -> confusion", aj1.count === 1 && aj1.level === "confusion");
check("AS jargon: term 2 -> frustration", aj2.count === 2 && aj2.level === "frustration", `got count ${aj2.count}`);
check("AS jargon: term 3 -> disengagement", aj3.count === 3 && aj3.level === "disengagement", `got count ${aj3.count}`);

// Self-correction: explaining a previously-flagged term resets the counter.
const asReset = computeJargonState(as.jargonBank, [
  "I think this is ankylosing spondylitis.",
  "Sorry — ankylosing spondylitis just means a type of arthritis that inflames and stiffens the spine over time.",
]);
check("AS jargon: self-correction resets the counter", asReset.count === 0 && asReset.level === "none");

// A genuine analogy paraphrase WITHOUT any cue word still counts as explained
// (exercises the analogy-overlap branch on AS data, as ITB does).
check("AS jargon: full analogy paraphrase (no cue word) counts as explained",
  detectUnexplainedJargon(as.jargonBank, "The joints are inflammatory — swelling and irritation driven by your immune system, not the wear and tear of age.").length === 0);

// Explaining an UNRELATED (never-flagged) term must NOT reset a prior flag.
const asNoReset = computeJargonState(as.jargonBank, [
  "I think this is ankylosing spondylitis.",                                                              // +1 (flagged)
  "A biologic, which means a newer injected medicine that calms an overactive immune system, might help.", // explains 'biologic' (never flagged) -> no reset
]);
check("AS jargon: explaining an unrelated term does NOT reset the counter", asNoReset.count === 1);

// Prompt lists AS terms but never their analogy meanings.
const asJargonPrompt = buildStandardizedPatientPrompt({ content: as, mode: "exam", tier: 2, sampledQuestionIds: AS_SAMPLED, transcript: asTx("I think this is ankylosing spondylitis.") }).system;
check("AS prompt: lists jargon term but NOT its meaning",
  asJargonPrompt.includes("ankylosing spondylitis")
    && !asJargonPrompt.includes("a type of arthritis that inflames and stiffens the spine")
    && !asJargonPrompt.includes("calms down an overactive immune system"),
  "an AS analogy meaning leaked into the patient prompt");

section("AS · Pillar 5 — Question pool runtime");
check("AS pool: sampled questions present", asP1.system.includes("seen urgently") && asP1.system.includes("play football"));
check("AS pool: unsampled question absent", !asP1.system.includes("AS_UNSAMPLED_Q"));
check("AS pool: check-in instruction on the safety question", /does that make sense|check they've understood/i.test(asP1.system));
const asNoCheckIn = buildStandardizedPatientPrompt({ content: as, mode: "exam", tier: 1, sampledQuestionIds: ["as-life"], transcript: asTx() }).system;
check("AS pool: NO check-in instruction when only a checkIn:false question is sampled",
  !/does that make sense|check they've understood/i.test(asNoCheckIn));

section("AS · Pillar 6 — Closing & teach-back");
const asClosed = evaluateClosing(as, [
  "To recap: keep active, exercise regularly, and don't let stiffness stop you moving.",
  "And if your eye ever goes red and painful again, seek urgent eye review that same day.",
  "Before you go — in your own words, what will you do if your eye turns red and painful?",
]);
check("AS closing: closing language detected", asClosed.closingStarted);
check("AS closing: teach-back detected", asClosed.teachBackDone);
check("AS closing: mustCover coverage detected (both items)", asClosed.coveredCount === 2 && asClosed.totalMustCover === 2);

const asMissed = buildEndState(evaluateClosing(as, [
  "To recap: keep active and exercise regularly.",
  "Watch that eye — seek urgent eye review if it goes red and painful.",
]));
check("AS closing: teach-back omitted -> silent critical fail recorded", asMissed.teachBackMissedCriticalFail === true);

// Leak guard: the AS end state must not carry verbatim examiner mustCover text.
const asEndJson = JSON.stringify(buildEndState(asClosed));
check("AS closing: end state stores NO examiner mustCover text (leak guard)",
  !asEndJson.includes("Keep active and exercise regularly") && !asEndJson.includes("Seek urgent eye review"),
  "AS mustCover text leaked into persisted end state");

// ════════════════════════════════════════════════════════════════════════
//  SCRIPTED FULL ENCOUNTERS — phase machine gathering -> closing -> ended
// ════════════════════════════════════════════════════════════════════════
type Turn = {
  say: string;
  phase: "gathering" | "closing";
  note: string;
  /** Fact ids that MUST be unlocked after this turn — INDEPENDENT ground
   *  truth (hand-authored), so an over-disclosure bug that unlocks too much is
   *  caught rather than papered over by trusting the engine's own set. */
  expectUnlocked: string[];
};

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

function runEncounter(label: string, station: StationContent, sampledIds: string[], script: Turn[]): void {
  section(`Scripted encounter — ${label}`);
  const turns: TranscriptMessage[] = [{ role: "patient", text: station.openingStatement, at: "" }];
  for (const step of script) {
    turns.push({ role: "candidate", text: step.say, at: "" });
    turns.push({ role: "patient", text: "(reply)", at: "" });
    const st = computeEngineState(station, turns);
    check(`${label}: after "${step.note}" phase is ${step.phase}`, st.phase === step.phase, `got ${st.phase}`);
    // Independent ground truth: the unlocked set must be EXACTLY the expected
    // ids — neither under- nor OVER-disclosing.
    check(`${label}: unlocked set after "${step.note}" is exactly as expected`,
      sameSet(st.unlockedFactIds, step.expectUnlocked), `got [${st.unlockedFactIds.join(", ")}]`);
    // And the prompt must contain every expected-unlocked fact's text and no
    // other (cross-checks the builder against that independent set).
    const prompt = buildStandardizedPatientPrompt({ content: station, mode: "exam", tier: 2, sampledQuestionIds: sampledIds, transcript: turns }).system;
    const expected = new Set(step.expectUnlocked);
    const wrongFact = station.withheldFacts.some((f) => prompt.includes(f.fact) !== expected.has(f.id));
    check(`${label}: prompt facts match the expected unlocked set after "${step.note}"`, !wrongFact);
  }
  // End the encounter and assert the recorded end-state is coherent + leak-free.
  const finalClosing = evaluateClosing(station, turns.filter((m) => m.role === "candidate").map((m) => m.text));
  const end = buildEndState(finalClosing);
  const completedState = computeEngineState(station, turns, true);
  check(`${label}: completed encounter -> phase ended`, completedState.phase === "ended");
  check(`${label}: end state carries no examiner mustCover text`,
    !station.closing.mustCover.some((m) => JSON.stringify(end).includes(m)));
}

runEncounter("ITB", ITB_STATION, ITB_SAMPLED, [
  { say: "Hi Omar, I'm Dr Chen. What's brought you in today?", phase: "gathering", note: "open", expectUnlocked: [] },
  { say: "Have you ever reduced or stopped your baclofen yourself?", phase: "gathering", note: "direct question", expectUnlocked: [ITB.DIRECT] },
  { say: "I'm so sorry, that sounds really frightening.", phase: "gathering", note: "empathy", expectUnlocked: [ITB.DIRECT, ITB.EMPATHY] },
  { say: "Before we finish, let me recap: carry the pump ID card at all times, and refill appointments are not optional.", phase: "closing", note: "closing recap", expectUnlocked: [ITB.DIRECT, ITB.EMPATHY] },
  { say: "Just so I know it's clear, can you tell me back what you'll do if the pump stops?", phase: "closing", note: "teach-back", expectUnlocked: [ITB.DIRECT, ITB.EMPATHY] },
]);

runEncounter("AS", AS_STATION, AS_SAMPLED, [
  { say: "Morning Daniel, I'm Dr Vogt. Tell me about this back pain.", phase: "gathering", note: "open", expectUnlocked: [] },
  { say: "Have you ever had a red or painful eye?", phase: "gathering", note: "direct question", expectUnlocked: [AS.EYE] },
  { say: "That must be really worrying for you — take your time.", phase: "gathering", note: "empathy", expectUnlocked: [AS.EYE, AS.EMPATHY] },
  { say: "I'd like to examine your back and see how far you can bend.", phase: "gathering", note: "examination", expectUnlocked: [AS.EYE, AS.EMPATHY, AS.EXAM] },
  { say: "To recap: keep active and exercise regularly, and seek urgent eye review if the eye goes red and painful.", phase: "closing", note: "closing recap", expectUnlocked: [AS.EYE, AS.EMPATHY, AS.EXAM] },
  { say: "Before you go — in your own words, what will you do if your eye turns red and painful?", phase: "closing", note: "teach-back", expectUnlocked: [AS.EYE, AS.EMPATHY, AS.EXAM] },
]);

// ════════════════════════════════════════════════════════════════════════
//  PILLAR 3 — TUTOR (Socratic coach prompt: behaviour + leak-safety)
// ════════════════════════════════════════════════════════════════════════
section("Tutor coach (pillar 3)");
for (const [label, station] of [["ITB", ITB_STATION], ["AS", AS_STATION]] as const) {
  const coachTx: TranscriptMessage[] = [
    { role: "patient", text: station.openingStatement, at: "" },
    { role: "candidate", text: "So this is just wear and tear, nothing to worry about.", at: "" },
    { role: "patient", text: "(reply)", at: "" },
  ];
  const coach = buildTutorCoachPrompt({ content: station, transcript: coachTx });
  const blob = coach.system + "\n" + coach.messages.map((m) => m.content).join("\n");

  // POSITIVE invariants — the coach must actually be built and constrained, so
  // the leak checks below aren't passing merely because the prompt is empty.
  check(`${label} tutor: coach prompt is non-empty (system + user message)`,
    coach.system.trim().length > 0 && coach.messages.length > 0);
  check(`${label} tutor: [SILENT] sentinel instruction present`, coach.system.includes(TUTOR_SILENT));
  check(`${label} tutor: Socratic 'never give the answer' constraint present`,
    /Socratic/i.test(coach.system) && /never give the answer/i.test(coach.system) && /guiding question/i.test(coach.system));
  // Silence must be the EXPLICIT default, with the two concrete coach-only
  // triggers stated — so the coach doesn't fire on every turn.
  check(`${label} tutor: explicit silence-bias default present`,
    /most turns deserve no coaching/i.test(coach.system) && /when in doubt, stay silent/i.test(coach.system));
  check(`${label} tutor: the two coach-only triggers (clear miss / pivotal reveal) present`,
    /clear miss/i.test(coach.system) && /pivotal/i.test(coach.system));
  check(`${label} tutor: coaches on process (scoring-domain focus areas injected, not the answer key)`,
    /areas worth watching/i.test(coach.system));
  check(`${label} tutor: the candidate's turn is passed to the coach`, blob.includes("wear and tear"));

  // NEGATIVE invariants — no examiner answer-key material anywhere in the prompt.
  const factLeak = station.withheldFacts.some((f) => blob.includes(f.fact));
  const mustCoverLeak = station.closing.mustCover.some((m) => blob.includes(m));
  const answerLeak = station.questionPool.some((q) => q.expectedElements.some((e) => blob.includes(e)));
  const flagLeak = station.scoring.criticalFlags.some((c) => blob.includes(c.description));
  check(`${label} tutor: no withheld-fact text in the coach prompt`, !factLeak);
  check(`${label} tutor: no mustCover checklist text in the coach prompt`, !mustCoverLeak);
  check(`${label} tutor: no expected-answer keys in the coach prompt`, !answerLeak);
  check(`${label} tutor: no critical-flag text in the coach prompt`, !flagLeak);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
