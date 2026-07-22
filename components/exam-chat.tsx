"use client";

import { useEffect, useRef, useState } from "react";
import type { AttemptMode } from "@/lib/contracts/db";
import type { TranscriptMessage } from "@/lib/engine/transcript";

const TUTOR_SILENT = "[SILENT]";

type UiRole = "candidate" | "patient" | "tutor";
type UiMessage = { role: UiRole; text: string; at: string; streaming?: boolean };

function timeLabel(at: string): string {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(d);
}

export function ExamChat({
  attemptId,
  mode,
  patientName,
  patientInitials,
  initialTranscript,
  completed,
}: {
  attemptId: string;
  mode: AttemptMode;
  patientName: string;
  patientInitials: string;
  initialTranscript: TranscriptMessage[];
  completed: boolean;
}) {
  const [messages, setMessages] = useState<UiMessage[]>(initialTranscript);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pin the scroll container to the bottom on every change — the container's
  // bottom padding clears the composer, so the latest line stays above it.
  // Instant (not smooth) so streaming tokens can't outrun the scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  async function send() {
    const text = draft.trim();
    if (!text || busy || completed) return;

    setError(null);
    setBusy(true);
    setDraft("");
    const nowIso = new Date().toISOString();
    setMessages((prev) => [...prev, { role: "candidate", text, at: nowIso }]);
    setTyping(true);

    let patientReplied = false;
    try {
      const res = await fetch(`/app/attempts/${attemptId}/patient`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      // res.redirected → an auth redirect (e.g. session expired) was followed,
      // so the body is sign-in HTML, not a patient reply.
      if (!res.ok || res.redirected || !res.body) {
        const detail = res.redirected ? "" : await res.text().catch(() => "");
        throw new Error(detail || "The patient could not respond. Try again.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let started = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        if (!started) {
          started = true;
          setTyping(false); // swap the typing dots for the streaming bubble
          setMessages((prev) => [
            ...prev,
            { role: "patient", text: chunk, at: new Date().toISOString(), streaming: true },
          ]);
        } else {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.streaming) next[next.length - 1] = { ...last, text: last.text + chunk };
            return next;
          });
        }
      }

      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.streaming) next[next.length - 1] = { ...last, streaming: false };
        return next;
      });
      patientReplied = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      // Reset regardless of which chunk (if any) arrived, so an empty reply
      // never leaves a phantom typing indicator.
      setTyping(false);
      setBusy(false);
    }

    // Tutor mode: once the patient has replied AND the composer is unlocked,
    // ask the coach for a Socratic nudge in the background. The trainee can
    // already type their next turn; a nudge (if any) appears when it's ready.
    // Ephemeral — never persisted to the transcript.
    if (patientReplied && mode === "tutor") void coach();
  }

  async function coach() {
    try {
      const res = await fetch(`/app/attempts/${attemptId}/coach`, { method: "POST" });
      // A followed auth redirect (session expired) returns sign-in HTML with a
      // 200 — never render that as coaching.
      if (!res.ok || res.redirected) return;
      // Coaching nudges are a sentence or two — buffer the whole reply and
      // decide once. The literal sentinel means "nothing worth saying now".
      const full = (await res.text()).trim();
      if (!full || full === TUTOR_SILENT) return;
      setMessages((prev) => [...prev, { role: "tutor", text: full, at: "" }]);
    } catch {
      // Coaching is best-effort — never block the encounter on it.
    }
  }

  return (
    <section className="chat-panel">
      <div className={`chat-scroll ${completed ? "ended" : ""}`} ref={scrollRef}>
        <div className="chat-inner">
          <div className="day-divider">Consultation begins</div>

          {messages.map((m, i) => {
            if (m.role === "tutor") {
              return (
                <div key={`tutor-${i}`} className="tutor-note">
                  <span className="tutor-note-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18h6" />
                      <path d="M10 22h4" />
                      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
                    </svg>
                  </span>
                  <div>
                    <div className="tutor-note-label">Tutor</div>
                    <div className="tutor-note-text">{m.text}</div>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={`${m.role}-${i}`}
                className={`msg-row ${m.role === "candidate" ? "user" : "patient"}`}
              >
                <div className={`avatar ${m.role === "candidate" ? "avatar-user" : "avatar-patient"}`}>
                  {m.role === "candidate" ? "You" : patientInitials}
                </div>
                <div className="msg-content">
                  <div className="msg-meta">
                    {m.role === "candidate" ? (
                      <>
                        {timeLabel(m.at) && <span>{timeLabel(m.at)}</span>}
                        <span>·</span>
                        <span className="msg-meta-name">You</span>
                      </>
                    ) : (
                      <>
                        <span className="msg-meta-name">{patientName}</span>
                        {timeLabel(m.at) && (
                          <>
                            <span>·</span>
                            <span>{timeLabel(m.at)}</span>
                          </>
                        )}
                      </>
                    )}
                  </div>
                  <div className="msg-bubble">{m.text}</div>
                </div>
              </div>
            );
          })}

          {typing && (
            <div className="msg-row patient">
              <div className="avatar avatar-patient">{patientInitials}</div>
              <div className="msg-content">
                <div className="typing-bubble">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      <div className="input-footer">
        {error && <div className="chat-error" role="alert">{error}</div>}

        {completed ? (
          <p className="ended-note">
            This encounter has ended. Your transcript is saved.
          </p>
        ) : (
          <div className="input-inner">
            <div className="input-meta-row">
              <span>Speak to your patient as you would in a real OSCE.</span>
              <span className="send-hint">
                Press <kbd>Enter</kbd> to send, <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line
              </span>
            </div>
            <div className={`input-shell ${busy ? "disabled" : ""}`}>
              <textarea
                className="chat-textarea"
                placeholder="Type your response to the patient…"
                value={draft}
                disabled={busy}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="input-controls">
                <button
                  type="button"
                  className="send-btn"
                  aria-label="Send"
                  disabled={busy || draft.trim().length === 0}
                  onClick={() => void send()}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
