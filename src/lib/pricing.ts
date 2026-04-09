import type { ModelPricing, PricingData } from '$lib/types.js';
import pricingJson from '$lib/pricing-data.json';

const data: PricingData = pricingJson as PricingData;

/** Strip ANSI codes and [1m] context window annotations from model strings. */
export function normalizeModel(model: string): string {
	return model
		.replace(/\x1b\[[0-9;]*m/g, '') // ANSI first (may wrap the bracket suffix)
		.replace(/\[.*?\]$/g, '')
		.trim();
}

/**
 * Look up pricing for a model. Tries exact match first, then prefix match.
 * Returns null for unknown models.
 */
export function lookupPricing(model: string): ModelPricing | null {
	const normalized = normalizeModel(model);

	// 1. Exact match
	if (normalized in data.models) {
		return data.models[normalized];
	}

	// 2. Prefix match — longest key that is a prefix, with a delimiter boundary
	// (the character after the key must be '-' or end-of-string to prevent
	// e.g. "claude-opus-4-61" matching "claude-opus-4-6")
	let bestMatch: string | null = null;
	for (const key of Object.keys(data.models)) {
		if (
			normalized.startsWith(key) &&
			(normalized.length === key.length || normalized[key.length] === '-') &&
			(!bestMatch || key.length > bestMatch.length)
		) {
			bestMatch = key;
		}
	}
	if (bestMatch) {
		return data.models[bestMatch];
	}

	return null;
}

/** Get the full pricing data (for display/admin purposes). */
export function getPricingData(): PricingData {
	return data;
}
