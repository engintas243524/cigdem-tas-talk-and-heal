import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleUptimeWebhook } from '../src/routes/alert';

afterEach(() => vi.unstubAllGlobals());

const testEnv = { ...env, UPTIME_WEBHOOK_SECRET: 'uptime-test-secret' } as typeof env;

describe('POST /alert/uptime', () => {
	it('rejects a request with the wrong secret', async () => {
		const request = new Request('http://example.com/alert/uptime?secret=wrong', {
			method: 'POST',
			body: JSON.stringify({ heartbeat: { status: 0, msg: 'down' }, monitor: { name: 'Site' } }),
		});
		const response = await handleUptimeWebhook(request, testEnv);
		expect(response.status).toBe(403);
	});

	it('sends a WhatsApp alert to Selen on a DOWN heartbeat', async () => {
		const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const request = new Request(`http://example.com/alert/uptime?secret=${testEnv.UPTIME_WEBHOOK_SECRET}`, {
			method: 'POST',
			body: JSON.stringify({
				heartbeat: { status: 0, msg: 'HTTP 500', time: '2026-08-19T03:00:00.000Z' },
				monitor: { name: 'Talk and Heal Site' },
			}),
		});
		const response = await handleUptimeWebhook(request, testEnv);

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, init] = fetchMock.mock.calls[0];
		const body = JSON.parse(init.body as string);
		expect(body.to).toBe(testEnv.SELEN_WHATSAPP_NUMBER);
		expect(body.template.name).toBe('sistem_uyarisi_selen');
		expect(body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual([
			'Talk and Heal Site',
			'HTTP 500',
			'2026-08-19T03:00:00.000Z',
		]);
	});

	it('does not send anything on a recovery (UP) heartbeat', async () => {
		const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const request = new Request(`http://example.com/alert/uptime?secret=${testEnv.UPTIME_WEBHOOK_SECRET}`, {
			method: 'POST',
			body: JSON.stringify({ heartbeat: { status: 1, msg: 'up' }, monitor: { name: 'Talk and Heal Site' } }),
		});
		const response = await handleUptimeWebhook(request, testEnv);

		expect(response.status).toBe(200);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns 200 without sending anything when the payload is malformed JSON', async () => {
		const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const request = new Request(`http://example.com/alert/uptime?secret=${testEnv.UPTIME_WEBHOOK_SECRET}`, {
			method: 'POST',
			body: 'not json',
		});
		const response = await handleUptimeWebhook(request, testEnv);

		expect(response.status).toBe(200);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
