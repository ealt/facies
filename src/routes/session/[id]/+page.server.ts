import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { getSessionIndex } from '$lib/server/session-index.js';
import { loadSession } from '$lib/server/session-loader.js';
import { getClaudeDir, getCacheFile } from '$lib/server/config.js';

export const load: PageServerLoad = async ({ params }) => {
	const index = await getSessionIndex(getClaudeDir(), getCacheFile());
	const summary = index.sessions.find((s) => s.sessionId === params.id);

	if (!summary) {
		error(404, `Session not found: ${params.id}`);
	}

	const detail = await loadSession(summary);
	return { detail };
};
