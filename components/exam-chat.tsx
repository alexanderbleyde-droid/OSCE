"use client";

import { useEffect, useRef, useState } from "react";
import type { TranscriptMessage } from "@/lib/engine/transcript";

type UiMessage = TranscriptMessage & { streaming?: boolean };

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
  patientName,
  patientInitials,
  initialTranscript,
  completed,
}: {
  attemptId: string;
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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

    try {
      const res = await fetch(`/app/attempts/${attemptId}/patient`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        throw new Error(detail || "The patient could not respond. Try again.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      let started = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        if (!started) {
          started = true;
          setTyping(false);
          setMessages((prev) => [
            ...prev,
            { role: "patient", text: acc, at: new Date().toISOString(), streaming: true },
          ]);
        } else {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.streaming) next[next.length - 1] = { ...last, text: acc };
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setTyping(false);
      setBusy(false);
    }
  }

  return (
    <section className="chat-panel">
      <div className="chat-scroll" ref={scrollRef}>
        <div className="chat-inner">
          <div className="day-divider">Consultation begins</div>

          {messages.map((m, i) => (
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
          ))}

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

          <div ref={bottomRef} />
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
