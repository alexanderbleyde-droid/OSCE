import { redirect } from "next/navigation";
import { AppTopbar } from "@/components/app-topbar";
import { createClient } from "@/lib/supabase/server";
import "@/components/shell.css";

/** Candidate shell: V3 topbar + centered content column.
 *  The proxy already gates /app/**; this check is defense in depth. */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/signin");

  return (
    <>
      <AppTopbar />
      <main className="shell-main">{children}</main>
    </>
  );
}
