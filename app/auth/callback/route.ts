import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile, safeNext } from "@/lib/auth/bootstrap";

/**
 * PKCE code landing (client-initiated signInWithOtp uses this flow):
 * exchanges the ?code= for a session, bootstraps the profile on first
 * sign-in, then redirects into the app. The token_hash flow lives at
 * /auth/confirm. Invalid/expired links land back on /signin.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

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
