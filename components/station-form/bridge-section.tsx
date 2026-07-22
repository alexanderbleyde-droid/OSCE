"use client";

import type { StationContent } from "@/lib/contracts/station";
import { Field, SectionCard, TextArea, TextInput } from "./fields";
import { removeMcqOption } from "./mcq-utils";
import { TagEditor } from "./tag-editor";

type Bridge = StationContent["bridge"];

/** Knowledge Bridge assets — pillar 8. The remediation engine draws on
 *  these when a domain drops below 50%, a critical flag fires, or a
 *  construct scores 0. */
export function BridgeSection({
  bridge,
  onChange,
  err,
  onRowsChanged,
}: {
  bridge: Bridge;
  onChange: (bridge: Bridge) => void;
  err: (path: string) => string | undefined;
  onRowsChanged: () => void;
}) {
  return (
    <SectionCard
      icon={
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 12h4l3-9 4 18 3-9h6" />
        </svg>
      }
      title="Knowledge Bridge assets"
      sub="Remediation material: mini-cases, MCQs, clinical pearls, and framework reviews the Bridge generates learning from."
    >
      {/* ===== Mini-cases ===== */}
      <span className="field-label">Mini-cases</span>
      <div style={{ margin: "var(--space-3) 0 var(--space-6)" }}>
        {bridge.miniCases.length === 0 && (
          <div className="array-empty">No mini-cases yet.</div>
        )}
        {bridge.miniCases.map((mc, i) => (
          <div key={mc.id} className="array-row">
            <div className="array-row-head">
              <span className="array-row-label">Mini-case {i + 1}</span>
              <button
                type="button"
                className="row-remove"
                onClick={() => {
                  onRowsChanged();
                  onChange({ ...bridge, miniCases: bridge.miniCases.filter((_, idx) => idx !== i) });
                }}
              >
                Remove
              </button>
            </div>
            <Field label="Title" error={err(`content.bridge.miniCases.${i}.title`)}>
              <TextInput
                value={mc.title}
                invalid={!!err(`content.bridge.miniCases.${i}.title`)}
                onChange={(v) =>
                  onChange({
                    ...bridge,
                    miniCases: bridge.miniCases.map((m, idx) => (idx === i ? { ...m, title: v } : m)),
                  })
                }
              />
            </Field>
            <Field label="Scenario" error={err(`content.bridge.miniCases.${i}.scenario`)}>
              <TextArea
                value={mc.scenario}
                invalid={!!err(`content.bridge.miniCases.${i}.scenario`)}
                placeholder="A short clinical vignette"
                onChange={(v) =>
                  onChange({
                    ...bridge,
                    miniCases: bridge.miniCases.map((m, idx) => (idx === i ? { ...m, scenario: v } : m)),
                  })
                }
              />
            </Field>
            <div className="field-grid">
              <Field label="Prompt" error={err(`content.bridge.miniCases.${i}.prompt`)}>
                <TextInput
                  value={mc.prompt}
                  invalid={!!err(`content.bridge.miniCases.${i}.prompt`)}
                  placeholder="What the learner is asked"
                  onChange={(v) =>
                    onChange({
                      ...bridge,
                      miniCases: bridge.miniCases.map((m, idx) => (idx === i ? { ...m, prompt: v } : m)),
                    })
                  }
                />
              </Field>
              <Field label="Debrief" error={err(`content.bridge.miniCases.${i}.debrief`)}>
                <TextInput
                  value={mc.debrief}
                  invalid={!!err(`content.bridge.miniCases.${i}.debrief`)}
                  placeholder="The takeaway after answering"
                  onChange={(v) =>
                    onChange({
                      ...bridge,
                      miniCases: bridge.miniCases.map((m, idx) => (idx === i ? { ...m, debrief: v } : m)),
                    })
                  }
                />
              </Field>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            onRowsChanged();
            onChange({
              ...bridge,
              miniCases: [
                ...bridge.miniCases,
                { id: crypto.randomUUID(), title: "", scenario: "", prompt: "", debrief: "" },
              ],
            });
          }}
        >
          + Add mini-case
        </button>
      </div>

      {/* ===== MCQs ===== */}
      <span className="field-label">MCQs</span>
      <div style={{ margin: "var(--space-3) 0 var(--space-6)" }}>
        {bridge.mcqs.length === 0 && <div className="array-empty">No MCQs yet.</div>}
        {bridge.mcqs.map((mcq, i) => (
          <div key={mcq.id} className="array-row">
            <div className="array-row-head">
              <span className="array-row-label">MCQ {i + 1}</span>
              <button
                type="button"
                className="row-remove"
                onClick={() => {
                  onRowsChanged();
                  onChange({ ...bridge, mcqs: bridge.mcqs.filter((_, idx) => idx !== i) });
                }}
              >
                Remove
              </button>
            </div>
            <Field label="Question" error={err(`content.bridge.mcqs.${i}.question`)}>
              <TextInput
                value={mcq.question}
                invalid={!!err(`content.bridge.mcqs.${i}.question`)}
                onChange={(v) =>
                  onChange({
                    ...bridge,
                    mcqs: bridge.mcqs.map((m, idx) => (idx === i ? { ...m, question: v } : m)),
                  })
                }
              />
            </Field>
            <Field
              label="Options"
              hint="Mark the correct answer. At least two options to publish."
              error={
                err(`content.bridge.mcqs.${i}.options`) ??
                err(`content.bridge.mcqs.${i}.correctIndex`)
              }
            >
              <div>
                {mcq.options.map((option, oi) => (
                  <div key={`${mcq.id}-opt-${oi}`} className="option-row">
                    <label className={`option-correct ${mcq.correctIndex === oi ? "on" : ""}`}>
                      <input
                        type="radio"
                        name={`mcq-correct-${mcq.id}`}
                        checked={mcq.correctIndex === oi}
                        onChange={() =>
                          onChange({
                            ...bridge,
                            mcqs: bridge.mcqs.map((m, idx) =>
                              idx === i ? { ...m, correctIndex: oi } : m,
                            ),
                          })
                        }
                      />
                      correct
                    </label>
                    <input
                      type="text"
                      className={`input ${err(`content.bridge.mcqs.${i}.options.${oi}`) ? "invalid" : ""}`}
                      value={option}
                      placeholder={`Option ${oi + 1}`}
                      onChange={(e) =>
                        onChange({
                          ...bridge,
                          mcqs: bridge.mcqs.map((m, idx) =>
                            idx === i
                              ? { ...m, options: m.options.map((o, oidx) => (oidx === oi ? e.target.value : o)) }
                              : m,
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      className="row-remove"
                      aria-label={`Remove option ${oi + 1}`}
                      onClick={() => {
                        onRowsChanged();
                        onChange({
                          ...bridge,
                          mcqs: bridge.mcqs.map((m, idx) =>
                            idx === i ? removeMcqOption(m, oi) : m,
                          ),
                        });
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ marginTop: "var(--space-2)" }}
                  onClick={() =>
                    onChange({
                      ...bridge,
                      mcqs: bridge.mcqs.map((m, idx) =>
                        idx === i ? { ...m, options: [...m.options, ""] } : m,
                      ),
                    })
                  }
                >
                  + Add option
                </button>
                {mcq.correctIndex === null && (
                  <span className="field-error" style={{ display: "block", marginTop: "var(--space-2)" }}>
                    Mark the correct answer
                  </span>
                )}
              </div>
            </Field>
            <Field label="Explanation" error={err(`content.bridge.mcqs.${i}.explanation`)}>
              <TextInput
                value={mcq.explanation}
                invalid={!!err(`content.bridge.mcqs.${i}.explanation`)}
                placeholder="Why the correct answer is correct"
                onChange={(v) =>
                  onChange({
                    ...bridge,
                    mcqs: bridge.mcqs.map((m, idx) => (idx === i ? { ...m, explanation: v } : m)),
                  })
                }
              />
            </Field>
          </div>
        ))}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            onRowsChanged();
            onChange({
              ...bridge,
              mcqs: [
                ...bridge.mcqs,
                // correctIndex starts UNSET — the author must explicitly choose.
                { id: crypto.randomUUID(), question: "", options: ["", ""], correctIndex: null, explanation: "" },
              ],
            });
          }}
        >
          + Add MCQ
        </button>
      </div>

      {/* ===== Pearls ===== */}
      <span className="field-label">Clinical pearls</span>
      <div style={{ margin: "var(--space-3) 0 var(--space-6)" }}>
        {bridge.pearls.length === 0 && <div className="array-empty">No pearls yet.</div>}
        {bridge.pearls.map((pearl, i) => (
          <div key={pearl.id} className="array-row" style={{ gridTemplateColumns: "240px 1fr auto" }}>
            <Field label="Title" error={err(`content.bridge.pearls.${i}.title`)}>
              <TextInput
                value={pearl.title}
                invalid={!!err(`content.bridge.pearls.${i}.title`)}
                onChange={(v) =>
                  onChange({
                    ...bridge,
                    pearls: bridge.pearls.map((p, idx) => (idx === i ? { ...p, title: v } : p)),
                  })
                }
              />
            </Field>
            <Field label="Pearl" error={err(`content.bridge.pearls.${i}.text`)}>
              <TextInput
                value={pearl.text}
                invalid={!!err(`content.bridge.pearls.${i}.text`)}
                placeholder="The teaching point"
                onChange={(v) =>
                  onChange({
                    ...bridge,
                    pearls: bridge.pearls.map((p, idx) => (idx === i ? { ...p, text: v } : p)),
                  })
                }
              />
            </Field>
            <button
              type="button"
              className="row-remove"
              style={{ alignSelf: "center" }}
              onClick={() => {
                onRowsChanged();
                onChange({ ...bridge, pearls: bridge.pearls.filter((_, idx) => idx !== i) });
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
            onRowsChanged();
            onChange({
              ...bridge,
              pearls: [...bridge.pearls, { id: crypto.randomUUID(), title: "", text: "" }],
            });
          }}
        >
          + Add pearl
        </button>
      </div>

      {/* ===== Frameworks ===== */}
      <span className="field-label">Framework reviews</span>
      <div style={{ marginTop: "var(--space-3)" }}>
        {bridge.frameworks.length === 0 && <div className="array-empty">No frameworks yet.</div>}
        {bridge.frameworks.map((fw, i) => (
          <div key={fw.id} className="array-row">
            <div className="array-row-head">
              <span className="array-row-label">Framework {i + 1}</span>
              <button
                type="button"
                className="row-remove"
                onClick={() => {
                  onRowsChanged();
                  onChange({ ...bridge, frameworks: bridge.frameworks.filter((_, idx) => idx !== i) });
                }}
              >
                Remove
              </button>
            </div>
            <div className="field-grid">
              <Field label="Name" error={err(`content.bridge.frameworks.${i}.name`)}>
                <TextInput
                  value={fw.name}
                  invalid={!!err(`content.bridge.frameworks.${i}.name`)}
                  placeholder="e.g. Calgary-Cambridge stages"
                  onChange={(v) =>
                    onChange({
                      ...bridge,
                      frameworks: bridge.frameworks.map((f, idx) => (idx === i ? { ...f, name: v } : f)),
                    })
                  }
                />
              </Field>
              <Field label="Summary" error={err(`content.bridge.frameworks.${i}.summary`)}>
                <TextInput
                  value={fw.summary}
                  invalid={!!err(`content.bridge.frameworks.${i}.summary`)}
                  placeholder="One-line description"
                  onChange={(v) =>
                    onChange({
                      ...bridge,
                      frameworks: bridge.frameworks.map((f, idx) => (idx === i ? { ...f, summary: v } : f)),
                    })
                  }
                />
              </Field>
            </div>
            <Field
              label="Stages"
              hint="Press Enter to add each stage in order."
              error={err(`content.bridge.frameworks.${i}.stages`)}
            >
              <TagEditor
                values={fw.stages}
                onChange={(stages) =>
                  onChange({
                    ...bridge,
                    frameworks: bridge.frameworks.map((f, idx) => (idx === i ? { ...f, stages } : f)),
                  })
                }
                placeholder="e.g. initiating"
              />
            </Field>
          </div>
        ))}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            onRowsChanged();
            onChange({
              ...bridge,
              frameworks: [
                ...bridge.frameworks,
                { id: crypto.randomUUID(), name: "", summary: "", stages: [] },
              ],
            });
          }}
        >
          + Add framework
        </button>
      </div>
    </SectionCard>
  );
}
