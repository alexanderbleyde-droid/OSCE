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

  // Fixed to the viewport so the chat scroll area (not the page) scrolls and
  // the composer stays anchored.
  return <div className="flex h-screen flex-col overflow-hidden">{children}</div>;
}
