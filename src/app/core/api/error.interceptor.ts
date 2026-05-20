import {
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { ApiError } from './api-error';

/**
 * Normalizes server errors into ApiError instances — a friendly `message` the
 * UI can render directly, plus the HTTP `status` preserved so callers can
 * branch on it (retry on 404, etc.). The backend's ProblemDetails responses
 * use `title`/`detail`; controllers throwing BadRequest with a string use
 * `error` directly. We pick the most informative non-empty field.
 */
export const errorInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) =>
  next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        const message = extractMessage(err);
        return throwError(
          () => new ApiError(message, err.status, err.statusText),
        );
      }
      return throwError(() => err);
    }),
  );

function extractMessage(err: HttpErrorResponse): string {
  if (err.error && typeof err.error === 'object') {
    const body = err.error as Record<string, unknown>;
    const candidates = ['detail', 'title', 'message', 'error'];
    for (const key of candidates) {
      const v = body[key];
      if (typeof v === 'string' && v.trim().length > 0) return v;
    }
  }
  if (typeof err.error === 'string' && err.error.trim().length > 0) {
    return err.error;
  }
  if (err.status === 0) {
    return 'Could not reach the server. Check your network connection.';
  }
  return `${err.status} ${err.statusText || 'Request failed'}`;
}
