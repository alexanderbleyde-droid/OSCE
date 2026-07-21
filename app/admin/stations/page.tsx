import Link from "next/link";
import { SpecialtyFilter } from "@/components/specialty-filter";
import type { StationStatus, TrainingLevel } from "@/lib/contracts/db";
import {
  countStationsByStatus,
  isStationStatus,
  listSpecialties,
  listStations,
} from "@/lib/data/stations";
import "@/components/admin-ui.css";

const STATUS_CHIPS: { value: StationStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
  { value: "archived", label: "Archived" },
];

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function chipHref(status: StationStatus | "", specialtyId: string): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (specialtyId) params.set("specialty", specialtyId);
  const qs = params.toString();
  return qs ? `/admin/stations?${qs}` : "/admin/stations";
}

export default async function AdminStationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; specialty?: string }>;
}) {
  const params = await searchParams;
  const status =
    params.status && isStationStatus(params.status) ? params.status : undefined;
  const specialtyId = params.specialty || undefined;

  const [stations, specialties, counts] = await Promise.all([
    listStations({ status, specialtyId }),
    listSpecialties(),
    countStationsByStatus(specialtyId),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Stations</h1>
          <p className="page-sub">
            Create, version, and publish stations — all statuses
          </p>
        </div>
        <Link className="btn-primary" href="/admin/stations/new">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New station
        </Link>
      </div>

      <div className="filter-bar">
        <div className="filter-chips">
          {STATUS_CHIPS.map((chip) => (
            <Link
              key={chip.label}
              href={chipHref(chip.value, specialtyId ?? "")}
              className={`chip ${(status ?? "") === chip.value ? "active" : ""}`}
            >
              {chip.label}
              <span className="chip-count">
                {chip.value === "" ? counts.all : counts[chip.value]}
              </span>
            </Link>
          ))}
        </div>
        <SpecialtyFilter specialties={specialties} />
      </div>

      {stations.length === 0 ? (
        <div className="placeholder-card">
          <div className="placeholder-title">No stations match</div>
          <p className="placeholder-note">
            {counts.all === 0
              ? "No stations exist yet. Create the first one with “New station”."
              : "Nothing matches the current filters."}
          </p>
          {counts.all > 0 && (
            <Link className="btn-ghost" href="/admin/stations">
              Reset filters
            </Link>
          )}
        </div>
      ) : (
        <div className="table-card">
          <div className="table-head-row station-cols">
            <span>Code</span>
            <span>Title</span>
            <span>Specialty</span>
            <span>Levels</span>
            <span>Status</span>
            <span>Ver</span>
            <span>Updated</span>
          </div>
          {stations.map((station) => (
            <Link
              key={station.id}
              href={`/admin/stations/${station.id}/edit`}
              className="station-row station-cols"
            >
              <span className="row-code">{station.code}</span>
              <span className="row-title">{station.title}</span>
              <span className="row-sub">{station.specialty_name}</span>
              <span className="level-tags">
                {station.training_levels.map((level: TrainingLevel) => (
                  <span key={level} className="level-tag">
                    {level}
                  </span>
                ))}
              </span>
              <span>
                <span className={`status-pill ${station.status}`}>
                  {station.status}
                </span>
              </span>
              <span className="row-muted">
                {station.current_version ? `v${station.current_version}` : "—"}
              </span>
              <span className="row-muted">
                {dateFmt.format(new Date(station.updated_at))}
              </span>
            </Link>
          ))}
          <div className="table-foot">
            <span className="table-foot-note">
              {stations.length} station{stations.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
