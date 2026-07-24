import { describe, it, expect } from 'vitest';
import { computePolicyTier } from '../src/lib/policy';

describe('computePolicyTier', () => {
	it('returns 72 at exactly 72 hours or more', () => {
		expect(computePolicyTier(72)).toBe(72);
		expect(computePolicyTier(200)).toBe(72);
	});
	it('returns 48 between 48 and 72 hours', () => {
		expect(computePolicyTier(71.9)).toBe(48);
		expect(computePolicyTier(48)).toBe(48);
	});
	it('returns 24 below 48 hours (includes the sub-24h flat-50% case, enforced in Session 13)', () => {
		expect(computePolicyTier(47.9)).toBe(24);
		expect(computePolicyTier(24)).toBe(24);
		expect(computePolicyTier(1)).toBe(24);
		expect(computePolicyTier(0)).toBe(24);
	});
});
