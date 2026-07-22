import type { StationContent, ScoringDomainKey } from "./station";

/**
 * Shared row types for every table (docs/spec/station-schema.md).
 * Timestamps are ISO strings as returned by PostgREST.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export type UserRole = "admin" | "candidate";
export type TrainingLevel = "student" | "resident" | "physician";
export type StationStatus = "draft" | "enabled" | "disabled" | "archived";
export type AttemptMode = "exam" | "tutor";

/** Domain scores keyed by the five scoring domains, 0-100 each. */
export type DomainScores = Record<ScoringDomainKey, number>;

export interface Profile {
  id: string;
  role: UserRole;
  training_level: TrainingLevel | null;
  specialty_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Specialty {
  id: string;
  name: string;
  created_at: string;
}

export interface Station {
  id: string;
  code: string;
  title: string;
  specialty_id: string;
  training_levels: TrainingLevel[];
  status: StationStatus;
  current_version: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StationVersion {
  id: string;
  station_id: string;
  version: number;
  content: StationContent;
  created_at: string;
}

export interface Attempt {
  id: string;
  user_id: string;
  station_version_id: string;
  mode: AttemptMode;
  transcript: Json;
  domain_scores: DomainScores | null;
  aggregate: number | null;
  critical_failed: boolean;
  bridge_triggered: boolean;
  /** Server-authored engine state: { tier, sampledQuestionIds }. */
  engine_config: Json | null;
  created_at: string;
  completed_at: string | null;
}

/**
 * Bridge trigger rule (docs/spec/station-schema.md): any domain < 50
 * OR critical_failed OR any construct = 0. Construct scores (concealed
 * construct-recognition items) are per-station and optional here.
 */
export function shouldTriggerBridge(
  domainScores: DomainScores,
  criticalFailed: boolean,
  constructScores: number[] = [],
): boolean {
  if (criticalFailed) return true;
  if (constructScores.some((score) => score === 0)) return true;
  return Object.values(domainScores).some((score) => score < 50);
}
