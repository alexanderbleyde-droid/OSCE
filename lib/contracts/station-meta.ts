import { z } from "zod";
import { stationContentSchema } from "./station";

/** Station table metadata edited alongside content in the admin form. */
export const stationMetaSchema = z.object({
  code: z
    .string()
    .min(1, "Code is required")
    .max(64, "Keep the code under 64 characters")
    .regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, "Letters, digits, and dashes only"),
  title: z.string().min(1, "Title is required").max(200),
  specialtyId: z.uuid("Choose a specialty"),
  trainingLevels: z
    .array(z.enum(["student", "resident", "physician"]))
    .min(1, "Pick at least one training level"),
});

export type StationMeta = z.infer<typeof stationMetaSchema>;

/** Full form payload: metadata + StationContent (structural validation). */
export const stationFormSchema = z.object({
  meta: stationMetaSchema,
  content: stationContentSchema,
});

export type StationFormValues = z.infer<typeof stationFormSchema>;

/** Flattens Zod issues into a dot-path -> message map for inline errors. */
export function zodIssuesToMap(error: z.ZodError): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!(key in map)) map[key] = issue.message;
  }
  return map;
}
