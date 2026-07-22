import Link from "next/link";
import { notFound } from "next/navigation";
import { StationForm } from "@/components/station-form/station-form";
import { stationContentSchema } from "@/lib/contracts/station";
import { getStationForEdit, listSpecialties } from "@/lib/data/stations";
import "@/components/forms.css";

export default async function EditStationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, specialties] = await Promise.all([
    getStationForEdit(id),
    listSpecialties(),
  ]);
  if (!data) notFound();

  const { station, latestVersion } = data;

  if (station.status !== "draft") {
    return (
      <>
        <div className="page-head">
          <div>
            <h1 className="page-title">{station.title}</h1>
            <p className="page-sub">
              {station.code} · {station.status} · v{latestVersion.version}
            </p>
          </div>
          <Link className="btn-ghost" href="/admin/stations">
            ← Back to stations
          </Link>
        </div>
        <div className="placeholder-card">
          <div className="placeholder-title">
            This station is {station.status}
          </div>
          <p className="placeholder-note">
            Lifecycle actions and versioned editing of non-draft stations
            arrive in the publish-gate step of Phase 1A.
          </p>
        </div>
      </>
    );
  }

  const parsedContent = stationContentSchema.safeParse(latestVersion.content);
  if (!parsedContent.success) {
    return (
      <div className="placeholder-card">
        <div className="placeholder-title">Stored content fails the contract</div>
        <p className="placeholder-note">
          Version {latestVersion.version} of {station.code} does not parse
          against stationContentSchema — this should be impossible for
          form-written drafts. Inspect it manually before editing.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{station.title}</h1>
          <p className="page-sub">
            {station.code} ·{" "}
            <span className="status-pill draft">draft</span> · editing v
            {latestVersion.version}
          </p>
        </div>
        <Link className="btn-ghost" href="/admin/stations">
          ← Back to stations
        </Link>
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
    </>
  );
}
