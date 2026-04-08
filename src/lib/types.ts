// =============================================================================
// Event Log Types — ~/.claude/logs/{session_id}.jsonl
// =============================================================================

/** Common fields on all hook event log records */
interface BaseEvent {
	timestamp: string;
	event: string;
	session_id: string;
	cwd: string;
	transcript_path: string;
	permission_mode?: string;
}

export interface SessionStartEvent extends BaseEvent {
	event: 'SessionStart';
	source: string;
	model: string;
}

export interface SessionEndEvent extends BaseEvent {
	event: 'SessionEnd';
	reason: string;
}

export interface UserPromptSubmitEvent extends BaseEvent {
	event: 'UserPromptSubmit';
	prompt_length: number;
	slash_command?: string;
}

export interface PreToolUseEvent extends BaseEvent {
	event: 'PreToolUse';
	tool_name: string;
	tool_input_keys: string[];
}

export interface PostToolUseEvent extends BaseEvent {
	event: 'PostToolUse';
	tool_name: string;
	tool_use_id: string;
	tool_input_keys: string[];
	tool_input_size: number;
	tool_response_size: number;
}

export interface PostToolUseFailureEvent extends BaseEvent {
	event: 'PostToolUseFailure';
	tool_name: string;
	tool_use_id: string;
	error: string;
}

export interface PreCompactEvent extends BaseEvent {
	event: 'PreCompact';
	trigger: string;
	input_tokens_before: number;
}

export interface PostCompactEvent extends BaseEvent {
	event: 'PostCompact';
	trigger: string;
	input_tokens_after: number;
	tokens_freed: number;
}

export interface SubagentStartEvent extends BaseEvent {
	event: 'SubagentStart';
	agent_id: string;
	agent_type: string;
}

export interface SubagentStopEvent extends BaseEvent {
	event: 'SubagentStop';
	agent_id: string;
	agent_type: string;
	agent_transcript_path: string;
}

export interface StopEvent extends BaseEvent {
	event: 'Stop';
	stop_hook_active: boolean;
}

export interface TaskCreatedEvent extends BaseEvent {
	event: 'TaskCreated';
	task_id: string;
	task_subject: string;
}

export interface TaskCompletedEvent extends BaseEvent {
	event: 'TaskCompleted';
	task_id: string;
	task_subject: string;
}

export type EventLogRecord =
	| SessionStartEvent
	| SessionEndEvent
	| UserPromptSubmitEvent
	| PreToolUseEvent
	| PostToolUseEvent
	| PostToolUseFailureEvent
	| PreCompactEvent
	| PostCompactEvent
	| SubagentStartEvent
	| SubagentStopEvent
	| StopEvent
	| TaskCreatedEvent
	| TaskCompletedEvent;

// =============================================================================
// Transcript Types — ~/.claude/projects/{project-id}/{session-id}.jsonl
// =============================================================================

/** Token usage from the API response — permissive for forward compatibility */
export interface Usage {
	input_tokens?: number;
	output_tokens?: number;
	cache_creation_input_tokens?: number;
	cache_read_input_tokens?: number;
	service_tier?: string | null;
	inference_geo?: string | null;
	speed?: string | null;
	cache_creation?: Record<string, number>;
	server_tool_use?: Record<string, number>;
	iterations?: unknown[];
	/** Allow unknown fields from future API versions */
	[key: string]: unknown;
}

// -- Content blocks --

export interface TextBlock {
	type: 'text';
	text: string;
}

export interface ThinkingBlock {
	type: 'thinking';
	thinking: string;
	signature: string;
}

export interface ToolUseBlock {
	type: 'tool_use';
	id: string;
	name: string;
	input: Record<string, unknown>;
	caller?: { type: string };
}

export interface ToolResultBlock {
	type: 'tool_result';
	tool_use_id: string;
	content: string;
	is_error?: boolean;
}

export type AssistantContentBlock = TextBlock | ThinkingBlock | ToolUseBlock;
export type UserContentBlock = TextBlock | ToolResultBlock;

// -- Messages --

export interface AssistantMessage {
	model: string;
	id: string;
	type: 'message';
	role: 'assistant';
	content: AssistantContentBlock[];
	stop_reason: string | null;
	stop_sequence: string | null;
	usage: Usage;
	/** Allow unknown fields from future API versions */
	[key: string]: unknown;
}

export interface UserMessageString {
	role: 'user';
	content: string;
	/** Allow unknown fields */
	[key: string]: unknown;
}

export interface UserMessageBlocks {
	role: 'user';
	content: UserContentBlock[];
	/** Allow unknown fields */
	[key: string]: unknown;
}

export type UserMessage = UserMessageString | UserMessageBlocks;

// -- Structured toolUseResult --

export interface ToolUseResultFile {
	filePath: string;
	content: string;
	numLines: number;
	startLine: number;
	totalLines: number;
}

export interface ToolUseResultTextFile {
	type: 'text';
	file: ToolUseResultFile;
}

export type StructuredToolUseResult = ToolUseResultTextFile;

// -- Transcript records (tagged union on `type`) --

/** Common envelope fields on most transcript records */
interface BaseTranscriptRecord {
	parentUuid: string | null;
	isSidechain: boolean;
	uuid: string;
	timestamp: string;
	userType?: string;
	cwd?: string;
	sessionId?: string;
	version?: string;
	gitBranch?: string;
	slug?: string;
	agentId?: string;
	requestId?: string;
	sourceToolAssistantUUID?: string;
}

export interface UserRecord extends BaseTranscriptRecord {
	type: 'user';
	message: UserMessage;
	planContent?: string;
	toolUseResult?: string | StructuredToolUseResult | Record<string, unknown>;
	promptId?: string;
	isVisibleInTranscriptOnly?: boolean;
	isCompactSummary?: boolean;
	permissionMode?: string;
	entrypoint?: string;
}

export interface AssistantRecord extends BaseTranscriptRecord {
	type: 'assistant';
	message: AssistantMessage;
}

export interface SystemRecord extends BaseTranscriptRecord {
	type: 'system';
	subtype: 'turn_duration' | 'compact_boundary' | 'api_error' | string;
	content?: string;
	isMeta?: boolean;
	level?: string;
	// turn_duration fields
	durationMs?: number;
	messageCount?: number;
	// compact_boundary fields
	compactMetadata?: {
		trigger: string;
		preTokens: number;
		preCompactDiscoveredTools?: string[];
	};
	// api_error fields
	apiError?: {
		message: string;
		retryInMs?: number;
	};
	// For forward compatibility with new subtypes
	logicalParentUuid?: string;
}

export interface ProgressRecord extends BaseTranscriptRecord {
	type: 'progress';
	data: {
		type: string;
		hookEvent?: string;
		hookName?: string;
		command?: string;
		[key: string]: unknown;
	};
	parentToolUseID?: string;
	toolUseID?: string;
}

export interface FileHistorySnapshotRecord {
	type: 'file-history-snapshot';
	messageId: string;
	snapshot: {
		messageId: string;
		trackedFileBackups: Record<string, unknown>;
		timestamp?: string;
	};
	isSnapshotUpdate: boolean;
}

export interface PermissionModeRecord {
	type: 'permission-mode';
	[key: string]: unknown;
}

export interface CustomTitleRecord {
	type: 'custom-title';
	title: string;
	[key: string]: unknown;
}

export interface AgentNameRecord {
	type: 'agent-name';
	name: string;
	[key: string]: unknown;
}

/** Records we parse but largely ignore */
export interface IgnoredRecord {
	type: 'queue-operation' | 'last-prompt' | 'attachment';
	[key: string]: unknown;
}

export type TranscriptRecord =
	| UserRecord
	| AssistantRecord
	| SystemRecord
	| ProgressRecord
	| FileHistorySnapshotRecord
	| PermissionModeRecord
	| CustomTitleRecord
	| AgentNameRecord
	| IgnoredRecord;

// =============================================================================
// Subagent Metadata — {session-id}/subagents/agent-{id}.meta.json
// =============================================================================

export interface SubagentMeta {
	agentType: string;
	description: string;
}

// =============================================================================
// Diagnostics — ~/.claude/logs/_diagnostics.jsonl
// =============================================================================

export interface DiagnosticEvent {
	timestamp: string;
	session_id: string;
	transcript_path: string;
	type: string;
	detail: string;
	version?: string;
}

// =============================================================================
// Normalized / Processed Types — used by analysis + UI layers
// =============================================================================

/** An API call group: streaming chunks deduplicated by message.id */
export interface ApiCallGroup {
	/** API message ID — the dedup key (unique per API call). Null when message.id was missing and a fallback key was used. */
	messageId: string | null;
	/** Turn-level request ID (shared across API calls in a tool-use loop). Null when requestId was absent on the source record. */
	requestId: string | null;
	model: string;
	timestamp: string;
	usage: Usage;
	contentBlocks: AssistantContentBlock[];
	stopReason: string | null;
	/** True if this was a synthetic/placeholder record */
	isSynthetic: boolean;
}

/** Normalized tool result — unified from tool_result blocks + toolUseResult */
export interface NormalizedToolResult {
	toolUseId: string;
	toolName: string;
	content: string;
	isError: boolean;
	/** Present when toolUseResult is a structured file read */
	sourceFile?: {
		filePath: string;
		numLines: number;
		startLine: number;
		totalLines: number;
	};
}

/** Tool call with correlated pre/post events + transcript data */
export interface ToolCall {
	toolUseId: string;
	toolName: string;
	timestamp: string;
	/** Timestamp of the PostToolUse/PostToolUseFailure event (completion time). */
	endTimestamp?: string;
	inputKeys: string[];
	inputSize: number;
	responseSize: number;
	latencyMs: number | null; // null if pairing is ambiguous
	failed: boolean;
	error?: string;
	/** Short preview of the tool input (e.g. Bash command, file path). Populated from transcript tool_use blocks. */
	inputPreview?: string;
}

/** Compaction event — from compact_boundary system records */
export interface CompactionEvent {
	timestamp: string;
	trigger: string;
	preTokens: number;
	/** Inferred from next API call — labeled as heuristic */
	postTokens: number | null;
	tokensFreed: number | null;
	/** Turns that occurred before this compaction */
	turnsBefore: number;
	/** Cache hit rate of the API call immediately before compaction */
	cacheRateBefore: number | null;
	/** Cache hit rate of the API call immediately after compaction */
	cacheRateAfter: number | null;
	/** Number of turns until cache rate recovers above 80% */
	recoveryTurns: number | null;
	/** Milliseconds from session start to this compaction */
	elapsedMs: number | null;
	/** Cost of the first API call after compaction (null if no post-compaction call) */
	firstPostCompactionCost: number | null;
	/** Average cost of API calls in the segment before this compaction */
	avgPreCompactionCost: number | null;
}

/** Categories for context window decomposition */
export type ContextCategory =
	| 'system'
	| 'user'
	| 'assistant_text'
	| 'assistant_thinking'
	| 'tool_results'
	| 'subagent_overhead'
	| 'compacted_summary';

/** A snapshot of context composition at a single API call */
export interface ContextSnapshot {
	apiCallIndex: number;
	timestamp: string;
	totalTokens: number; // authoritative
	/** Estimated per-category breakdown (sums to totalTokens) */
	categories: Record<ContextCategory, number>;
	/** True if this is a heuristic decomposition */
	isEstimated: boolean;
}

/** A row in the "Network tab" context timeline table */
export interface ContextTimelineEntry {
	timestamp: string;
	type: ContextCategory;
	description: string;
	estimatedTokens: number;
	cumulativeTokens: number;
	/** Which API call this content is part of the input to. */
	apiCallIndex?: number;
}

// =============================================================================
// Subagent Analysis
// =============================================================================

export interface SubagentSummary {
	agentId: string;
	agentType: string;
	description: string;
	startTime: string;
	endTime: string | null;
	durationMs: number | null;
	internalToolCalls: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCost: number | null;
	/** True if any API call used an unknown model — cost is a lower bound */
	costIsLowerBound: boolean;
	/** The final output returned to the main session */
	lastAssistantMessage: string | null;
	/** How many tokens the subagent's result added to main context */
	contextOverheadTokens: number | null;
}

// =============================================================================
// Session — the fully parsed + analyzed result for a single session
// =============================================================================

export interface ParsedSession {
	sessionId: string;
	project: string;
	title: string | null;
	model: string;
	startTime: string;
	endTime: string | null;
	durationMs: number;
	isInterrupted: boolean;
	permissionModes: string[];
	skippedLines: number;

	// Raw parsed data
	events: EventLogRecord[];
	transcriptRecords: TranscriptRecord[];

	// Processed data
	apiCalls: ApiCallGroup[];
	toolCalls: ToolCall[];
	toolResults: NormalizedToolResult[];
	compactions: CompactionEvent[];
	subagents: SubagentSummary[];

	// Token economics
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCacheReadTokens: number;
	totalCacheCreateTokens: number;
	totalCost: number | null;
	costIsLowerBound: boolean;
	cacheHitRate: number;

	// Context decomposition
	contextSnapshots: ContextSnapshot[];
	contextTimeline: ContextTimelineEntry[];
}

// =============================================================================
// Session Index Cache — .cache/session-index.json
// =============================================================================

export interface SessionIndex {
	version: number;
	lastUpdated: string;
	sessions: SessionSummary[];
}

export interface SessionSummary {
	sessionId: string;
	project: string;
	title: string | null;
	model: string;
	startTime: string;
	endTime: string | null;
	durationMs: number;
	turns: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCost: number | null;
	costIsLowerBound: boolean;
	compactionCount: number;
	toolCallCount: number;
	subagentCount: number;
	skippedLines: number;
	// Source file metadata for staleness detection
	eventLogPath: string;
	eventLogMtime: number;
	transcriptPath: string;
	transcriptMtime: number;
	subagentMtimes: Record<string, number>;
}

// =============================================================================
// Pricing
// =============================================================================

export interface ModelPricing {
	/** Cost per 1M input tokens (uncached) */
	input: number;
	/** Cost per 1M output tokens */
	output: number;
	/** Cost per 1M cache read tokens */
	cacheRead: number;
	/** Cost per 1M cache creation tokens */
	cacheCreate: number;
}

export interface PricingData {
	lastUpdated: string;
	models: Record<string, ModelPricing>;
}
