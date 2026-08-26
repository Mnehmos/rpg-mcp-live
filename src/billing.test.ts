import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { handleStripeEvent, syncCompletedCheckoutSession } from "./billing.js";
import { GameStore } from "./store.js";

function createTestStore(): GameStore {
  const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-billing-"));
  return new GameStore(join(directory, "game.db"));
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
