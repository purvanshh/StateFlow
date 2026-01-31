import { Request, Response, NextFunction } from 'express';
import { logger } from '@stateflow/shared';

interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export function errorHandler(err: ApiError, _req: Request, res: Response, _next: NextFunction) {
  logger.error(`API error`, {
    error: err,
    metadata: { statusCode: err.statusCode, code: err.code },
  });

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  const errorResponse: Record<string, unknown> = {
    message,
    code: err.code || 'INTERNAL_ERROR',
  };

  if (process.env.NODE_ENV === 'development' && err.stack) {
    errorResponse.stack = err.stack;
  }

  if (err.details) {
    errorResponse.details = err.details;
  }

  res.status(statusCode).json({ error: errorResponse });
}
