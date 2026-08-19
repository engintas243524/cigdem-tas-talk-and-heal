import type { Env } from '../types';
import { sendTemplate } from '../lib/whatsapp';
import { WHATSAPP_TEMPLATES } from '../config';

// 10. Aşama (İzleme, 2026-08-19): Uptime Kuma's generic webhook notification provider posts here
// on every monitor status change. Payload shape (from Uptime Kuma's webhook.js):
// { heartbeat: { status, msg, time }, monitor: { name, type, url }, msg }
interface UptimeKumaWebhookBody {
	heartbeat?: { status?: number; msg?: string; time?: string };
	monitor?: { name?: string };
	msg?: string;
}

// POST /alert/uptime?secret=... — public (Uptime Kuma can't send our panel Bearer token), so the
// query-param secret is the only thing stopping a random internet request from triggering a paid
// WhatsApp send. Only fires on DOWN transitions (heartbeat.status === 0) — Uptime Kuma also posts
// on recovery (status === 1), which isn't useful as a 3am wake-up alert.
export async function handleUptimeWebhook(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	if (url.searchParams.get('secret') !== env.UPTIME_WEBHOOK_SECRET) {
		return new Response('Forbidden', { status: 403 });
	}

	let body: UptimeKumaWebhookBody;
	try {
		body = await request.json();
	} catch {
		return new Response('OK', { status: 200 }); // malformed payload, nothing to retry
	}

	if (body.heartbeat?.status === 1) {
		return new Response('OK', { status: 200 }); // recovery ping, not a down alert
	}

	const monitorName = body.monitor?.name || 'Bilinmeyen monitör';
	const reason = body.heartbeat?.msg || body.msg || 'Detay yok';
	const time = body.heartbeat?.time || new Date().toISOString();

	try {
		await sendTemplate(env, env.SELEN_WHATSAPP_NUMBER, WHATSAPP_TEMPLATES.systemAlert, [monitorName, reason, time]);
	} catch (err) {
		console.error('Uptime alert WhatsApp send failed', err);
	}

	return new Response('OK', { status: 200 });
}
