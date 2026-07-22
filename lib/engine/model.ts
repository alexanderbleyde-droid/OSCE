import "server-only";

import { anthropic } from "@ai-sdk/anthropic";

/** Model id from env with a sensible current default — never hardcoded at
 *  the call site. (Default per the Anthropic model guidance.) */
export const ENCOUNTER_MODEL_ID = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

export function encounterModel() {
  return anthropic(ENCOUNTER_MODEL_ID);
}
