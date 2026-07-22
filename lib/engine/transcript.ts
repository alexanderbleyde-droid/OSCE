/** Transcript shape persisted on attempts.transcript (jsonb). */

export type TranscriptMessage = {
  role: "candidate" | "patient";
  text: string;
  /** ISO timestamp (server-assigned at persistence). */
  at: string;
};

export function parseTranscript(value: unknown): TranscriptMessage[] {
  if (!Array.isArray(value)) return [];
  const out: TranscriptMessage[] = [];
  for (const item of value) {
    if (
      item &&
      typeof item === "object" &&
      ((item as TranscriptMessage).role === "candidate" ||
        (item as TranscriptMessage).role === "patient") &&
      typeof (item as TranscriptMessage).text === "string"
    ) {
      out.push({
        role: (item as TranscriptMessage).role,
        text: (item as TranscriptMessage).text,
        at: typeof (item as TranscriptMessage).at === "string" ? (item as TranscriptMessage).at : "",
      });
    }
  }
  return out;
}
