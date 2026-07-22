"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { stationEnableSchema } from "@/lib/contracts/station";
import {
  stationFormSchema,
  zodIssuesToMap,
} from "@/lib/contracts/station-meta";
import { requireAdmin } from "@/lib/data/admin-guard";
import {
  ArchivedError,
  createStationDraft,
  DuplicateCodeError,
  getStationForEdit,
  InvalidTransitionError,
  saveStationVersion,
  setStationStatus,
  VersionConflictError,
} from "@/lib/data/stations";

export type SaveStationResult =
  | { ok: true; stationId: string; savedVersion: number }
  | { ok: false; errors: Record<string, string>; message: string };

/**
 * Create or update a station's content. Always writes a DRAFT version:
 * draft stations save in place; published stations get a new version row
 * (published content is never mutated). Validation here is authoritative.
 */
export async function saveStationAction(
  stationId: string | null,
  expectedVersion: number,
  values: unknown,
): Promise<SaveStationResult> {
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
    let savedVersion: number;
    if (id) {
      savedVersion = await saveStationVersion(
        id,
        parsed.data.meta,
        parsed.data.content,
        expectedVersion,
      );
    } else {
      id = await createStationDraft(parsed.data.meta, parsed.data.content);
      savedVersion = 1;
    }
    revalidatePath("/admin/stations");
    revalidatePath(`/admin/stations/${id}/edit`);
    return { ok: true, stationId: id, savedVersion };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof DuplicateCodeError) {
      return {
        ok: false,
        errors: { "meta.code": err.message },
        message: "Fix the highlighted fields and save again.",
      };
    }
    if (err instanceof VersionConflictError || err instanceof ArchivedError) {
      return { ok: false, errors: {}, message: err.message };
    }
    const message = err instanceof Error ? err.message : "Save failed";
    return { ok: false, errors: {}, message };
  }
}

// ---------- lifecycle ----------

const SECTION_LABELS: Record<string, string> = {
  patient: "Patient & opening",
  openingStatement: "Patient & opening",
  difficultyTiers: "Difficulty tiers",
  withheldFacts: "Withheld facts",
  questionPool: "Question pool",
  jargonBank: "Jargon bank",
  closing: "Closing & teach-back",
  scoring: "Scoring",
  bridge: "Knowledge Bridge",
};

export type LifecycleResult =
  | { ok: true; status: "enabled" | "disabled" | "archived"; currentVersion: number | null }
  | { ok: false; gateErrors: string[]; message: string };

/**
 * Enable (publish): runs the FULL draft->enabled gate against the LATEST
 * version's content, then transitions atomically. Gate failures come back
 * as readable "Section — message" lines.
 */
export async function enableStationAction(
  stationId: string,
): Promise<LifecycleResult> {
  await requireAdmin();

  try {
    const data = await getStationForEdit(stationId);
    if (!data) {
      return { ok: false, gateErrors: [], message: "Station not found" };
    }

    const gate = stationEnableSchema.safeParse(data.latestVersion.content);
    if (!gate.success) {
      const gateErrors = gate.error.issues.map((issue) => {
        const section = SECTION_LABELS[String(issue.path[0])] ?? String(issue.path[0]);
        return `${section} — ${issue.message}`;
      });
      return {
        ok: false,
        gateErrors,
        message: `v${data.latestVersion.version} cannot be published yet:`,
      };
    }

    const currentVersion = await setStationStatus(stationId, "enabled");
    revalidatePath("/admin/stations");
    revalidatePath(`/admin/stations/${stationId}/edit`);
    return { ok: true, status: "enabled", currentVersion };
  } catch (err) {
    unstable_rethrow(err);
    // DB-trigger errors (enable guard, pointer FK) surface readably here.
    const message = err instanceof Error ? err.message : "Enable failed";
    return { ok: false, gateErrors: [], message };
  }
}

export async function disableStationAction(
  stationId: string,
): Promise<LifecycleResult> {
  await requireAdmin();
  try {
    const currentVersion = await setStationStatus(stationId, "disabled");
    revalidatePath("/admin/stations");
    revalidatePath(`/admin/stations/${stationId}/edit`);
    return { ok: true, status: "disabled", currentVersion };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof InvalidTransitionError) {
      return { ok: false, gateErrors: [], message: err.message };
    }
    const message = err instanceof Error ? err.message : "Disable failed";
    return { ok: false, gateErrors: [], message };
  }
}

export async function archiveStationAction(
  stationId: string,
): Promise<LifecycleResult> {
  await requireAdmin();
  try {
    await setStationStatus(stationId, "archived");
    revalidatePath("/admin/stations");
    revalidatePath(`/admin/stations/${stationId}/edit`);
    return { ok: true, status: "archived", currentVersion: null };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof InvalidTransitionError) {
      return { ok: false, gateErrors: [], message: err.message };
    }
    const message = err instanceof Error ? err.message : "Archive failed";
    return { ok: false, gateErrors: [], message };
  }
}
