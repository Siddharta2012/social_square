const dsn = import.meta.env.VITE_ERROR_REPORT_DSN as string | undefined;

export function captureClientError(error: unknown, context: Record<string, unknown> = {}): void {
  if (!dsn) return;
  const message = error instanceof Error ? error.message : String(error);
  console.error('[error-report]', { message, context });
}

export function installClientErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    captureClientError(event.error ?? event.message, { source: 'error' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    captureClientError(event.reason, { source: 'unhandledrejection' });
  });
}
