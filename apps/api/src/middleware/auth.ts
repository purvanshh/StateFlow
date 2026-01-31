import { Request, Response, NextFunction } from 'express';

// JWT verification would go here
// import jwt from 'jsonwebtoken';

interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email: string;
    };
}

export function authMiddleware(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({
            error: {
                message: 'Missing or invalid authorization header',
                code: 'UNAUTHORIZED',
            },
        });
    }



    try {
        // TODO: Verify JWT token
        // const decoded = jwt.verify(token, process.env.JWT_SECRET!);
        // req.user = decoded as any;

        // For now, mock user
        req.user = { id: 'user-1', email: 'user@example.com' };

        next();
    } catch {
        return res.status(401).json({
            error: {
                message: 'Invalid or expired token',
                code: 'UNAUTHORIZED',
            },
        });
    }
}

// Optional auth - sets user if token present, but doesn't require it
export function optionalAuthMiddleware(
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
) {
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {

        try {
            // TODO: Verify JWT token
            req.user = { id: 'user-1', email: 'user@example.com' };
        } catch {
            // Ignore invalid token for optional auth
        }
    }

    next();
}
