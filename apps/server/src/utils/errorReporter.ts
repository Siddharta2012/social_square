import { env } from '../config/env';
import { logError } from './logger';

export function captureError(error: unknown, context: Record<string, unknown> = {}): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  logError('error.captured', {
    message,
    stack,
    reporterConfigured: Boolean(env.ERROR_REPORT_DSN),
    ...context,
  });
}

export function installGlobalErrorHandlers(): void {
  process.on('unhandledRejection', (reason) => captureError(reason, { source: 'unhandledRejection' }));
  process.on('uncaughtException', (error) => {
    captureError(error, { source: 'uncaughtException' });
    process.exit(1);
  });
}
