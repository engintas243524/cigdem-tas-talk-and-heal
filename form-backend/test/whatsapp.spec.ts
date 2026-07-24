import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendText, sendTemplate } from '../src/lib/whatsapp';

afterEach(() => vi.unstubAllGlobals());

describe('sendText', () => {
	it('posts a text message payload to the Graph API', async () => {
		const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await sendText(env, '447911123456', 'hello');

		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toContain(`/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`);
		expect(JSON.parse(init.body as string)).toMatchObject({
			messaging_product: 'whatsapp',
			to: '447911123456',
			type: 'text',
			text: { body: 'hello' },
		});
	});

	it('throws when the Graph API responds with an error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('bad request', { status: 400 })),
		);
		await expect(sendText(env, '447911123456', 'hello')).rejects.toThrow('WhatsApp send failed');
	});
});

describe('sendTemplate', () => {
	it('posts a template payload with body parameters in order', async () => {
		const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await sendTemplate(env, '447911123456', 'randevu_onay_danisan', ['Ada', '2026-08-01 10:00', 'Online']);

		const [, init] = fetchMock.mock.calls[0];
		const body = JSON.parse(init.body as string);
		expect(body.template.name).toBe('randevu_onay_danisan');
		expect(body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual(['Ada', '2026-08-01 10:00', 'Online']);
	});
});
