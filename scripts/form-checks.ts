/**
 * Scripted checks for form editor logic — run with: npm run checks:form
 * Covers the MCQ correct-answer semantics (checkpoint 3 feedback) and the
 * contract's draft-vs-publish treatment of an unset correct answer.
 */

import { removeMcqOption } from "../components/station-form/mcq-utils.ts";
import {
  bridgeMcqSchema,
  stationContentSchema,
  stationEnableSchema,
} from "../lib/contracts/station.ts";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---------- removeMcqOption semantics ----------
const base = { options: ["A", "B", "C", "D"], correctIndex: 1 as number | null };

// 1. remove a non-correct option BEFORE the correct one -> marker follows the option
let r = removeMcqOption(base, 0);
check(
  "remove non-correct before: same OPTION stays correct",
  r.correctIndex === 0 && r.options[r.correctIndex] === "B",
  JSON.stringify(r),
);

// 2. remove a non-correct option AFTER the correct one -> index unchanged, option unchanged
r = removeMcqOption(base, 3);
check(
  "remove non-correct after: same OPTION stays correct",
  r.correctIndex === 1 && r.options[r.correctIndex] === "B",
  JSON.stringify(r),
);

// 3. remove THE CORRECT option -> selection cleared, nothing promoted
r = removeMcqOption(base, 1);
check(
  "remove the correct option: selection cleared (null)",
  r.correctIndex === null,
  JSON.stringify(r),
);

// 4. the user's exact repro: correct on option index 1 of 3, add a 4th,
//    mark IT correct, delete it -> must clear, never land on index 0
let mcq = { options: ["A", "B", "C"], correctIndex: 1 as number | null };
mcq = { ...mcq, options: [...mcq.options, "D"] };
mcq = { ...mcq, correctIndex: 3 };
mcq = removeMcqOption(mcq, 3);
check(
  "repro: delete newly-added correct 4th option -> cleared, not index 0",
  mcq.correctIndex === null && mcq.options.length === 3,
  JSON.stringify(mcq),
);

// 5. unset selection stays unset through unrelated removals
r = removeMcqOption({ options: ["A", "B", "C"], correctIndex: null }, 2);
check("unset selection survives removals as unset", r.correctIndex === null);

// ---------- contract: draft vs publish ----------
const draftMcq = {
  id: "m1",
  question: "Q?",
  options: ["A", "B"],
  correctIndex: null as number | null,
  explanation: "E",
};
check(
  "contract: draft MCQ with UNSET correct answer is savable",
  bridgeMcqSchema.safeParse(draftMcq).success,
);

const content = {
  patient: { name: "N", age: 40, gender: "f", presentation: "p", personaNotes: "" },
  openingStatement: "Hi",
  difficultyTiers: {
    tier1: { concealmentLevel: "explicit", description: "d1" },
    tier2: { concealmentLevel: "partial", description: "d2" },
    tier3: { concealmentLevel: "concealed", description: "d3" },
  },
  withheldFacts: [],
  questionPool: [
    { id: "q1", category: "safety", text: "s?", expectedElements: [], checkIn: false },
    { id: "q2", category: "lifestyle", text: "l?", expectedElements: [], checkIn: false },
  ],
  jargonBank: [],
  closing: { teachBackRequired: true, mustCover: ["x"] },
  scoring: {
    domains: [
      { key: "clinical-reasoning", weight: 20 }, { key: "safety", weight: 20 },
      { key: "professionalism", weight: 20 }, { key: "communication", weight: 20 },
      { key: "structure", weight: 20 },
    ],
    passThreshold: 65,
    criticalFlags: [{ id: "cf", description: "flag" }],
  },
  bridge: { miniCases: [], mcqs: [draftMcq], pearls: [], frameworks: [] },
};

check(
  "contract: full draft content with unset correct answer passes BASE schema",
  stationContentSchema.safeParse(content).success,
);

const gateUnset = stationEnableSchema.safeParse(content);
check(
  "gate: unset correct answer BLOCKS enabling with 'Mark the correct answer'",
  !gateUnset.success &&
    gateUnset.error.issues.some(
      (i) => i.path.join(".") === "bridge.mcqs.0.correctIndex" && i.message === "Mark the correct answer",
    ),
  gateUnset.success ? "gate passed unexpectedly" : gateUnset.error.issues.map((i) => i.message).join("; "),
);

const outOfRange = structuredClone(content);
outOfRange.bridge.mcqs[0].correctIndex = 5;
const gateRange = stationEnableSchema.safeParse(outOfRange);
check(
  "gate: out-of-range correct index blocked",
  !gateRange.success &&
    gateRange.error.issues.some((i) => i.message === "Correct answer must be one of the options"),
);

const valid = structuredClone(content);
valid.bridge.mcqs[0].correctIndex = 1;
check("gate: set correct answer passes", stationEnableSchema.safeParse(valid).success);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
