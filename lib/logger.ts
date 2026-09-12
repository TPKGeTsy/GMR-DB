/**
 * Centralized error logging.
 *
 * We don't have an external APM (Sentry, etc.) wired up, but Vercel already
 * captures everything written to stdout/stderr in its Runtime Logs — this just
 * makes those log lines consistent and searchable (scope + timestamp + a
 * structured `meta` blob) instead of ad-hoc `console.error("some string", error)`
 * calls scattered across every action file.
 */
export function logError(scope: string, error: unknown, meta?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error(
    JSON.stringify({
      level: "error",
      scope,
      message,
      meta,
      timestamp: new Date().toISOString(),
    })
  );
  if (stack) console.error(stack);
}
