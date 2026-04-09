# Claude JSONL Session Logs: Structure and Schema

This document describes the structure of two related
Claude log file types observed under:

```text
~/.claude/projects/
```

Specifically:

- **Main session logs**

  ```text
  ~/.claude/projects/<project-id>/<session-id>.jsonl
  ```

- **Subagent logs**

  ```text
  ~/.claude/projects/<project-id>/<session-id>/subagents/<subagent-file>.jsonl
  ```

Both formats use **JSON Lines (JSONL)**: each line is
an independent JSON object representing an event in a
session.

---

## 1. File Path Structure

## 1.1 Main Session Log

```text
~/.claude/projects/<project-id>/<session-id>.jsonl
```

- `<project-id>`: slug identifying the project
- `<session-id>`: UUID identifying a Claude session
- Contains the **primary conversation + tool execution history**

Example:

```text
~/.claude/projects/-garth-sandbox/427a1b3e-801e-4d9a-9cad-d2ef0d7e0b95.jsonl
```

---

## 1.2 Subagent Log

```text
~/.claude/projects/<project-id>/<session-id>/subagents/<subagent-id>.jsonl
```

- Nested under a session
- `<subagent-id>`: UUID for a spawned sub-agent
- Represents **tool-driven or delegated execution flows**

Example:

```text
~/.claude/projects/-garth-sandbox/4f1470b3-03cb-4f86-b5c9-3f55d4752f26/subagents/agent-a3371c6a3939b18b4.jsonl
```

---

## 1.3 Key Differences

| Feature         | Main Session Log | Subagent Log                 |
| --------------- | ---------------- | ---------------------------- |
| Location        | Top-level        | Nested                       |
| `agentId` field | Usually absent   | Present                      |
| Scope           | User session     | Tool/subagent execution      |
| Event types     | All              | Subset (mostly tool-related) |

---

## 2. High-Level Data Model

Each line in the JSONL file is an **event record**.

The logs form a **DAG (directed acyclic graph)** via:

- `uuid`: unique identifier for the event
- `parentUuid`: pointer to the parent event

---

## 2.1 Record Type Union

```ts
type JsonlRecord =
  | FileHistorySnapshotRecord
  | UserRecord
  | AssistantRecord
  | ProgressRecord;
```

---

## 3. Common Envelope

Most records share a common set of metadata:

```ts
type BaseRecord = {
  parentUuid: string | null;
  isSidechain: boolean;
  userType: string;        // typically "external"

  cwd: string;
  sessionId: string;
  version: string;
  gitBranch: string;
  slug: string;

  type: string;            // discriminator
  uuid?: string;

  timestamp: string;       // ISO-8601
};
```

---

## 3.1 Optional Fields

These appear inconsistently:

```ts
type OptionalFields = {
  agentId?: string;              // present in subagent logs
  requestId?: string;

  sourceToolAssistantUUID?: string;

  toolUseResult?: string | object;
};
```

---

## 4. Record Types

---

## 4.1 User Records

```ts
type UserRecord = BaseRecord & OptionalFields & {
  type: "user";
  message: UserMessage;
  planContent?: string;
};
```

### Variants

### 4.1.1 Simple Text

```ts
{
  role: "user";
  content: string;
}
```

---

### 4.1.2 Structured Content

```ts
{
  role: "user";
  content: [
    {
      type: "text";
      text: string;
    }
  ];
}
```

---

### 4.1.3 Tool Result Wrapper

Used to return tool outputs into the conversation:

```ts
{
  role: "user";
  content: [
    {
      tool_use_id: string;
      type: "tool_result";
      content: string;
      is_error?: boolean;
    }
  ];
}
```

---

### 4.1.4 `toolUseResult` Field

Top-level field (not inside `message`):

```ts
toolUseResult?:
  | string
  | {
      type: "text";
      file: {
        filePath: string;
        content: string;
        numLines: number;
        startLine: number;
        totalLines: number;
      };
    };
```

---

## 4.2 Assistant Records

```ts
type AssistantRecord = BaseRecord & OptionalFields & {
  type: "assistant";
  message: AssistantMessage;
};
```

---

### 4.2.1 Assistant Message Envelope

```ts
type AssistantMessage = {
  model: string;
  id: string;

  type: "message";
  role: "assistant";

  content: AssistantContentBlock[];

  stop_reason: string | null;
  stop_sequence: string | null;

  usage: Usage;
};
```

---

### 4.2.2 Content Block Types

#### Text

```ts
{
  type: "text";
  text: string;
}
```

---

#### Tool Use

```ts
{
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
  caller?: object;
}
```

---

#### Thinking (extended reasoning)

```ts
{
  type: "thinking";
  thinking: string;
  signature: string;
}
```

---

## 4.3 Progress Records

```ts
type ProgressRecord = BaseRecord & {
  type: "progress";

  data: {
    type: string;       // e.g. "hook_progress"
    hookEvent?: string;
    hookName?: string;
    command?: string;
    [k: string]: unknown;
  };

  parentToolUseID?: string;
  toolUseID?: string;
};
```

These represent **tool lifecycle events**, e.g.:

- `PostToolUse`
- `PostToolUse:Read`

---

## 4.4 File History Snapshot Records

Present only in main session logs.

```ts
type FileHistorySnapshotRecord = {
  type: "file-history-snapshot";

  messageId: string;

  snapshot: {
    messageId: string;
    trackedFileBackups: Record<string, unknown>;
    timestamp: string;
  };

  isSnapshotUpdate: boolean;
};
```

Notably:

- Does **not follow the full BaseRecord schema**
- Represents file tracking state

---

## 5. Usage Object

```ts
type Usage = {
  input_tokens?: number;
  output_tokens?: number;

  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;

  service_tier?: string;
  inference_geo?: string;
  speed?: string;

  cache_creation?: Record<string, number>;
  server_tool_use?: Record<string, number>;
  iterations?: unknown[];

  [k: string]: unknown;
};
```

### Notes

- Highly **extensible**
- Varies across models and runtime
- Do **not treat as fixed schema**

---

## 6. Execution Model

The logs encode a **tool-augmented conversational DAG**:

- Nodes = records
- Edges = `parentUuid`
- Tool execution pattern:

```text
assistant (tool_use)
   ↓
progress (tool start / hooks)
   ↓
user (tool_result)
   ↓
assistant (response)
```

---

## 7. Key Observations

## Shared Across Both Logs

- Same core event model
- Same assistant message structure
- Same tool invocation pattern
- Same DAG linking via UUIDs

---

## Differences

| Feature                  | Main Session   | Subagent            |
| ------------------------ | -------------- | ------------------- |
| `agentId`                | Usually absent | Present             |
| `file-history-snapshot`  | Present        | Absent              |
| Scope                    | Full session   | Delegated execution |
| `toolUseResult` richness | Higher         | Lower               |

---

## Important Design Insight

This is not a single rigid schema.

Instead:

> **The log format is a tagged union of event types with extensible payloads.**

You should model it as:

- Union types (not a flat schema)
- Open-ended objects (forward-compatible)

---

## 8. Practical Recommendations

If building a parser:

### Do

- Use `type` as the primary discriminator
- Allow unknown fields (`additionalProperties: true`)
- Treat `usage` as opaque
- Support both string and structured `content`

### Do NOT

- Assume fixed assistant content types
- Assume `toolUseResult` is always a string
- Assume all records share identical fields

---

## 9. Minimal Mental Model

You can think of the system as:

```text
Conversation DAG
  ├── user messages
  ├── assistant responses
  ├── tool invocations
  ├── tool results (as synthetic user messages)
  └── execution progress events
```

With optional:

```text
+ file tracking snapshots
+ subagent execution branches
```

## Claude JSONL Logs: Parsing, Storage, and Graph Reconstruction

This appendix describes a practical implementation strategy for Claude JSONL
session logs and subagent logs.

It covers:

1. Pydantic model set for Python parsing
2. Normalized relational schema for SQL storage
3. Graph reconstruction algorithm for execution tracing
4. Practical progression and best use cases

---

## 1. Practical progression

A good implementation order is:

### Phase 1: Parse with Pydantic

Use Pydantic to ingest JSONL safely and normalize polymorphic records into typed
Python objects.

Use this when you need:

- validation
- structured parsing
- ETL
- reproducible downstream analysis

### Phase 2: Store in SQL

After parsing, load records into a normalized relational schema.

Use this when you need:

- filtering across many sessions
- joins
- analytics
- dashboards
- incident review

### Phase 3: Reconstruct graphs

Build execution DAGs from normalized records.

Use this when you need:

- session replay
- tool lifecycle tracing
- orphan detection
- branch/subagent visualization
- causal flow analysis

---

## 2. Best use cases

### Pydantic model set

Best for:

- Python scripts
- ingestion pipelines
- validation
- schema exploration
- exporting typed objects to parquet or SQL

### Relational schema

Best for:

- querying many logs at once
- finding failures and anomalies
- reporting and dashboards
- comparing sessions/subagents over time

### Graph reconstruction

Best for:

- execution tracing
- DAG visualization
- reconstructing tool chains
- investigating interrupted flows
- understanding branching and delegation

---

## 3. Pydantic model set

The logs are best modeled as a tagged union over `type`, with permissive extras.

### Design principles

- Use `type` as the primary discriminator
- Allow extra fields because the format is extensible
- Treat nested `message.content` as polymorphic
- Preserve raw payloads where helpful
- Do not over-constrain `usage`

### Example Pydantic v2 model set

```python
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Union, Annotated

from pydantic import BaseModel, ConfigDict, Field


class PermissiveModel(BaseModel):
    model_config = ConfigDict(extra="allow")


# ---------------------------------------------------------------------
# Shared payloads
# ---------------------------------------------------------------------

class Usage(PermissiveModel):
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    cache_creation_input_tokens: Optional[int] = None
    cache_read_input_tokens: Optional[int] = None
    service_tier: Optional[str] = None
    inference_geo: Optional[str] = None
    speed: Optional[str] = None
    cache_creation: Optional[Dict[str, Any]] = None
    server_tool_use: Optional[Dict[str, Any]] = None
    iterations: Optional[List[Any]] = None


class Caller(PermissiveModel):
    type: Optional[str] = None


# ---------------------------------------------------------------------
# User content blocks
# ---------------------------------------------------------------------

class UserTextBlock(PermissiveModel):
    type: Literal["text"]
    text: str


class ToolResultBlock(PermissiveModel):
    tool_use_id: str
    type: Literal["tool_result"]
    content: str
    is_error: Optional[bool] = None


UserContentBlock = Annotated[
    Union[UserTextBlock, ToolResultBlock],
    Field(discriminator="type"),
]


# ---------------------------------------------------------------------
# Assistant content blocks
# ---------------------------------------------------------------------

class AssistantTextBlock(PermissiveModel):
    type: Literal["text"]
    text: str


class AssistantToolUseBlock(PermissiveModel):
    type: Literal["tool_use"]
    id: str
    name: str
    input: Dict[str, Any]
    caller: Optional[Caller] = None


class AssistantThinkingBlock(PermissiveModel):
    type: Literal["thinking"]
    thinking: str
    signature: str


AssistantContentBlock = Annotated[
    Union[AssistantTextBlock, AssistantToolUseBlock, AssistantThinkingBlock],
    Field(discriminator="type"),
]


# ---------------------------------------------------------------------
# Message envelopes
# ---------------------------------------------------------------------

class UserMessageString(PermissiveModel):
    role: Literal["user"]
    content: str


class UserMessageBlocks(PermissiveModel):
    role: Literal["user"]
    content: List[UserContentBlock]


UserMessage = Union[UserMessageString, UserMessageBlocks]


class AssistantMessage(PermissiveModel):
    model: str
    id: str
    type: Literal["message"]
    role: Literal["assistant"]
    content: List[AssistantContentBlock]
    stop_reason: Optional[str] = None
    stop_sequence: Optional[str] = None
    usage: Usage


# ---------------------------------------------------------------------
# Structured toolUseResult payloads
# ---------------------------------------------------------------------

class ToolUseResultFile(PermissiveModel):
    filePath: str
    content: str
    numLines: int
    startLine: int
    totalLines: int


class ToolUseResultTextFile(PermissiveModel):
    type: Literal["text"]
    file: ToolUseResultFile


StructuredToolUseResult = ToolUseResultTextFile


# ---------------------------------------------------------------------
# Base record
# ---------------------------------------------------------------------

class BaseEvent(PermissiveModel):
    parentUuid: Optional[str] = None
    isSidechain: Optional[bool] = None
    userType: Optional[str] = None
    cwd: Optional[str] = None
    sessionId: Optional[str] = None
    version: Optional[str] = None
    gitBranch: Optional[str] = None
    slug: Optional[str] = None
    uuid: Optional[str] = None
    timestamp: Optional[datetime] = None

    agentId: Optional[str] = None
    requestId: Optional[str] = None
    sourceToolAssistantUUID: Optional[str] = None
    toolUseResult: Optional[Union[str, StructuredToolUseResult, Dict[str, Any]]] = None


# ---------------------------------------------------------------------
# Event records
# ---------------------------------------------------------------------

class UserRecord(BaseEvent):
    type: Literal["user"]
    message: UserMessage
    planContent: Optional[str] = None


class AssistantRecord(BaseEvent):
    type: Literal["assistant"]
    message: AssistantMessage


class ProgressData(PermissiveModel):
    type: str
    hookEvent: Optional[str] = None
    hookName: Optional[str] = None
    command: Optional[str] = None


class ProgressRecord(BaseEvent):
    type: Literal["progress"]
    data: ProgressData
    parentToolUseID: Optional[str] = None
    toolUseID: Optional[str] = None


class FileHistorySnapshot(PermissiveModel):
    messageId: str
    trackedFileBackups: Dict[str, Any]
    timestamp: datetime


class FileHistorySnapshotRecord(PermissiveModel):
    type: Literal["file-history-snapshot"]
    messageId: str
    snapshot: FileHistorySnapshot
    isSnapshotUpdate: bool


JsonlRecord = Annotated[
    Union[
        UserRecord,
        AssistantRecord,
        ProgressRecord,
        FileHistorySnapshotRecord,
    ],
    Field(discriminator="type"),
]
```

### Parsing JSONL

```python
import json
from pathlib import Path
from typing import Iterator

def iter_records(path: str | Path) -> Iterator[JsonlRecord]:
    path = Path(path)
    with path.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            raw = json.loads(line)
            try:
                yield JsonlRecord.model_validate(raw)
            except Exception as e:
                raise ValueError(f"{path}:{line_no}: {e}") from e
```

---

## 4. Normalized relational schema

The relational schema should preserve both:

- normalized searchable fields
- raw JSON for forward compatibility

### Schema design principles

- one master `events` table
- subtype tables for polymorphic records
- one row per content block where useful
- retain raw JSON blob
- index identifiers used for reconstruction

### Recommended tables

#### `log_files`

One row per physical JSONL file.

```sql
CREATE TABLE log_files (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    project_slug TEXT,
    session_id TEXT,
    is_subagent_log BOOLEAN NOT NULL DEFAULT 0,
    parent_session_id TEXT,
    subagent_name TEXT,
    discovered_at TEXT NOT NULL
);
```

#### `events`

One row per JSONL record.

```sql
CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    log_file_id INTEGER NOT NULL REFERENCES log_files(id),

    type TEXT NOT NULL,
    uuid TEXT,
    parent_uuid TEXT,

    timestamp TEXT,
    session_id TEXT,
    agent_id TEXT,
    request_id TEXT,

    is_sidechain BOOLEAN,
    user_type TEXT,
    cwd TEXT,
    version TEXT,
    git_branch TEXT,
    slug TEXT,

    source_tool_assistant_uuid TEXT,
    parent_tool_use_id TEXT,
    tool_use_id TEXT,

    raw_json TEXT NOT NULL
);

CREATE INDEX idx_events_uuid ON events(uuid);
CREATE INDEX idx_events_parent_uuid ON events(parent_uuid);
CREATE INDEX idx_events_session_id ON events(session_id);
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_tool_use_id ON events(tool_use_id);
CREATE INDEX idx_events_parent_tool_use_id ON events(parent_tool_use_id);
```

#### `user_messages`

```sql
CREATE TABLE user_messages (
    event_id INTEGER PRIMARY KEY REFERENCES events(id),
    role TEXT NOT NULL,
    content_kind TEXT NOT NULL   -- 'string' or 'blocks'
);
```

#### `assistant_messages`

```sql
CREATE TABLE assistant_messages (
    event_id INTEGER PRIMARY KEY REFERENCES events(id),
    model TEXT NOT NULL,
    message_id TEXT NOT NULL,
    role TEXT NOT NULL,
    stop_reason TEXT,
    stop_sequence TEXT,
    usage_json TEXT
);
```

#### `content_blocks`

For both user and assistant block payloads.

```sql
CREATE TABLE content_blocks (
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id),
    ordinal INTEGER NOT NULL,
    owner_role TEXT NOT NULL,        -- 'user' or 'assistant'
    block_type TEXT NOT NULL,        -- text, tool_use, tool_result, thinking

    text_value TEXT,
    tool_use_id TEXT,
    tool_name TEXT,
    tool_input_json TEXT,
    thinking_text TEXT,
    signature TEXT,
    is_error BOOLEAN,

    raw_json TEXT NOT NULL
);

CREATE INDEX idx_content_blocks_event_id ON content_blocks(event_id);
CREATE INDEX idx_content_blocks_tool_use_id ON content_blocks(tool_use_id);
CREATE INDEX idx_content_blocks_block_type ON content_blocks(block_type);
```

#### `tool_use_results`

Optional convenience table for top-level `toolUseResult`.

```sql
CREATE TABLE tool_use_results (
    event_id INTEGER PRIMARY KEY REFERENCES events(id),
    result_kind TEXT NOT NULL,       -- 'string', 'text_file', 'other'
    result_text TEXT,

    file_path TEXT,
    file_content TEXT,
    file_num_lines INTEGER,
    file_start_line INTEGER,
    file_total_lines INTEGER,

    raw_json TEXT
);
```

#### `progress_events`

```sql
CREATE TABLE progress_events (
    event_id INTEGER PRIMARY KEY REFERENCES events(id),
    data_type TEXT NOT NULL,
    hook_event TEXT,
    hook_name TEXT,
    command TEXT
);
```

#### `file_history_snapshots`

```sql
CREATE TABLE file_history_snapshots (
    event_id INTEGER PRIMARY KEY REFERENCES events(id),
    message_id TEXT NOT NULL,
    snapshot_message_id TEXT NOT NULL,
    tracked_file_backups_json TEXT NOT NULL,
    is_snapshot_update BOOLEAN NOT NULL,
    snapshot_timestamp TEXT NOT NULL
);
```

### Why this schema works

It supports:

- fast queries over all events
- subtype-specific fields without JSON extraction everywhere
- raw preservation for unknown future fields
- graph reconstruction using indexed identifiers

---

## 5. Graph reconstruction algorithm

The logs encode a DAG plus tool-lifecycle side links.

### Edge types

#### A. Structural parent edge

Primary conversation graph:

- child `uuid` → `parentUuid`

#### B. Tool lifecycle edge

Connect tool activity across different record types:

- assistant `tool_use.id`
- user tool result `tool_use_id`
- progress `toolUseID`
- progress `parentToolUseID`
- user `sourceToolAssistantUUID`

### Graph node model

```python
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

@dataclass
class GraphNode:
    key: str
    event_type: str
    uuid: Optional[str]
    parent_uuid: Optional[str]
    timestamp: Optional[str]
    payload: Dict[str, Any] = field(default_factory=dict)

    structural_parents: List[str] = field(default_factory=list)
    structural_children: List[str] = field(default_factory=list)

    tool_links: List[str] = field(default_factory=list)
```

### Reconstruction pseudocode

```python
def build_graph(records):
    nodes_by_uuid = {}
    synthetic_nodes = []
    tool_use_to_nodes = {}

    # Pass 1: materialize nodes
    for rec in records:
        node_key = rec.uuid or f"{rec.type}:{id(rec)}"
        node = GraphNode(
            key=node_key,
            event_type=rec.type,
            uuid=getattr(rec, "uuid", None),
            parent_uuid=getattr(rec, "parentUuid", None),
            timestamp=str(getattr(rec, "timestamp", None)),
            payload=rec.model_dump(mode="python"),
        )

        if rec.uuid:
            nodes_by_uuid[rec.uuid] = node
        else:
            synthetic_nodes.append(node)

        # collect tool ids
        if rec.type == "assistant":
            for block in rec.message.content:
                if getattr(block, "type", None) == "tool_use":
                    tool_use_to_nodes.setdefault(block.id, []).append(node.key)

        elif rec.type == "user":
            msg = rec.message
            if hasattr(msg, "content") and isinstance(msg.content, list):
                for block in msg.content:
                    if getattr(block, "type", None) == "tool_result":
                        tool_use_to_nodes.setdefault(block.tool_use_id, []).append(node.key)

        elif rec.type == "progress":
            if rec.toolUseID:
                tool_use_to_nodes.setdefault(rec.toolUseID, []).append(node.key)
            if rec.parentToolUseID:
                tool_use_to_nodes.setdefault(rec.parentToolUseID, []).append(node.key)

    # convenience lookup
    all_nodes = {n.key: n for n in list(nodes_by_uuid.values()) + synthetic_nodes}

    # Pass 2: structural edges
    for node in all_nodes.values():
        if node.parent_uuid and node.parent_uuid in nodes_by_uuid:
            parent = nodes_by_uuid[node.parent_uuid]
            node.structural_parents.append(parent.key)
            parent.structural_children.append(node.key)

    # Pass 3: tool lifecycle edges
    for tool_id, node_keys in tool_use_to_nodes.items():
        node_keys = list(dict.fromkeys(node_keys))  # stable dedupe
        for src in node_keys:
            for dst in node_keys:
                if src != dst:
                    all_nodes[src].tool_links.append(dst)

    return all_nodes
```

---

## 6. Practical graph analysis tasks

Once reconstructed, you can compute:

### Root events

Events with no structural parent.

Useful for:

- identifying session starts
- finding orphaned branches

### Tool chains

Assistant tool invocation → progress hooks → tool result → assistant follow-up.

Useful for:

- latency measurement
- tool failure analysis
- interrupt detection

### Subagent branches

Group nodes by:

- `sessionId`
- `agentId`
- physical log file path

Useful for:

- comparing main-session vs subagent behavior
- understanding delegated execution

### Orphan detection

Look for:

- `parentUuid` with no matching node
- `tool_use_id` with no matching tool invocation
- progress records with missing surrounding events

Useful for:

- log corruption detection
- truncated-session analysis

---

## 7. Example analytical queries

### SQL: all tool errors

```sql
SELECT e.timestamp, e.session_id, cb.tool_use_id, cb.text_value
FROM content_blocks cb
JOIN events e ON e.id = cb.event_id
WHERE cb.block_type = 'tool_result'
  AND cb.is_error = 1
ORDER BY e.timestamp;
```

### SQL: assistant tool invocations by model

```sql
SELECT am.model, cb.tool_name, COUNT(*) AS n
FROM content_blocks cb
JOIN assistant_messages am ON am.event_id = cb.event_id
WHERE cb.block_type = 'tool_use'
GROUP BY am.model, cb.tool_name
ORDER BY n DESC;
```

### SQL: snapshot records in main session logs

```sql
SELECT lf.path, e.timestamp, fhs.message_id, fhs.is_snapshot_update
FROM file_history_snapshots fhs
JOIN events e ON e.id = fhs.event_id
JOIN log_files lf ON lf.id = e.log_file_id
ORDER BY e.timestamp;
```

---

## 8. Recommended implementation notes

### Keep raw JSON

Always store the original JSON line. The schema is clearly evolving.

### Be permissive

Unknown fields should not break ingestion.

### Normalize only high-value structures

Good candidates:

- content blocks
- tool results
- progress data
- snapshots

### Use both SQL and graph representations

SQL is best for reporting.
Graphs are best for replay and causal tracing.

---

## 9. Suggested project layout

```text
claude_logs/
├── models.py          # Pydantic models
├── ingest.py          # JSONL reader and validator
├── normalize.py       # mapping parsed objects -> SQL rows
├── schema.sql         # relational schema
├── graph.py           # DAG reconstruction
├── queries.sql        # common analyses
└── notebooks/         # exploratory analysis
```

---

## 10. Summary

### Best first step

Pydantic parser.

### Best second step

Normalized SQL storage.

### Best third step

Graph reconstruction.

### Best use cases by layer

| Layer    | Best for                                  |
| -------- | ----------------------------------------- |
| Pydantic | validation, ETL, Python analysis          |
| SQL      | querying, dashboards, comparisons         |
| Graph    | tracing, replay, causality, visualization |

Together, they form a practical stack:

```text
JSONL -> Pydantic -> SQL -> Graph analytics
```
