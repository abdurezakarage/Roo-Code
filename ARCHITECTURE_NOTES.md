## Phase 0: The Archaeological Dig (Roo Code / Cline)

Goal: map the extension “nervous system” enough to confidently modify the prompt + tool loop.

---

## Fork & Run (Extension Host)

### What is the VS Code extension entrypoint?

- **Activation entrypoint**: `src/extension.ts`
- **Packaged entrypoint**: `src/package.json` has `"main": "./dist/extension.js"`

The extension activates on VS Code startup and language events (see `src/package.json` `"activationEvents"`).

### How to run your fork in the VS Code Extension Host (dev)

High-level steps (typical VS Code extension workflow):

1. **Install dependencies** (repo root `Roo-Code/`):
    - Use `pnpm` (see root `package.json` `"packageManager": "pnpm@..."`).
2. **Build / watch**:
    - Ensure the extension output exists at `src/dist/extension.js` (or run the repo build that produces it).
3. **Launch Extension Host**:
    - Open the `Roo-Code/` folder in VS Code.
    - Use the Run/Debug configuration that launches the extension (commonly the default “Run Extension”).
    - Press **F5** to start the Extension Development Host.

Notes:

- The extension supports an optional `.env` file at the extension root; activation loads it if present (`src/extension.ts`).
- Many behaviors depend on workspace settings and the webview state managed by `ClineProvider`.

---

## Trace the Tool Loop (execute_command, write_to_file)

### Where does tool execution get dispatched?

The **central dispatcher** for assistant tool calls is:

- **Function**: `presentAssistantMessage(cline: Task)`
- **File**: `src/core/assistant-message/presentAssistantMessage.ts`

This function:

- iterates streamed assistant “content blocks”
- when it sees a `tool_use` block, it routes by `block.name` (a `ToolName`)
- executes the corresponding Tool class, then pushes a `tool_result` back into the conversation

### The exact dispatch cases for `write_to_file` and `execute_command`

Inside `presentAssistantMessage(...)`, tool calls are handled via a `switch (block.name)`:

- **write_to_file**:
    - `case "write_to_file": await writeToFileTool.handle(...)`
- **execute_command**:
    - `case "execute_command": await executeCommandTool.handle(...)`

Files involved:

- Dispatcher: `src/core/assistant-message/presentAssistantMessage.ts`
- Tool implementations:
    - `src/core/tools/WriteToFileTool.ts` (`WriteToFileTool`)
    - `src/core/tools/ExecuteCommandTool.ts` (`ExecuteCommandTool`)

### Where does the tool security hook wrap execution?

Tool execution is funneled through the base tool class:

- **Class**: `BaseTool<TName>`
- **Method**: `BaseTool.handle(...)`
- **File**: `src/core/tools/BaseTool.ts`

`BaseTool.handle(...)`:

1. waits for tool calls to finish streaming (`block.partial === false`)
2. reads typed native args from `block.nativeArgs`
3. runs the security middleware pre-hook
4. calls `this.execute(...)` if allowed

The middleware is in:

- `src/hooks/ToolSecurityMiddleware.ts`

---

## Locate the Prompt Builder (System Prompt)

### Where is the system prompt constructed?

- **Builder**: `SYSTEM_PROMPT(...)`
- **File**: `src/core/prompts/system.ts`

This composes:

- mode role definition + instructions
- formatting rules
- tool-use guidelines
- capabilities
- modes + skills + rules sections
- system info + objective
- any custom instructions

### Where is the system prompt requested during the tool loop?

The system prompt is generated at runtime by `Task`:

- **Method**: `private async getSystemPrompt(): Promise<string>`
- **File**: `src/core/task/Task.ts`

`Task.getSystemPrompt()` fetches provider state (mode, instructions, experiments, etc) and calls `SYSTEM_PROMPT(...)`.

---

## Quick “mental model” map (core runtime objects)

- `src/extension.ts`
    - VS Code activation: initializes services, creates the `ClineProvider`, registers commands and webview plumbing.
- `src/core/webview/ClineProvider.ts`
    - Bridges VS Code UI/webview with task execution.
- `src/core/task/Task.ts`
    - Owns the agent loop and API requests (`createMessage(...)`), builds prompt and tools metadata, manages conversation history.
- `src/core/assistant-message/presentAssistantMessage.ts`
    - Interprets streamed assistant content and dispatches tool execution.
- `src/core/tools/*Tool.ts`
    - Concrete tool implementations.
- `src/hooks/*`
    - "Hook engine" components (intent context loader, tool security middleware).

---

## Phase 1: The Handshake (Reasoning Loop Implementation)

### Goal

Solve the Context Paradox by bridging the synchronous LLM with the asynchronous IDE loop through intent-driven architecture.

### Implementation Overview

#### 1. The `select_active_intent` Tool

**Location**: `src/core/tools/SelectActiveIntentTool.ts`

**Purpose**: Allows the LLM to declare which intent it's working on before executing any destructive operations.

**Flow**:

1. LLM calls `select_active_intent(intent_id: "INT-001")`
2. Tool loads intent context from `.orchestration/active_intents.yaml`
3. Tool loads related agent traces from `.orchestration/agent_trace.jsonl`
4. Tool constructs XML `<intent_context>` block
5. Tool persists intent ID on Task via `task.setActiveIntentId()`
6. Tool returns XML block as tool result

**Key Implementation Details**:

- Uses `loadIntentContext()` from `src/hooks/IntentContextLoader.ts`
- Reads from `.orchestration/active_intents.yaml` (YAML format)
- Reads from `.orchestration/agent_trace.jsonl` (JSON Lines format)
- Returns XML block containing constraints, scope, and related agent traces

#### 2. Context Loader (Pre-Hook)

**Location**: `src/hooks/IntentContextLoader.ts`

**Function**: `loadIntentContext(workspaceRoot: string, intentId: string)`

**Responsibilities**:

- Read `.orchestration/active_intents.yaml` to find matching intent entry
- Read `.orchestration/agent_trace.jsonl` to find related trace entries
- Construct XML `<intent_context>` block with:
    - Intent ID
    - Constraints
    - Scope
    - Related agent traces

**Schema Support**:

- Supports flexible YAML schema (allows evolution over time)
- Handles both array and object-based YAML structures
- Filters agent traces by `intent_id` or `intentId` field

#### 3. System Prompt Modification

**Location**: `src/core/prompts/system.ts`

**Modification**: Added intent handshake section at lines 85-86:

```typescript
const intentHandshakeSection = `You are an Intent-Driven Architect. You CANNOT write code immediately.
Your first action MUST be to analyze the user request and call the select_active_intent tool to load the necessary context before using any other tools or writing code.`
```

**Integration**: This section is injected into the base prompt, ensuring the LLM is instructed to use `select_active_intent` first.

#### 4. Context Injection Hook

**Location**: `src/core/task/Task.ts` (lines 4320-4337)

**Function**: `getSystemPrompt()` method injects intent context after generating base system prompt.

**Flow**:

1. Generate base system prompt
2. Check if active intent ID exists (`task.getActiveIntentId()`)
3. Load intent context using `loadIntentContext()`
4. Append `<intent_context>` XML block to system prompt
5. Return final system prompt with injected context

#### 5. The Gatekeeper

**Location**: `src/hooks/ToolSecurityMiddleware.ts` (lines 147-154)

**Function**: `enforceToolSecurityPreHook()`

**Gatekeeper Logic**:

```typescript
// Gatekeeper: Block destructive tools without an active intent_id.
// Exception: select_active_intent itself is allowed (it's how you set the intent).
if (!intentId && toolName !== "select_active_intent") {
	const message = `You must cite a valid active Intent ID. Call select_active_intent first before using destructive tools.`
	pushToolResult(buildJsonToolError(toolName, "missing_intent_id", message))
	return false
}
```

**Behavior**:

- Blocks all destructive tools if no active intent ID is set
- Exception: `select_active_intent` tool itself is allowed (chicken-and-egg problem)
- Returns JSON-formatted tool error that LLM can parse and self-correct

---

## Phase 2: The Hook Middleware & Security Boundary

### Goal

Architect the Hook Engine that wraps all tool execution requests and enforces formal boundaries.

### Implementation Overview

#### 1. Command Classification

**Location**: `src/shared/tools.ts`

**Classification System**: `TOOL_SECURITY_CLASSIFICATION` map

**Categories**:

- **Safe**: Read-only operations (e.g., `read_file`, `codebase_search`, `list_files`)
- **Destructive**: Write/delete/execute operations (e.g., `write_to_file`, `execute_command`, `edit_file`)

**Usage**: `ToolSecurityMiddleware` uses this classification to determine which tools require authorization.

#### 2. UI-Blocking Authorization

**Location**: `src/hooks/ToolSecurityMiddleware.ts` (lines 183-206)

**Implementation**:

- Uses `vscode.window.showWarningMessage()` with modal dialog
- Shows intent ID and tool details
- Provides "Approve" / "Reject" options
- Blocks execution until user approves

**User Experience**:

- Modal dialog appears for all destructive tools
- Shows context: intent ID, tool name, target file/command
- User can approve or reject
- Rejection returns JSON error to LLM for self-correction

#### 3. .intentignore Support

**Location**: `src/hooks/ToolSecurityMiddleware.ts` (lines 31-75)

**File**: `.intentignore` in workspace root

**Format**: One intent ID per line (supports comments with `#`)

**Behavior**:

- Cached in memory (invalidated on file modification)
- Blocks all destructive tools for listed intent IDs
- Returns JSON error: `"intent_ignored"`

**Example**:

```
# Disabled intents
INT-003
INT-004
```

#### 4. Scope Enforcement

**Location**: `src/hooks/ToolSecurityMiddleware.ts` (lines 161-181)

**Function**: Validates `write_to_file` operations against intent's `owned_scope`

**Flow**:

1. Check if tool is `write_to_file`
2. Load intent context to get `ownedScope`
3. Resolve target file path relative to workspace
4. Check if path matches any pattern in `ownedScope`
5. Block if path is outside owned scope

**Pattern Matching**:

- Supports exact paths: `"src/api/weather.ts"`
- Supports wildcards: `"src/api/weather/**"`
- Normalizes path separators (handles Windows/Unix)

**Error Response**:

```json
{
	"type": "tool_error",
	"tool": "write_to_file",
	"reason": "scope_violation",
	"intent_id": "INT-001",
	"file": "src/unauthorized/file.ts",
	"message": "Scope Violation: INT-001 is not authorized to edit src/unauthorized/file.ts. Request scope expansion."
}
```

#### 5. Autonomous Recovery

**Location**: `src/hooks/ToolSecurityMiddleware.ts`

**Error Format**: All errors are returned as JSON strings that the LLM can parse:

```typescript
interface JsonToolErrorPayload {
	type: "tool_error"
	tool: ToolName
	reason: "intent_ignored" | "scope_violation" | "user_rejected" | "missing_intent_id"
	intent_id?: string
	file?: string
	message: string
}
```

**Self-Correction**: LLM receives structured error, can:

- Understand what went wrong
- Take corrective action (e.g., call `select_active_intent` first)
- Retry the operation

---

## Phase 3: The AI-Native Git Layer (Full Traceability)

### Goal

Implement the semantic tracking ledger to repay Trust Debt with Verification.

### Implementation Overview

#### 1. Schema Modification

**Location**: `src/core/prompts/tools/native-tools/write_to_file.ts`

**Modified Schema**: `write_to_file` tool now requires:

- `intent_id: string` (required)
- `mutation_class: "AST_REFACTOR" | "INTENT_EVOLUTION"` (required)

**Tool Definition**:

```typescript
parameters: {
    type: "object",
    properties: {
        path: { type: "string" },
        content: { type: "string" },
        intent_id: { type: "string" },
        mutation_class: {
            type: "string",
            enum: ["AST_REFACTOR", "INTENT_EVOLUTION"]
        }
    },
    required: ["path", "content", "intent_id", "mutation_class"]
}
```

#### 2. Semantic Classification

**Mutation Classes**:

- **AST_REFACTOR**: Syntax changes that preserve intent (renames, formatting, refactoring)
- **INTENT_EVOLUTION**: Changes that introduce new features or modify behavior

**Usage**: LLM must classify each write operation, enabling semantic tracking of code evolution.

#### 3. Spatial Hashing

**Location**: `src/utils/spatial-hash.ts`

**Function**: `generateContentHash(content: string): string`

**Implementation**: SHA-256 hash of file content

**Purpose**:

- Content deduplication
- Change detection
- Traceability (content_hash in agent trace entries)

#### 4. Trace Serialization

**Location**: `src/hooks/AgentTraceSchema.ts` and `src/hooks/AgentTraceLogger.ts`

**Schema**:

```typescript
interface AgentTraceEntry {
	req_id: string // REQ-ID (task ID)
	intent_id: string // Intent ID
	file: string // Relative file path
	timestamp: string // ISO 8601
	mutation_class: "AST_REFACTOR" | "INTENT_EVOLUTION"
	content_hash: string // SHA-256 hash
	model_identifier?: string // Model that generated mutation
	related: string[] // Related REQ-IDs
	ranges: {
		content_hash: string // Spatial hash for indexing
	}
}
```

**Post-Hook Implementation**: `src/core/tools/WriteToFileTool.ts` (lines 229-251)

**Flow**:

1. After successful file write
2. Create trace entry using `createAgentTraceEntry()`
3. Inject REQ-ID (task ID) into `related` array
4. Append to `.orchestration/agent_trace.jsonl` (JSON Lines format)

**File Format**: JSON Lines (one JSON object per line)

- Enables streaming writes
- Easy to parse line-by-line
- Append-only (immutable log)

---

## Phase 4: Parallel Orchestration (The Master Thinker)

### Goal

Manage Silicon Workers via Optimistic Locking.

### Implementation Overview

#### 1. Concurrency Control (Optimistic Locking)

**Location**: `src/core/tools/WriteToFileTool.ts` (lines 76-92)

**Implementation**:

```typescript
// Phase 4: Optimistic Locking - Check if file was modified since last read
if (fileExists) {
	try {
		const currentContent = await fs.readFile(absolutePath, "utf-8")
		if (!task.fileHashTracker.isFileUnchanged(relPath, currentContent)) {
			// File was modified by another agent/human - block the write
			task.consecutiveMistakeCount++
			task.recordToolError("write_to_file")
			pushToolResult(formatResponse.staleFileError(relPath))
			await task.diffViewProvider.reset()
			return
		}
	} catch (error) {
		// If we can't read the file, allow the write to proceed (might be a race condition)
		console.warn(`[WriteToFileTool] Could not read file for hash check: ${error}`)
	}
}
```

**Hash Tracking**: `src/core/context-tracking/FileHashTracker.ts`

**Flow**:

1. When file is read, store hash in `FileHashTracker`
2. Before write, read current file content
3. Compare current hash with stored hash
4. If different: file was modified by another agent/human
5. Block write and return "Stale File" error
6. Force agent to re-read file

**After Successful Write**: Update stored hash (line 199)

#### 2. Lesson Recording

**Location**: `src/core/tools/RecordLessonTool.ts`

**Purpose**: Append "Lessons Learned" to `CLAUDE.md` when verification fails

**Trigger**: LLM can call `record_lesson` tool when:

- Linter errors occur
- Tests fail
- Type checking fails
- Important patterns are discovered

**Format**:

```markdown
## Lesson Learned (2024-01-15T10:30:00.000Z)

[Lesson content]

**Context:** [Optional context]

---
```

**File**: `CLAUDE.md` in workspace root (appended, not overwritten)

---

## Architecture Diagrams

### Tool Execution Flow

```
User Request
    ↓
Task.startTask()
    ↓
LLM receives system prompt (with intent handshake instructions)
    ↓
LLM calls select_active_intent(intent_id)
    ↓
SelectActiveIntentTool.execute()
    ├─→ loadIntentContext()
    │   ├─→ Read .orchestration/active_intents.yaml
    │   └─→ Read .orchestration/agent_trace.jsonl
    ├─→ task.setActiveIntentId()
    └─→ Return <intent_context> XML
    ↓
LLM receives intent context
    ↓
LLM calls write_to_file(intent_id, mutation_class, ...)
    ↓
BaseTool.handle()
    ├─→ enforceToolSecurityPreHook()
    │   ├─→ Check classification (safe/destructive)
    │   ├─→ Gatekeeper: Check active intent_id
    │   ├─→ Check .intentignore
    │   ├─→ Check scope enforcement
    │   └─→ UI authorization (if destructive)
    ├─→ WriteToFileTool.execute()
    │   ├─→ Optimistic locking check
    │   ├─→ Write file
    │   └─→ Update file hash
    └─→ WriteToFileTool.postExecute()
        ├─→ createAgentTraceEntry()
        └─→ appendAgentTrace() → .orchestration/agent_trace.jsonl
```

### Hook System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    BaseTool.handle()                     │
└─────────────────────────────────────────────────────────┘
                        ↓
        ┌───────────────────────────────┐
        │  enforceToolSecurityPreHook()  │
        │  (ToolSecurityMiddleware)      │
        └───────────────────────────────┘
                        ↓
        ┌───────────────────────────────┐
        │  1. Classification Check       │
        │     (Safe → Allow)             │
        └───────────────────────────────┘
                        ↓
        ┌───────────────────────────────┐
        │  2. Gatekeeper                 │
        │     (Check active intent_id)   │
        └───────────────────────────────┘
                        ↓
        ┌───────────────────────────────┐
        │  3. .intentignore Check        │
        └───────────────────────────────┘
                        ↓
        ┌───────────────────────────────┐
        │  4. Scope Enforcement         │
        │     (write_to_file only)      │
        └───────────────────────────────┘
                        ↓
        ┌───────────────────────────────┐
        │  5. UI Authorization           │
        │     (Destructive tools)        │
        └───────────────────────────────┘
                        ↓
                   [Allow/Block]
```

### Data Flow: Intent Context Loading

```
select_active_intent(intent_id: "INT-001")
    ↓
loadIntentContext(workspaceRoot, "INT-001")
    ↓
┌─────────────────────────────────────┐
│  Read .orchestration/               │
│  ├─ active_intents.yaml            │
│  └─ agent_trace.jsonl               │
└─────────────────────────────────────┘
    ↓
Find intent entry (id: "INT-001")
    ↓
Filter agent traces (intent_id: "INT-001")
    ↓
Build XML:
<intent_context id="INT-001">
  <constraints>...</constraints>
  <scope>...</scope>
  <agent_trace>...</agent_trace>
  ...
</intent_context>
    ↓
Return to LLM as tool result
```

---

## File Structure

```
.orchestration/
├── active_intents.yaml      # Intent definitions (YAML)
├── agent_trace.jsonl        # Mutation log (JSON Lines)
├── intent_map.md            # Intent overview (Markdown)
└── .intentignore            # Disabled intents (text)

src/hooks/
├── IntentContextLoader.ts   # Load intent context from files
├── ToolSecurityMiddleware.ts # Security hooks (gatekeeper, scope, etc.)
├── AgentTraceSchema.ts      # Trace entry schema
├── AgentTraceLogger.ts       # Append to agent_trace.jsonl
└── index.ts                 # Exports

src/core/tools/
├── SelectActiveIntentTool.ts # Intent selection tool
├── WriteToFileTool.ts        # File writing (with trace logging)
├── RecordLessonTool.ts       # Lesson recording
└── BaseTool.ts              # Base class (runs security hooks)
```

---

## Key Design Decisions

### 1. Why `.orchestration/` instead of `.roo/`?

- Separation of concerns: `.roo/` is used for skills, rules, and other Roo Code features
- Clear intent: `.orchestration/` is specifically for intent-driven agent orchestration
- Future-proofing: Allows independent evolution of orchestration features

### 2. Why JSON Lines for agent_trace.jsonl?

- **Append-only**: Immutable log (can't corrupt existing entries)
- **Streaming**: Can write entries as they occur (no need to load entire file)
- **Parseable**: Easy to read line-by-line for analysis
- **Scalable**: Handles large trace files efficiently

### 3. Why XML for intent context?

- **Structured**: Clear hierarchy (constraints, scope, traces)
- **LLM-friendly**: LLMs parse XML well
- **Extensible**: Easy to add new sections without breaking existing code

### 4. Why gatekeeper blocks ALL destructive tools?

- **Safety first**: Prevents accidental operations without intent context
- **Traceability**: Ensures every mutation is linked to an intent
- **Self-correction**: LLM receives clear error and can fix itself

### 5. Why optimistic locking instead of file locks?

- **Non-blocking**: Doesn't prevent reads while write is pending
- **Simple**: No need for complex locking mechanisms
- **Effective**: Detects conflicts before they cause data loss
- **Recoverable**: Agent can re-read and retry

---

## Testing Strategy

### Unit Tests

- `IntentContextLoader`: Test YAML/JSON parsing, XML generation
- `ToolSecurityMiddleware`: Test classification, gatekeeper, scope enforcement
- `AgentTraceLogger`: Test JSON Lines appending

### Integration Tests

- End-to-end: `select_active_intent` → `write_to_file` → trace logging
- Parallel agents: Two agents modifying same file (optimistic locking)
- Scope enforcement: Write outside owned scope (should block)

### Manual Testing

- Demo workflow: Two agent instances working on different intents
- Show trace file updating in real-time
- Show gatekeeper blocking operations without intent ID

---

## Future Enhancements

1. **Intent Dependencies**: Support intent relationships (INT-002 depends on INT-001)
2. **Intent Merging**: Automatic conflict resolution when intents overlap
3. **Trace Analysis**: Tools to analyze agent_trace.jsonl for patterns
4. **Intent Templates**: Reusable intent definitions
5. **Multi-workspace**: Support intents across multiple workspaces
6. **Intent Versioning**: Track intent evolution over time
