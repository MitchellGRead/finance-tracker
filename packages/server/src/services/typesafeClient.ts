import {
  APIError,
  AuthenticationError,
  PermissionDeniedError,
  TypeSafeClient,
  UnprocessableEntityError,
  type Questions,
  type SystemOneRequest,
  type SystemOneResult,
} from "@typesafe-ai/sdk";
import { config } from "../lib/config";

/**
 * The only module that touches the TypeSafe SDK, so tests mock one boundary.
 *
 * With no API key the whole feature is inert: the client is never constructed
 * (its constructor throws on a missing key) and callers get `null`.
 */

let client: TypeSafeClient | null = null;

export function isSuggestionsEnabled(): boolean {
  return config.typesafe.apiKey !== null;
}

export function getTypeSafeClient(): TypeSafeClient | null {
  if (!isSuggestionsEnabled()) return null;
  if (client === null) {
    client = new TypeSafeClient({
      apiKey: config.typesafe.apiKey ?? undefined,
      defaultModel: config.typesafe.model,
      timeout: config.typesafe.timeoutMs,
      // The SDK retries 408/429/5xx and connection errors, honouring Retry-After.
      retry: { maxRetries: config.typesafe.maxRetries },
    });
  }
  return client;
}

/** Test seam — resets the memoized client after config or mocks change. */
export function resetTypeSafeClient(): void {
  client = null;
}

/**
 * Asks one System One request. Returns `null` when the feature is disabled;
 * otherwise resolves or throws the SDK's own error classes.
 */
export async function askSystemOne<const Q extends Questions>(
  request: SystemOneRequest<Q>
): Promise<SystemOneResult<Q> | null> {
  const c = getTypeSafeClient();
  if (c === null) return null;
  return c.systemOne(request);
}

/**
 * A failure that should abort the whole run rather than just the item:
 * a bad key or a revoked account will fail identically for every remaining row.
 */
export function isFatalTypeSafeError(error: unknown): boolean {
  return error instanceof AuthenticationError || error instanceof PermissionDeniedError;
}

/** True when the request itself was malformed — a bug in our question building. */
export function isRequestShapeError(error: unknown): boolean {
  return error instanceof UnprocessableEntityError;
}

/** Short, non-sensitive description of a failure for run records and logs. */
export function describeTypeSafeError(error: unknown): string {
  if (error instanceof APIError) {
    return `${error.constructor.name} (HTTP ${error.status})`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
