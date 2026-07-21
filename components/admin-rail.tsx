"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";

type RailItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

type RailSection = {
  label: string;
  items: RailItem[];
};

const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const SECTIONS: RailSection[] = [
  {
    label: "Operations",
    items: [
      {
        href: "/admin",
        label: "Overview",
        icon: (
          <svg {...ICON_PROPS}>
            <rect x="3" y="3" width="7" height="9" rx="1" />
            <rect x="14" y="3" width="7" height="5" rx="1" />
            <rect x="14" y="12" width="7" height="9" rx="1" />
            <rect x="3" y="16" width="7" height="5" rx="1" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Manage",
    items: [
      {
        href: "/admin/stations",
        label: "Stations",
        icon: (
          <svg {...ICON_PROPS}>
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        ),
      },
      {
        href: "/admin/users",
        label: "Users",
        icon: (
          <svg {...ICON_PROPS}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Configuration",
    items: [
      {
        href: "/admin/settings",
        label: "System settings",
        icon: (
          <svg {...ICON_PROPS}>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        ),
      },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Admin left rail — V3 screen-06 sidebar. */
export function AdminRail({
  userName,
  userInitials,
}: {
  userName: string;
  userInitials: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="rail">
      <div className="rail-brand">
        <BrandMark size={26} />
        <div className="rail-brand-text">
          <span className="rail-brand-name">Plexus</span>
          <span className="rail-brand-sub">ADMIN</span>
        </div>
      </div>

      {SECTIONS.map((section) => (
        <div key={section.label} className="contents">
          <div className="rail-section-label">{section.label}</div>
          {section.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rail-link ${isActive(pathname, item.href) ? "active" : ""}`}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </div>
      ))}

      <div className="rail-footer">
        <div className="rail-user">
          <span className="rail-user-dot">{userInitials}</span>
          <div className="rail-user-info">
            <span className="rail-user-name">{userName}</span>
            <span className="rail-user-role">Admin</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
