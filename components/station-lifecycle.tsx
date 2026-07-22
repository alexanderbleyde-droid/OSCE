"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  archiveStationAction,
  disableStationAction,
  enableStationAction,
  type LifecycleResult,
} from "@/app/admin/stations/actions";
import type { StationStatus } from "@/lib/contracts/db";
import { ConfirmDialog } from "./confirm-dialog";

type PendingConfirm = "disable" | "archive" | null;

/** Lifecycle actions for the edit page: enable/publish (full gate),
 *  disable and archive (confirmed). */
export function StationLifecycle({
  stationId,
  status,
  currentVersion,
  latestVersion,
}: {
  stationId: string;
  status: StationStatus;
  currentVersion: number | null;
  latestVersion: number;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<PendingConfirm>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; gateErrors: string[] } | null>(null);
  const [, startTransition] = useTransition();

  const hasUnpublished =
    status !== "draft" && currentVersion !== null && latestVersion > currentVersion;

  async function run(action: (id: string) => Promise<LifecycleResult>) {
    setBusy(true);
    setFailure(null);
    const result = await action(stationId);
    setBusy(false);
    setConfirm(null);
    if (result.ok) {
      startTransition(() => router.refresh());
    } else {
      setFailure({ message: result.message, gateErrors: result.gateErrors });
    }
  }

  return (
    <div>
      {failure && (
        <div className="gate-errors" role="alert">
          {failure.message}
          {failure.gateErrors.length > 0 && (
            <ul>
              {failure.gateErrors.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="lifecycle-bar">
        {(status === "draft" || status === "disabled") && (
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => void run(enableStationAction)}
          >
            {busy ? "Working…" : `Enable station (publish v${latestVersion})`}
          </button>
        )}

        {status === "enabled" && hasUnpublished && (
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => void run(enableStationAction)}
          >
            {busy ? "Working…" : `Publish changes (v${latestVersion})`}
          </button>
        )}

        {status === "enabled" && (
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => setConfirm("disable")}
          >
            Disable
          </button>
        )}

        {status !== "archived" && (
          <button
            type="button"
            className="btn-danger"
            disabled={busy}
            onClick={() => setConfirm("archive")}
          >
            Archive
          </button>
        )}

        {status === "enabled" && !hasUnpublished && (
          <span className="lifecycle-note">
            Live at v{currentVersion} — saving edits creates a new draft version.
          </span>
        )}
        {hasUnpublished && (
          <span className="lifecycle-note">
            Live at v{currentVersion}; v{latestVersion} is an unpublished draft.
          </span>
        )}
      </div>

      <ConfirmDialog
        open={confirm === "disable"}
        title="Disable this station?"
        body="Candidates immediately lose access to new attempts. Past attempts keep their version reference and stay reportable. You can re-enable at any time."
        confirmLabel="Disable station"
        busy={busy}
        onConfirm={() => void run(disableStationAction)}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "archive"}
        title="Archive this station?"
        body="Archival is the delete of this system and cannot be undone from the UI. The station becomes read-only; versions and past attempts are preserved."
        confirmLabel="Archive station"
        danger
        busy={busy}
        onConfirm={() => void run(archiveStationAction)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
