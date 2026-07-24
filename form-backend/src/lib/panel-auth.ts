import type { Env } from '../types';

// Signed, time-limited login token for the therapist control panel (Madde 5). Same SubtleCrypto
// HMAC-SHA256 approach as lib/cancel-link.ts (Workers has no Node `crypto`); the only addition is
// an expiry baked into the signed payload so a leaked token can't be used forever.
// Token shape: "<expiryMs>.<hmacHex>", where the HMAC signs the exact "<expiryMs>" string.

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h — one working day; Çiğdem just logs in again after.

async function hmacKey(env: Env): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', new TextEncoder().encode(env.PANEL_TOKEN_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, [
		'sign',
		'verify',
	]);
}

function toHex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

// null for malformed hex — verifyPanelToken treats that as an invalid token rather than throwing.
function fromHex(hex: string): Uint8Array | null {
	if (hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) return null;
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return bytes;
}

export async function signPanelToken(env: Env, now: Date = new Date()): Promise<string> {
	const expiry = String(now.getTime() + TOKEN_TTL_MS);
	const key = await hmacKey(env);
	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(expiry));
	return `${expiry}.${toHex(signature)}`;
}

export async function verifyPanelToken(env: Env, token: string, now: Date = new Date()): Promise<boolean> {
	const dot = token.indexOf('.');
	if (dot === -1) return false;
	const expiry = token.slice(0, dot);
	const signature = fromHex(token.slice(dot + 1));
	if (!signature || !/^\d+$/.test(expiry) || Number(expiry) < now.getTime()) return false;
	const key = await hmacKey(env);
	return crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(expiry));
}

// Reads the Bearer token from a request and verifies it — the guard every /panel/* route (except
// login) runs first. Returns true iff the Authorization header carries a valid, unexpired token.
export async function isPanelAuthorized(env: Env, request: Request, now: Date = new Date()): Promise<boolean> {
	const header = request.headers.get('Authorization') ?? '';
	const match = header.match(/^Bearer (.+)$/);
	if (!match) return false;
	return verifyPanelToken(env, match[1], now);
}
