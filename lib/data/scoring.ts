import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { scoreAttemptCore, type ScoreAttemptOutcome } from "@/lib/scoring/core";

/**
 * Server-side scoring entry point (service role). Thin wrapper over the
 * injected-client core. Called after an attempt is finished (writes the score
 * of record). A re-score stores a new non-record version unless `promote` is
 * set, so the Finish-time record is never silently overwritten.
 */
export async function scoreAttempt(
  attemptId: string,
  opts?: { promote?: boolean },
): Promise<ScoreAttemptOutcome> {
  return scoreAttemptCore(createAdminClient(), attemptId, opts);
}
