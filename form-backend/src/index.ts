import type { Env } from './types';
import { handleAvailability } from './routes/availability';
import { handleBooking } from './routes/booking';
import { handleWhatsappVerify, handleWhatsappIncoming } from './routes/whatsapp';
import { handleStripeWebhook } from './routes/stripe-webhook';
import { handleCancelGet, handleCancelPost } from './routes/cancel';
import { handleTranslate } from './routes/translate';
import { handleFixText } from './routes/fix-text';
import {
	handlePanelLogin,
	handlePanelPending,
	handlePanelClients,
	handlePanelNoteGet,
	handlePanelNotePost,
	handlePanelRefundPreview,
	handlePanelCancel,
	requirePanelAuth,
} from './routes/panel';
import { handleRakipEkle, handleRakipAra, handleRakipListe, handleRakipSil, handleIcerikStrateji, handleAksiyonAnaliz } from './routes/rakipAnalizi';
import { runReminderSweep, runSessionNoteFallback } from './scheduled';
import { corsHeaders } from './lib/http';

// Routes are added here as their build session lands (see plan doc, Phase 2 build order).
// Each case below is a placeholder until its session implements the real handler.
export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const key = `${request.method} ${url.pathname}`;

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders(request) });
		}

		switch (key) {
			case 'GET /availability':
				return handleAvailability(request, env);
			case 'POST /booking':
				return handleBooking(request, env);
			case 'GET /webhook/whatsapp':
				return handleWhatsappVerify(request, env);
			case 'POST /webhook/whatsapp':
				return handleWhatsappIncoming(request, env);
			case 'POST /webhook/stripe':
				return handleStripeWebhook(request, env);
			case 'GET /cancel':
				return handleCancelGet(request, env);
			case 'POST /cancel':
				return handleCancelPost(request, env);
			case 'GET /translate':
				return handleTranslate(request, env);
			case 'GET /fix-text':
				return handleFixText(request, env);
			// Madde 5 control panel. Login is public (it's the password check); every other panel
			// route is gated by a valid Bearer token via requirePanelAuth.
			case 'POST /panel/login':
				return handlePanelLogin(request, env);
			case 'GET /panel/pending':
				return (await requirePanelAuth(request, env)) ?? handlePanelPending(request, env);
			case 'GET /panel/clients':
				return (await requirePanelAuth(request, env)) ?? handlePanelClients(request, env);
			case 'GET /panel/note':
				return (await requirePanelAuth(request, env)) ?? handlePanelNoteGet(request, env);
			case 'POST /panel/note':
				return (await requirePanelAuth(request, env)) ?? handlePanelNotePost(request, env);
			case 'GET /panel/refund-preview':
				return (await requirePanelAuth(request, env)) ?? handlePanelRefundPreview(request, env);
			case 'POST /panel/cancel':
				return (await requirePanelAuth(request, env)) ?? handlePanelCancel(request, env);
			case 'POST /panel/rakip-analizi/rakip':
				return (await requirePanelAuth(request, env)) ?? handleRakipEkle(request, env);
			case 'GET /panel/rakip-analizi/rakip-ara':
				return (await requirePanelAuth(request, env)) ?? handleRakipAra(request, env);
			case 'GET /panel/rakip-analizi/rakip-liste':
				return (await requirePanelAuth(request, env)) ?? handleRakipListe(request, env);
			case 'POST /panel/rakip-analizi/rakip-sil':
				return (await requirePanelAuth(request, env)) ?? handleRakipSil(request, env);
			case 'POST /panel/rakip-analizi/icerik-strateji':
				return (await requirePanelAuth(request, env)) ?? handleIcerikStrateji(request, env);
			case 'POST /panel/rakip-analizi/aksiyon-analiz':
				return (await requirePanelAuth(request, env)) ?? handleAksiyonAnaliz(request, env);
			default:
				return new Response('Not Found', { status: 404 });
		}
	},

	async scheduled(_controller, env): Promise<void> {
		await runReminderSweep(env);
		await runSessionNoteFallback(env);
	},
} satisfies ExportedHandler<Env>;
