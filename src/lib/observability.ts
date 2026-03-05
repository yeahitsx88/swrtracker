import type { UUID } from '@/shared/types';
import { getCorrelationId } from './correlation';

type LogLevel = 'INFO' | 'ERROR';

interface LogContext {
  tenantId?: UUID | null;
  ticketId?: UUID | null;
  actorId?: UUID | null;
  eventType: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, context: LogContext): void {
  const correlationId = getCorrelationId();
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    event_type: context.eventType,
    tenant_id: context.tenantId ?? null,
    ticket_id: context.ticketId ?? null,
    actor_id: context.actorId ?? null,
    correlation_id: correlationId,
    ...context,
  };

  if (level === 'ERROR') {
    console.error(JSON.stringify(payload));
    return;
  }
  console.log(JSON.stringify(payload));
}

export function logInfo(message: string, context: LogContext): void {
  emit('INFO', message, context);
}

export function logError(
  message: string,
  context: LogContext,
  err?: unknown,
): void {
  const errorContext = err instanceof Error
    ? {
      error_name: err.name,
      error_message: err.message,
    }
    : {};
  emit('ERROR', message, {
    ...context,
    ...errorContext,
  });
}
