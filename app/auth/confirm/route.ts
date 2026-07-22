import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile, safeNext } from "@/lib/auth/bootstrap";

const VALID_TYPES: EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

/**
 * token_hash verification flow — the form Supabase email templates and
 * admin-generated links use. Verifies server-side (sets the session cookie
 * via the SSR client), bootstraps the profile on first sign-in, sanitizes
 * the redirect, and sends failures to /signin's expired state. This avoids
 * the remote /auth/v1/verify endpoint's fragment-token flow, which the
 * PKCE-only /auth/callback cannot consume.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNext(searchParams.get("next"));

  if (tokenHash && type && (VALID_TYPES as string[]).includes(type)) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    if (!error && data.user) {
      await ensureProfile(data.user);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/signin?state=expired`);
}
