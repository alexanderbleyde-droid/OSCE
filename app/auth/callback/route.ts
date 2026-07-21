import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Magic-link landing: exchanges the PKCE code for a session, bootstraps the
 * profile on first sign-in (always candidate — admin is only ever set via
 * promote_to_admin with the service role), then redirects into the app.
 * Invalid/expired links land back on /signin in its "expired" state.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Only same-site relative paths — never redirect off-origin.
  const nextParam = searchParams.get("next") ?? "/app";
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/app";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await ensureProfile(data.user);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/signin?state=expired`);
}

/** First sign-in creates a candidate profile; later sign-ins are a no-op. */
async function ensureProfile(user: User): Promise<void> {
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
