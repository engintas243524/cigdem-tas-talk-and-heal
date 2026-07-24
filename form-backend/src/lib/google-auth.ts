import { SignJWT, importPKCS8 } from 'jose';
import type { Env } from '../types';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/spreadsheets'];

async function fetchAccessToken(env: Env): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const privateKey = await importPKCS8(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, 'RS256');
	const assertion = await new SignJWT({ scope: SCOPES.join(' ') })
		.setProtectedHeader({ alg: 'RS256' })
		.setIssuer(env.GOOGLE_SERVICE_ACCOUNT_EMAIL)
		.setSubject(env.GOOGLE_SERVICE_ACCOUNT_EMAIL)
		.setAudience(TOKEN_URL)
		.setIssuedAt(now)
		.setExpirationTime(now + 3600)
		.sign(privateKey);

	const response = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			assertion,
		}),
	});

	if (!response.ok) {
		throw new Error(`Google token exchange failed: ${response.status} ${await response.text()}`);
	}

	const data = (await response.json()) as { access_token: string };
	return data.access_token;
}

// Module-scope cache: correctness-neutral (a Workers isolate can be evicted anytime, in which
// case this just re-fetches) — not a durability guarantee, only avoids a token round-trip on
// every call within a warm isolate.
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

export async function getGoogleAccessToken(env: Env): Promise<string> {
	const now = Date.now();
	if (cachedToken && cachedToken.expiresAt > now) {
		return cachedToken.accessToken;
	}
	const accessToken = await fetchAccessToken(env);
	// Google tokens are valid 1h; refresh a few minutes early to avoid edge-of-expiry failures.
	cachedToken = { accessToken, expiresAt: now + 55 * 60 * 1000 };
	return accessToken;
}
