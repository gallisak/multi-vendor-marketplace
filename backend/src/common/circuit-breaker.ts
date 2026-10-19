export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private probeInFlight = false;

  constructor(
    private readonly failureThreshold: number,
    private readonly cooldownMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get state(): 'closed' | 'open' | 'half-open' {
    if (this.openedAt === null) {
      return 'closed';
    }
    return this.now() - this.openedAt >= this.cooldownMs ? 'half-open' : 'open';
  }

  tryAcquire(): boolean {
    const state = this.state;
    if (state === 'closed') {
      return true;
    }
    if (state === 'half-open' && !this.probeInFlight) {
      this.probeInFlight = true;
      return true;
    }
    return false;
  }

  recordSuccess() {
    this.failures = 0;
    this.openedAt = null;
    this.probeInFlight = false;
  }

  recordFailure() {
    this.failures += 1;
    if (this.probeInFlight || this.failures >= this.failureThreshold) {
      this.openedAt = this.now();
    }
    this.probeInFlight = false;
  }
}
