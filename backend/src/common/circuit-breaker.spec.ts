import { CircuitBreaker } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  let time: number;
  let breaker: CircuitBreaker;

  const open = () => {
    breaker.recordFailure();
    breaker.recordFailure();
  };

  beforeEach(() => {
    time = 0;
    breaker = new CircuitBreaker(2, 1000, () => time);
  });

  it('stays closed below the failure threshold', () => {
    breaker.recordFailure();

    expect(breaker.state).toBe('closed');
    expect(breaker.tryAcquire()).toBe(true);
  });

  it('opens after consecutive failures and blocks requests during cooldown', () => {
    open();

    expect(breaker.state).toBe('open');
    expect(breaker.tryAcquire()).toBe(false);
  });

  it('lets exactly one probe through after cooldown', () => {
    open();
    time = 1000;

    expect(breaker.state).toBe('half-open');
    expect(breaker.tryAcquire()).toBe(true);
    expect(breaker.tryAcquire()).toBe(false);
    expect(breaker.tryAcquire()).toBe(false);
  });

  it('closes when the probe succeeds', () => {
    open();
    time = 1000;
    breaker.tryAcquire();
    breaker.recordSuccess();

    expect(breaker.state).toBe('closed');
    expect(breaker.tryAcquire()).toBe(true);
    expect(breaker.tryAcquire()).toBe(true);
  });

  it('reopens for a full cooldown when the probe fails', () => {
    open();
    time = 1500;
    breaker.tryAcquire();
    breaker.recordFailure();

    expect(breaker.state).toBe('open');
    time = 2499;
    expect(breaker.tryAcquire()).toBe(false);
    time = 2500;
    expect(breaker.tryAcquire()).toBe(true);
  });

  it('resets the failure count after a success', () => {
    breaker.recordFailure();
    breaker.recordSuccess();
    breaker.recordFailure();

    expect(breaker.state).toBe('closed');
  });
});
