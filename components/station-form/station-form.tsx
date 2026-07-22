"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveStationAction } from "@/app/admin/stations/actions";
import type { Specialty, TrainingLevel } from "@/lib/contracts/db";
import type {
  DisclosureRule,
  PoolQuestion,
  QuestionCategory,
  StationContent,
  WithheldFact,
} from "@/lib/contracts/station";
import {
  stationFormSchema,
  zodIssuesToMap,
  type StationFormValues,
} from "@/lib/contracts/station-meta";
import { Field, SectionCard, Select, TextArea, TextInput, Toggle } from "./fields";
import { TagEditor } from "./tag-editor";

const LEVELS: TrainingLevel[] = ["student", "resident", "physician"];
const DISCLOSURE_RULES: { value: DisclosureRule; label: string }[] = [
  { value: "direct-question", label: "Direct question" },
  { value: "empathy-triggered", label: "Empathy-triggered" },
  { value: "examination", label: "Examination" },
];
const CATEGORIES: { value: QuestionCategory; label: string }[] = [
  { value: "safety", label: "Safety" },
  { value: "lifestyle", label: "Lifestyle" },
  { value: "general", label: "General" },
];
const TIERS = [
  { key: "tier1" as const, label: "Tier 1 · Basic" },
  { key: "tier2" as const, label: "Tier 2 · Intermediate" },
  { key: "tier3" as const, label: "Tier 3 · Advanced" },
];

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

export function StationForm({
  specialties,
  initial,
  stationId,
  version,
}: {
  specialties: Specialty[];
  initial: StationFormValues;
  stationId: string | null;
  /** Version being edited — optimistic-concurrency check on save. */
  version: number;
}) {
  const router = useRouter();
  const [values, setValues] = useState<StationFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Survives the create -> edit transition: a second Save before navigation
  // completes must UPDATE the just-created draft, never create a duplicate.
  const [savedId, setSavedId] = useState<string | null>(stationId);
  const [navPending, startNavTransition] = useTransition();
  const bannerRef = useRef<HTMLDivElement>(null);

  // Errors are reported ONCE, in the top banner — bring it into view when
  // the save happened at the bottom of a long form.
  useEffect(() => {
    if (status.kind === "error") {
      bannerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [status]);

  const busy = status.kind === "saving" || navPending;
  const { meta, content } = values;

  function setMeta(patch: Partial<StationFormValues["meta"]>) {
    setValues((v) => ({ ...v, meta: { ...v.meta, ...patch } }));
  }
  function setContent(patch: Partial<StationContent>) {
    setValues((v) => ({ ...v, content: { ...v.content, ...patch } }));
  }
  function setPatient(patch: Partial<StationContent["patient"]>) {
    setContent({ patient: { ...content.patient, ...patch } });
  }

  async function handleSave() {
    const parsed = stationFormSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(zodIssuesToMap(parsed.error));
      setStatus({ kind: "error", message: "Fix the highlighted fields and save again." });
      return;
    }
    setErrors({});
    setStatus({ kind: "saving" });
    const wasCreate = savedId === null;
    const result = await saveStationAction(savedId, version, parsed.data);
    if (result.ok) {
      setSavedId(result.stationId);
      setStatus({
        kind: "saved",
        at: new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date()),
      });
      // The whole form stays disabled (fieldset) until navigation lands —
      // no edits can be silently discarded by the remount.
      startNavTransition(() => {
        if (wasCreate) {
          router.replace(`/admin/stations/${result.stationId}/edit`);
        }
        router.refresh();
      });
    } else {
      setErrors(result.errors);
      setStatus({ kind: "error", message: result.message });
    }
  }

  const err = (path: string) => errors[path];

  /** Index-keyed errors go stale when rows shift — drop a section's errors
   *  whenever its rows are added/removed; the next save revalidates. */
  function clearSectionErrors(prefix: string) {
    setErrors((current) => {
      const next: Record<string, string> = {};
      for (const [key, value] of Object.entries(current)) {
        if (!key.startsWith(prefix)) next[key] = value;
      }
      return next;
    });
  }

  return (
    <div>
      {status.kind === "error" && (
        <div className="form-banner-error" role="alert" ref={bannerRef}>
          {status.message}
        </div>
      )}

      <fieldset className="form-fieldset" disabled={busy}>
      {/* ===== Identity ===== */}
      <SectionCard
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" />
            <line x1="12" y1="4" x2="12" y2="20" />
            <line x1="8" y1="20" x2="16" y2="20" />
          </svg>
        }
        title="Identity"
        sub="Code, title, specialty, and who the station is for."
      >
        <div className="field-grid">
          <Field label="Station code" htmlFor="code" error={err("meta.code")} hint="e.g. PLX-PMR-AS-001">
            <TextInput id="code" mono value={meta.code} invalid={!!err("meta.code")} placeholder="PLX-…" onChange={(v) => setMeta({ code: v })} />
          </Field>
          <Field label="Title" htmlFor="title" error={err("meta.title")}>
            <TextInput id="title" value={meta.title} invalid={!!err("meta.title")} placeholder="Station title" onChange={(v) => setMeta({ title: v })} />
          </Field>
          <Field label="Specialty" htmlFor="specialty" error={err("meta.specialtyId")}>
            <Select id="specialty" value={meta.specialtyId} invalid={!!err("meta.specialtyId")} onChange={(v) => setMeta({ specialtyId: v })}>
              <option value="">Choose a specialty…</option>
              {specialties.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Training levels" error={err("meta.trainingLevels")}>
            <div className="pill-checks">
              {LEVELS.map((level) => {
                const on = meta.trainingLevels.includes(level);
                return (
                  <label key={level} className={`pill-check ${on ? "on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setMeta({
                          trainingLevels: on
                            ? meta.trainingLevels.filter((l) => l !== level)
                            : [...meta.trainingLevels, level],
                        })
                      }
                    />
                    {level}
                  </label>
                );
              })}
            </div>
          </Field>
        </div>
      </SectionCard>

      {/* ===== Patient & opening ===== */}
      <SectionCard
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        }
        title="Patient & opening"
        sub="Who the standardized patient is and the first thing they say."
      >
        <div className="field-grid">
          <Field label="Name" htmlFor="p-name" error={err("content.patient.name")}>
            <TextInput id="p-name" value={content.patient.name} invalid={!!err("content.patient.name")} onChange={(v) => setPatient({ name: v })} />
          </Field>
          <Field label="Age" htmlFor="p-age" error={err("content.patient.age")}>
            <input
              id="p-age"
              type="number"
              min={0}
              max={130}
              className={`input ${err("content.patient.age") ? "invalid" : ""}`}
              value={Number.isFinite(content.patient.age) ? content.patient.age : ""}
              onChange={(e) => setPatient({ age: e.target.valueAsNumber })}
            />
          </Field>
          <Field label="Gender" htmlFor="p-gender" error={err("content.patient.gender")}>
            <TextInput id="p-gender" value={content.patient.gender} invalid={!!err("content.patient.gender")} placeholder="female / male / …" onChange={(v) => setPatient({ gender: v })} />
          </Field>
        </div>
        <Field label="Presentation" htmlFor="p-pres" error={err("content.patient.presentation")} hint="One-line clinical presentation shown to the engine, never to the candidate.">
          <TextInput id="p-pres" value={content.patient.presentation} invalid={!!err("content.patient.presentation")} onChange={(v) => setPatient({ presentation: v })} />
        </Field>
        <Field label="Persona notes" htmlFor="p-notes" error={err("content.patient.personaNotes")} hint="Speech style, mood, worries — optional.">
          <TextArea id="p-notes" value={content.patient.personaNotes} onChange={(v) => setPatient({ personaNotes: v })} />
        </Field>
        <Field label="Opening statement" htmlFor="opening" error={err("content.openingStatement")}>
          <TextArea id="opening" value={content.openingStatement} invalid={!!err("content.openingStatement")} placeholder="The patient's first words in the encounter…" onChange={(v) => setContent({ openingStatement: v })} />
        </Field>
      </SectionCard>

      {/* ===== Difficulty tiers ===== */}
      <SectionCard
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
        }
        title="Difficulty tiers — AI Dial"
        sub="One locked case run at three concealment levels. The dial varies presentation, never the facts or rubric."
      >
        {TIERS.map((tier) => (
          <div key={tier.key} className="array-row" style={{ gridTemplateColumns: "160px 200px 1fr" }}>
            <span className="array-row-label" style={{ alignSelf: "center" }}>{tier.label}</span>
            <Field label="Concealment level" error={err(`content.difficultyTiers.${tier.key}.concealmentLevel`)}>
              <TextInput
                value={content.difficultyTiers[tier.key].concealmentLevel}
                invalid={!!err(`content.difficultyTiers.${tier.key}.concealmentLevel`)}
                onChange={(v) =>
                  setContent({
                    difficultyTiers: {
                      ...content.difficultyTiers,
                      [tier.key]: { ...content.difficultyTiers[tier.key], concealmentLevel: v },
                    },
                  })
                }
              />
            </Field>
            <Field label="Description" error={err(`content.difficultyTiers.${tier.key}.description`)}>
              <TextInput
                value={content.difficultyTiers[tier.key].description}
                invalid={!!err(`content.difficultyTiers.${tier.key}.description`)}
                placeholder="How the patient behaves at this tier"
                onChange={(v) =>
                  setContent({
                    difficultyTiers: {
                      ...content.difficultyTiers,
                      [tier.key]: { ...content.difficultyTiers[tier.key], description: v },
                    },
                  })
                }
              />
            </Field>
          </div>
        ))}
      </SectionCard>

      {/* ===== Withheld facts ===== */}
      <SectionCard
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        }
        title="Withheld facts — progressive disclosure"
        sub="Facts the patient only reveals on the right cue, at the tier they belong to."
      >
        {content.withheldFacts.length === 0 && (
          <div className="array-empty">No withheld facts yet — add the first one.</div>
        )}
        {content.withheldFacts.map((fact, i) => (
          <WithheldFactRow
            key={fact.id}
            index={i}
            fact={fact}
            err={err}
            onChange={(next) =>
              setContent({
                withheldFacts: content.withheldFacts.map((f, idx) => (idx === i ? next : f)),
              })
            }
            onRemove={() => {
              clearSectionErrors("content.withheldFacts");
              setContent({ withheldFacts: content.withheldFacts.filter((_, idx) => idx !== i) });
            }}
          />
        ))}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            clearSectionErrors("content.withheldFacts");
            setContent({
              withheldFacts: [
                ...content.withheldFacts,
                { id: crypto.randomUUID(), fact: "", disclosureRule: "direct-question", tier: 1 },
              ],
            });
          }}
        >
          + Add withheld fact
        </button>
      </SectionCard>

      {/* ===== Question pool ===== */}
      <SectionCard
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        }
        title="Question pool"
        sub="The engine samples 2–3 per encounter. Publishing requires at least one safety and one lifestyle question — drafts can save without."
      >
        {content.questionPool.length === 0 && (
          <div className="array-empty">No pool questions yet — add the first one.</div>
        )}
        {content.questionPool.map((q, i) => (
          <QuestionRow
            key={q.id}
            index={i}
            question={q}
            err={err}
            onChange={(next) =>
              setContent({
                questionPool: content.questionPool.map((item, idx) => (idx === i ? next : item)),
              })
            }
            onRemove={() => {
              clearSectionErrors("content.questionPool");
              setContent({ questionPool: content.questionPool.filter((_, idx) => idx !== i) });
            }}
          />
        ))}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            clearSectionErrors("content.questionPool");
            setContent({
              questionPool: [
                ...content.questionPool,
                { id: crypto.randomUUID(), category: "general", text: "", expectedElements: [], checkIn: false },
              ],
            });
          }}
        >
          + Add question
        </button>
      </SectionCard>

      {/* ===== Jargon bank ===== */}
      <SectionCard
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        }
        title="Jargon bank"
        sub="Terms that trigger in-character confusion, each with the plain analogy the patient understands."
      >
        {content.jargonBank.length === 0 && (
          <div className="array-empty">No jargon entries yet — add the first one.</div>
        )}
        {content.jargonBank.map((entry, i) => (
          <div key={`jargon-${i}`} className="array-row" style={{ gridTemplateColumns: "220px 1fr auto" }}>
            <Field label="Term" error={err(`content.jargonBank.${i}.term`)}>
              <TextInput
                value={entry.term}
                invalid={!!err(`content.jargonBank.${i}.term`)}
                placeholder="contraindicated"
                onChange={(v) =>
                  setContent({
                    jargonBank: content.jargonBank.map((j, idx) => (idx === i ? { ...j, term: v } : j)),
                  })
                }
              />
            </Field>
            <Field label="Plain analogy" error={err(`content.jargonBank.${i}.plainAnalogy`)}>
              <TextInput
                value={entry.plainAnalogy}
                invalid={!!err(`content.jargonBank.${i}.plainAnalogy`)}
                placeholder="something your body can't safely handle"
                onChange={(v) =>
                  setContent({
                    jargonBank: content.jargonBank.map((j, idx) =>
                      idx === i ? { ...j, plainAnalogy: v } : j,
                    ),
                  })
                }
              />
            </Field>
            <button
              type="button"
              className="row-remove"
              style={{ alignSelf: "center" }}
              onClick={() => {
                clearSectionErrors("content.jargonBank");
                setContent({ jargonBank: content.jargonBank.filter((_, idx) => idx !== i) });
              }}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            clearSectionErrors("content.jargonBank");
            setContent({ jargonBank: [...content.jargonBank, { term: "", plainAnalogy: "" }] });
          }}
        >
          + Add term
        </button>
      </SectionCard>
      </fieldset>

      {/* ===== Save bar ===== */}
      <div className="save-bar">
        <span className={`save-bar-status ${status.kind === "saved" ? "ok" : ""}`}>
          {status.kind === "idle" && "Draft saves are explicit — nothing is stored until you save."}
          {status.kind === "saving" && "Saving draft…"}
          {status.kind === "saved" && `Draft saved at ${status.at}`}
          {/* error state: reported once, in the top banner */}
        </span>
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() => void handleSave()}
        >
          {busy ? "Saving…" : "Save draft"}
        </button>
      </div>
    </div>
  );
}

function WithheldFactRow({
  index,
  fact,
  err,
  onChange,
  onRemove,
}: {
  index: number;
  fact: WithheldFact;
  err: (path: string) => string | undefined;
  onChange: (fact: WithheldFact) => void;
  onRemove: () => void;
}) {
  return (
    <div className="array-row">
      <div className="array-row-head">
        <span className="array-row-label">Fact {index + 1}</span>
        <button type="button" className="row-remove" onClick={onRemove}>
          Remove
        </button>
      </div>
      <Field label="Fact" error={err(`content.withheldFacts.${index}.fact`)}>
        <TextInput
          value={fact.fact}
          invalid={!!err(`content.withheldFacts.${index}.fact`)}
          placeholder="What the patient is holding back"
          onChange={(v) => onChange({ ...fact, fact: v })}
        />
      </Field>
      <div className="field-grid">
        <Field label="Disclosure rule" error={err(`content.withheldFacts.${index}.disclosureRule`)}>
          <Select
            ariaLabel="Disclosure rule"
            value={fact.disclosureRule}
            onChange={(v) => onChange({ ...fact, disclosureRule: v as DisclosureRule })}
          >
            {DISCLOSURE_RULES.map((rule) => (
              <option key={rule.value} value={rule.value}>{rule.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tier" error={err(`content.withheldFacts.${index}.tier`)}>
          <Select
            ariaLabel="Tier"
            value={String(fact.tier)}
            onChange={(v) => onChange({ ...fact, tier: Number(v) })}
          >
            <option value="1">Tier 1</option>
            <option value="2">Tier 2</option>
            <option value="3">Tier 3</option>
          </Select>
        </Field>
      </div>
    </div>
  );
}

function QuestionRow({
  index,
  question,
  err,
  onChange,
  onRemove,
}: {
  index: number;
  question: PoolQuestion;
  err: (path: string) => string | undefined;
  onChange: (question: PoolQuestion) => void;
  onRemove: () => void;
}) {
  return (
    <div className="array-row">
      <div className="array-row-head">
        <span className="array-row-label">Question {index + 1}</span>
        <button type="button" className="row-remove" onClick={onRemove}>
          Remove
        </button>
      </div>
      <div className="field-grid">
        <Field label="Category" error={err(`content.questionPool.${index}.category`)}>
          <Select
            ariaLabel="Category"
            value={question.category}
            onChange={(v) => onChange({ ...question, category: v as QuestionCategory })}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
        </Field>
        <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 16 }}>
          <Toggle
            on={question.checkIn}
            onChange={(on) => onChange({ ...question, checkIn: on })}
            label="Check-in question"
          />
        </div>
      </div>
      <Field label="Question text" error={err(`content.questionPool.${index}.text`)}>
        <TextInput
          value={question.text}
          invalid={!!err(`content.questionPool.${index}.text`)}
          placeholder="What the patient asks or raises"
          onChange={(v) => onChange({ ...question, text: v })}
        />
      </Field>
      <Field
        label="Expected elements"
        hint="What a good answer covers — press Enter to add each element."
        error={err(`content.questionPool.${index}.expectedElements`)}
      >
        <TagEditor
          values={question.expectedElements}
          onChange={(values) => onChange({ ...question, expectedElements: values })}
          placeholder="e.g. Red-flag safety netting"
        />
      </Field>
    </div>
  );
}
