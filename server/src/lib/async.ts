import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Express 4 drops rejected promises on the floor instead of routing them to the error
 *  middleware. Every async handler goes through here so a thrown ApiError still lands
 *  as a proper JSON response. */
export function ah(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
