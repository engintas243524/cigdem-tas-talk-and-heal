import { getSlotStatuses } from '../lib/calendar';
import { errorResponse, json } from '../lib/http';
import type { Env } from '../types';
import type { SessionType } from '../config';

const VALID_SESSION_TYPES: SessionType[] = ['standard', 'extended'];

export async function handleAvailability(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const sessionTypeParam = url.searchParams.get('sessionType') ?? 'standard';

	if (!VALID_SESSION_TYPES.includes(sessionTypeParam as SessionType)) {
		return errorResponse(request, 400, `sessionType must be one of: ${VALID_SESSION_TYPES.join(', ')}`);
	}

	try {
		// `slots`: every candidate slot in the lookahead window with a per-slot status
		// ('available' | 'reserved' | 'holiday', the last carrying holidayTitle) — the frontend
		// renders reserved/holiday chips as non-interactive rather than hiding them.
		const slots = await getSlotStatuses(env, sessionTypeParam as SessionType);
		return json({ slots }, request);
	} catch (err) {
		return errorResponse(request, 502, 'Could not load availability right now, please try again shortly.', err);
	}
}
