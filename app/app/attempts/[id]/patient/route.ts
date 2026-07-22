import { streamText } from "ai";
import { z } from "zod";
import {
  appendTranscriptMessage,
  loadEncounterForOwner,
} from "@/lib/data/encounter";
import { buildStandardizedPatientPrompt } from "@/lib/engine/prompt-builder";
import { encounterModel } from "@/lib/engine/model";

export const maxDuration = 60;

const bodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
});

/**
 * Streaming standardized-patient reply. Server-side only:
 *   - proves attempt ownership (loadEncounterForOwner uses RLS),
 *   - persists the candidate turn, builds the SP prompt from station data
 *     alone (examiner material never leaves the server),
 *   - streams the patient reply, persisting it on finish.
 * The Anthropic key stays server-side; the model id comes from env.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid body", { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response("A non-empty message is required", { status: 400 });
  }

  // Ownership + engine state (redirects to /signin if unauthenticated).
  const encounter = await loadEncounterForOwner(id);
  if (!encounter) {
    return new Response("Attempt not found", { status: 404 });
  }
  if (encounter.completed) {
    return new Response("This encounter has ended", { status: 409 });
  }

  // Persist the candidate turn first (server-authored timestamp).
  await appendTranscriptMessage(id, encounter.userId, "candidate", parsed.data.message);

  const built = buildStandardizedPatientPrompt({
    content: encounter.content,
    mode: encounter.mode,
    tier: encounter.tier,
    sampledQuestionIds: encounter.sampledQuestionIds,
    transcript: [
      ...encounter.transcript,
      { role: "candidate", text: parsed.data.message, at: "" },
    ],
  });

  const result = streamText({
    model: encounterModel(),
    system: built.system,
    messages: built.messages,
    onFinish: async ({ text }) => {
      const reply = text.trim();
      if (reply.length > 0) {
        await appendTranscriptMessage(id, encounter.userId, "patient", reply);
      }
    },
  });

  return result.toTextStreamResponse();
}
