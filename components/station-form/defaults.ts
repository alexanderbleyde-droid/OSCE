import type { StationFormValues } from "@/lib/contracts/station-meta";

/** Fresh form values for a new draft. Tier concealment levels prefill with
 *  the reference stations' vocabulary (explicit / partial / concealed).
 *  Closing/scoring/bridge carry structural defaults — their editors arrive
 *  in the next step. */
export function emptyStationForm(): StationFormValues {
  return {
    meta: {
      code: "",
      title: "",
      specialtyId: "",
      trainingLevels: [],
    },
    content: {
      patient: {
        name: "",
        age: 45,
        gender: "",
        presentation: "",
        personaNotes: "",
      },
      openingStatement: "",
      difficultyTiers: {
        tier1: { concealmentLevel: "explicit", description: "" },
        tier2: { concealmentLevel: "partial", description: "" },
        tier3: { concealmentLevel: "concealed", description: "" },
      },
      withheldFacts: [],
      questionPool: [],
      jargonBank: [],
      closing: { teachBackRequired: true, mustCover: [] },
      scoring: {
        domains: [
          { key: "clinical-reasoning", weight: 20 },
          { key: "safety", weight: 20 },
          { key: "professionalism", weight: 20 },
          { key: "communication", weight: 20 },
          { key: "structure", weight: 20 },
        ],
        passThreshold: 65,
        criticalFlags: [],
      },
      bridge: { miniCases: [], mcqs: [], pearls: [], frameworks: [] },
    },
  };
}
