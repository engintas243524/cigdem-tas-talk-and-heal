import type { Env } from '../types';
import { sendText } from '../lib/whatsapp';
import { BOOKING_PAGE_URL } from '../config';

const WELCOME_MESSAGE = `Hello! To see available times and book an appointment, please tap the link below:\n👉 ${BOOKING_PAGE_URL}`;

// Meta's one-time handshake when the webhook URL is registered/re-verified in the dashboard.
export function handleWhatsappVerify(request: Request, env: Env): Response {
	const url = new URL(request.url);
	const mode = url.searchParams.get('hub.mode');
	const token = url.searchParams.get('hub.verify_token');
	const challenge = url.searchParams.get('hub.challenge');

	if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN && challenge) {
		return new Response(challenge, { status: 200 });
	}
	return new Response('Forbidden', { status: 403 });
}

interface WhatsappWebhookBody {
	entry?: {
		changes?: {
			value: {
				// Meta sends both message deliveries and delivery/read "statuses" through the same
				// webhook shape — only entries with `messages` are inbound texts we reply to.
				messages?: { from: string }[];
			};
		}[];
	}[];
}

export async function handleWhatsappIncoming(request: Request, env: Env): Promise<Response> {
	let body: WhatsappWebhookBody;
	try {
		body = await request.json();
	} catch {
		return new Response('OK', { status: 200 }); // malformed payload, nothing Meta should retry
	}

	const senders = (body.entry ?? [])
		.flatMap((entry) => entry.changes ?? [])
		.flatMap((change) => change.value.messages ?? [])
		.map((message) => message.from);

	for (const to of senders) {
		try {
			await sendText(env, to, WELCOME_MESSAGE);
		} catch (err) {
			// ponytail: no wamid dedupe store, a rare Meta retry could double-send the welcome
			// text — add a KV keyed by wamid if it becomes a real annoyance (see plan doc).
			console.error('WhatsApp welcome send failed', err);
		}
	}

	// Always 200 — a non-200 makes Meta retry the whole payload, which would re-attempt sends
	// that may have already gone out above.
	return new Response('OK', { status: 200 });
}
