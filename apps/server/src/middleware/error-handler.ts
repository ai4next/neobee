import type { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  const message = err.message || 'Internal server error';
  const statusCode = 'statusCode' in err ? (err as any).statusCode : 500;
  res.status(statusCode).json({ error: message });
}