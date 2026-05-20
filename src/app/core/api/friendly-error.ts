/**
 * Translates a failed HTTP request into a user-facing message. When the API
 * process isn't running, the Angular dev-server proxy returns a 500 for a dead
 * upstream — so a bare "500 Internal Server Error" is misleading: the API
 * didn't error, it's absent. A connection-level failure surfaces as status 0.
 * For any other status, the original message is used, or `fallback` if none.
 */
export function friendlyApiError(
  err: unknown,
  fallback = 'Something went wrong. Try again in a moment.',
): string {
  const status = (err as { status?: number })?.status;
  if (
    status === 0 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return (
      'Can\u2019t reach the upload service \u2014 it may still be ' +
      'starting. Try again in a moment.'
    );
  }
  return (err as { message?: string })?.message ?? fallback;
}
