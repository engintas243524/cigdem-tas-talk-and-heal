import { describe, it, expect } from 'vitest';
import { getPriceGBP, getSessionMinutes } from '../src/config';

describe('getPriceGBP', () => {
	it.each([
		['online', 'individual', 'standard', 120],
		['online', 'individual', 'extended', 150],
		['online', 'couple', 'standard', 200],
		['online', 'couple', 'extended', 250],
		['inPerson', 'individual', 'standard', 140],
		['inPerson', 'individual', 'extended', 175],
		['inPerson', 'couple', 'standard', 350],
		['inPerson', 'couple', 'extended', 425],
	] as const)('%s + %s + %s = £%d', (sessionMode, therapyMode, sessionType, expected) => {
		expect(getPriceGBP(sessionMode, therapyMode, sessionType)).toBe(expected);
	});
});

describe('getSessionMinutes', () => {
	it('standard is 50 minutes regardless of mode', () => {
		expect(getSessionMinutes('standard')).toBe(50);
	});
	it('extended is 80 minutes regardless of mode', () => {
		expect(getSessionMinutes('extended')).toBe(80);
	});
});
