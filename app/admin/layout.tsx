import { redirect } from "next/navigation";
import { AdminRail } from "@/components/admin-rail";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/server";
import "@/components/shell.css";
import "@/components/admin-ui.css";

/** Admin shell: V3 screen-06 rail + main. The proxy already gates
 *  /admin/** by role; this check is defense in depth. */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/signin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.claims.sub)
    .single();
  if (profile?.role !== "admin") redirect("/signin");

  const email = String(data.claims.email ?? "");
  const namePart = email.split("@")[0] || "Admin";
  const initials = namePart
    .split(/[._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

  return (
    <div className="app">
      <AdminRail userName={email || "Admin"} userInitials={initials || "AD"} />
      <div className="main">
        <div className="mb-6 flex items-center justify-end gap-3">
          <ThemeToggle />
          <SignOutButton />
        </div>
        {children}
      </div>
    </div>
  );
}
