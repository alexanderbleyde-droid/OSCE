import { streamText } from "ai";
import { loadEncounterForOwner } from "@/lib/data/encounter";
import { buildTutorCoachPrompt } from "@/lib/engine/tutor-prompt";
import { encounterModel } from "@/lib/engine/model";

export const maxDuration = 30;

/**
 * Tutor-mode Socratic coaching (pillar 3). Streams a short guiding nudge, or
 * the literal "[SILENT]" sentinel when no coaching is warranted. Tutor mode
 * only; ephemeral (coaching is not persisted to the transcript — it's in-the-
 * moment). Reads only the coaching-safe view (no examiner answer key).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const encounter = await loadEncounterForOwner(id);
  if (!encounter) return new Response("Attempt not found", { status: 404 });
  if (encounter.mode !== "tutor") {
    return new Response("Coaching is only available in tutor mode", { status: 409 });
  }
  if (encounter.completed) {
    return new Response("This encounter has ended", { status: 409 });
  }

  const built = buildTutorCoachPrompt({
    content: encounter.content,
    transcript: encounter.transcript,
  });

  const result = streamText({
    model: encounterModel(),
    system: built.system,
    messages: built.messages,
    onError: (event) => {
      console.error(`tutor coach stream error (attempt ${id}):`, event.error);
    },
  });

  return result.toTextStreamResponse();
}
