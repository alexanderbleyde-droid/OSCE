"use client";

import { createPortal } from "react-dom";

/** Confirmation dialog for destructive/irreversible actions. Rendered via a
 *  portal to <body> so the fixed overlay escapes any ancestor that creates a
 *  containing block (e.g. the encounter topbar's backdrop-filter) and always
 *  covers the full viewport. Theme still applies (data-theme is on <html>). */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // These dialogs only open via client interaction, so `open` is always false
  // during SSR — the document guard makes the portal client-only safely.
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="modal-card" role="alertdialog" aria-modal="true" aria-label={title}>
        <div className="modal-title">{title}</div>
        <div className="modal-body">{body}</div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? "btn-danger-strong" : "btn-primary"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
