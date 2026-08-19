import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

/** Replaces req.body / req.query with the parsed value so handlers get inferred types
 *  and never see an unvalidated field. */
export function validateBody<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data as z.infer<T>;
    next();
  };
}

export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(result.error);
    Object.defineProperty(req, 'validatedQuery', { value: result.data, configurable: true });
    next();
  };
}

export function query<T>(req: Request): T {
  return (req as Request & { validatedQuery: T }).validatedQuery;
}
