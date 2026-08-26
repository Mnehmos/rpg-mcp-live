import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { syncCompletedCheckoutSession } from "./billing.js";
import { GameStore } from "./store.js";

function createTestStore(): GameStore {
  const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-billing-"));
  return new GameStore(join(directory, "game.db"));
}

describe("Stripe membership synchronization", () => {
  it("binds a completed Checkout session to the authenticated Clerk user", async () => {
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
    } as unknown as Stripe;

    await expect(syncCompletedCheckoutSession(stripe, "cs_test", "player-1", store)).resolves.toBe(true);
    expect(store.getSubscription("player-1")).toMatchObject({
      stripeCustomerId: "cus_checkout",
      stripeSubscriptionId: "sub_checkout",
      status: "checkout_complete",
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
    } as unknown as Stripe;

    await expect(syncCompletedCheckoutSession(stripe, "cs_test", "player-1", store)).resolves.toBe(true);
    expect(store.getSubscription("player-1")?.status).toBe("canceled");
    store.close();
  });
});
