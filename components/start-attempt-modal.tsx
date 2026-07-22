"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { startAttemptAction } from "@/app/app/stations/actions";
import type { AttemptMode } from "@/lib/contracts/db";

/** Mode selection + attempt start, per the V3 dashboard modal language.
 *  Exam vs Tutor definitions from the reference stations (AS S8). */
export function StartAttemptModal({
  station,
  onClose,
}: {
  station: { id: string; title: string; code: string };
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<AttemptMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(mode: AttemptMode) {
    setBusy(mode);
    setError(null);
    const result = await startAttemptAction({ stationId: station.id, mode });
    if (result.ok) {
      router.push(`/encounter/${result.attemptId}`);
      return;
    }
    setBusy(null);
    setError(result.message);
  }

  return (
    <div
      className="candidate-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="candidate-modal-card" role="dialog" aria-modal="true" aria-label={`Start ${station.title}`}>
        <div className="candidate-modal-head">
          <div className="candidate-modal-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
          <div>
            <div className="candidate-modal-eyebrow">Start station</div>
            <h2 className="candidate-modal-title">{station.title}</h2>
            <p className="candidate-modal-sub">
              {station.code} · choose how you want to run this encounter.
              Your questions are drawn when the attempt starts and stay fixed
              — leaving and returning resumes the same encounter.
            </p>
          </div>
        </div>

        {error && <div className="candidate-error" role="alert" style={{ marginTop: "var(--space-4)" }}>{error}</div>}

        <div className="candidate-modal-body">
          <div className="mode-row">
            <div>
              <div className="mode-row-title">Exam mode</div>
              <div className="mode-row-desc">
                A silent examiner: the patient stays fully in character and
                reveals nothing. Scored exactly like the real thing.
              </div>
            </div>
            <button
              type="button"
              className="modal-exam-btn primary"
              disabled={busy !== null}
              onClick={() => void start("exam")}
            >
              {busy === "exam" ? "Starting…" : "Start exam"}
            </button>
          </div>

          <div className="mode-row">
            <div>
              <div className="mode-row-title">Tutor mode</div>
              <div className="mode-row-desc">
                Socratic coaching at natural pauses, and directive feedback
                after the encounter. Same patient, same case.
              </div>
            </div>
            <button
              type="button"
              className="modal-exam-btn"
              disabled={busy !== null}
              onClick={() => void start("tutor")}
            >
              {busy === "tutor" ? "Starting…" : "Start tutor session"}
            </button>
          </div>
        </div>

        <div className="candidate-modal-foot">
          <span className="candidate-modal-foot-note">
            2–3 patient questions are sampled per encounter — always covering
            safety and lifestyle.
          </span>
          <button type="button" className="modal-exam-btn" disabled={busy !== null} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
