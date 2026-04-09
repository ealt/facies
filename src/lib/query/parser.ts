import type { SessionSummary } from '$lib/types.js';
import { lookupField, fieldNames, type QueryField } from './schema.js';

// =============================================================================
// Types
// =============================================================================

export type Operator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'CONTAINS';
type Combinator = 'AND' | 'OR';

export interface ConditionNode {
	kind: 'condition';
	field: string;
	op: Operator;
	value: string | number | null;
	offset: number;
}

export interface BinaryNode {
	kind: 'binary';
	combinator: Combinator;
	left: QueryNode;
	right: QueryNode;
}

export type QueryNode = ConditionNode | BinaryNode;

export interface ParseSuccess {
	ok: true;
	predicate: (s: SessionSummary) => boolean;
	ast: QueryNode;
}

export interface ParseError {
	ok: false;
	error: string;
	offset: number;
	length: number;
}

export type ParseResult = ParseSuccess | ParseError;

// =============================================================================
// Tokenizer
// =============================================================================

interface Token {
	type: 'field' | 'op' | 'value' | 'combinator' | 'null' | 'lparen' | 'rparen';
	value: string;
	offset: number;
}

const OPERATORS = ['!=', '>=', '<=', '=', '>', '<'];
const COMBINATORS = ['AND', 'OR'];

function tokenize(input: string): Token[] | ParseError {
	const tokens: Token[] = [];
	let i = 0;

	while (i < input.length) {
		// Skip whitespace
		if (/\s/.test(input[i])) {
			i++;
			continue;
		}

		// Parentheses
		if (input[i] === '(') {
			tokens.push({ type: 'lparen', value: '(', offset: i });
			i++;
			continue;
		}
		if (input[i] === ')') {
			tokens.push({ type: 'rparen', value: ')', offset: i });
			i++;
			continue;
		}

		// Operators (check multi-char first)
		const opMatch = OPERATORS.find((op) => input.slice(i, i + op.length) === op);
		if (opMatch) {
			tokens.push({ type: 'op', value: opMatch, offset: i });
			i += opMatch.length;
			continue;
		}

		// Quoted string
		if (input[i] === '"') {
			const start = i;
			i++; // skip opening quote
			let str = '';
			while (i < input.length && input[i] !== '"') {
				if (input[i] === '\\' && i + 1 < input.length) {
					str += input[i + 1];
					i += 2;
				} else {
					str += input[i];
					i++;
				}
			}
			if (i >= input.length) {
				return { ok: false, error: 'Unterminated string', offset: start, length: i - start };
			}
			i++; // skip closing quote
			tokens.push({ type: 'value', value: str, offset: start });
			continue;
		}

		// Word (field name, combinator, CONTAINS, null, or bare value)
		const wordStart = i;
		while (i < input.length && /[^\s()=!<>"']/.test(input[i])) {
			i++;
		}
		if (i === wordStart) {
			return {
				ok: false,
				error: `Unexpected character: ${input[i]}`,
				offset: i,
				length: 1,
			};
		}
		const word = input.slice(wordStart, i);
		const upper = word.toUpperCase();

		if (upper === 'CONTAINS') {
			tokens.push({ type: 'op', value: 'CONTAINS', offset: wordStart });
		} else if (COMBINATORS.includes(upper)) {
			tokens.push({ type: 'combinator', value: upper, offset: wordStart });
		} else if (upper === 'NULL') {
			tokens.push({ type: 'null', value: 'null', offset: wordStart });
		} else {
			// Could be a field name or a bare value — context determines
			tokens.push({ type: 'field', value: word, offset: wordStart });
		}
	}

	return tokens;
}

// =============================================================================
// Value parsing
// =============================================================================

const NUMERIC_SHORTHAND = /^(-?\d+(?:\.\d+)?)(k|m|b)?$/i;
const DURATION_SHORTHAND = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/i;
const RELATIVE_DATE = /^(\d+)(d|w|mo)$/i;

function parseNumericValue(raw: string): number | null {
	const m = raw.match(NUMERIC_SHORTHAND);
	if (!m) return null;
	const base = parseFloat(m[1]);
	const suffix = (m[2] ?? '').toLowerCase();
	if (suffix === 'k') return base * 1_000;
	if (suffix === 'm') return base * 1_000_000;
	if (suffix === 'b') return base * 1_000_000_000;
	return base;
}

function parseDurationMs(raw: string): number | null {
	const m = raw.match(DURATION_SHORTHAND);
	if (!m) return null;
	const base = parseFloat(m[1]);
	const unit = m[2].toLowerCase();
	if (unit === 'ms') return base;
	if (unit === 's') return base * 1_000;
	if (unit === 'm') return base * 60_000;
	if (unit === 'h') return base * 3_600_000;
	if (unit === 'd') return base * 86_400_000;
	return null;
}

function parseRelativeDate(raw: string): number | null {
	const m = raw.match(RELATIVE_DATE);
	if (!m) return null;
	const n = parseInt(m[1], 10);
	const unit = m[2].toLowerCase();
	const now = new Date();
	if (unit === 'd') now.setDate(now.getDate() - n);
	else if (unit === 'w') now.setDate(now.getDate() - n * 7);
	else if (unit === 'mo') now.setMonth(now.getMonth() - n);
	return now.getTime();
}

function resolveValue(
	raw: string,
	field: QueryField,
	offset: number,
): { value: string | number | null } | ParseError {
	if (field.type === 'number') {
		// Try duration first (for 'duration' field), then plain numeric
		const dur = parseDurationMs(raw);
		if (dur !== null) return { value: dur };
		const num = parseNumericValue(raw);
		if (num !== null) return { value: num };
		return { ok: false, error: `Invalid number: "${raw}"`, offset, length: raw.length };
	}
	if (field.type === 'date') {
		// Relative date shorthand — resolves to epoch ms
		const rel = parseRelativeDate(raw);
		if (rel !== null) return { value: rel };
		// Date-only format (YYYY-MM-DD): interpret as local midnight, not UTC
		const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
		if (dateOnly) {
			const [y, m, d] = raw.split('-').map(Number);
			const local = new Date(y, m - 1, d);
			if (!isNaN(local.getTime())) return { value: local.getTime() };
		}
		// Full ISO date string — resolve to epoch ms
		const d = new Date(raw);
		if (!isNaN(d.getTime())) return { value: d.getTime() };
		return {
			ok: false,
			error: `Invalid date: "${raw}". Use ISO format ("2026-04-01") or relative (7d, 2w, 1mo)`,
			offset,
			length: raw.length,
		};
	}
	// string — pass through
	return { value: raw };
}

// =============================================================================
// Parser (recursive descent)
// =============================================================================

class Parser {
	private tokens: Token[];
	private pos = 0;

	constructor(tokens: Token[]) {
		this.tokens = tokens;
	}

	parse(): QueryNode | ParseError {
		const node = this.parseOr();
		if ('ok' in node && !node.ok) return node;
		if (this.pos < this.tokens.length) {
			const t = this.tokens[this.pos];
			return {
				ok: false,
				error: `Unexpected token: "${t.value}"`,
				offset: t.offset,
				length: t.value.length,
			};
		}
		return node as QueryNode;
	}

	private parseOr(): QueryNode | ParseError {
		let left = this.parseAnd();
		if ('ok' in left && !left.ok) return left;

		while (this.pos < this.tokens.length) {
			const t = this.tokens[this.pos];
			if (t.type === 'combinator' && t.value === 'OR') {
				this.pos++;
				const right = this.parseAnd();
				if ('ok' in right && !right.ok) return right;
				left = { kind: 'binary', combinator: 'OR', left: left as QueryNode, right: right as QueryNode };
			} else {
				break;
			}
		}

		return left;
	}

	private parseAnd(): QueryNode | ParseError {
		let left = this.parseAtom();
		if ('ok' in left && !left.ok) return left;

		while (this.pos < this.tokens.length) {
			const t = this.tokens[this.pos];
			if (t.type === 'combinator' && t.value === 'AND') {
				this.pos++;
				const right = this.parseAtom();
				if ('ok' in right && !right.ok) return right;
				left = { kind: 'binary', combinator: 'AND', left: left as QueryNode, right: right as QueryNode };
			} else {
				break;
			}
		}

		return left;
	}

	private parseAtom(): QueryNode | ParseError {
		if (this.pos >= this.tokens.length) {
			const lastOffset =
				this.tokens.length > 0 ? this.tokens[this.tokens.length - 1].offset + this.tokens[this.tokens.length - 1].value.length : 0;
			return { ok: false, error: 'Expected a condition', offset: lastOffset, length: 1 };
		}

		const t = this.tokens[this.pos];

		// Parenthesized expression
		if (t.type === 'lparen') {
			this.pos++;
			const inner = this.parseOr();
			if ('ok' in inner && !inner.ok) return inner;
			if (this.pos >= this.tokens.length || this.tokens[this.pos].type !== 'rparen') {
				const off = this.pos < this.tokens.length ? this.tokens[this.pos].offset : t.offset + 1;
				return { ok: false, error: 'Expected closing ")"', offset: off, length: 1 };
			}
			this.pos++;
			return inner;
		}

		// Condition: field op value
		if (t.type !== 'field') {
			return {
				ok: false,
				error: `Expected field name, got "${t.value}". Valid fields: ${fieldNames().join(', ')}`,
				offset: t.offset,
				length: t.value.length,
			};
		}

		const field = lookupField(t.value);
		if (!field) {
			return {
				ok: false,
				error: `Unknown field: "${t.value}". Valid fields: ${fieldNames().join(', ')}`,
				offset: t.offset,
				length: t.value.length,
			};
		}
		this.pos++;

		// Operator
		if (this.pos >= this.tokens.length || this.tokens[this.pos].type !== 'op') {
			const off = this.pos < this.tokens.length ? this.tokens[this.pos].offset : t.offset + t.value.length;
			return {
				ok: false,
				error: 'Expected operator (=, !=, >, <, >=, <=, CONTAINS)',
				offset: off,
				length: 1,
			};
		}
		const opToken = this.tokens[this.pos];
		const op = opToken.value as Operator;

		// Validate operator for field type
		if (op === 'CONTAINS' && field.type !== 'string') {
			return {
				ok: false,
				error: `CONTAINS only works with string fields, not ${field.type}`,
				offset: opToken.offset,
				length: opToken.value.length,
			};
		}
		this.pos++;

		// Value
		if (this.pos >= this.tokens.length) {
			return {
				ok: false,
				error: 'Expected value after operator',
				offset: opToken.offset + opToken.value.length,
				length: 1,
			};
		}
		const valToken = this.tokens[this.pos];

		// null literal
		if (valToken.type === 'null') {
			this.pos++;
			if (op !== '=' && op !== '!=') {
				return {
					ok: false,
					error: `Only = and != can be used with null`,
					offset: opToken.offset,
					length: opToken.value.length,
				};
			}
			return {
				kind: 'condition',
				field: field.key,
				op,
				value: null,
				offset: t.offset,
			};
		}

		// Resolve the raw value string
		const rawValue = valToken.type === 'value' ? valToken.value : valToken.value;
		this.pos++;

		const resolved = resolveValue(rawValue, field, valToken.offset);
		if ('ok' in resolved && !resolved.ok) return resolved;

		return {
			kind: 'condition',
			field: field.key,
			op,
			value: (resolved as { value: string | number | null }).value,
			offset: t.offset,
		};
	}
}

// =============================================================================
// Compiler (AST → predicate)
// =============================================================================

function compileNode(node: QueryNode): (s: SessionSummary) => boolean {
	if (node.kind === 'binary') {
		const left = compileNode(node.left);
		const right = compileNode(node.right);
		return node.combinator === 'AND'
			? (s) => left(s) && right(s)
			: (s) => left(s) || right(s);
	}

	const field = lookupField(node.field)!;
	const { op, value } = node;

	return (s: SessionSummary) => {
		const actual = field.accessor(s);

		// Null checks
		if (value === null) {
			return op === '=' ? actual === null : actual !== null;
		}
		if (actual === null) {
			return false; // null never matches non-null comparisons
		}

		// Date fields: compare as epoch milliseconds for correct chronological ordering
		if (field.type === 'date') {
			const av = new Date(String(actual)).getTime();
			const bv = value as number; // dates are resolved to epoch ms at parse time
			if (isNaN(av)) return false;
			switch (op) {
				case '=': return av === bv;
				case '!=': return av !== bv;
				case '>': return av > bv;
				case '<': return av < bv;
				case '>=': return av >= bv;
				case '<=': return av <= bv;
				default: return false;
			}
		}

		if (field.type === 'number') {
			const av = actual as number;
			const bv = value as number;
			switch (op) {
				case '=': return av === bv;
				case '!=': return av !== bv;
				case '>': return av > bv;
				case '<': return av < bv;
				case '>=': return av >= bv;
				case '<=': return av <= bv;
				default: return false;
			}
		}

		// String
		const av = String(actual).toLowerCase();
		const bv = String(value).toLowerCase();
		switch (op) {
			case '=': return av === bv;
			case '!=': return av !== bv;
			case '>': return av > bv;
			case '<': return av < bv;
			case '>=': return av >= bv;
			case '<=': return av <= bv;
			case 'CONTAINS': return av.includes(bv);
			default: return false;
		}
	};
}

// =============================================================================
// Public API
// =============================================================================

export function parseQuery(input: string): ParseResult {
	const trimmed = input.trim();
	if (trimmed === '') {
		return {
			ok: true,
			predicate: () => true,
			ast: { kind: 'condition', field: '', op: '=', value: '', offset: 0 },
		};
	}

	// Track leading whitespace so error offsets map back to the original input
	const leadingSpaces = input.length - input.trimStart().length;

	const tokens = tokenize(trimmed);
	if (!Array.isArray(tokens)) {
		// Shift offset back to original input coordinates
		return { ...tokens, offset: tokens.offset + leadingSpaces };
	}

	const parser = new Parser(tokens);
	const ast = parser.parse();
	if ('ok' in ast && !ast.ok) {
		return { ...ast, offset: ast.offset + leadingSpaces };
	}

	const predicate = compileNode(ast as QueryNode);
	return { ok: true, predicate, ast: ast as QueryNode };
}
