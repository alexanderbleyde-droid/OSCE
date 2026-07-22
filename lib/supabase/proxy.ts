import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session refresh + route protection, run from the root proxy.
 *   /app/**   requires a session
 *   /admin/** requires a session AND an admin profile
 *   unauthorized -> /signin; signed-in users on /signin -> /app
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Don't put this client in a global — create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims() — and do not
  // remove getClaims(): it refreshes the token for server components.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const path = request.nextUrl.pathname;
  const wantsApp =
    path === "/app" ||
    path.startsWith("/app/") ||
    path === "/encounter" ||
    path.startsWith("/encounter/");
  const wantsAdmin = path === "/admin" || path.startsWith("/admin/");
  const onSignin = path === "/signin";

  // Preserves refreshed auth cookies on every redirect we issue.
  function redirectTo(pathname: string) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => response.cookies.set(cookie));
    return response;
  }

  if (!claims && (wantsApp || wantsAdmin)) {
    return redirectTo("/signin");
  }

  if (claims && wantsAdmin) {
    // Role lives in profiles (never in user_metadata). RLS lets users read
    // their own row, so this query runs as the requesting user.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", claims.sub)
      .single();
    if (profile?.role !== "admin") {
      return redirectTo("/signin");
    }
  }

  if (claims && onSignin) {
    return redirectTo("/app");
  }

  // Return supabaseResponse as-is (cookies must stay intact). If you branch
  // into a new response, copy the cookies over exactly like redirectTo does.
  return supabaseResponse;
}
