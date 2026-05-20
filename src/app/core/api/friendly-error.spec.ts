import { describe, it, expect } from 'vitest';
import { friendlyApiError } from './friendly-error';

/** The exact message returned for any connectivity-level failure. */
const UNREACHABLE =
  'Can\u2019t reach the upload service \u2014 it may still be ' +
  'starting. Try again in a moment.';

/** The default fallback baked into the function's signature. */
const DEFAULT_FALLBACK = 'Something went wrong. Try again in a moment.';

describe('friendlyApiError', () => {
  describe('connectivity-level failures', () => {
    it.each([0, 500, 502, 503, 504])(
      'returns the "unreachable" message for status %i',
      (status) => {
        expect(friendlyApiError({ status })).toBe(UNREACHABLE);
      },
    );

    it('returns the unreachable message even when a server message is present', () => {
      // A 500 with its own message is still treated as "service absent",
      // because the dev-server proxy fabricates 500s for a dead upstream.
      const err = { status: 500, message: 'Internal Server Error' };
      expect(friendlyApiError(err)).toBe(UNREACHABLE);
    });

    it('ignores the fallback argument for a connectivity status', () => {
      expect(friendlyApiError({ status: 503 }, 'custom fallback')).toBe(
        UNREACHABLE,
      );
    });
  });

  describe('other HTTP statuses', () => {
    it('returns the original message for a 4xx error', () => {
      const err = { status: 404, message: 'Run not found.' };
      expect(friendlyApiError(err)).toBe('Run not found.');
    });

    it('returns the original message for a 400 error', () => {
      const err = { status: 400, message: 'Invalid function name.' };
      expect(friendlyApiError(err)).toBe('Invalid function name.');
    });

    it('returns the original message for a non-listed 5xx like 501', () => {
      // 501 is not in the connectivity set, so the message passes through.
      const err = { status: 501, message: 'Not Implemented.' };
      expect(friendlyApiError(err)).toBe('Not Implemented.');
    });

    it('uses the default fallback when a non-connectivity error has no message', () => {
      expect(friendlyApiError({ status: 404 })).toBe(DEFAULT_FALLBACK);
    });

    it('uses a custom fallback when provided and there is no message', () => {
      expect(friendlyApiError({ status: 403 }, 'Access denied.')).toBe(
        'Access denied.',
      );
    });

    it('prefers the error message over the fallback when both exist', () => {
      const err = { status: 409, message: 'Conflict on the run.' };
      expect(friendlyApiError(err, 'unused fallback')).toBe(
        'Conflict on the run.',
      );
    });
  });

  describe('malformed or non-standard inputs', () => {
    it('returns the default fallback for null', () => {
      expect(friendlyApiError(null)).toBe(DEFAULT_FALLBACK);
    });

    it('returns the default fallback for undefined', () => {
      expect(friendlyApiError(undefined)).toBe(DEFAULT_FALLBACK);
    });

    it('returns a custom fallback for null when one is given', () => {
      expect(friendlyApiError(null, 'nothing to see here')).toBe(
        'nothing to see here',
      );
    });

    it('returns the fallback for an object with neither status nor message', () => {
      expect(friendlyApiError({})).toBe(DEFAULT_FALLBACK);
    });

    it('uses the message of an object that has a message but no status', () => {
      const err = { message: 'A bare error with no status.' };
      expect(friendlyApiError(err)).toBe('A bare error with no status.');
    });

    it('handles a real Error instance with no status', () => {
      const err = new Error('Native error message.');
      expect(friendlyApiError(err)).toBe('Native error message.');
    });

    it('returns the fallback for a primitive string input', () => {
      // A string has no `.status` and no `.message`, so it falls through.
      expect(friendlyApiError('some error string')).toBe(DEFAULT_FALLBACK);
    });

    it('returns the fallback for a numeric input', () => {
      expect(friendlyApiError(42)).toBe(DEFAULT_FALLBACK);
    });

    it('does not treat a non-connectivity numeric status as connectivity', () => {
      // 200 is not in the set; with no message, the fallback is used.
      expect(friendlyApiError({ status: 200 })).toBe(DEFAULT_FALLBACK);
    });
  });
});
