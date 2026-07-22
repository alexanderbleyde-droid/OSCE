"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import {
  stationFormSchema,
  zodIssuesToMap,
} from "@/lib/contracts/station-meta";
import { requireAdmin } from "@/lib/data/admin-guard";
import {
  createStationDraft,
  DuplicateCodeError,
  NotDraftError,
  updateStationDraft,
  VersionConflictError,
} from "@/lib/data/stations";

export type SaveStationResult =
  | { ok: true; stationId: string }
  | { ok: false; errors: Record<string, string>; message: string };

/**
 * Create or update a DRAFT station. Validation here is authoritative —
 * the client runs the same Zod schema for instant inline errors, but the
 * server re-validates every save.
 */
export async function saveStationAction(
  stationId: string | null,
  expectedVersion: number,
  values: unknown,
): Promise<SaveStationResult> {
  // Auth first, outside the try: an unauthenticated caller is redirected
  // before even exercising validation. (Data functions re-check — defense
  // in depth.)
  await requireAdmin();

  const parsed = stationFormSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      errors: zodIssuesToMap(parsed.error),
      message: "Fix the highlighted fields and save again.",
    };
  }

  try {
    let id = stationId;
    if (id) {
      await updateStationDraft(
        id,
        parsed.data.meta,
        parsed.data.content,
        expectedVersion,
      );
    } else {
      id = await createStationDraft(parsed.data.meta, parsed.data.content);
    }
    revalidatePath("/admin/stations");
    revalidatePath(`/admin/stations/${id}/edit`);
    return { ok: true, stationId: id };
  } catch (err) {
    // Framework control flow (redirect from requireAdmin) must propagate.
    unstable_rethrow(err);
    if (err instanceof DuplicateCodeError) {
      return {
        ok: false,
        errors: { "meta.code": err.message },
        message: "Fix the highlighted fields and save again.",
      };
    }
    if (err instanceof VersionConflictError || err instanceof NotDraftError) {
      return { ok: false, errors: {}, message: err.message };
    }
    const message = err instanceof Error ? err.message : "Save failed";
    return { ok: false, errors: {}, message };
  }
}
