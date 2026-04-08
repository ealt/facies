import { json } from '@sveltejs/kit';
import { getSessionIndex } from '$lib/server/session-index.js';
import { getClaudeDir, getCacheFile } from '$lib/server/config.js';

export async function GET() {
	const index = await getSessionIndex(getClaudeDir(), getCacheFile());
	return json(index);
}
