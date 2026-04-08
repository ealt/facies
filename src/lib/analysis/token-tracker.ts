import type { ApiCallGroup, TranscriptRecord, SystemRecord } from '$lib/types.js';
import { normalizeModel, lookupPricing } from '$lib/pricing.js';
import { computeApiCallCost } from './cost-calculator.js';

/** Per-API-call token snapshot with cumulative totals. */
export interface TokenSnapshot {
	index: number;
	timestamp: string;
	model: string;

	// Per-call token counts
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreateTokens: number;

	// Per-call cost
	cost: number | null;

	// Per-call cache rate: cache_read / (input + cache_read + cache_create)
	cacheRate: number;

	// Cumulative totals
	cumulativeInputTokens: number;
	cumulativeOutputTokens: number;
	cumulativeCacheReadTokens: number;
	cumulativeCacheCreateTokens: number;
	cumulativeCost: number;
}

/** Per-model aggregation. */
export interface ModelBreakdown {
	model: string;
	apiCalls: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreateTokens: number;
	cacheRate: number;
	totalCost: number | null;
}

/** Session-level token economics summary. */
export interface TokenEconomics {
	snapshots: TokenSnapshot[];

	// Aggregate totals
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCacheReadTokens: number;
	totalCacheCreateTokens: number;
	totalCost: number | null;
	costIsLowerBound: boolean;

	// Derived metrics
	overallCacheRate: number;
	costSavedByCaching: number | null;
	costSavedIsLowerBound: boolean;
	avgCostPerTurn: number | null;
	models: string[];
	perModel: ModelBreakdown[];
}

/** A per-API-call latency data point. */
export interface LatencyPoint {
	index: number;
	timestamp: string;
	/** Estimated latency in ms (from turn_duration for single-call turns, averaged for multi-call turns). */
	latencyMs: number;
	inputTokens: number;
	outputTokens: number;
	model: string;
	/** True when the turn had multiple API calls and latency is an average estimate. */
	isEstimated: boolean;
}

function cacheRate(input: number, cacheRead: number, cacheCreate: number): number {
	const total = input + cacheRead + cacheCreate;
	return total > 0 ? cacheRead / total : 0;
}

/**
 * Compute full token economics for a set of API call groups.
 * Pass all groups (main + subagents) for complete session accounting.
 * `turns` is the number of user turns (for avg cost per turn).
 */
export function computeTokenEconomics(
	groups: ApiCallGroup[],
	turns: number,
): TokenEconomics {
	// Sort by timestamp so main + subagent calls interleave chronologically
	const sorted = [...groups].sort(
		(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
	);

	const snapshots: TokenSnapshot[] = [];
	const modelMap = new Map<string, {
		apiCalls: number;
		input: number;
		output: number;
		cacheRead: number;
		cacheCreate: number;
		cost: number;
		hasUnknownCost: boolean;
	}>();

	let cumInput = 0;
	let cumOutput = 0;
	let cumCacheRead = 0;
	let cumCacheCreate = 0;
	let cumCost = 0;
	let hasKnownCost = false;
	let hasUnknownCost = false;

	for (let i = 0; i < sorted.length; i++) {
		const g = sorted[i];
		if (g.isSynthetic) continue;

		const model = normalizeModel(g.model);
		const input = g.usage.input_tokens ?? 0;
		const output = g.usage.output_tokens ?? 0;
		const cRead = g.usage.cache_read_input_tokens ?? 0;
		const cCreate = g.usage.cache_creation_input_tokens ?? 0;

		const costResult = computeApiCallCost(g);
		const callCost = costResult.cost;

		cumInput += input;
		cumOutput += output;
		cumCacheRead += cRead;
		cumCacheCreate += cCreate;
		if (callCost !== null) {
			cumCost += callCost;
			hasKnownCost = true;
		} else {
			hasUnknownCost = true;
		}

		snapshots.push({
			index: snapshots.length,
			timestamp: g.timestamp,
			model,
			inputTokens: input,
			outputTokens: output,
			cacheReadTokens: cRead,
			cacheCreateTokens: cCreate,
			cost: callCost,
			cacheRate: cacheRate(input, cRead, cCreate),
			cumulativeInputTokens: cumInput,
			cumulativeOutputTokens: cumOutput,
			cumulativeCacheReadTokens: cumCacheRead,
			cumulativeCacheCreateTokens: cumCacheCreate,
			cumulativeCost: cumCost,
		});

		// Per-model aggregation
		const entry = modelMap.get(model) ?? {
			apiCalls: 0, input: 0, output: 0, cacheRead: 0, cacheCreate: 0,
			cost: 0, hasUnknownCost: false,
		};
		entry.apiCalls++;
		entry.input += input;
		entry.output += output;
		entry.cacheRead += cRead;
		entry.cacheCreate += cCreate;
		if (callCost !== null) {
			entry.cost += callCost;
		} else {
			entry.hasUnknownCost = true;
		}
		modelMap.set(model, entry);
	}

	const totalCost = hasKnownCost || !hasUnknownCost ? cumCost : null;

	// Cost saved by caching: compare actual cached billing against a no-cache
	// baseline where all input tokens (cache_read + cache_create + input) are
	// billed at the base input rate.
	let costSaved: number | null = null;
	let costSavedIsLowerBound = false;
	if (hasKnownCost) {
		costSaved = 0;
		for (const snap of snapshots) {
			const pricing = lookupPricing(snap.model);
			if (!pricing) {
				costSavedIsLowerBound = true;
				continue;
			}
			const allInput = snap.inputTokens + snap.cacheReadTokens + snap.cacheCreateTokens;
			const noCacheInputCost = allInput * pricing.input / 1_000_000;
			const actualInputCost =
				(snap.inputTokens * pricing.input +
					snap.cacheReadTokens * pricing.cacheRead +
					snap.cacheCreateTokens * pricing.cacheCreate) / 1_000_000;
			costSaved += noCacheInputCost - actualInputCost;
		}
	}

	const perModel: ModelBreakdown[] = [...modelMap.entries()]
		.sort((a, b) => (b[1].cost) - (a[1].cost))
		.map(([model, m]) => ({
			model,
			apiCalls: m.apiCalls,
			inputTokens: m.input,
			outputTokens: m.output,
			cacheReadTokens: m.cacheRead,
			cacheCreateTokens: m.cacheCreate,
			cacheRate: cacheRate(m.input, m.cacheRead, m.cacheCreate),
			totalCost: m.hasUnknownCost && m.cost === 0 ? null : m.cost,
		}));

	return {
		snapshots,
		totalInputTokens: cumInput,
		totalOutputTokens: cumOutput,
		totalCacheReadTokens: cumCacheRead,
		totalCacheCreateTokens: cumCacheCreate,
		totalCost,
		costIsLowerBound: hasUnknownCost,
		overallCacheRate: cacheRate(cumInput, cumCacheRead, cumCacheCreate),
		costSavedByCaching: costSaved,
		costSavedIsLowerBound,
		avgCostPerTurn: totalCost !== null && turns > 0 ? totalCost / turns : null,
		models: [...modelMap.keys()],
		perModel,
	};
}

/**
 * Compute per-API-call latency data points by correlating turn_duration system
 * records with API call groups. Each turn_duration marks the end of a turn;
 * API calls between consecutive turn boundaries belong to that turn.
 *
 * For single-call turns the latency is exact. For multi-call turns the turn
 * duration is divided equally (marked as estimated).
 *
 * Only pass API call groups from the **same transcript scope** as the records
 * (i.e., main-session groups with main-session records). Mixing scopes
 * (e.g., subagent API calls with main-session turn_duration) corrupts the
 * correlation.
 */
export function computeLatencyPoints(
	records: TranscriptRecord[],
	groups: ApiCallGroup[],
): LatencyPoint[] {
	// Extract turn_duration records sorted by timestamp
	const turnDurations = records
		.filter((r): r is SystemRecord => r.type === 'system' && r.subtype === 'turn_duration')
		.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

	if (turnDurations.length === 0) return [];

	// Sort API call groups chronologically, skip synthetic
	const sorted = [...groups]
		.filter((g) => !g.isSynthetic)
		.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

	const points: LatencyPoint[] = [];
	let groupIdx = 0;

	for (let i = 0; i < turnDurations.length; i++) {
		const td = turnDurations[i];
		const tdTime = new Date(td.timestamp).getTime();
		const prevTime = i > 0 ? new Date(turnDurations[i - 1].timestamp).getTime() : 0;
		const durationMs = td.durationMs ?? 0;
		if (durationMs <= 0) continue;

		// Collect API calls that belong to this turn:
		// timestamp > previous turn_duration AND timestamp <= this turn_duration
		const turnCalls: ApiCallGroup[] = [];

		while (groupIdx < sorted.length) {
			const gTime = new Date(sorted[groupIdx].timestamp).getTime();
			if (gTime > tdTime) break;
			if (gTime > prevTime) {
				turnCalls.push(sorted[groupIdx]);
			}
			groupIdx++;
		}

		if (turnCalls.length === 0) continue;

		const isEstimated = turnCalls.length > 1;
		const perCallLatency = durationMs / turnCalls.length;

		for (const g of turnCalls) {
			const inp = (g.usage.input_tokens ?? 0) +
				(g.usage.cache_read_input_tokens ?? 0) +
				(g.usage.cache_creation_input_tokens ?? 0);
			const out = g.usage.output_tokens ?? 0;

			points.push({
				index: points.length,
				timestamp: g.timestamp,
				latencyMs: isEstimated ? perCallLatency : durationMs,
				inputTokens: inp,
				outputTokens: out,
				model: normalizeModel(g.model),
				isEstimated,
			});
		}
	}

	return points;
}
