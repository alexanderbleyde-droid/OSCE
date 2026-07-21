/**
 * Promote an existing auth user to admin, via the service role.
 * The UUID is NEVER hardcoded — pass it as an argument or env var:
 *
 *   node scripts/promote-admin.ts <auth-user-uuid>
 *   ADMIN_USER_ID=<uuid> node scripts/promote-admin.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  } catch {
    // .env.local absent — rely on process env
  }
}
loadEnvLocal();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.argv[2] ?? process.env.ADMIN_USER_ID;

if (!URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
  console.error("Usage: node scripts/promote-admin.ts <auth-user-uuid>");
  process.exit(1);
}

const service = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: authUser, error: lookupError } =
  await service.auth.admin.getUserById(userId);
if (lookupError || !authUser.user) {
  console.error(`No auth user with id ${userId}: ${lookupError?.message}`);
  process.exit(1);
}

const { error } = await service.rpc("promote_to_admin", {
  target_user: userId,
});
if (error) {
  console.error(`promote_to_admin failed: ${error.message}`);
  process.exit(1);
}

const { data: profile, error: profileError } = await service
  .from("profiles")
  .select("id, role")
  .eq("id", userId)
  .single();
if (profileError || profile?.role !== "admin") {
  console.error(`verification failed: ${profileError?.message ?? `role=${profile?.role}`}`);
  process.exit(1);
}

console.log(`OK: ${userId} is now admin`);
