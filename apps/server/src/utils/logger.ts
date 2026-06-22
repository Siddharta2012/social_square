type LogLevel = 'info' | 'warn' | 'error';

function write(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...fields,
  };
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function logInfo(event: string, fields?: Record<string, unknown>): void {
  write('info', event, fields);
}

export function logWarn(event: string, fields?: Record<string, unknown>): void {
  write('warn', event, fields);
}

export function logError(event: string, fields?: Record<string, unknown>): void {
  write('error', event, fields);
}
