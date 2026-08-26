import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
  handleStripeEvent,
  reconcileSubscriptionByEmail,
  reconcileStoredSubscription,
  resolveCheckoutGuard,
  syncCompletedCheckoutSession,
} from "./billing.js";
import { LlmUsageStore, type LlmUsagePolicy } from "./llm-usage.js";
import { GameStore } from "./store.js";

function createTestStore(): GameStore {
  const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-billing-"));
  return new GameStore(join(directory, "game.db"));
}

function testUsagePolicy(): LlmUsagePolicy {
  return {
    freeDailyCostMicros: 10,
    freeMonthlyCostMicros: 20,
    playerMonthlyTargetCostMicros: 150,
    playerMonthlyCostMicros: 200,
    globalDailyCostMicros: 1_000,
    globalMonthlyCostMicros: 2_000,
    turnAdmissionReserveCostMicros: 5,
    maxTurnCostMicros: 500,
    npcReserveCostMicros: 100,
    reservationTtlMs: 60_000,
    inputCostUsdPerMillion: 0.2,
    outputCostUsdPerMillion: 1.2,
  };
}

function testSubscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_checkout",
    object: "subscription",
    created: 100,
    customer: "cus_checkout",
    status: "active",
    metadata: { clerk_user_id: "player-1" },
    items: {
      data: [{ price: { id: "price_test" }, current_period_end: 1_900_000_000 }],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function testEvent(type: string, object: Record<string, unknown>, id: string): Stripe.Event {
  return {
    id,
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

describe("Stripe membership synchronization", () => {
  it("binds one active Player Pass by the authenticated billing email when no local row exists", async () => {
    const store = createTestStore();
    const stripe = {
      customers: {
        list: async () => ({ data: [{ id: "cus_legacy", email: "mnehmos@gmail.com" }] }),
      },
      subscriptions: {
        list: async () => ({ data: [testSubscription({ id: "sub_legacy", customer: "cus_legacy" })] }),
        retrieve: async () => testSubscription({ id: "sub_legacy", customer: "cus_legacy" }),
      },
    } as unknown as Stripe;

    await expect(reconcileSubscriptionByEmail(stripe, store, "player-1", "MNEHMOS@gmail.com", "price_test"))
      .resolves.toBe("linked");
    expect(store.getSubscription("player-1")).toMatchObject({
      stripeCustomerId: "cus_legacy",
      stripeSubscriptionId: "sub_legacy",
      status: "active",
    });
    store.close();
  });

  it("paginates customers and matches email casing before linking a legacy account", async () => {
    const store = createTestStore();
    const customerRequests: Array<{ limit: number; starting_after?: string }> = [];
    const customerPages = [
      {
        data: [{ id: "cus_other", email: "other@example.com" }],
        has_more: true,
      },
      {
        data: [{ id: "cus_legacy", email: "MNEHMOS@GMAIL.COM" }],
        has_more: false,
      },
    ];
    const stripe = {
      customers: {
        list: async (params: { limit: number; starting_after?: string }) => {
          customerRequests.push(params);
          const page = customerPages.shift();
          if (!page) throw new Error("unexpected customer page request");
          return page;
        },
      },
      subscriptions: {
        list: async ({ customer }: { customer: string }) => ({
          data: customer === "cus_legacy"
            ? [testSubscription({ id: "sub_legacy", customer: "cus_legacy" })]
            : [],
          has_more: false,
        }),
      },
    } as unknown as Stripe;

    await expect(reconcileSubscriptionByEmail(stripe, store, "player-1", "mnehmos@gmail.com", "price_test"))
      .resolves.toBe("linked");
    expect(customerRequests).toEqual([
      { limit: 100 },
      { limit: 100, starting_after: "cus_other" },
    ]);
    expect(store.getSubscription("player-1")).toMatchObject({
      stripeCustomerId: "cus_legacy",
      stripeSubscriptionId: "sub_legacy",
      status: "active",
    });
    store.close();
  });

  it("refuses to bind an ambiguous email with multiple active Player Pass subscriptions", async () => {
    const store = createTestStore();
    const stripe = {
      customers: {
        list: async () => ({ data: [{ id: "cus_one", email: "mnehmos@gmail.com" }] }),
      },
      subscriptions: {
        list: async () => ({ data: [
          testSubscription({ id: "sub_one", customer: "cus_one" }),
          testSubscription({ id: "sub_two", customer: "cus_one" }),
        ] }),
      },
    } as unknown as Stripe;

    await expect(reconcileSubscriptionByEmail(stripe, store, "player-1", "mnehmos@gmail.com", "price_test"))
      .resolves.toBe("ambiguous");
    expect(store.getSubscription("player-1")).toBeNull();
    store.close();
  });

  it("reconciles a legacy Checkout marker from its stored subscription and restores Player Pass usage", async () => {
    const store = createTestStore();
    store.upsertSubscription({
      userId: "player-1",
      stripeCustomerId: "cus_checkout",
      stripeSubscriptionId: "sub_checkout",
      status: "checkout_complete",
      priceId: "price_test",
      currentPeriodEnd: null,
    });
    const usage = new LlmUsageStore(store.getRawDb(), testUsagePolicy());
    const retrievedIds: string[] = [];
    const stripe = {
      subscriptions: {
        retrieve: async (id: string) => {
          retrievedIds.push(id);
          return testSubscription({ id: "sub_checkout", customer: "cus_checkout", status: "active" });
        },
      },
    } as unknown as Stripe;

    await expect(reconcileStoredSubscription(stripe, store, "player-1")).resolves.toBe(true);
    expect(retrievedIds).toEqual(["sub_checkout"]);
    expect(store.getSubscription("player-1")).toMatchObject({ status: "active" });
    expect(usage.getSummary("player-1").plan).toBe("player_pass");
    store.close();
  });

  it("does not reconcile a stored subscription bound to a different Stripe customer", async () => {
    const store = createTestStore();
    store.upsertSubscription({
      userId: "player-1",
      stripeCustomerId: "cus_expected",
      stripeSubscriptionId: "sub_checkout",
      status: "checkout_complete",
      priceId: "price_test",
      currentPeriodEnd: null,
    });
    const stripe = {
      subscriptions: {
        retrieve: async () => testSubscription({ customer: "cus_other", status: "active" }),
      },
    } as unknown as Stripe;

    await expect(reconcileStoredSubscription(stripe, store, "player-1")).resolves.toBe(false);
    expect(store.getSubscription("player-1")).toMatchObject({
      stripeCustomerId: "cus_expected",
      status: "checkout_complete",
    });
    store.close();
  });

  it("routes an existing active subscription to billing portal instead of creating Checkout", async () => {
    const store = createTestStore();
    store.upsertSubscription({
      userId: "player-1",
      stripeCustomerId: "cus_checkout",
      stripeSubscriptionId: "sub_checkout",
      status: "active",
      priceId: "price_test",
      currentPeriodEnd: null,
    });
    let checkoutCreates = 0;
    const stripe = {
      subscriptions: {
        retrieve: async () => testSubscription({ status: "active" }),
      },
      checkout: {
        sessions: {
          create: async () => {
            checkoutCreates += 1;
            return { url: "https://checkout.stripe.test/session" };
          },
        },
      },
    } as unknown as Stripe;

    await expect(resolveCheckoutGuard(stripe, store, "player-1")).resolves.toEqual({
      action: "portal",
      customerId: "cus_checkout",
      status: "active",
    });
    expect(checkoutCreates).toBe(0);
    store.close();
  });

  it("fails closed instead of opening a second Checkout when an existing binding cannot be verified", async () => {
    const store = createTestStore();
    store.upsertSubscription({
      userId: "player-1",
      stripeCustomerId: "cus_expected",
      stripeSubscriptionId: "sub_checkout",
      status: "active",
      priceId: "price_test",
      currentPeriodEnd: null,
    });
    const stripe = {
      subscriptions: {
        retrieve: async () => testSubscription({ customer: "cus_other", status: "active" }),
      },
    } as unknown as Stripe;

    await expect(resolveCheckoutGuard(stripe, store, "player-1")).resolves.toEqual({
      action: "pending",
      status: "active",
    });
    store.close();
  });

  it("binds a completed Checkout session to the authenticated Clerk user using current Stripe status", async () => {
    const store = createTestStore();
    const stripe = {
      checkout: {
        sessions: {
          retrieve: async () => ({
            metadata: { clerk_user_id: "player-1" },
            client_reference_id: null,
            mode: "subscription",
            status: "complete",
            subscription: "sub_checkout",
            customer: "cus_checkout",
          }),
        },
      },
      subscriptions: {
        retrieve: async () => testSubscription(),
      },
    } as unknown as Stripe;

    await expect(syncCompletedCheckoutSession(stripe, "cs_test", "player-1", store)).resolves.toBe(true);
    expect(store.getSubscription("player-1")).toMatchObject({
      stripeCustomerId: "cus_checkout",
      stripeSubscriptionId: "sub_checkout",
      status: "active",
      currentPeriodEnd: 1_900_000_000,
    });
    store.close();
  });

  it("does not persist a Checkout session for a different Clerk user", async () => {
    const store = createTestStore();
    const stripe = {
      checkout: {
        sessions: {
          retrieve: async () => ({
            metadata: { clerk_user_id: "another-player" },
            client_reference_id: null,
            mode: "subscription",
            status: "complete",
            subscription: "sub_other",
            customer: "cus_other",
          }),
        },
      },
      subscriptions: {
        retrieve: async () => testSubscription({
          id: "sub_other",
          customer: "cus_other",
          metadata: { clerk_user_id: "another-player" },
        }),
      },
    } as unknown as Stripe;

    await expect(syncCompletedCheckoutSession(stripe, "cs_other", "player-1", store)).resolves.toBe(false);
    expect(store.getSubscription("player-1")).toBeNull();
    store.close();
  });

  it("does not reactivate a subscription already marked canceled", async () => {
    const store = createTestStore();
    store.upsertSubscription({
      userId: "player-1",
      stripeCustomerId: "cus_checkout",
      stripeSubscriptionId: "sub_checkout",
      status: "canceled",
      priceId: "price_test",
      currentPeriodEnd: null,
    });
    const stripe = {
      checkout: {
        sessions: {
          retrieve: async () => ({
            metadata: { clerk_user_id: "player-1" },
            client_reference_id: null,
            mode: "subscription",
            status: "complete",
            subscription: "sub_checkout",
            customer: "cus_checkout",
          }),
        },
      },
      subscriptions: {
        retrieve: async () => testSubscription({ status: "canceled" }),
      },
    } as unknown as Stripe;

    await expect(syncCompletedCheckoutSession(stripe, "cs_test", "player-1", store)).resolves.toBe(true);
    expect(store.getSubscription("player-1")?.status).toBe("canceled");
    store.close();
  });

  it("does not let an old Checkout return replace a newer subscription record", async () => {
    const store = createTestStore();
    store.upsertSubscription({
      userId: "player-1",
      stripeCustomerId: "cus_new",
      stripeSubscriptionId: "sub_new",
      status: "canceled",
      priceId: "price_test",
      currentPeriodEnd: null,
    });
    const stripe = {
      checkout: {
        sessions: {
          retrieve: async () => ({
            metadata: { clerk_user_id: "player-1" },
            client_reference_id: null,
            mode: "subscription",
            status: "complete",
            subscription: "sub_old",
            customer: "cus_old",
          }),
        },
      },
      subscriptions: {
        retrieve: async (id: string) => id === "sub_new"
          ? testSubscription({ id: "sub_new", customer: "cus_new", created: 200, status: "canceled" })
          : testSubscription({ id: "sub_old", customer: "cus_old", created: 100, status: "active" }),
      },
    } as unknown as Stripe;

    await expect(syncCompletedCheckoutSession(stripe, "cs_old", "player-1", store)).resolves.toBe(true);
    expect(store.getSubscription("player-1")).toMatchObject({
      stripeSubscriptionId: "sub_new",
      status: "canceled",
    });
    store.close();
  });

  it("uses the current Stripe status when a Checkout webhook arrives", async () => {
    const store = createTestStore();
    const event = testEvent("checkout.session.completed", {
      metadata: { clerk_user_id: "player-1" },
      client_reference_id: null,
      subscription: "sub_checkout",
      customer: "cus_checkout",
    }, "evt_checkout_authoritative");
    const stripe = {
      subscriptions: {
        retrieve: async () => testSubscription({ status: "canceled" }),
      },
    } as unknown as Stripe;

    await handleStripeEvent(event, store, stripe);
    expect(store.getSubscription("player-1")).toMatchObject({ status: "canceled" });
    store.close();
  });

  it("can bind subscription webhooks from the subscription metadata", async () => {
    const store = createTestStore();
    const event = testEvent("customer.subscription.created", {
      id: "sub_metadata",
      customer: "cus_metadata",
      status: "active",
      metadata: { clerk_user_id: "player-1" },
    }, "evt_subscription_metadata");
    const stripe = {
      subscriptions: {
        retrieve: async () => testSubscription({
          id: "sub_metadata",
          customer: "cus_metadata",
          metadata: { clerk_user_id: "player-1" },
        }),
      },
    } as unknown as Stripe;

    await handleStripeEvent(event, store, stripe);
    expect(store.getSubscription("player-1")).toMatchObject({
      stripeSubscriptionId: "sub_metadata",
      stripeCustomerId: "cus_metadata",
      status: "active",
    });
    store.close();
  });
});
