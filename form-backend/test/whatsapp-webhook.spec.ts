import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleWhatsappVerify, handleWhatsappIncoming } from '../src/routes/whatsapp';

afterEach(() => vi.unstubAllGlobals());

describe('GET /webhook/whatsapp (verify handshake)', () => {
	it('echoes hub.challenge when the verify token matches', () => {
		const request = new Request(
			`http://example.com/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${env.WHATSAPP_VERIFY_TOKEN}&hub.challenge=1234`,
		);
		const response = handleWhatsappVerify(request, env);
		expect(response.status).toBe(200);
	});

	it('rejects a wrong verify token', async () => {
		const request = new Request('http://example.com/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1234');
		const response = handleWhatsappVerify(request, env);
		expect(response.status).toBe(403);
	});
});

describe('POST /webhook/whatsapp (incoming message)', () => {
	it('replies with the welcome text to each inbound sender', async () => {
		const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const request = new Request('http://example.com/webhook/whatsapp', {
			method: 'POST',
			body: JSON.stringify({
				entry: [
					{
						changes: [
							{ value: { messages: [{ from: '447911123456' }] } },
							{ value: { statuses: [{ status: 'delivered' }] } }, // no `messages` — must be ignored
						],
					},
				],
			}),
		});

		const response = await handleWhatsappIncoming(request, env);

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, init] = fetchMock.mock.calls[0];
		const body = JSON.parse(init.body as string);
		expect(body).toMatchObject({ to: '447911123456', type: 'text' });
		expect(body.text.body).toContain('book an appointment');
	});

	it('returns 200 even when malformed JSON is posted', async () => {
		const request = new Request('http://example.com/webhook/whatsapp', { method: 'POST', body: 'not json' });
		const response = await handleWhatsappIncoming(request, env);
		expect(response.status).toBe(200);
	});

	it('returns 200 without sending anything when there are no inbound messages', async () => {
		const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const request = new Request('http://example.com/webhook/whatsapp', {
			method: 'POST',
			body: JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ status: 'read' }] } }] }] }),
		});
		const response = await handleWhatsappIncoming(request, env);

		expect(response.status).toBe(200);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
