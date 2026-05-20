import { describe, it, expect } from 'vitest';
import { ApiError } from './api-error';

describe('ApiError', () => {
  it('exposes the friendly message via the standard Error.message', () => {
    const err = new ApiError(
      'Something went wrong.',
      500,
      'Internal Server Error',
    );
    expect(err.message).toBe('Something went wrong.');
  });

  it('carries the HTTP status and statusText', () => {
    const err = new ApiError('Not found.', 404, 'Not Found');
    expect(err.status).toBe(404);
    expect(err.statusText).toBe('Not Found');
  });

  it('sets name to "ApiError" rather than the default "Error"', () => {
    const err = new ApiError('Unauthorized.', 401, 'Unauthorized');
    expect(err.name).toBe('ApiError');
  });

  it('is an instance of both ApiError and Error', () => {
    const err = new ApiError('Bad request.', 400, 'Bad Request');
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
  });

  it('is throwable and catchable as an ApiError', () => {
    const throwIt = (): never => {
      throw new ApiError('Conflict.', 409, 'Conflict');
    };

    expect(throwIt).toThrow(ApiError);

    try {
      throwIt();
      expect.unreachable('ApiError should have been thrown');
    } catch (caught) {
      expect(caught).toBeInstanceOf(ApiError);
      // Status is readable from a generic catch without re-parsing.
      expect((caught as ApiError).status).toBe(409);
      expect((caught as ApiError).statusText).toBe('Conflict');
    }
  });

  it('lets callers branch on status — e.g. detecting a 404', () => {
    const errors = [
      new ApiError('Not found.', 404, 'Not Found'),
      new ApiError('Server error.', 500, 'Internal Server Error'),
    ];
    const notFound = errors.filter((e) => e.status === 404);
    expect(notFound).toHaveLength(1);
    expect(notFound[0].message).toBe('Not found.');
  });

  it('treats status and statusText as readonly at the type level', () => {
    const err = new ApiError('Forbidden.', 403, 'Forbidden');
    // @ts-expect-error status is declared readonly and cannot be reassigned.
    err.status = 500;
    // @ts-expect-error statusText is declared readonly and cannot be reassigned.
    err.statusText = 'Internal Server Error';
  });

  it('produces a useful stack trace', () => {
    const err = new ApiError('Gateway timeout.', 504, 'Gateway Timeout');
    expect(typeof err.stack).toBe('string');
    expect(err.stack?.length ?? 0).toBeGreaterThan(0);
  });

  it('includes the message in the default string representation', () => {
    const err = new ApiError(
      'Service unavailable.',
      503,
      'Service Unavailable',
    );
    // Error.prototype.toString() is "<name>: <message>".
    expect(String(err)).toBe('ApiError: Service unavailable.');
  });
});
