"use client";

import { useState } from "react";
import type { TrainingLevel } from "@/lib/contracts/db";
import { StartAttemptModal } from "./start-attempt-modal";

export type CandidateStation = {
  id: string;
  code: string;
  title: string;
  specialty_name: string;
  training_levels: TrainingLevel[];
};

export function StationCard({ station }: { station: CandidateStation }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="station-card">
        <div className="station-card-head">
          <div>
            <div className="station-card-title">{station.title}</div>
            <div className="station-card-meta">{station.code}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span className="spec-chip">{station.specialty_name}</span>
          {station.training_levels.map((level) => (
            <span key={level} className="station-tag" style={{ alignSelf: "center" }}>
              {level}
            </span>
          ))}
        </div>
        <div className="station-card-actions">
          <button type="button" className="btn-start" onClick={() => setOpen(true)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Start station
          </button>
        </div>
      </div>
      {open && <StartAttemptModal station={station} onClose={() => setOpen(false)} />}
    </>
  );
}
