import Link from "next/link";
import { notFound } from "next/navigation";
import { StationForm } from "@/components/station-form/station-form";
import { StationLifecycle } from "@/components/station-lifecycle";
import { stationContentSchema } from "@/lib/contracts/station";
import {
  getStationForEdit,
  getStationVersion,
  listSpecialties,
  listStationVersions,
} from "@/lib/data/stations";
import "@/components/forms.css";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export default async function EditStationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, specialties, versions] = await Promise.all([
    getStationForEdit(id),
    listSpecialties(),
    listStationVersions(id),
  ]);
  if (!data) notFound();

  const { station, latestVersion } = data;

  const head = (
    <div className="page-head">
      <div>
        <h1 className="page-title">{station.title}</h1>
        <p className="page-sub">
          {station.code} ·{" "}
          <span className={`status-pill ${station.status}`}>{station.status}</span>
          {station.current_version !== null && ` · live v${station.current_version}`}
          {` · latest v${latestVersion.version}`}
        </p>
      </div>
      <Link className="btn-ghost" href="/admin/stations">
        ← Back to stations
      </Link>
    </div>
  );

  const history = (
    <section className="section-card">
      <div className="section-head">
        <div className="section-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15.5 13.5" />
          </svg>
        </div>
        <div className="section-head-left">
          <div className="section-title">Version history</div>
          <div className="section-sub">
            Read-only. Published versions are immutable once attempts
            reference them; enabling always publishes the latest version.
          </div>
        </div>
      </div>
      {versions.map((v) => (
        <div key={v.id} className="version-row">
          <span className="version-num">v{v.version}</span>
          <span className="version-date">{dateFmt.format(new Date(v.created_at))} UTC</span>
          <span>
            {v.version === station.current_version ? (
              <span className="status-pill enabled">current</span>
            ) : v.version > (station.current_version ?? 0) ? (
              <span className="status-pill draft">draft</span>
            ) : (
              <span className="status-pill disabled">superseded</span>
            )}
          </span>
        </div>
      ))}
    </section>
  );

  if (station.status === "archived") {
    // Archival preserves data: show the current (published) version's full
    // content read-only. Falls back to the latest version if the station
    // was archived before ever publishing beyond its pointer.
    const displayVersionNumber = station.current_version ?? latestVersion.version;
    const displayVersion =
      displayVersionNumber === latestVersion.version
        ? latestVersion
        : ((await getStationVersion(station.id, displayVersionNumber)) ?? latestVersion);
    const archivedContent = stationContentSchema.safeParse(displayVersion.content);

    return (
      <>
        {head}
        <div className="placeholder-card" style={{ marginBottom: "var(--space-5)" }}>
          <div className="placeholder-title">This station is archived</div>
          <p className="placeholder-note">
            Archival is the delete of this system: the station is read-only,
            and its versions and past attempts are preserved. Showing v
            {displayVersion.version} content below.
          </p>
        </div>
        {archivedContent.success ? (
          <StationForm
            specialties={specialties}
            initial={{
              meta: {
                code: station.code,
                title: station.title,
                specialtyId: station.specialty_id,
                trainingLevels: station.training_levels,
              },
              content: archivedContent.data,
            }}
            stationId={station.id}
            version={displayVersion.version}
            readOnly
          />
        ) : (
          <div className="placeholder-card" style={{ marginBottom: "var(--space-5)" }}>
            <div className="placeholder-title">Stored content fails the contract</div>
            <p className="placeholder-note">
              Version {displayVersion.version} does not parse against
              stationContentSchema — inspect it manually.
            </p>
          </div>
        )}
        {history}
      </>
    );
  }

  const parsedContent = stationContentSchema.safeParse(latestVersion.content);
  if (!parsedContent.success) {
    return (
      <>
        {head}
        <div className="placeholder-card">
          <div className="placeholder-title">Stored content fails the contract</div>
          <p className="placeholder-note">
            Version {latestVersion.version} of {station.code} does not parse
            against stationContentSchema — inspect it manually before editing.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {head}

      <div style={{ marginBottom: "var(--space-6)" }}>
        <StationLifecycle
          stationId={station.id}
          status={station.status}
          currentVersion={station.current_version}
          latestVersion={latestVersion.version}
        />
      </div>

      <StationForm
        specialties={specialties}
        initial={{
          meta: {
            code: station.code,
            title: station.title,
            specialtyId: station.specialty_id,
            trainingLevels: station.training_levels,
          },
          content: parsedContent.data,
        }}
        stationId={station.id}
        version={latestVersion.version}
      />

      <div style={{ marginTop: "var(--space-6)" }}>{history}</div>
    </>
  );
}
