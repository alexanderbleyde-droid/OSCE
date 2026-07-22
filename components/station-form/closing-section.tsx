"use client";

import type { StationContent } from "@/lib/contracts/station";
import { Field, SectionCard, Toggle } from "./fields";
import { TagEditor } from "./tag-editor";

/** Closing & teach-back — pillar 6. Teach-back is locked ON per the
 *  station contract (closing.teachBackRequired is literal true). */
export function ClosingSection({
  closing,
  onChange,
  err,
}: {
  closing: StationContent["closing"];
  onChange: (closing: StationContent["closing"]) => void;
  err: (path: string) => string | undefined;
}) {
  return (
    <SectionCard
      icon={
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      }
      title="Closing & teach-back"
      sub="The critical safety close: what the candidate must cover before the encounter can end, confirmed by patient teach-back."
    >
      <div className="field" style={{ marginBottom: "var(--space-5)" }}>
        <Toggle on disabled onChange={() => undefined} label="Teach-back required" />
        <span className="field-hint">
          Locked on — every station requires teach-back (station contract).
        </span>
      </div>

      <Field
        label="Must-cover items"
        hint="Each item the closing must address — press Enter to add. Publishing requires at least one."
        error={err("content.closing.mustCover")}
      >
        <TagEditor
          values={closing.mustCover}
          onChange={(mustCover) => onChange({ ...closing, mustCover })}
          placeholder="e.g. When to seek urgent help"
        />
      </Field>
    </SectionCard>
  );
}
