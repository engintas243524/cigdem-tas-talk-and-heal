import { CANCEL_PAGE_URL } from '../config';
import type { Env } from '../types';

// HMAC-SHA256 signed cancellation links (Session 13). Workers has no Node `crypto` — this uses the
// native SubtleCrypto only. Verification goes through `crypto.subtle.verify`, which compares in
// constant time, so we never do a manual (timing-leaky) string equality on the token.

async function hmacKey(env: Env): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', new TextEncoder().encode(env.CANCEL_LINK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, [
		'sign',
		'verify',
	]);
}

function toHex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

// null for any malformed hex (odd length or non-hex chars) — verifyCancelToken treats that as an
// invalid token rather than throwing.
function fromHex(hex: string): Uint8Array | null {
	if (hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) return null;
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return bytes;
}

export async function signCancelToken(env: Env, stripeSessionId: string): Promise<string> {
	const key = await hmacKey(env);
	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(stripeSessionId));
	return toHex(signature);
}

export async function verifyCancelToken(env: Env, stripeSessionId: string, token: string): Promise<boolean> {
	const signature = fromHex(token);
	if (!signature) return false;
	const key = await hmacKey(env);
	return crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(stripeSessionId));
}

export async function buildCancelUrl(env: Env, stripeSessionId: string): Promise<string> {
	const token = await signCancelToken(env, stripeSessionId);
	return `${CANCEL_PAGE_URL}?session=${encodeURIComponent(stripeSessionId)}&token=${token}`;
}
