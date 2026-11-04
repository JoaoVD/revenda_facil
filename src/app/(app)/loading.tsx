export default function Loading() {
  return (
    <section
      className="route-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p>Carregando esta tela…</p>
      <div className="loading-placeholder" />
      <div className="loading-placeholder" />
    </section>
  );
}
