import "server-only";

import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/** First sign-in creates a candidate profile; later sign-ins are a no-op.
 *  Admin role is only ever set via promote_to_admin (service role). */
export async function ensureProfile(user: User): Promise<void> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (existing) return;

  // Specialization picked at sign-up travels via user_metadata. It is
  // user-editable, so validate against specialties before trusting it.
  // (Roles NEVER come from metadata.)
  let specialtyId: string | null = null;
  const requested = user.user_metadata?.specialty_id;
  if (typeof requested === "string" && /^[0-9a-f-]{36}$/i.test(requested)) {
    const { data: specialty } = await admin
      .from("specialties")
      .select("id")
      .eq("id", requested)
      .maybeSingle();
    specialtyId = specialty?.id ?? null;
  }

  const { error } = await admin.from("profiles").insert({
    id: user.id,
    role: "candidate",
    specialty_id: specialtyId,
  });
  // Ignore duplicate-key races (two parallel callbacks); anything else is
  // unexpected but must not block sign-in.
  if (error && error.code !== "23505") {
    console.error(`profile bootstrap failed for ${user.id}: ${error.message}`);
  }
}

/** Same-site relative redirect target only — never redirect off-origin. */
export function safeNext(nextParam: string | null): string {
  return nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
    ? nextParam
    : "/app";
}
