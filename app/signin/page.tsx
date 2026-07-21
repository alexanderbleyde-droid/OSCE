import type { Metadata } from "next";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/theme-toggle";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthCard } from "./auth-card";
import "./signin.css";

export const metadata: Metadata = {
  title: "Sign in · Plexus OSCE Simulator",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;

  // Specialties are RLS-protected (authenticated only); the sign-up select
  // needs them pre-auth, so read names via service role here on the server.
  const admin = createAdminClient();
  const { data: specialties } = await admin
    .from("specialties")
    .select("id, name")
    .order("name");

  return (
    <>
      <div className="signin-theme-toggle">
        <ThemeToggle />
      </div>

      <main className="page">
        {/* ============ BRAND SIDE ============ */}
        <aside className="brand-side">
          <div className="brand-lockup">
            <BrandMark size={56} />
            <div className="brand-lockup-text">
              <span className="brand-lockup-name">Plexus</span>
              <span className="brand-lockup-sub">OSCE Simulator</span>
            </div>
          </div>

          <h1 className="brand-headline">
            Practise on demand. <strong>Improve with intent.</strong>
          </h1>

          <p className="brand-lede">
            Realistic OSCE cases, AI-driven patient consultations, and
            structured feedback across five scoring domains — designed to help
            students, residents, and physicians prepare with the consistency a
            real examiner cannot offer.
          </p>

          <div className="brand-stats">
            <div>
              <div className="brand-stat-num">100</div>
              <div className="brand-stat-label">
                Maximum score across five domains
              </div>
            </div>
            <div>
              <div className="brand-stat-num">
                ~12
                <span
                  style={{
                    fontSize: 16,
                    color: "var(--text-tertiary)",
                    marginLeft: 3,
                  }}
                >
                  min
                </span>
              </div>
              <div className="brand-stat-label">Average case duration</div>
            </div>
            <div>
              <div className="brand-stat-num">6</div>
              <div className="brand-stat-label">
                Station types — history, assessment, more
              </div>
            </div>
          </div>

          <div className="brand-spec-card">
            <div className="brand-spec-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="brand-spec-content">
              <div className="brand-spec-title">
                Adapts to your level and specialty
              </div>
              <div className="brand-spec-desc">
                Cases are generated to match your training level — from early
                students to residents and practicing physicians — and adapt to
                your chosen specialization and evolving competence over time.
              </div>
            </div>
          </div>
        </aside>

        {/* ============ FORM SIDE ============ */}
        <section className="form-side">
          <AuthCard
            specialties={specialties ?? []}
            initialState={state === "expired" ? "expired" : "form"}
          />
        </section>
      </main>
    </>
  );
}
