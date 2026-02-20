import * as fs from "node:fs/promises"
import * as path from "node:path"

import * as yaml from "yaml"

interface AgentTraceLogParams {
	intentId: string
	workspaceRoot?: string
	filePath: string
	content: string
	timestamp: string
	modelIdentifier?: string
}

interface AgentTraceEntry {
	intent_id: string
	file: string
	timestamp: string
	model_identifier?: string
	summary: string
	content: string
}

function buildSummary(filePath: string, content: string): string {
	const length = content?.length ?? 0
	return `write_to_file:${filePath} (${length} chars)`
}

/**
 * Append a write trace entry to .roo/agent_traces.yaml.
 */
export async function logAgentTrace(params: AgentTraceLogParams): Promise<void> {
	const { intentId, workspaceRoot, filePath, content, timestamp, modelIdentifier } = params
	if (!intentId || !filePath) {
		return
	}

	const tracesPath = path.join(workspaceRoot || process.cwd(), ".roo", "agent_traces.yaml")

	let existing: any = undefined
	try {
		const raw = await fs.readFile(tracesPath, "utf8")
		existing = yaml.parse(raw)
	} catch (error: any) {
		if (!(error && (error.code === "ENOENT" || error.code === "ENOTDIR"))) {
			console.error("[TraceLogger] Failed reading existing trace file:", error)
		}
	}

	const entry: AgentTraceEntry = {
		intent_id: intentId,
		file: filePath,
		timestamp,
		model_identifier: modelIdentifier,
		summary: buildSummary(filePath, content),
		content,
	}

	let output: any
	if (Array.isArray(existing)) {
		output = [...existing, entry]
	} else if (existing && Array.isArray(existing.traces)) {
		output = { ...existing, traces: [...existing.traces, entry] }
	} else {
		output = { traces: [entry] }
	}

	await fs.mkdir(path.dirname(tracesPath), { recursive: true })
	await fs.writeFile(tracesPath, yaml.stringify(output), "utf8")
}
