import { describe, expect, it } from "vitest";
import {
  ProviderGate,
  ProviderGateAccountBusyError,
  ProviderGateTimeoutError,
} from "./provider-gate.js";

function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe("ProviderGate", () => {
  it("admits up to the global ceiling without queueing", async () => {
    const gate = new ProviderGate({ maxConcurrent: 3, maxConcurrentPerAccount: 3 });

    const first = await gate.acquire("account-a");
    const second = await gate.acquire("account-a");
    const third = await gate.acquire("account-a");

    expect(gate.snapshot().inFlight).toBe(3);
    expect(first.waitedMs).toBe(0);
    expect(second.waitedMs).toBe(0);
    expect(third.waitedMs).toBe(0);
  });

  it("queues past the ceiling and admits on release", async () => {
    const gate = new ProviderGate({ maxConcurrent: 1, maxConcurrentPerAccount: 5 });
    const held = await gate.acquire("account-a");

    let admitted = false;
    const queued = gate.acquire("account-b").then((slot) => {
      admitted = true;
      return slot;
    });

    await Promise.resolve();
    expect(admitted).toBe(false);
    expect(gate.snapshot().queueDepth).toBe(1);

    held.release();
    const slot = await queued;

    expect(admitted).toBe(true);
    expect(gate.snapshot().inFlight).toBe(1);
    expect(gate.snapshot().queueDepth).toBe(0);
    slot.release();
  });

  it("rejects a second concurrent turn from the same account", async () => {
    const gate = new ProviderGate({ maxConcurrent: 8, maxConcurrentPerAccount: 1 });
    const held = await gate.acquire("account-a");

    await expect(gate.acquire("account-a")).rejects.toBeInstanceOf(ProviderGateAccountBusyError);

    // A different account is unaffected by that account's ceiling.
    const other = await gate.acquire("account-b");
    expect(gate.snapshot().inFlight).toBe(2);

    held.release();
    other.release();
  });

  it("rejects immediately when the deadline leaves no room to queue", async () => {
    const gate = new ProviderGate({ maxConcurrent: 1, maxConcurrentPerAccount: 5 });
    const held = await gate.acquire("account-a");

    // Deadline is already inside the minimum work budget, so a slot is useless.
    await expect(gate.acquire("account-b", Date.now() + 100, 500)).rejects.toBeInstanceOf(
      ProviderGateTimeoutError,
    );

    held.release();
  });

  it("times out a queued caller at its deadline rather than hanging", async () => {
    const gate = new ProviderGate({ maxConcurrent: 1, maxConcurrentPerAccount: 5 });
    const held = await gate.acquire("account-a");

    const queued = gate.acquire("account-b", Date.now() + 40, 0);
    await expect(queued).rejects.toBeInstanceOf(ProviderGateTimeoutError);
    // The timed-out waiter must not linger in the queue.
    expect(gate.snapshot().queueDepth).toBe(0);

    held.release();
  });

  it("does not leak a slot when the queued caller times out", async () => {
    const gate = new ProviderGate({ maxConcurrent: 1, maxConcurrentPerAccount: 5 });
    const held = await gate.acquire("account-a");

    await expect(gate.acquire("account-b", Date.now() + 30, 0)).rejects.toBeInstanceOf(
      ProviderGateTimeoutError,
    );
    held.release();

    // Capacity is fully restored for the next caller.
    const next = await gate.acquire("account-c");
    expect(next.waitedMs).toBe(0);
    expect(gate.snapshot().inFlight).toBe(1);
    next.release();
    expect(gate.snapshot().inFlight).toBe(0);
  });

  it("keeps one account from starving others when capacity frees up", async () => {
    const gate = new ProviderGate({ maxConcurrent: 2, maxConcurrentPerAccount: 1 });
    // Fill the pool with unrelated work so the next callers must queue.
    const blockerA = await gate.acquire("blocker-a");
    const blockerB = await gate.acquire("blocker-b");

    // Both greedy waiters enqueue while that account holds nothing, so they
    // are individually admissible. Only one may actually run at a time.
    const greedyFirst = gate.acquire("greedy", Date.now() + 1_000, 0);
    const greedySecond = gate.acquire("greedy", Date.now() + 1_000, 0);
    const patient = gate.acquire("patient", Date.now() + 1_000, 0);

    await Promise.resolve();
    expect(gate.snapshot().queueDepth).toBe(3);

    blockerA.release();
    blockerB.release();

    // Freed capacity goes to greedy's first waiter and then skips its second
    // (that account is now at its ceiling) to admit the patient account.
    const greedyFirstSlot = await greedyFirst;
    const patientSlot = await patient;
    expect(gate.snapshot().perAccountInFlight).toEqual({ greedy: 1, patient: 1 });

    greedyFirstSlot.release();
    patientSlot.release();
    const greedySecondSlot = await greedySecond;
    greedySecondSlot.release();
    expect(gate.snapshot().inFlight).toBe(0);
  });

  it("releases the slot when the wrapped work throws", async () => {
    const gate = new ProviderGate({ maxConcurrent: 1, maxConcurrentPerAccount: 1 });

    await expect(
      gate.run("account-a", async () => {
        throw new Error("provider exploded");
      }),
    ).rejects.toThrow("provider exploded");

    expect(gate.snapshot().inFlight).toBe(0);
    const next = await gate.acquire("account-a");
    expect(next.waitedMs).toBe(0);
    next.release();
  });

  it("serialises a burst through a narrow gate without exceeding the ceiling", async () => {
    const gate = new ProviderGate({ maxConcurrent: 2, maxConcurrentPerAccount: 1, maxQueueWaitMs: 5_000 });
    let peak = 0;
    let active = 0;
    const gates = Array.from({ length: 8 }, () => deferred());

    const runs = gates.map((barrier, index) =>
      gate.run(`account-${index}`, async () => {
        active += 1;
        peak = Math.max(peak, active);
        await barrier.promise;
        active -= 1;
        return index;
      }),
    );

    // Let the first admissions settle, then drain one at a time.
    await Promise.resolve();
    for (const barrier of gates) {
      barrier.resolve();
      await Promise.resolve();
    }

    const results = await Promise.all(runs);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBeLessThanOrEqual(2);
    expect(gate.snapshot().inFlight).toBe(0);
    expect(gate.snapshot().queueDepth).toBe(0);
  });

  it("reports queue depth and per-account occupancy", async () => {
    const gate = new ProviderGate({ maxConcurrent: 1, maxConcurrentPerAccount: 2 });
    const held = await gate.acquire("account-a");
    const queued = gate.acquire("account-b", Date.now() + 1_000, 0);

    await Promise.resolve();
    const snapshot = gate.snapshot();
    expect(snapshot.inFlight).toBe(1);
    expect(snapshot.queueDepth).toBe(1);
    expect(snapshot.perAccountInFlight).toEqual({ "account-a": 1 });
    expect(snapshot.maxConcurrent).toBe(1);
    expect(snapshot.maxConcurrentPerAccount).toBe(2);

    held.release();
    (await queued).release();
  });
});
