import type { ApiCallGroup, ModelPricing } from '$lib/types.js';
import { normalizeModel, lookupPricing } from '$lib/pricing.js';

export interface ApiCallCost {
	/** Cost in USD, or null if model pricing is unknown */
	cost: number | null;
	/** The pricing used (null if unknown model) */
	pricing: ModelPricing | null;
	/** The normalized model string */
	model: string;
}

export interface SessionCostResult {
	/** Total cost in USD, or null if ALL models are unknown */
	totalCost: number | null;
	/** True if any API call used an unknown model (cost is a lower bound) */
	costIsLowerBound: boolean;
	/** Per-API-call cost breakdown */
	perCall: ApiCallCost[];
}

/** Compute cost for a single API call group. */
export function computeApiCallCost(group: ApiCallGroup): ApiCallCost {
	const model = normalizeModel(group.model);

	// Skip synthetic records entirely
	if (group.isSynthetic) {
		return { cost: 0, pricing: null, model };
	}

	const pricing = lookupPricing(model);
	if (!pricing) {
		return { cost: null, pricing: null, model };
	}

	const inputTokens = group.usage.input_tokens ?? 0;
	const outputTokens = group.usage.output_tokens ?? 0;
	const cacheReadTokens = group.usage.cache_read_input_tokens ?? 0;
	const cacheCreateTokens = group.usage.cache_creation_input_tokens ?? 0;

	const cost =
		(inputTokens * pricing.input +
			outputTokens * pricing.output +
			cacheReadTokens * pricing.cacheRead +
			cacheCreateTokens * pricing.cacheCreate) /
		1_000_000;

	return { cost, pricing, model };
}

/**
 * Compute total cost for a session's API call groups (main + subagents).
 * Pass all groups from main session and subagents combined.
 */
export function computeSessionCost(groups: ApiCallGroup[]): SessionCostResult {
	const perCall: ApiCallCost[] = [];
	let totalCost = 0;
	let hasKnownCost = false;
	let hasUnknownCost = false;

	for (const group of groups) {
		const result = computeApiCallCost(group);
		perCall.push(result);

		if (result.cost !== null) {
			totalCost += result.cost;
			if (!group.isSynthetic) {
				hasKnownCost = true;
			}
		} else {
			hasUnknownCost = true;
		}
	}

	return {
		totalCost: hasKnownCost || !hasUnknownCost ? totalCost : null,
		costIsLowerBound: hasUnknownCost,
		perCall,
	};
}
