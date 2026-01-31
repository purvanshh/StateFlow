export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  executionId?: string;
  stepId?: string;
  workerId?: string;
  attempt?: number;
  durationMs?: number;
  delayMs?: number;
  metadata?: Record<string, unknown>;
  error?: Error;
}

export class Logger {
  private baseContext?: Partial<LogEntry>;

  constructor(context?: Partial<LogEntry>) {
    this.baseContext = context;
  }

  private log(level: LogLevel, message: string, meta?: Partial<LogEntry>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.baseContext,
      ...meta,
    };

    console.log(JSON.stringify(entry));
  }

  info(message: string, meta?: Partial<LogEntry>) {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Partial<LogEntry>) {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Partial<LogEntry>) {
    const errorObj = meta?.error;
    const errorMeta = errorObj
      ? {
          ...meta,
          metadata: {
            ...meta?.metadata,
            stack: errorObj.stack,
            errorMessage: errorObj.message,
          },
        }
      : meta;

    this.log('error', message, errorMeta);
  }

  debug(message: string, meta?: Partial<LogEntry>) {
    this.log('debug', message, meta);
  }

  child(context: Partial<LogEntry>): Logger {
    return new Logger({ ...this.baseContext, ...context });
  }

  withExecution(executionId: string): Logger {
    return this.child({ executionId });
  }

  withStep(stepId: string): Logger {
    return this.child({ stepId });
  }

  withWorker(workerId: string): Logger {
    return this.child({ workerId });
  }

  withAttempt(attempt: number): Logger {
    return this.child({ attempt });
  }

  withDuration(durationMs: number): Logger {
    return this.child({ durationMs });
  }

  withDelay(delayMs: number): Logger {
    return this.child({ delayMs });
  }
}

export const logger = new Logger();
