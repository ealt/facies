#!/usr/bin/env npx tsx
/**
 * Fetch current Claude model pricing from Anthropic's docs and update
 * src/lib/pricing-data.json. Run with: npx tsx scripts/update-pricing.ts
 *
 * Merges with existing data — adds new models, updates changed prices,
 * preserves manual entries. Fails loudly if parsing returns zero models.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface ModelPricing {
	input: number;
	output: number;
	cacheRead: number;
	cacheCreate: number;
}

interface PricingData {
	lastUpdated: string;
	models: Record<string, ModelPricing>;
}

const PRICING_FILE = resolve(import.meta.dirname ?? '.', '../src/lib/pricing-data.json');
const PRICING_URL = 'https://platform.claude.com/docs/en/about-claude/pricing';

/** Map display names (as they appear in the pricing table) to canonical API model IDs. */
const MODEL_ID_MAP: Record<string, string> = {
	'Claude Opus 4.6': 'claude-opus-4-6',
	'Claude Opus 4.5': 'claude-opus-4-5-20251101',
	'Claude Opus 4.1': 'claude-opus-4-1-20250805',
	'Claude Opus 4': 'claude-opus-4-20250514',
	'Claude Sonnet 4.6': 'claude-sonnet-4-6',
	'Claude Sonnet 4.5': 'claude-sonnet-4-5-20250929',
	'Claude Sonnet 4': 'claude-sonnet-4-20250514',
	'Claude Sonnet 3.7': 'claude-3-7-sonnet-20250219',
	'Claude Haiku 4.5': 'claude-haiku-4-5-20251001',
	'Claude Haiku 3.5': 'claude-3-5-haiku-20241022',
	'Claude Opus 3': 'claude-3-opus-20240229',
	'Claude Haiku 3': 'claude-3-haiku-20240307',
};

function parsePrice(text: string): number {
	const match = text.match(/\$([0-9.]+)/);
	if (!match) throw new Error(`Cannot parse price from: "${text}"`);
	return parseFloat(match[1]);
}

async function fetchPricingPage(): Promise<string> {
	const response = await fetch(PRICING_URL);
	if (!response.ok) {
		throw new Error(`Failed to fetch pricing page: ${response.status} ${response.statusText}`);
	}
	return response.text();
}

/**
 * Parse the model pricing table from the docs page.
 *
 * The page may render as HTML or markdown depending on the fetch method.
 * We try multiple strategies:
 * 1. Pipe-delimited markdown table rows
 * 2. Flattened text with model names followed by price patterns
 */
function parsePricingTable(content: string): Record<string, ModelPricing> {
	const models: Record<string, ModelPricing> = {};

	// Strategy 1: Pipe-delimited markdown table
	// | Claude Opus 4.6 | $5 / MTok | $6.25 / MTok | $10 / MTok | $0.50 / MTok | $25 / MTok |
	const pipeRowPattern =
		/\|\s*(Claude\s+\w+\s+[\d.]+(?:\s+\([^)]*\))?)\s*\|\s*(\$[\d.]+)\s*\/\s*MTok\s*\|\s*(\$[\d.]+)\s*\/\s*MTok\s*\|\s*(\$[\d.]+)\s*\/\s*MTok\s*\|\s*(\$[\d.]+)\s*\/\s*MTok\s*\|\s*(\$[\d.]+)\s*\/\s*MTok\s*\|/g;

	let match;
	while ((match = pipeRowPattern.exec(content)) !== null) {
		const displayName = match[1].replace(/\s*\([^)]*\)\s*/, '').trim();
		const modelId = MODEL_ID_MAP[displayName];
		if (!modelId) {
			console.warn(`  Unknown model display name: "${displayName}" — skipping`);
			continue;
		}
		models[modelId] = {
			input: parsePrice(match[2]),
			cacheCreate: parsePrice(match[3]), // 5m cache write
			// match[4] = 1h cache write (skip)
			cacheRead: parsePrice(match[5]),
			output: parsePrice(match[6]),
		};
	}

	if (Object.keys(models).length > 0) return models;

	// Strategy 2: Flattened text — look for model name followed by price tokens.
	// Sort display names longest-first so "Claude Opus 4.6" matches before
	// "Claude Opus 4" — prevents prefix collisions in text scanning.
	const displayNames = Object.keys(MODEL_ID_MAP).sort((a, b) => b.length - a.length);

	for (const name of displayNames) {
		const modelId = MODEL_ID_MAP[name];
		if (modelId in models) continue; // Already matched by a longer name

		// Match the display name followed by a word boundary — not immediately
		// followed by a dot+digit (which indicates a longer model like "4.6")
		const namePattern = new RegExp(
			name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
				'(?![.\\d])' + // negative lookahead: not a longer version
				'(?:\\s*\\([^)]*\\))?', // optional "(deprecated)" etc.
			'g',
		);
		let nameMatch;
		while ((nameMatch = namePattern.exec(content)) !== null) {
			// Extract the next 5 price tokens after the model name
			const afterName = content.slice(
				nameMatch.index + nameMatch[0].length,
				nameMatch.index + nameMatch[0].length + 500,
			);
			const prices: number[] = [];
			const localPricePattern = /\$([0-9.]+)\s*\/\s*MTok/g;
			let priceMatch;
			while ((priceMatch = localPricePattern.exec(afterName)) !== null && prices.length < 5) {
				prices.push(parseFloat(priceMatch[1]));
			}

			if (prices.length >= 5) {
				// Column order: Base Input, 5m Cache Write, 1h Cache Write, Cache Hits, Output
				models[modelId] = {
					input: prices[0],
					cacheCreate: prices[1], // 5m cache write
					// prices[2] = 1h cache write (skip)
					cacheRead: prices[3],
					output: prices[4],
				};
				break; // Found this model, move to next
			}
		}
	}

	return models;
}

async function main() {
	console.log('Fetching pricing from Anthropic docs...');
	const content = await fetchPricingPage();

	const fetched = parsePricingTable(content);
	const fetchedCount = Object.keys(fetched).length;

	if (fetchedCount === 0) {
		console.error(
			'ERROR: Parsed zero models from the pricing page.\n' +
				'The page structure may have changed beyond recognition.\n' +
				'Aborting to prevent data loss. Review the page manually and update pricing-data.json.',
		);
		process.exit(1);
	}

	console.log(`Parsed ${fetchedCount} models from pricing page.`);

	// Read existing pricing data
	let existing: PricingData;
	try {
		const raw = await readFile(PRICING_FILE, 'utf-8');
		existing = JSON.parse(raw) as PricingData;
	} catch {
		existing = { lastUpdated: '', models: {} };
	}

	// Merge: fetched models override, existing manual entries are preserved
	const merged: Record<string, ModelPricing> = { ...existing.models };
	const changes: string[] = [];

	for (const [id, pricing] of Object.entries(fetched)) {
		const old = merged[id];
		if (!old) {
			changes.push(`  + ${id} (new)`);
		} else {
			const diffs: string[] = [];
			for (const key of ['input', 'output', 'cacheRead', 'cacheCreate'] as const) {
				if (old[key] !== pricing[key]) {
					diffs.push(`${key}: $${old[key]} → $${pricing[key]}`);
				}
			}
			if (diffs.length > 0) {
				changes.push(`  ~ ${id}: ${diffs.join(', ')}`);
			}
		}
		merged[id] = pricing;
	}

	const updated: PricingData = {
		lastUpdated: new Date().toISOString().split('T')[0],
		models: merged,
	};

	await writeFile(PRICING_FILE, JSON.stringify(updated, null, 2) + '\n');

	if (changes.length === 0) {
		console.log('No changes — pricing data is up to date.');
	} else {
		console.log(`\nChanges:\n${changes.join('\n')}`);
	}

	console.log(`\nWrote ${PRICING_FILE}`);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
