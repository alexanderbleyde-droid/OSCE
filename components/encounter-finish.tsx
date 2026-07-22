"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { finishEncounterAction } from "@/app/encounter/[id]/actions";
import { ConfirmDialog } from "./confirm-dialog";

/** "Finish encounter" control — the candidate ends the station. Neutral
 *  copy by design: closing without teach-back is a silent critical fail
 *  (recorded, not announced). */
export function EncounterFinish({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function finish() {
    setBusy(true);
    await finishEncounterAction(attemptId);
    setBusy(false);
    setOpen(false);
    // Refresh either way: on success the page shows the ended state; on an
    // already-completed race the reload simply reflects the truth.
    startTransition(() => router.refresh());
  }

  return (
    <>
      <button type="button" className="btn-finish enabled" onClick={() => setOpen(true)}>
        Finish encounter
      </button>
      <ConfirmDialog
        open={open}
        title="Finish this encounter?"
        body="This ends the station. You won't be able to continue the conversation afterwards, and your transcript will be saved for your report."
        confirmLabel="Finish encounter"
        busy={busy}
        onConfirm={() => void finish()}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
