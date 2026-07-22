import { StationCard, type CandidateStation } from "@/components/station-card";
import type { TrainingLevel } from "@/lib/contracts/db";
import { requireUser } from "@/lib/data/user-guard";
import { createClient } from "@/lib/supabase/server";
import "@/components/candidate-ui.css";

/**
 * Candidate station library: RLS does the heavy lifting — the user client
 * can only see ENABLED stations' metadata (draft/disabled rows and all
 * version content are invisible by policy, not by UI goodwill).
 */
export default async function CandidateStationsPage() {
  const { profile } = await requireUser();
  const supabase = await createClient();

  let query = supabase
    .from("stations")
    .select("id, code, title, training_levels, specialties(name)")
    .eq("status", "enabled")
    .order("title");
  if (profile?.training_level) {
    query = query.contains("training_levels", [profile.training_level]);
  }
  if (profile?.specialty_id) {
    query = query.eq("specialty_id", profile.specialty_id);
  }

  const { data, error } = await query;
  if (error) throw new Error(`stations list: ${error.message}`);

  const stations: CandidateStation[] = (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    training_levels: row.training_levels as TrainingLevel[],
    specialty_name:
      (row.specialties as unknown as { name: string } | null)?.name ?? "—",
  }));

  const filters: string[] = [];
  if (profile?.training_level) filters.push(profile.training_level);
  if (profile?.specialty_id && stations[0]) filters.push(stations[0].specialty_name);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="section-title-eyebrow">Station library</div>
          <h1 className="page-title">Stations</h1>
          <p className="page-sub">
            {filters.length > 0
              ? `Matched to your profile (${filters.join(" · ")})`
              : "All available stations"}
          </p>
        </div>
      </div>

      {stations.length === 0 ? (
        <div className="placeholder-card">
          <div className="placeholder-title">No stations available yet</div>
          <p className="placeholder-note">
            Stations matching your training level and specialization appear
            here as soon as they are published.
          </p>
        </div>
      ) : (
        <div className="station-grid">
          {stations.map((station) => (
            <StationCard key={station.id} station={station} />
          ))}
        </div>
      )}
    </>
  );
}
