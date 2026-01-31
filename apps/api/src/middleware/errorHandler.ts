import { Request, Response, NextFunction } from 'express';

interface ApiError extends Error {
    statusCode?: number;
    code?: string;
    details?: unknown;
}

export function errorHandler(
    err: ApiError,
    _req: Request,
    res: Response,
    _next: NextFunction
) {
    console.error('[Error]', {
        message: err.message,
        code: err.code,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        error: {
            message,
            code: err.code || 'INTERNAL_ERROR',
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
            ...(err.details && { details: err.details }),
        },
    });
}
