import { EMAIL_FROM } from '../config';
import type { Env } from '../types';

export async function sendEmail(env: Env, to: string, subject: string, text: string): Promise<void> {
	const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, text }),
	});
	if (!response.ok) {
		throw new Error(`Resend send failed: ${response.status} ${await response.text()}`);
	}
}
