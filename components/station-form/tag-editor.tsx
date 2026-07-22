"use client";

import { useState } from "react";

/** List-of-strings editor: type, Enter/Add, removable tags. */
export function TagEditor({
  values,
  onChange,
  placeholder,
  addLabel,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  addLabel?: string;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const trimmed = draft.trim();
    if (!trimmed || values.includes(trimmed)) return;
    onChange([...values, trimmed]);
    setDraft("");
  }

  return (
    <div className="tag-editor">
      <div className="tag-editor-input">
        <input
          type="text"
          className="input"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
        />
        <button type="button" className="btn-secondary" onClick={add}>
          {addLabel ?? "Add"}
        </button>
      </div>
      {values.length > 0 && (
        <div className="tag-list">
          {values.map((value, i) => (
            <span key={`${value}-${i}`} className="tag">
              {value}
              <button
                type="button"
                aria-label={`Remove ${value}`}
                onClick={() => onChange(values.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
