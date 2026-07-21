import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Asserts the current request comes from a signed-in admin BEFORE any
 * service-role data access runs. Every lib/data function that uses the
 * admin client must call this first — the proxy and layouts also gate
 * /admin/**, but data-layer functions must not rely on their callers.
 */
export async function requireAdmin(): Promise<{ userId: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/signin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.claims.sub)
    .single();
  if (profile?.role !== "admin") redirect("/signin");

  return { userId: data.claims.sub };
}
