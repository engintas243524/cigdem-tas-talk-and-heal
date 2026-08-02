import { WHATSAPP_TEMPLATE_LANGUAGE } from '../config';
import type { Env } from '../types';

// Meta's Graph API versions expire ~2 years after release (see
// developers.facebook.com/docs/graph-api/changelog/versions) — v20.0 (used until 2026-08-02)
// was set to expire 2026-09-24. Bumped to the current version ahead of that deadline.
const GRAPH_API_VERSION = 'v26.0';

async function sendMessage(env: Env, payload: Record<string, unknown>): Promise<void> {
	const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
	});
	if (!response.ok) {
		throw new Error(`WhatsApp send failed: ${response.status} ${await response.text()}`);
	}
}

// Free-text message — only usable within Meta's 24h service window (a reply to an inbound
// message, or to a number that messaged us recently). No Meta approval needed.
export function sendText(env: Env, to: string, body: string): Promise<void> {
	return sendMessage(env, { to, type: 'text', text: { body } });
}

// Approved utility template — usable any time, but the name/variable order/count must exactly
// match what Meta approved (see config.ts WHATSAPP_TEMPLATES + WHATSAPP_TEMPLATE_LANGUAGE).
export function sendTemplate(env: Env, to: string, templateName: string, bodyParams: string[]): Promise<void> {
	return sendMessage(env, {
		to,
		type: 'template',
		template: {
			name: templateName,
			language: { code: WHATSAPP_TEMPLATE_LANGUAGE },
			components: [{ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) }],
		},
	});
}
