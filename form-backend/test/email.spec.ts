import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendEmail } from '../src/lib/email';

afterEach(() => vi.unstubAllGlobals());

describe('sendEmail', () => {
	it('posts to the Resend API with the expected payload', async () => {
		const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await sendEmail(env, 'selen@example.com', 'New booking', 'body text');

		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe('https://api.resend.com/emails');
		expect(JSON.parse(init.body as string)).toMatchObject({
			to: ['selen@example.com'],
			subject: 'New booking',
			text: 'body text',
		});
	});

	it('throws when Resend responds with an error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('bad request', { status: 422 })),
		);
		await expect(sendEmail(env, 'selen@example.com', 'x', 'y')).rejects.toThrow('Resend send failed');
	});
});
