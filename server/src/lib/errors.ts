/** Every failure that reaches the client is one of these. The error middleware turns
 *  anything else into a 500 with a generic message, so stack traces never ship. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Sign in to continue') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = "You don't have access to that") {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = "That doesn't exist") {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string) {
    return new ApiError(409, 'CONFLICT', message);
  }
  static tooMany(message: string) {
    return new ApiError(429, 'RATE_LIMITED', message);
  }
}
