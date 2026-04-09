import type { LayoutServerLoad } from './$types.js';
import { getSessionIndex } from '$lib/server/session-index.js';
import { getClaudeDir, getCacheFile } from '$lib/server/config.js';

export const load: LayoutServerLoad = async () => {
	const index = await getSessionIndex(getClaudeDir(), getCacheFile());
	return { sessions: index.sessions };
};
