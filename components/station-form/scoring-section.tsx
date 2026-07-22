"use client";

import type { StationContent } from "@/lib/contracts/station";
import { Field, SectionCard, TextInput } from "./fields";

const DOMAIN_LABELS: Record<string, string> = {
  "clinical-reasoning": "Clinical reasoning",
  safety: "Safety",
  professionalism: "Professionalism",
  communication: "Communication",
  structure: "Structure",
};

/** Scoring — pillar 7. Five fixed domains whose weights must sum to 100
 *  (live indicator; enforced at publish), plus the critical-fail flags. */
export function ScoringSection({
  scoring,
  onChange,
  err,
  onRowsChanged,
}: {
  scoring: StationContent["scoring"];
  onChange: (scoring: StationContent["scoring"]) => void;
  err: (path: string) => string | undefined;
  onRowsChanged: () => void;
}) {
  const sum = scoring.domains.reduce(
    (total, d) => total + (Number.isFinite(d.weight) ? d.weight : 0),
    0,
  );
  const sumOk = sum === 100;

  return (
    <SectionCard
      icon={
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
      }
      title="Scoring domains & critical flags"
      sub="Weights across the five domains must total 100% to publish. Any triggered critical flag auto-fails the attempt regardless of score."
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
        <span className="field-label">Domain weights</span>
        <span className={`sum-pill ${sumOk ? "ok" : "bad"}`}>
          Total {Number.isFinite(sum) ? sum : "—"} / 100
        </span>
      </div>

      {scoring.domains.map((domain, i) => (
        <div key={domain.key} className="domain-row">
          <span className="domain-name">
            {DOMAIN_LABELS[domain.key] ?? domain.key}
            <span className="domain-key">{domain.key}</span>
          </span>
          <div>
            <div className={`input-suffix ${err(`content.scoring.domains.${i}.weight`) ? "invalid" : ""}`}>
              <input
                type="number"
                min={0}
                max={100}
                aria-label={`${DOMAIN_LABELS[domain.key] ?? domain.key} weight`}
                value={Number.isFinite(domain.weight) ? domain.weight : ""}
                onChange={(e) =>
                  onChange({
                    ...scoring,
                    domains: scoring.domains.map((d, idx) =>
                      idx === i ? { ...d, weight: e.target.valueAsNumber } : d,
                    ),
                  })
                }
              />
              <span className="input-suffix-label">%</span>
            </div>
            {err(`content.scoring.domains.${i}.weight`) && (
              <span className="field-error" style={{ display: "block", marginTop: 4 }}>
                {err(`content.scoring.domains.${i}.weight`)}
              </span>
            )}
          </div>
        </div>
      ))}

      <div className="field-hint" style={{ margin: "var(--space-3) 0 var(--space-6)" }}>
        Pass threshold is fixed at 65% by the engine contract; a critical
        fail overrides the aggregate.
      </div>

      <span className="field-label">Critical flags</span>
      <div style={{ marginTop: "var(--space-3)" }}>
        {scoring.criticalFlags.length === 0 && (
          <div className="array-empty">
            No critical flags yet — publishing requires at least one.
          </div>
        )}
        {scoring.criticalFlags.map((flag, i) => (
          <div key={flag.id} className="array-row" style={{ gridTemplateColumns: "1fr auto" }}>
            <Field
              label={`Flag ${i + 1} — description`}
              error={err(`content.scoring.criticalFlags.${i}.description`)}
            >
              <TextInput
                value={flag.description}
                invalid={!!err(`content.scoring.criticalFlags.${i}.description`)}
                placeholder="e.g. Fails to safety-net red flags"
                onChange={(v) =>
                  onChange({
                    ...scoring,
                    criticalFlags: scoring.criticalFlags.map((f, idx) =>
                      idx === i ? { ...f, description: v } : f,
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
                onRowsChanged();
                onChange({
                  ...scoring,
                  criticalFlags: scoring.criticalFlags.filter((_, idx) => idx !== i),
                });
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
              ...scoring,
              criticalFlags: [
                ...scoring.criticalFlags,
                { id: crypto.randomUUID(), description: "" },
              ],
            });
          }}
        >
          + Add critical flag
        </button>
      </div>
    </SectionCard>
  );
}
