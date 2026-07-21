import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Specialty, Station, StationStatus } from "@/lib/contracts/db";
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
