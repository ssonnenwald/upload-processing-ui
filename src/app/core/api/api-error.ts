/**
 * Error type thrown by errorInterceptor. Carries the friendly `message` for
 * direct UI display, plus the original HTTP `status` so callers can branch on
 * it (e.g. retry on 404, treat 401 specially) without re-parsing.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly statusText: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
