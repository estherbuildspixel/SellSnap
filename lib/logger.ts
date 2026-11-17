import { AsyncLocalStorage } from 'async_hooks';

type LogContext = Record<string, unknown>;

const requestStore = new AsyncLocalStorage<{ requestId: string }>();

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return requestStore.run({ requestId }, fn);
}

function formatLog(level: 'info' | 'warn' | 'error', event: string, ctx?: LogContext): string {
  const store = requestStore.getStore();
  const requestId = store?.requestId ?? 'system';
  const timestamp = new Date().toISOString();

  // Redact any accidental secret fields
  const sanitizedCtx = ctx ? { ...ctx } : {};
  const sensitiveKeys = ['password', 'passwordHash', 'secret', 'FLW_SECRET_KEY', 'FLW_SECRET_HASH', 'token'];
  for (const k of Object.keys(sanitizedCtx)) {
    if (sensitiveKeys.some((s) => k.toLowerCase().includes(s.toLowerCase()))) {
      sanitizedCtx[k] = '[REDACTED]';
    }
  }

  return JSON.stringify({
    timestamp,
    level,
    requestId,
    event,
    ...sanitizedCtx,
  });
}

export const logger = {
  info(event: string, ctx?: LogContext) {
    process.stdout.write(formatLog('info', event, ctx) + '\n');
  },
  warn(event: string, ctx?: LogContext) {
    process.stderr.write(formatLog('warn', event, ctx) + '\n');
  },
  error(event: string, ctx?: LogContext) {
    process.stderr.write(formatLog('error', event, ctx) + '\n');
  },
};
