"use client";

/** Shared field primitives for the station form — V3 field language. */

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  invalid,
  mono,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  mono?: boolean;
}) {
  return (
    <input
      id={id}
      type="text"
      className={`input ${invalid ? "invalid" : ""}`}
      style={mono ? { fontFamily: "var(--font-mono)", fontSize: 13 } : undefined}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function TextArea({
  id,
  value,
  onChange,
  placeholder,
  invalid,
  rows,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  rows?: number;
}) {
  return (
    <textarea
      id={id}
      className={`textarea ${invalid ? "invalid" : ""}`}
      value={value}
      placeholder={placeholder}
      rows={rows ?? 3}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Select({
  id,
  value,
  onChange,
  invalid,
  children,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <div className="select-wrap">
      <select
        id={id}
        aria-label={ariaLabel}
        className={`select ${invalid ? "invalid" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      <span className="select-arrow">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </span>
    </div>
  );
}

export function Toggle({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <span className="toggle">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        className={`toggle-switch ${on ? "on" : ""}`}
        onClick={() => {
          if (!disabled) onChange(!on);
        }}
      />
      <span className="toggle-label">{label}</span>
    </span>
  );
}

export function SectionCard({
  icon,
  title,
  sub,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section-card">
      <div className="section-head">
        <div className="section-icon">{icon}</div>
        <div className="section-head-left">
          <div className="section-title">{title}</div>
          <div className="section-sub">{sub}</div>
        </div>
      </div>
      {children}
    </section>
  );
}
