import Stripe from 'stripe';
import type { Env } from '../types';

export function getStripeClient(env: Env): Stripe {
	return new Stripe(env.STRIPE_SECRET_KEY, {
		httpClient: Stripe.createFetchHttpClient(),
	});
}

// Verifies + parses an inbound Stripe webhook. Must use the *Async variant with a WebCrypto
// provider — Workers has no Node `crypto`, which the sync `constructEvent` needs.
export async function constructStripeEvent(env: Env, rawBody: string, signature: string): Promise<Stripe.Event> {
	const stripe = getStripeClient(env);
	return stripe.webhooks.constructEventAsync(rawBody, signature, env.STRIPE_WEBHOOK_SECRET, undefined, Stripe.createSubtleCryptoProvider());
}
