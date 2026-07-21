"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Specialty dropdown filter — updates the `specialty` search param. */
export function SpecialtyFilter({
  specialties,
}: {
  specialties: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("specialty") ?? "";

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("specialty", value);
    else params.delete("specialty");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="filter-select-wrap">
      <select
        className="filter-select"
        aria-label="Filter by specialty"
        value={current}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All specialties</option>
        {specialties.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <span className="select-caret">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </span>
    </div>
  );
}
