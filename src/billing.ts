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
    subscription_data: { metadata: { clerk_user_id: userId } },
    success_url: `${config.appUrl}/play?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
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

function subscriptionPeriodEnd(subscription: Stripe.Subscription): number | null {
  return subscription.items.data[0]?.current_period_end ?? null;
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

/**
 * Persist the current Stripe subscription object, not the status implied by
 * the Checkout event that led us to it. The second lookup protects the
 * single-user subscription row from an old Checkout return or an out-of-order
 * webhook replacing a newer subscription.
 */
async function saveAuthoritativeSubscription(
  stripe: Stripe,
  store: GameStore,
  userId: string,
  subscription: Stripe.Subscription,
  expectedCustomerId?: string | null,
): Promise<boolean> {
  const customerId = stripeId(subscription.customer);
  if (expectedCustomerId && customerId !== expectedCustomerId) return false;

  const existing = store.getSubscription(userId);
  if (existing?.stripeSubscriptionId && existing.stripeSubscriptionId !== subscription.id) {
    const current = await stripe.subscriptions.retrieve(existing.stripeSubscriptionId);
    if (current.created >= subscription.created) return false;
  }

  saveSubscription(store, {
    userId,
    customerId,
    subscriptionId: subscription.id,
    status: subscription.status,
    priceId: subscriptionPriceId(subscription),
    currentPeriodEnd: subscriptionPeriodEnd(subscription),
  });
  return true;
}

/**
 * Stripe normally reaches the webhook before the player returns from
 * Checkout, but the redirect is the only reliable signal available to the
 * browser when webhook delivery is delayed. Verify the session server-side
 * and fill the same subscription record used by the webhook handler.
 */
export async function syncCompletedCheckoutSession(
  stripe: Stripe,
  sessionId: string,
  userId: string,
  store: GameStore,
): Promise<boolean> {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const sessionUserId = session.metadata?.clerk_user_id ?? session.client_reference_id;
  if (sessionUserId !== userId || session.mode !== "subscription" || session.status !== "complete") return false;

  const subscriptionId = stripeId(session.subscription);
  const customerId = stripeId(session.customer);
  if (!subscriptionId) return false;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const subscriptionUserId = subscription.metadata?.clerk_user_id;
  if (subscriptionUserId && subscriptionUserId !== userId) return false;
  // An equal-or-newer subscription may already be the account's source of
  // truth; either way the session is valid and the browser may clear the
  // return marker.
  await saveAuthoritativeSubscription(stripe, store, userId, subscription, customerId);
  return true;
}

export async function handleStripeEvent(event: Stripe.Event, store: GameStore, stripe?: Stripe): Promise<void> {
  if (store.hasWebhookEvent(event.id)) return;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.clerk_user_id ?? session.client_reference_id;
      const subscriptionId = stripeId(session.subscription);
      const customerId = stripeId(session.customer);

      if (userId && subscriptionId && stripe) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        if (!subscription.metadata?.clerk_user_id || subscription.metadata.clerk_user_id === userId) {
          await saveAuthoritativeSubscription(stripe, store, userId, subscription, customerId);
        }
      } else if (userId && !stripe && subscriptionId) {
        // Tests/tools without a Stripe client can retain the binding marker,
        // but it is deliberately not an entitled status (see planForUser).
        if (!store.getSubscription(userId)) {
          saveSubscription(store, {
            userId,
            customerId,
            subscriptionId,
            status: "checkout_complete",
            priceId: config.stripePriceId || null,
            currentPeriodEnd: null,
          });
        }
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = stripeId(subscription.customer);
      const userId = subscription.metadata?.clerk_user_id
        ?? (customerId ? store.findUserIdByStripeCustomer(customerId) : null);

      if (userId && stripe) {
        const current = await stripe.subscriptions.retrieve(subscription.id);
        const currentUserId = current.metadata?.clerk_user_id
          ?? (stripeId(current.customer) ? store.findUserIdByStripeCustomer(stripeId(current.customer)!) : null);
        if (currentUserId === userId) {
          await saveAuthoritativeSubscription(stripe, store, userId, current, customerId);
        }
      } else if (userId) {
        saveSubscription(store, {
          userId,
          customerId,
          subscriptionId: subscription.id,
          status: subscription.status,
          priceId: subscriptionPriceId(subscription),
          currentPeriodEnd: subscriptionPeriodEnd(subscription),
        });
      }
      break;
    }
    default:
      break;
  }

  store.recordWebhookEvent(event.id, event.type);
}
