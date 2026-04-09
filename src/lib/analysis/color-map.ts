import * as d3 from 'd3';

const PALETTE = d3.schemeTableau10;

export function buildProjectColorMap(projects: string[]): Map<string, string> {
	const sorted = [...projects].sort();
	const map = new Map<string, string>();
	for (let i = 0; i < sorted.length; i++) {
		map.set(sorted[i], PALETTE[i % PALETTE.length]);
	}
	return map;
}
