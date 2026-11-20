export default function Loading() {
  return (
    <div className="wrap cuv-loading" role="status">
      <span className="sr-only">Loading marketplace…</span>
      <div className="cuv-skeleton" aria-hidden="true" />
      <div className="cuv-skeleton" aria-hidden="true" />
    </div>
  );
}
