import { ProviderRequestError } from "./types";

export interface FetchWithRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with exponential backoff retry for transient failures (network
 * errors, timeouts, 429/5xx). Non-retryable errors (4xx other than 408/429)
 * fail immediately with the response body attached to the error message.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const { maxRetries = 3, baseDelayMs = 500, timeoutMs = 10_000, fetchImpl = fetch } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        return response;
      }

      const retryable = RETRYABLE_STATUS_CODES.has(response.status);
      if (!retryable || attempt === maxRetries) {
        const body = await response.text().catch(() => "");
        throw new ProviderRequestError(
          `Provider request failed with status ${response.status}: ${body.slice(0, 500)}`,
          response.status,
          retryable
        );
      }

      lastError = new ProviderRequestError(
        `Provider request failed with retryable status ${response.status}`,
        response.status,
        true
      );
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof ProviderRequestError && !err.retryable) {
        throw err;
      }
      lastError = err;
      if (attempt === maxRetries) {
        break;
      }
    }

    const delay = baseDelayMs * 2 ** attempt;
    await sleep(delay);
  }

  throw lastError instanceof Error
    ? lastError
    : new ProviderRequestError("Provider request failed after retries");
}
