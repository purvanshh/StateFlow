import { Request, Response } from 'express';

export function notFoundHandler(_req: Request, res: Response) {
    res.status(404).json({
        error: {
            message: 'Resource not found',
            code: 'NOT_FOUND',
        },
    });
}
