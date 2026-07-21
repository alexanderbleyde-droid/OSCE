import { redirect } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/server";

/** Stub dashboard — replaced by the full candidate shell in Step 4. */
export default async function AppDashboard() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/signin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, training_level")
    .eq("id", data.claims.sub)
    .single();

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center">
      <div className="absolute top-6 right-6 flex items-center gap-3">
        <ThemeToggle />
        <SignOutButton />
      </div>

      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-border-strong bg-surface-2 p-8 shadow-lg">
        <BrandMark size={40} />
        <div className="text-center">
          <h1 className="font-display text-xl font-medium tracking-[-0.015em] text-primary">
            Dashboard
          </h1>
          <p className="mt-2 text-sm text-secondary">
            Signed in as{" "}
            <span className="font-mono text-[13px] text-primary">
              {String(data.claims.email ?? data.claims.sub)}
            </span>
          </p>
          <p className="mt-1 text-sm text-tertiary">
            Role: <span className="text-secondary">{profile?.role ?? "—"}</span>
          </p>
        </div>
        <p className="text-center text-xs text-tertiary">
          Stub page — the full candidate shell arrives in Step 4.
        </p>
      </div>
    </main>
  );
}
