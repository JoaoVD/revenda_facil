export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.FISCAL_POLLING_ENABLED === 'true'
  ) {
    const { startFiscalPolling } = await import('./modules/fiscal/worker');
    startFiscalPolling();
  }
}
