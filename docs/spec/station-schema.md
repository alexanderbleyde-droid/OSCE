# Station Schema — the core contract

A station is a versioned data record. The engine is generic; all clinical
content lives here. Derived from the two reference stations (ITB PMR-002,
AS PLX-PMR-AS-001) and the V3 blueprint.

## Tables (Postgres)

### stations
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| code | text unique | e.g. "PLX-PMR-AS-001" |
| title | text | |
| specialty_id | uuid fk | specialties table |
| training_levels | text[] | student / resident / physician |
| status | enum | draft · enabled · disabled · archived |
| current_version | int | points at station_versions |
| created_by | uuid fk profiles | |
| timestamps | | |

### station_versions
Immutable once any attempt references them. New edits ⇒ new version row.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| station_id | uuid fk | |
| version | int | |
| content | jsonb | full StationContent (below), Zod-validated |
| created_at | timestamptz | |

### StationContent (jsonb, validated by Zod schema in lib/contracts/station.ts)
```
{
  patient: { name, age, gender, presentation, personaNotes },
  openingStatement: string,
  difficultyTiers: {            // AI Dial — pillar 1
    tier1..tier3: { concealmentLevel, description }
  },
  withheldFacts: [              // progressive disclosure — pillar 4
    { id, fact, disclosureRule: "direct-question" | "empathy-triggered"
        | "examination", tier }
  ],
  questionPool: [               // pillar 5
    { id, category: "safety" | "lifestyle" | "general",
      text, expectedElements[], checkIn: boolean }
  ],                            // constraint: ≥1 safety AND ≥1 lifestyle;
                                // engine samples 2–3 per encounter
  jargonBank: [                 // pillar 2
    { term, plainAnalogy }
  ],
  closing: {                    // pillar 6 — critical safety item
    teachBackRequired: true,
    mustCover: string[]
  },
  scoring: {                    // pillar 7
    domains: [ { key: "clinical-reasoning" | "safety" | "professionalism"
        | "communication" | "structure", weight } ],  // weights sum 100
    passThreshold: 65,
    criticalFlags: [ { id, description } ]   // any triggered ⇒ auto-fail
  },
  bridge: {                     // pillar 8 — Knowledge Bridge assets
    miniCases[], mcqs[], pearls[], frameworks[]
  }
}
```

## Lifecycle & gates
- draft → enabled requires validation: pool constraint met, weights sum 100,
  closing.mustCover non-empty, ≥1 criticalFlag reviewed.
- enabled → disabled hides from candidates; past attempts keep their
  station_version reference and remain scorable/reportable.
- Deleting is archival only. Never hard-delete a version with attempts.

## Attempts
attempts(id, user_id, station_version_id, mode: exam|tutor, transcript jsonb,
domain_scores jsonb, aggregate int, critical_failed bool, bridge_triggered
bool, completed_at). Bridge trigger rule: any domain < 50 OR critical_failed
OR any construct = 0.
