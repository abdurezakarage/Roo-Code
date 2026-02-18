import * as fs from "fs/promises"
import * as path from "path"

import * as yaml from "yaml"

/**
 * Shape of an intent entry in active_intents.yaml.
 * The actual schema is intentionally loose to allow evolution over time.
 */
interface RawIntentEntry {
	id?: string
	intent_id?: string
	constraints?: string
	scope?: string
	// Allow arbitrary additional properties without enforcing a schema.
	[key: string]: unknown
}

interface RawAgentTraceEntry {
	intent_id?: string
	intentId?: string
	summary?: string
	text?: string
	detail?: string
	// Allow arbitrary additional properties without enforcing a schema.
	[key: string]: unknown
}

export interface LoadedIntentContext {
	intentId: string
	constraints?: string
	scope?: string
	agentTraces: RawAgentTraceEntry[]
	xml: string
}

/**
 * Escape XML special characters.
 */
function escapeXml(value: string | undefined): string {
	if (!value) return ""
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")
}

async function loadYamlFile<T = unknown>(filePath: string): Promise<T | undefined> {
	try {
		const raw = await fs.readFile(filePath, "utf8")
		return yaml.parse(raw) as T
	} catch (error: any) {
		// Silently ignore missing files; this hook is optional.
		if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
			return undefined
		}
		console.error(`[IntentContextLoader] Failed to read YAML file at ${filePath}:`, error)
		return undefined
	}
}

function findIntentEntry(doc: any, intentId: string): RawIntentEntry | undefined {
	if (!doc) return undefined

	// Support either a top-level array or an object with an `intents` array.
	const intents: RawIntentEntry[] | undefined = Array.isArray(doc)
		? doc
		: Array.isArray(doc?.intents)
			? doc.intents
			: undefined

	if (!intents) return undefined

	return intents.find((entry) => {
		if (!entry || typeof entry !== "object") return false
		const id = (entry as RawIntentEntry).id ?? (entry as RawIntentEntry).intent_id
		return typeof id === "string" && id === intentId
	})
}

function findAgentTraces(doc: any, intentId: string): RawAgentTraceEntry[] {
	if (!doc) return []

	const allEntries: RawAgentTraceEntry[] | undefined = Array.isArray(doc)
		? doc
		: Array.isArray(doc?.traces)
			? doc.traces
			: undefined

	if (!allEntries) return []

	return allEntries.filter((entry) => {
		if (!entry || typeof entry !== "object") return false
		const entryIntentId = (entry as RawAgentTraceEntry).intent_id ?? (entry as RawAgentTraceEntry).intentId
		return typeof entryIntentId === "string" && entryIntentId === intentId
	})
}

function buildIntentContextXml(
	intentId: string,
	constraints?: string,
	scope?: string,
	agentTraces: RawAgentTraceEntry[] = [],
): string {
	const lines: string[] = []

	lines.push(`<intent_context id="${escapeXml(intentId)}">`)

	if (constraints) {
		lines.push(`  <constraints>${escapeXml(constraints)}</constraints>`)
	}

	if (scope) {
		lines.push(`  <scope>${escapeXml(scope)}</scope>`)
	}

	for (const trace of agentTraces) {
		const content =
			trace.summary ??
			trace.text ??
			trace.detail ??
			// Fallback to a compact JSON representation if there is no obvious text field.
			JSON.stringify(trace)
		lines.push(`  <agent_trace>${escapeXml(String(content))}</agent_trace>`)
	}

	lines.push(`</intent_context>`)

	return lines.join("\n")
}

/**
 * Load the consolidated intent context for a given intent_id.
 *
 * This reads:
 * - active_intents.yaml to locate the matching intent entry
 * - agent_traces.yaml (if present) to collect related trace entries
 *
 * Both files are expected to live under a .roo folder at the given workspaceRoot:
 *   {workspaceRoot}/.roo/active_intents.yaml
 *   {workspaceRoot}/.roo/agent_traces.yaml
 *
 * If either file is missing or the intent cannot be found, this returns undefined.
 */
export async function loadIntentContext(
	workspaceRoot: string,
	intentId: string,
): Promise<LoadedIntentContext | undefined> {
	if (!workspaceRoot || !intentId) {
		return undefined
	}

	const intentsPath = path.join(workspaceRoot, ".roo", "active_intents.yaml")
	const tracesPath = path.join(workspaceRoot, ".roo", "agent_traces.yaml")

	const [intentsDoc, tracesDoc] = await Promise.all([loadYamlFile(intentsPath), loadYamlFile(tracesPath)])

	const intent = findIntentEntry(intentsDoc, intentId)
	if (!intent) {
		return undefined
	}

	const constraints = typeof intent.constraints === "string" ? intent.constraints : undefined
	const scope = typeof intent.scope === "string" ? intent.scope : undefined

	const agentTraces = findAgentTraces(tracesDoc, intentId)

	const xml = buildIntentContextXml(intentId, constraints, scope, agentTraces)

	return {
		intentId,
		constraints,
		scope,
		agentTraces,
		xml,
	}
}
