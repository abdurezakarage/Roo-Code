import * as fs from "node:fs/promises"
import * as path from "node:path"

import type { AgentTraceEntry } from "./AgentTraceSchema"

/**
 * Append an agent trace entry to .roo/agent_trace.jsonl (JSON Lines format).
 * Each line is a complete JSON object representing one trace entry.
 *
 * @param workspaceRoot - Root directory of the workspace
 * @param entry - Agent trace entry to append
 */
export async function appendAgentTrace(workspaceRoot: string, entry: AgentTraceEntry): Promise<void> {
	const traceFilePath = path.join(workspaceRoot, ".roo", "agent_trace.jsonl")

	// Ensure .roo directory exists
	await fs.mkdir(path.dirname(traceFilePath), { recursive: true })

	// Append entry as a single JSON line
	const jsonLine = JSON.stringify(entry) + "\n"
	await fs.appendFile(traceFilePath, jsonLine, "utf8")
}
