/** Typed errors so route handlers can map failures to precise HTTP responses. */

export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Player not found") {
    super(message, 404, "not_found");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Not signed in as this athlete") {
    super(message, 401, "unauthorized");
  }
}

export class ConfigError extends AppError {
  constructor(message: string) {
    super(message, 500, "config_error");
  }
}

/** Strava (or our own budget guard) says slow down. */
export class RateLimitError extends AppError {
  constructor(
    message: string,
    /** Seconds until it is reasonable to retry. */
    readonly retryAfter: number,
  ) {
    super(message, 429, "rate_limited");
  }
}

/** The athlete revoked access or the refresh token is no longer valid. */
export class StravaAuthError extends AppError {
  constructor(message = "Strava authorization expired — reconnect your account") {
    super(message, 401, "strava_auth");
  }
}

export class StravaApiError extends AppError {
  constructor(
    message: string,
    readonly upstreamStatus: number,
  ) {
    super(message, 502, "strava_upstream");
  }
}

export class CooldownError extends AppError {
  constructor(readonly retryAfter: number) {
    super(`Re-scout available in ${Math.ceil(retryAfter / 60)} min`, 429, "cooldown");
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    const headers: Record<string, string> = {};
    if (err instanceof RateLimitError || err instanceof CooldownError) {
      headers["Retry-After"] = String(err.retryAfter);
    }
    return Response.json({ error: err.code, message: err.message }, { status: err.status, headers });
  }
  console.error("[strava-fut] unexpected error", err);
  return Response.json({ error: "internal", message: "Something went wrong" }, { status: 500 });
}
