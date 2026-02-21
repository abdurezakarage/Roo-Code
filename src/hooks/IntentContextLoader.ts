import * as fs from "node:fs/promises"
import * as path from "node:path"

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
	owned_scope?: string | string[]
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
	ownedScope?: string[]
}

/**
 * Escape XML special characters.
 */
function escapeXml(value: string | undefined): string {
	if (!value) return ""
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;")
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

/**
 * Load JSON Lines file (agent_trace.jsonl) and parse all entries.
 */
async function loadJsonLinesFile<T = unknown>(filePath: string): Promise<T[]> {
	try {
		const raw = await fs.readFile(filePath, "utf8")
		const lines = raw.split("\n").filter((line) => line.trim().length > 0)
		return lines.map((line) => JSON.parse(line) as T)
	} catch (error: any) {
		// Silently ignore missing files; this hook is optional.
		if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
			return []
		}
		console.error(`[IntentContextLoader] Failed to read JSON Lines file at ${filePath}:`, error)
		return []
	}
}

function findIntentEntry(doc: any, intentId: string): RawIntentEntry | undefined {
	if (!doc) return undefined

	// Support either a top-level array or an object with an `intents` array.
	let intents: RawIntentEntry[] | undefined
	if (Array.isArray(doc)) {
		intents = doc
	} else if (Array.isArray(doc?.intents)) {
		intents = doc.intents
	}

	if (!intents) return undefined

	return intents.find((entry) => {
		if (!entry || typeof entry !== "object") return false
		const id = entry.id ?? entry.intent_id
		return typeof id === "string" && id === intentId
	})
}

function findAgentTraces(entries: RawAgentTraceEntry[], intentId: string): RawAgentTraceEntry[] {
	if (!entries || !Array.isArray(entries)) return []

	return entries.filter((entry) => {
		if (!entry || typeof entry !== "object") return false
		const entryIntentId = entry.intent_id ?? entry.intentId
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
 * Both files are expected to live under a .orchestration folder at the given workspaceRoot:
 *   {workspaceRoot}/.orchestration/active_intents.yaml
 *   {workspaceRoot}/.orchestration/agent_trace.jsonl
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

	const intentsPath = path.join(workspaceRoot, ".orchestration", "active_intents.yaml")
	const tracesPath = path.join(workspaceRoot, ".orchestration", "agent_trace.jsonl")

	const [intentsDoc, traceEntries] = await Promise.all([
		loadYamlFile(intentsPath),
		loadJsonLinesFile<RawAgentTraceEntry>(tracesPath),
	])

	const intent = findIntentEntry(intentsDoc, intentId)
	if (!intent) {
		return undefined
	}

	const constraints = typeof intent.constraints === "string" ? intent.constraints : undefined
	const scope = typeof intent.scope === "string" ? intent.scope : undefined

	const agentTraces = findAgentTraces(traceEntries, intentId)

	let ownedScope: string[] | undefined
	const rawOwnedScope = intent.owned_scope
	if (typeof rawOwnedScope === "string") {
		ownedScope = [rawOwnedScope]
	} else if (Array.isArray(rawOwnedScope)) {
		ownedScope = rawOwnedScope.filter((entry): entry is string => typeof entry === "string")
	}

	const xml = buildIntentContextXml(intentId, constraints, scope, agentTraces)

	return {
		intentId,
		constraints,
		scope,
		agentTraces,
		ownedScope,
		xml,
	}
}
