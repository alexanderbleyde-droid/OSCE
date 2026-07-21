"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "signin" | "signup";
type UiState = "form" | "sent" | "expired";

const EMAIL_KEY = "plexus-signin-email";
const RESEND_COOLDOWN_S = 30;

type Props = {
  specialties: { id: string; name: string }[];
  initialState: "form" | "expired";
};

export function AuthCard({ specialties, initialState }: Props) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [uiState, setUiState] = useState<UiState>(initialState);
  const [email, setEmail] = useState("");
  const [specialtyId, setSpecialtyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Prefill the expired state's confirm-email field from the last attempt.
  // (Deferred a frame: sessionStorage is client-only and the lint rule
  // forbids synchronous setState inside effects.)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const saved = sessionStorage.getItem(EMAIL_KEY);
        if (saved) setEmail((current) => current || saved);
      } catch {
        // sessionStorage unavailable — field starts empty
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendLink(targetEmail: string) {
    const trimmed = targetEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/app`,
        // Specialization travels via user metadata and is validated
        // server-side at profile bootstrap. Roles never come from here.
        data:
          mode === "signup" && specialtyId
            ? { specialty_id: specialtyId }
            : undefined,
      },
    });
    setBusy(false);
    if (otpError) {
      setError(otpError.message);
      return;
    }
    try {
      sessionStorage.setItem(EMAIL_KEY, trimmed);
    } catch {
      // non-fatal
    }
    setEmail(trimmed);
    setCooldown(RESEND_COOLDOWN_S);
    setUiState("sent");
  }

  function switchMode(next: AuthMode) {
    setMode(next);
    setError(null);
  }

  return (
    <div className="auth-card">
      {uiState === "form" && (
        <>
          <div className="tab-toggle" role="tablist" aria-label="Auth mode">
            <button
              type="button"
              className={mode === "signin" ? "active" : ""}
              onClick={() => switchMode("signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === "signup" ? "active" : ""}
              onClick={() => switchMode("signup")}
            >
              Create account
            </button>
          </div>

          <div className="auth-eyebrow">
            {mode === "signup" ? "Get started" : "Welcome back"}
          </div>
          <h2 className="auth-title">
            {mode === "signup" ? "Create your account" : "Sign in to your account"}
          </h2>
          <p className="auth-desc">
            {mode === "signup"
              ? "Enter your email and choose your specialization. We’ll send you a sign-in link to confirm."
              : "Enter your email and we’ll send you a secure sign-in link. No password, no setup — it just works."}
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendLink(email);
            }}
          >
            <div className="field">
              <label className="field-label" htmlFor="email">
                Email address
              </label>
              <input
                className="input"
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {mode === "signup" && (
              <div className="field">
                <label className="field-label" htmlFor="spec">
                  Specialization
                </label>
                <div className="select-wrap">
                  <select
                    className="select"
                    id="spec"
                    value={specialtyId}
                    onChange={(e) => setSpecialtyId(e.target.value)}
                  >
                    <option value="">Choose a specialization…</option>
                    {specialties.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <span className="select-arrow">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </div>
              </div>
            )}

            <div className="magic-explain">
              <span className="magic-explain-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <span>
                We&apos;ll email you a sign-in link valid for 15 minutes. Click
                it on this device and you&apos;re in — no password to remember.
              </span>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <button className="submit-btn" type="submit" disabled={busy}>
              <span>
                {busy
                  ? "Sending…"
                  : mode === "signup"
                    ? "Send account link"
                    : "Send sign-in link"}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </form>

          <p className="terms">
            By continuing you agree to our <a href="#">terms</a> and{" "}
            <a href="#">privacy notice</a>.
            <br />
            Plexus is for educational practice only; it doesn&apos;t provide
            real clinical advice.
          </p>
        </>
      )}

      {uiState === "sent" && (
        <div>
          <div className="confirm-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22 6 12 13 2 6" />
            </svg>
          </div>
          <h2 className="confirm-title">Check your inbox.</h2>
          <p className="confirm-body">
            A sign-in link is on its way to{" "}
            <span className="confirm-email">{email}</span>. Click it from this
            device or open it in this browser. The link expires in 15 minutes.
          </p>

          <ul className="confirm-list">
            <li className="confirm-list-item">
              <span className="confirm-list-num">1</span>
              <span>Open the email titled &quot;Your Plexus sign-in link&quot;</span>
            </li>
            <li className="confirm-list-item">
              <span className="confirm-list-num">2</span>
              <span>Click the secure sign-in button inside</span>
            </li>
            <li className="confirm-list-item">
              <span className="confirm-list-num">3</span>
              <span>You&apos;ll be returned here, signed in and ready</span>
            </li>
          </ul>

          {error && <div className="auth-error">{error}</div>}

          <div className="confirm-actions">
            <button
              type="button"
              className="confirm-back"
              onClick={() => {
                setError(null);
                setUiState("form");
              }}
            >
              ← Use a different email
            </button>
            <button
              type="button"
              className="confirm-resend"
              disabled={busy || cooldown > 0}
              onClick={() => void sendLink(email)}
            >
              {cooldown > 0 ? `Resend link (${cooldown}s)` : "Resend link"}
            </button>
          </div>
        </div>
      )}

      {uiState === "expired" && (
        <div>
          <div className="expired-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <h2 className="confirm-title">That link has expired.</h2>
          <p className="confirm-body">
            Sign-in links are only valid for 15 minutes and can only be used
            once. No problem — we&apos;ll send a fresh one.
          </p>

          <div className="field">
            <label className="field-label" htmlFor="email2">
              Confirm your email
            </label>
            <input
              className="input"
              id="email2"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button
            className="submit-btn"
            style={{ marginTop: "var(--space-4)" }}
            type="button"
            disabled={busy}
            onClick={() => void sendLink(email)}
          >
            {busy ? "Sending…" : "Send a new link"}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>

          <p className="terms" style={{ marginTop: "var(--space-4)" }}>
            Having trouble? <a href="#">Contact support</a>
          </p>
        </div>
      )}
    </div>
  );
}
