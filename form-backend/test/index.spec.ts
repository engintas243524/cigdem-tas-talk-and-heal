import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src';

describe('router', () => {
	it('returns 404 for an unknown route', async () => {
		const request = new Request('http://example.com/nope');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(404);
	});

	// /availability and /booking call real Google/Stripe APIs — deliberately not asserted here,
	// so `npm test` stays fast/deterministic without live credentials. Verified manually via
	// `wrangler dev` instead (see plan doc). /webhook/whatsapp and /webhook/stripe behavior are
	// covered in their own spec files (whatsapp-webhook.spec.ts, stripe-webhook.spec.ts).
});
