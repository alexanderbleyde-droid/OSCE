import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Specialty,
  Station,
  StationStatus,
  StationVersion,
} from "@/lib/contracts/db";
import type { StationContent } from "@/lib/contracts/station";
import type { StationMeta } from "@/lib/contracts/station-meta";
import { requireAdmin } from "./admin-guard";

export type StationListRow = Station & { specialty_name: string };

export type StationListFilters = {
  status?: StationStatus;
  specialtyId?: string;
};

const STATION_STATUSES: StationStatus[] = [
  "draft",
  "enabled",
  "disabled",
  "archived",
];

export function isStationStatus(value: string): value is StationStatus {
  return (STATION_STATUSES as string[]).includes(value);
}

export async function listStations(
  filters: StationListFilters = {},
): Promise<StationListRow[]> {
  await requireAdmin();
  const admin = createAdminClient();

  let query = admin
    .from("stations")
    .select("*, specialties(name)")
    .order("updated_at", { ascending: false });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.specialtyId) query = query.eq("specialty_id", filters.specialtyId);

  const { data, error } = await query;
  if (error) throw new Error(`listStations: ${error.message}`);

  return (data ?? []).map((row) => {
    const { specialties, ...station } = row as Station & {
      specialties: { name: string } | null;
    };
    return { ...station, specialty_name: specialties?.name ?? "—" };
  });
}

/** Status counts for the filter chips (respects the specialty filter). */
export async function countStationsByStatus(
  specialtyId?: string,
): Promise<Record<StationStatus | "all", number>> {
  await requireAdmin();
  const admin = createAdminClient();

  let query = admin.from("stations").select("status");
  if (specialtyId) query = query.eq("specialty_id", specialtyId);
  const { data, error } = await query;
  if (error) throw new Error(`countStationsByStatus: ${error.message}`);

  const counts: Record<StationStatus | "all", number> = {
    all: data?.length ?? 0,
    draft: 0,
    enabled: 0,
    disabled: 0,
    archived: 0,
  };
  for (const row of data ?? []) {
    counts[row.status as StationStatus] += 1;
  }
  return counts;
}

export async function listSpecialties(): Promise<Specialty[]> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("specialties")
    .select("*")
    .order("name");
  if (error) throw new Error(`listSpecialties: ${error.message}`);
  return data ?? [];
}

/** Thrown when a station code collides with an existing one. */
export class DuplicateCodeError extends Error {
  constructor() {
    super("A station with this code already exists");
    this.name = "DuplicateCodeError";
  }
}

export type StationEditData = {
  station: StationListRow;
  /** Latest version row (drafts always have one). */
  latestVersion: StationVersion;
};

export async function getStationForEdit(
  stationId: string,
): Promise<StationEditData | null> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: station, error } = await admin
    .from("stations")
    .select("*, specialties(name)")
    .eq("id", stationId)
    .maybeSingle();
  if (error) throw new Error(`getStationForEdit: ${error.message}`);
  if (!station) return null;

  const { data: version, error: verError } = await admin
    .from("station_versions")
    .select("*")
    .eq("station_id", stationId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (verError) throw new Error(`getStationForEdit version: ${verError.message}`);
  if (!version) return null;

  const { specialties, ...rest } = station as Station & {
    specialties: { name: string } | null;
  };
  return {
    station: { ...rest, specialty_name: specialties?.name ?? "—" },
    latestVersion: version as StationVersion,
  };
}

/** Thrown when the draft changed underneath the editor (stale version). */
export class VersionConflictError extends Error {
  constructor() {
    super("This draft changed since you loaded it — reload the page before saving");
    this.name = "VersionConflictError";
  }
}

/** Thrown when a lifecycle transition made the station non-editable here. */
export class NotDraftError extends Error {
  constructor() {
    super("Only draft stations can be edited in this step");
    this.name = "NotDraftError";
  }
}

/** Creates a new draft station (station + v1 + pointer) in ONE transaction
 *  via the create_station_draft RPC — no orphaned rows on partial failure. */
export async function createStationDraft(
  meta: StationMeta,
  content: StationContent,
): Promise<string> {
  const { userId } = await requireAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("create_station_draft", {
    p_code: meta.code,
    p_title: meta.title,
    p_specialty: meta.specialtyId,
    p_levels: meta.trainingLevels,
    p_content: content,
    p_created_by: userId,
  });
  if (error) {
    if (error.code === "23505") throw new DuplicateCodeError();
    throw new Error(`createStationDraft: ${error.message}`);
  }
  return data as string;
}

/**
 * Saves metadata + content for a DRAFT station atomically via the
 * update_station_draft RPC: locks the station row, re-asserts draft status
 * inside the transaction, and rejects saves against a stale version.
 */
export async function updateStationDraft(
  stationId: string,
  meta: StationMeta,
  content: StationContent,
  expectedVersion: number,
): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin.rpc("update_station_draft", {
    p_station: stationId,
    p_code: meta.code,
    p_title: meta.title,
    p_specialty: meta.specialtyId,
    p_levels: meta.trainingLevels,
    p_content: content,
    p_expected_version: expectedVersion,
  });
  if (error) {
    if (error.code === "23505") throw new DuplicateCodeError();
    if (error.message.includes("station_not_draft")) throw new NotDraftError();
    if (error.message.includes("version_conflict")) throw new VersionConflictError();
    if (error.message.includes("station_not_found")) throw new Error("Station not found");
    throw new Error(`updateStationDraft: ${error.message}`);
  }
}
