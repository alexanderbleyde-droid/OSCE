"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { startAttempt } from "@/lib/data/attempts";
import { AttemptStartError } from "@/lib/engine/attempts";

const inputSchema = z.object({
  stationId: z.uuid(),
  mode: z.enum(["exam", "tutor"]),
});

export type StartAttemptActionResult =
  | { ok: true; attemptId: string; resumed: boolean }
  | { ok: false; message: string };

export async function startAttemptAction(
  input: unknown,
): Promise<StartAttemptActionResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid start request" };
  }

  try {
    const result = await startAttempt(parsed.data.stationId, parsed.data.mode);
    return { ok: true, attemptId: result.attemptId, resumed: result.resumed };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof AttemptStartError) {
      return { ok: false, message: err.message };
    }
    console.error("startAttemptAction:", err);
    return { ok: false, message: "Could not start the encounter — try again." };
  }
}
