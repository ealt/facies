import { describe, it, expect } from 'vitest';
import { parseJsonl } from '$lib/server/jsonl-parser.js';

describe('parseJsonl', () => {
	it('parses valid JSONL', () => {
		const input = '{"a":1}\n{"a":2}\n{"a":3}\n';
		const { records, skippedLines } = parseJsonl<{ a: number }>(input);
		expect(records).toHaveLength(3);
		expect(records[0].a).toBe(1);
		expect(skippedLines).toBe(0);
	});

	it('skips empty lines', () => {
		const input = '{"a":1}\n\n\n{"a":2}\n';
		const { records, skippedLines } = parseJsonl(input);
		expect(records).toHaveLength(2);
		expect(skippedLines).toBe(0);
	});

	it('skips malformed lines and tracks count', () => {
		const input = '{"a":1}\nnot json\n{"a":2}\n{broken\n';
		const { records, skippedLines } = parseJsonl(input);
		expect(records).toHaveLength(2);
		expect(skippedLines).toBe(2);
	});

	it('handles empty input', () => {
		const { records, skippedLines } = parseJsonl('');
		expect(records).toHaveLength(0);
		expect(skippedLines).toBe(0);
	});

	it('handles input with only whitespace lines', () => {
		const { records, skippedLines } = parseJsonl('  \n  \n  ');
		expect(records).toHaveLength(0);
		expect(skippedLines).toBe(0);
	});

	it('trims whitespace around lines', () => {
		const input = '  {"a":1}  \n  {"a":2}  \n';
		const { records, skippedLines } = parseJsonl(input);
		expect(records).toHaveLength(2);
		expect(skippedLines).toBe(0);
	});
});
