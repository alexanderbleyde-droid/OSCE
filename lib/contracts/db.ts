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
  /** Server-authored engine state: { tier, sampledQuestionIds, endState }. */
  engine_config: Json | null;
  /** Server-authored scoring detail (per-domain rationale, triggered flags,
   *  bridge reasons, construct scores). Written by the score_attempt RPC. */
  score_detail: Json | null;
  scored_at: string | null;
  scoring_model: string | null;
  created_at: string;
  completed_at: string | null;
}

/**
 * One versioned scoring run for an attempt (attempt_scores). The first run
 * (at Finish) is is_of_record; re-scores add non-record versions. The of-record
 * row is mirrored onto the Attempt's flat scoring columns.
 */
export interface AttemptScore {
  id: string;
  attempt_id: string;
  version: number;
  is_of_record: boolean;
  domain_scores: DomainScores | null;
  aggregate: number | null;
  critical_failed: boolean;
  bridge_triggered: boolean;
  score_detail: Json | null;
  scoring_model: string | null;
  scored_at: string;
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
