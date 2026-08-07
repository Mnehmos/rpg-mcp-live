import Stripe from "stripe";
import { config } from "./config.js";
import type { GameStore } from "./store.js";

export function createStripeClient(): Stripe | null {
  if (!config.stripeSecretKey) return null;

  return new Stripe(config.stripeSecretKey, {
    apiVersion: "2026-07-29.dahlia",
    maxNetworkRetries: 2,
  });
}

export async function createCheckoutUrl(stripe: Stripe, userId: string): Promise<string> {
  if (!config.stripePriceId) throw new Error("STRIPE_PRICE_ID is not configured");

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    integration_identifier: "rpg_mcp_live_checkout_emberfox",
    line_items: [{ price: config.stripePriceId, quantity: 1 }],
    client_reference_id: userId,
    metadata: { clerk_user_id: userId },
    success_url: `${config.appUrl}/play?checkout=success`,
    cancel_url: `${config.appUrl}/?checkout=cancelled`,
  });

  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return session.url;
}

export async function createPortalUrl(stripe: Stripe, customerId: string): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${config.appUrl}/play`,
  });

  return session.url;
}

function stripeId(value: string | Stripe.Customer | Stripe.DeletedCustomer | Stripe.Subscription | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function subscriptionPriceId(subscription: Stripe.Subscription): string | null {
  return subscription.items.data[0]?.price.id ?? null;
}

function saveSubscription(store: GameStore, values: {
  userId: string;
  customerId: string | null;
  subscriptionId: string | null;
  status: string;
  priceId: string | null;
  currentPeriodEnd: number | null;
}): void {
  store.upsertSubscription({
    userId: values.userId,
    stripeCustomerId: values.customerId,
    stripeSubscriptionId: values.subscriptionId,
    status: values.status,
    priceId: values.priceId,
    currentPeriodEnd: values.currentPeriodEnd,
  });
}

export function handleStripeEvent(event: Stripe.Event, store: GameStore): void {
  if (store.hasWebhookEvent(event.id)) return;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.clerk_user_id ?? session.client_reference_id;
      const subscriptionId = stripeId(session.subscription);
      const customerId = stripeId(session.customer);

      if (userId && (subscriptionId || customerId)) {
        saveSubscription(store, {
          userId,
          customerId,
          subscriptionId,
          status: "checkout_complete",
          priceId: config.stripePriceId || null,
          currentPeriodEnd: null,
        });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = stripeId(subscription.customer);
      const userId = customerId ? store.findUserIdByStripeCustomer(customerId) : null;

      if (userId) {
        saveSubscription(store, {
          userId,
          customerId,
          subscriptionId: subscription.id,
          status: subscription.status,
          priceId: subscriptionPriceId(subscription),
          currentPeriodEnd: subscription.items.data[0]?.current_period_end ?? null,
        });
      }
      break;
    }
    default:
      break;
  }

  store.recordWebhookEvent(event.id, event.type);
}
