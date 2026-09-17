/**
 * Bounded-concurrency admission gate for upstream provider calls.
 *
 * Without this, every concurrent player turn fans straight out into a
 * simultaneous OpenRouter request. The shared upstream pool answers that
 * burst with HTTP 429 (`limit_source: upstream_provider_shared_pool`), which
 * is how a handful of overlapping sessions turns into a wave of failed turns.
 *
 * The gate holds the fan-out to a fixed ceiling and queues the rest, so load
 * arrives upstream as a steady line instead of a spike. Two properties matter
 * for a live table:
 *
 * - A queued caller never waits past its own turn deadline. If its slot cannot
 *   plausibly arrive in time, it is rejected immediately with the wait it would
 *   have faced, so the turn fails fast and honestly instead of timing out.
 * - One account cannot occupy the whole pool. A per-account ceiling keeps a
 *   player with ten open tabs from starving everyone else, which is both a
 *   fairness property and an abuse control.
 */

export interface ProviderGateOptions {
  /** Maximum provider calls in flight across the whole service. */
  maxConcurrent: number;
  /** Maximum provider calls in flight for any single account. */
  maxConcurrentPerAccount: number;
  /**
   * Longest a caller may sit in the queue when it has no explicit deadline.
   * A caller that supplies a deadline is bounded by that instead.
   */
  maxQueueWaitMs: number;
}

export interface ProviderGateAcquisition {
  /** Milliseconds this caller spent queued before admission. */
  waitedMs: number;
  /** Releases the slot. Safe to call more than once. */
  release: () => void;
}

export interface ProviderGateSnapshot {
  inFlight: number;
  queueDepth: number;
  maxConcurrent: number;
  maxConcurrentPerAccount: number;
  /** Accounts currently holding at least one slot, and how many. */
  perAccountInFlight: Record<string, number>;
}

/**
 * Raised when a caller cannot be admitted before its deadline, or when the
 * queue wait would exceed the configured ceiling. This is deliberately
 * distinct from a provider error: nothing was sent upstream, so the turn is
 * cleanly not-committed and is safe to retry later.
 */
export class ProviderGateTimeoutError extends Error {
  public readonly code = "provider_gate_timeout";

  public constructor(
    public readonly waitedMs: number,
    public readonly queueDepth: number,
  ) {
    super(
      `The table is busy: no provider slot became available within the turn's time budget (waited ${waitedMs}ms behind ${queueDepth} queued turn(s)).`,
    );
    this.name = "ProviderGateTimeoutError";
  }
}

/**
 * Raised when one account already holds its maximum number of concurrent
 * provider slots. Unlike a queue timeout this is a policy decision, so it is
 * reported separately and is not worth queueing behind: the account's own
 * other turn has to finish first.
 */
export class ProviderGateAccountBusyError extends Error {
  public readonly code = "provider_gate_account_busy";

  public constructor(
    public readonly accountId: string,
    public readonly inFlight: number,
    public readonly limit: number,
  ) {
    super(
      `That account already has ${inFlight} turn(s) resolving (limit ${limit}). Let the current turn finish before sending another.`,
    );
    this.name = "ProviderGateAccountBusyError";
  }
}

interface Waiter {
  accountId: string;
  enqueuedAt: number;
  /** Absolute time past which admission is useless to this caller. */
  admitByAt: number | null;
  resolve: (acquisition: ProviderGateAcquisition) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout | null;
  settled: boolean;
}

export class ProviderGate {
  private readonly options: ProviderGateOptions;
  private inFlight = 0;
  private readonly perAccount = new Map<string, number>();
  private readonly queue: Waiter[] = [];

  public constructor(options: Partial<ProviderGateOptions> = {}) {
    this.options = {
      maxConcurrent: Math.max(1, Math.trunc(options.maxConcurrent ?? 4)),
      maxConcurrentPerAccount: Math.max(1, Math.trunc(options.maxConcurrentPerAccount ?? 1)),
      maxQueueWaitMs: Math.max(0, Math.trunc(options.maxQueueWaitMs ?? 10_000)),
    };
  }

  /**
   * Acquire a provider slot.
   *
   * `deadlineAt` is the caller's own turn deadline. The gate will not admit a
   * caller after that instant, and rejects early rather than handing back a
   * slot that leaves no time to actually use it.
   *
   * `minimumWorkBudgetMs` is how much time the caller needs *after* admission
   * for the request itself to be worth starting.
   */
  public acquire(
    accountId: string,
    deadlineAt: number | null = null,
    minimumWorkBudgetMs = 0,
  ): Promise<ProviderGateAcquisition> {
    const accountInFlight = this.perAccount.get(accountId) ?? 0;
    if (accountInFlight >= this.options.maxConcurrentPerAccount) {
      return Promise.reject(
        new ProviderGateAccountBusyError(accountId, accountInFlight, this.options.maxConcurrentPerAccount),
      );
    }

    if (this.inFlight < this.options.maxConcurrent) {
      return Promise.resolve(this.admit(accountId, 0));
    }

    const now = Date.now();
    const queueCeilingAt = now + this.options.maxQueueWaitMs;
    const deadlineCeilingAt = deadlineAt === null ? null : deadlineAt - minimumWorkBudgetMs;
    const admitByAt = deadlineCeilingAt === null
      ? queueCeilingAt
      : Math.min(queueCeilingAt, deadlineCeilingAt);

    // No point queueing for a slot that cannot arrive in time to be used.
    if (admitByAt <= now) {
      return Promise.reject(new ProviderGateTimeoutError(0, this.queue.length));
    }

    return new Promise<ProviderGateAcquisition>((resolve, reject) => {
      const waiter: Waiter = {
        accountId,
        enqueuedAt: now,
        admitByAt,
        resolve,
        reject,
        timer: null,
        settled: false,
      };
      waiter.timer = setTimeout(() => {
        if (waiter.settled) return;
        waiter.settled = true;
        const index = this.queue.indexOf(waiter);
        if (index >= 0) this.queue.splice(index, 1);
        reject(new ProviderGateTimeoutError(Date.now() - waiter.enqueuedAt, this.queue.length));
      }, Math.max(1, admitByAt - now));
      // Never let a queued turn hold the process open on shutdown.
      waiter.timer.unref?.();
      this.queue.push(waiter);
    });
  }

  /** Runs `work` while holding a slot, releasing it however `work` settles. */
  public async run<T>(
    accountId: string,
    work: () => Promise<T>,
    deadlineAt: number | null = null,
    minimumWorkBudgetMs = 0,
  ): Promise<T> {
    const slot = await this.acquire(accountId, deadlineAt, minimumWorkBudgetMs);
    try {
      return await work();
    } finally {
      slot.release();
    }
  }

  public snapshot(): ProviderGateSnapshot {
    const perAccountInFlight: Record<string, number> = {};
    for (const [accountId, count] of this.perAccount) {
      if (count > 0) perAccountInFlight[accountId] = count;
    }
    return {
      inFlight: this.inFlight,
      queueDepth: this.queue.length,
      maxConcurrent: this.options.maxConcurrent,
      maxConcurrentPerAccount: this.options.maxConcurrentPerAccount,
      perAccountInFlight,
    };
  }

  private admit(accountId: string, waitedMs: number): ProviderGateAcquisition {
    this.inFlight += 1;
    this.perAccount.set(accountId, (this.perAccount.get(accountId) ?? 0) + 1);
    let released = false;
    return {
      waitedMs,
      release: () => {
        if (released) return;
        released = true;
        this.inFlight = Math.max(0, this.inFlight - 1);
        const remaining = (this.perAccount.get(accountId) ?? 1) - 1;
        if (remaining > 0) this.perAccount.set(accountId, remaining);
        else this.perAccount.delete(accountId);
        this.drain();
      },
    };
  }

  /**
   * Hand freed capacity to the longest-waiting caller that is still eligible.
   *
   * A waiter whose account filled up while it queued is skipped rather than
   * failed: its own in-flight turn will free a slot shortly, and its queue
   * timer still bounds the wait.
   */
  private drain(): void {
    while (this.inFlight < this.options.maxConcurrent) {
      const index = this.queue.findIndex(
        (waiter) => (this.perAccount.get(waiter.accountId) ?? 0) < this.options.maxConcurrentPerAccount,
      );
      if (index < 0) return;
      const [waiter] = this.queue.splice(index, 1);
      if (!waiter || waiter.settled) continue;
      waiter.settled = true;
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.resolve(this.admit(waiter.accountId, Date.now() - waiter.enqueuedAt));
    }
  }
}
