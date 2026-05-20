import { describe, it, expect } from 'vitest';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { errorInterceptor } from './error.interceptor';
import { ApiError } from './api-error';

const REQ = new HttpRequest('GET', '/api/runs');

function failWith(error: HttpErrorResponse): HttpHandlerFn {
  return (): Observable<HttpEvent<unknown>> => throwError(() => error);
}

function failWithRaw(error: unknown): HttpHandlerFn {
  return (): Observable<HttpEvent<unknown>> => throwError(() => error);
}

function succeedWith(body: unknown): HttpHandlerFn {
  return (): Observable<HttpEvent<unknown>> =>
    of(new HttpResponse({ status: 200, body }));
}

async function interceptError(next: HttpHandlerFn): Promise<unknown> {
  try {
    await firstValueFrom(errorInterceptor(REQ, next));
    expect.unreachable('Interceptor stream should have errored');
  } catch (caught) {
    return caught;
  }
}

describe('errorInterceptor', () => {
  it('passes a successful response straight through', async () => {
    const event = await firstValueFrom(
      errorInterceptor(REQ, succeedWith('ok')),
    );
    expect(event).toBeInstanceOf(HttpResponse);
    expect((event as HttpResponse<unknown>).body).toBe('ok');
  });

  it('wraps an HttpErrorResponse in an ApiError', async () => {
    const httpErr = new HttpErrorResponse({
      status: 500,
      statusText: 'Internal Server Error',
      error: { detail: 'The pipeline crashed.' },
    });

    const caught = await interceptError(failWith(httpErr));
    expect(caught).toBeInstanceOf(ApiError);
  });

  it('preserves the HTTP status and statusText on the ApiError', async () => {
    const httpErr = new HttpErrorResponse({
      status: 404,
      statusText: 'Not Found',
      error: { title: 'Run not found' },
    });

    const caught = (await interceptError(failWith(httpErr))) as ApiError;
    expect(caught.status).toBe(404);
    expect(caught.statusText).toBe('Not Found');
  });

  describe('message extraction from a ProblemDetails-style object body', () => {
    it('prefers `detail` over the other fields', async () => {
      const httpErr = new HttpErrorResponse({
        status: 400,
        statusText: 'Bad Request',
        error: {
          detail: 'detail wins',
          title: 'title loses',
          message: 'message loses',
          error: 'error loses',
        },
      });

      const caught = (await interceptError(failWith(httpErr))) as ApiError;
      expect(caught.message).toBe('detail wins');
    });

    it('falls back to `title` when `detail` is absent', async () => {
      const httpErr = new HttpErrorResponse({
        status: 400,
        statusText: 'Bad Request',
        error: { title: 'title wins', message: 'message loses' },
      });

      const caught = (await interceptError(failWith(httpErr))) as ApiError;
      expect(caught.message).toBe('title wins');
    });

    it('falls back to `message`, then `error`, in order', async () => {
      const messageOnly = new HttpErrorResponse({
        status: 400,
        statusText: 'Bad Request',
        error: { message: 'message wins', error: 'error loses' },
      });
      const errorOnly = new HttpErrorResponse({
        status: 400,
        statusText: 'Bad Request',
        error: { error: 'error wins' },
      });

      expect(
        ((await interceptError(failWith(messageOnly))) as ApiError).message,
      ).toBe('message wins');
      expect(
        ((await interceptError(failWith(errorOnly))) as ApiError).message,
      ).toBe('error wins');
    });

    it('skips blank/whitespace-only fields and uses the next non-empty one', async () => {
      const httpErr = new HttpErrorResponse({
        status: 400,
        statusText: 'Bad Request',
        error: { detail: '   ', title: 'real title' },
      });

      const caught = (await interceptError(failWith(httpErr))) as ApiError;
      expect(caught.message).toBe('real title');
    });

    it('skips non-string field values', async () => {
      const httpErr = new HttpErrorResponse({
        status: 400,
        statusText: 'Bad Request',
        error: { detail: 42, title: 'string title' },
      });

      const caught = (await interceptError(failWith(httpErr))) as ApiError;
      expect(caught.message).toBe('string title');
    });
  });

  it('uses a plain string error body directly', async () => {
    const httpErr = new HttpErrorResponse({
      status: 400,
      statusText: 'Bad Request',
      error: 'Invalid function name.',
    });

    const caught = (await interceptError(failWith(httpErr))) as ApiError;
    expect(caught.message).toBe('Invalid function name.');
  });

  it('gives a network message when status is 0 and no body is present', async () => {
    const httpErr = new HttpErrorResponse({
      status: 0,
      statusText: 'Unknown Error',
      error: null,
    });

    const caught = (await interceptError(failWith(httpErr))) as ApiError;
    expect(caught.message).toBe(
      'Could not reach the server. Check your network connection.',
    );
  });

  it('falls back to "<status> <statusText>" when nothing else is usable', async () => {
    const httpErr = new HttpErrorResponse({
      status: 503,
      statusText: 'Service Unavailable',
      error: null,
    });

    const caught = (await interceptError(failWith(httpErr))) as ApiError;
    expect(caught.message).toBe('503 Service Unavailable');
  });

  it('uses the substituted statusText when an empty one is given', async () => {
    // HttpErrorResponse replaces an empty statusText with 'Unknown Error'
    // internally, so the interceptor's `statusText || 'Request failed'`
    // fallback never sees an empty string — the message is "503 Unknown Error".
    const httpErr = new HttpErrorResponse({
      status: 503,
      statusText: '',
      error: null,
    });

    const caught = (await interceptError(failWith(httpErr))) as ApiError;
    expect(caught.message).toBe('503 Unknown Error');
  });

  it('re-throws a non-HttpErrorResponse error unchanged', async () => {
    const raw = new TypeError('boom');
    const caught = await interceptError(failWithRaw(raw));
    expect(caught).toBe(raw);
    expect(caught).not.toBeInstanceOf(ApiError);
  });
});
