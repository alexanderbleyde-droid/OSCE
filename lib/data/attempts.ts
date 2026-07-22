import "server-only";

import type { AttemptMode } from "@/lib/contracts/db";
import { startAttemptCore, type StartAttemptResult } from "@/lib/engine/attempts";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "./user-guard";

/** Starts (or resumes) an attempt for the signed-in user. Domain rules —
 *  enabled-only, eligibility, one-time sampling — live in the engine core. */
export async function startAttempt(
  stationId: string,
  mode: AttemptMode,
): Promise<StartAttemptResult> {
  const { userId, profile } = await requireUser();
  const admin = createAdminClient();
  return startAttemptCore(admin, {
    userId,
    stationId,
    mode,
    profile: {
      training_level: profile?.training_level ?? null,
      specialty_id: profile?.specialty_id ?? null,
    },
  });
}
