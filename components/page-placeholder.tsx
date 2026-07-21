/** Shared empty-page scaffold for Step 4 routed pages. */
export function PagePlaceholder({
  title,
  sub,
  note,
}: {
  title: string;
  sub: string;
  note: string;
}) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-sub">{sub}</p>
        </div>
      </div>
      <div className="placeholder-card">
        <div className="placeholder-title">Nothing here yet</div>
        <p className="placeholder-note">{note}</p>
      </div>
    </>
  );
}
