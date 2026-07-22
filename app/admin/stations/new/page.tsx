import Link from "next/link";
import { StationForm } from "@/components/station-form/station-form";
import { emptyStationForm } from "@/components/station-form/defaults";
import { listSpecialties } from "@/lib/data/stations";
import "@/components/forms.css";

export default async function NewStationPage() {
  const specialties = await listSpecialties();

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">New station</h1>
          <p className="page-sub">
            Author a station against the StationContent contract — saving
            creates a draft
          </p>
        </div>
        <Link className="btn-ghost" href="/admin/stations">
          ← Back to stations
        </Link>
      </div>
      <StationForm
        specialties={specialties}
        initial={emptyStationForm()}
        stationId={null}
        version={1}
      />
    </>
  );
}
