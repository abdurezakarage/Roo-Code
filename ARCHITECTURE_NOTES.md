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
    - “Hook engine” components (intent context loader, tool security middleware).
