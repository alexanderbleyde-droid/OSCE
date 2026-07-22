import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import "@/components/exam-chat.css";

/** Focused full-screen encounter shell — session-gated, no app chrome
 *  (the encounter provides its own topbar). */
export default async function EncounterLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/signin");

  return <div className="flex min-h-screen flex-col">{children}</div>;
}
