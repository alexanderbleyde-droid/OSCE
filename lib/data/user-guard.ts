import "server-only";

import { redirect } from "next/navigation";
import type { Profile } from "@/lib/contracts/db";
import { createClient } from "@/lib/supabase/server";

/** Asserts a signed-in user and returns their id + profile row (own-row
 *  read via RLS). Candidate routes/actions call this before any work. */
export async function requireUser(): Promise<{
  userId: string;
  profile: Profile | null;
}> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/signin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", data.claims.sub)
    .maybeSingle();

  return { userId: data.claims.sub, profile: (profile as Profile) ?? null };
}
