import Link from "next/link";
import { notFound } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { ExamChat } from "@/components/exam-chat";
import { EncounterFinish } from "@/components/encounter-finish";
import { TIER_LABELS } from "@/lib/engine/attempts";
import { computeEngineState } from "@/lib/engine/prompt-builder";
import { loadEncounterForOwner } from "@/lib/data/encounter";

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SP";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export default async function EncounterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const encounter = await loadEncounterForOwner(id);
  if (!encounter) notFound();

  const { content, station, mode, tier, completed, transcript } = encounter;
  const patientName = content.patient.name;

  const { phase } = computeEngineState(content, transcript, completed);
  const phaseLabel =
    phase === "ended"
      ? "Encounter ended"
      : phase === "closing"
        ? "Closing"
        : mode === "exam"
          ? "Exam · information gathering"
          : "Tutor · information gathering";
  const pillClass = phase === "ended" ? "ended" : phase === "closing" ? "closing" : "";

  return (
    <>
      <header className="exam-topbar">
        <div className="exam-topbar-left">
          <Link className="back-btn" href="/app/stations">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Stations
          </Link>
          <div className="case-id">
            <span className="case-id-main">{station.title}</span>
            <span className="case-id-divider" />
            <span className="case-id-sub">{station.code}</span>
          </div>
        </div>

        <div className="exam-topbar-center">
          <span className={`state-pill ${pillClass}`}>
            <span className="state-pill-dot" />
            {phaseLabel}
          </span>
        </div>

        <div className="exam-topbar-right">
          <span className="case-id-sub" style={{ fontSize: 11 }}>
            {TIER_LABELS[tier]}
          </span>
          <ThemeToggle />
          {!completed && <EncounterFinish attemptId={id} />}
        </div>
      </header>

      <ExamChat
        attemptId={id}
        patientName={patientName}
        patientInitials={initialsFrom(patientName)}
        initialTranscript={transcript}
        completed={completed}
      />
    </>
  );
}
