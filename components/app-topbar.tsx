"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/stations", label: "Stations" },
  { href: "/app/profile", label: "Profile" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Candidate topbar — V3 system-page header: brand left, nav centered,
 *  theme toggle right. */
export function AppTopbar() {
  const pathname = usePathname();

  return (
    <header className="topbar">
      <Link className="brand" href="/app">
        <BrandMark size={32} />
        <span className="brand-name">
          <span className="brand-name-main">Plexus</span>
          <span className="brand-name-sub">OSCE · V3</span>
        </span>
      </Link>

      <nav className="topnav" aria-label="Primary">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={isActive(pathname, item.href) ? "active" : ""}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="topbar-right">
        <ThemeToggle />
        <SignOutButton />
      </div>
    </header>
  );
}
