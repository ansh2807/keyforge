export default function Loading() {
  return (
    <main className="page" aria-label="Loading">
      <div style={{ height: 42, width: 260, borderRadius: 9, background: "var(--surface-raised)" }} />
      <div className="stats-grid" style={{ marginTop: 28, minHeight: 100, opacity: 0.6 }} />
      <div className="panel" style={{ minHeight: 360, marginTop: 20, opacity: 0.6 }} />
    </main>
  );
}
