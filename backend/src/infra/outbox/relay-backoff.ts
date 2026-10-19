export const MAX_RETRY_DELAY_MS = 30_000;

export function retryDelayMs(baseMs: number, consecutiveFailures: number): number {
  const exponent = Math.min(Math.max(consecutiveFailures - 1, 0), 16);
  return Math.min(baseMs * 2 ** exponent, MAX_RETRY_DELAY_MS);
}

export function shouldLogFailure(consecutiveFailures: number): boolean {
  return consecutiveFailures === 1 || consecutiveFailures % 10 === 0;
}
