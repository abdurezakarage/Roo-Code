import * as path from "node:path"
import * as fs from "node:fs/promises"
import * as vscode from "vscode"

import type { ToolName } from "@roo-code/types"

import { Task } from "../core/task/Task"
import { loadIntentContext } from "./IntentContextLoader"
import { getWorkspacePath, toRelativePath } from "../utils/path"
import type { PushToolResult } from "../shared/tools"
import { TOOL_SECURITY_CLASSIFICATION, type ToolSecurityClassification } from "../shared/tools"

type JsonToolErrorReason = "intent_ignored" | "scope_violation" | "user_rejected"

interface JsonToolErrorPayload {
	type: "tool_error"
	tool: ToolName
	reason: JsonToolErrorReason
	intent_id?: string
	file?: string
	message: string
}

/**
 * Simple in-memory cache for .intentignore contents.
 */
let cachedIntentIgnoreWorkspace: string | undefined
let cachedIntentIgnoreMtimeMs: number | undefined
let cachedIntentIgnoreEntries: string[] | undefined

async function readIntentIgnoreFile(workspaceRoot: string): Promise<string[]> {
	const intentIgnorePath = path.join(workspaceRoot, ".intentignore")

	try {
		const stats = await fs.stat(intentIgnorePath)

		// If cache is valid, return it
		if (
			cachedIntentIgnoreWorkspace === workspaceRoot &&
			cachedIntentIgnoreMtimeMs !== undefined &&
			cachedIntentIgnoreMtimeMs === stats.mtimeMs &&
			cachedIntentIgnoreEntries
		) {
			return cachedIntentIgnoreEntries
		}

		const raw = await fs.readFile(intentIgnorePath, "utf8")
		const entries = raw
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0 && !line.startsWith("#"))

		cachedIntentIgnoreWorkspace = workspaceRoot
		cachedIntentIgnoreMtimeMs = stats.mtimeMs
		cachedIntentIgnoreEntries = entries

		return entries
	} catch (error: any) {
		if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
			return []
		}
		console.error(`[ToolSecurityMiddleware] Failed to read .intentignore:`, error)
		return []
	}
}

async function isIntentIgnored(workspaceRoot: string, intentId: string): Promise<boolean> {
	const entries = await readIntentIgnoreFile(workspaceRoot)
	if (!entries.length) {
		return false
	}

	// For now, support exact ID matches. Pattern support can be added later.
	return entries.includes(intentId)
}

function isPathWithinOwnedScope(relPath: string, ownedScope: string[]): boolean {
	const normalizedRel = relPath.replace(/\\/g, "/")

	for (const patternRaw of ownedScope) {
		const pattern = patternRaw.trim().replace(/\\/g, "/")
		if (!pattern) continue

		// Support simple "**" or "*" suffix semantics via prefix matching.
		const isWildcard = pattern.endsWith("/**") || pattern.endsWith("/*")
		const base = isWildcard ? pattern.replace(/\/\*\*?$/, "") : pattern

		if (!base) continue

		if (normalizedRel === base || normalizedRel.startsWith(base.endsWith("/") ? base : `${base}/`)) {
			return true
		}
	}

	return false
}

function buildJsonToolError(
	tool: ToolName,
	reason: JsonToolErrorReason,
	message: string,
	intentId?: string,
	file?: string,
): string {
	const payload: JsonToolErrorPayload = {
		type: "tool_error",
		tool,
		reason,
		message,
	}

	if (intentId) {
		payload.intent_id = intentId
	}
	if (file) {
		payload.file = file
	}

	return JSON.stringify(payload)
}

/**
 * Central security middleware that runs before any tool is executed.
 *
 * Responsibilities:
 * - Command classification: safe vs destructive.
 * - .intentignore enforcement (block destructive tools for ignored intents).
 * - Scope enforcement for write_to_file based on intent-owned scope.
 * - UI-blocking VS Code authorization for destructive tools.
 *
 * Returns true when execution is allowed, false when blocked.
 */
export async function enforceToolSecurityPreHook(
	toolName: ToolName,
	params: any,
	task: Task,
	pushToolResult: PushToolResult,
): Promise<boolean> {
	const classification: ToolSecurityClassification =
		TOOL_SECURITY_CLASSIFICATION[toolName] ?? ("destructive" as ToolSecurityClassification)

	// Fast path: safe tools are not gated.
	if (classification === "safe") {
		return true
	}

	// Determine workspace and active intent (if any).
	const workspaceRoot = getWorkspacePath() || task.cwd
	const intentId = task.getActiveIntentId()

	// 1) .intentignore enforcement: block destructive tools for ignored intents.
	if (workspaceRoot && intentId) {
		const ignored = await isIntentIgnored(workspaceRoot, intentId)
		if (ignored) {
			const message = `Intent "${intentId}" is disabled by .intentignore. Destructive tool "${toolName}" was blocked.`
			pushToolResult(buildJsonToolError(toolName, "intent_ignored", message, intentId))
			return false
		}
	}

	// 2) Scope enforcement for write_to_file based on owned_scope of active intent.
	if (toolName === "write_to_file" && workspaceRoot && intentId && typeof params?.path === "string") {
		try {
			const intentContext = await loadIntentContext(workspaceRoot, intentId)
			const ownedScope = intentContext?.ownedScope

			if (ownedScope && ownedScope.length > 0) {
				const absolutePath = path.resolve(task.cwd, params.path)
				const relToWorkspace = toRelativePath(absolutePath, workspaceRoot)

				if (!isPathWithinOwnedScope(relToWorkspace, ownedScope)) {
					const message = `Scope Violation: ${intentId} is not authorized to edit ${relToWorkspace}. Request scope expansion.`
					pushToolResult(buildJsonToolError(toolName, "scope_violation", message, intentId, relToWorkspace))
					return false
				}
			}
		} catch (error) {
			console.error("[ToolSecurityMiddleware] Failed to enforce owned_scope for write_to_file:", error)
			// Fail open: do not block execution solely due to a loader error.
		}
	}

	// 3) UI-blocking authorization for destructive tools.
	try {
		const humanIntentId = intentId ?? "(no active intent)"

		let detail = `Intent ${humanIntentId} is about to execute destructive tool "${toolName}".`

		// Add basic context for common destructive tools.
		if (toolName === "write_to_file" && typeof params?.path === "string") {
			detail += `\n\nTarget file: ${params.path}`
		} else if (toolName === "execute_command" && typeof params?.command === "string") {
			detail += `\n\nCommand: ${params.command}`
		}

		const selection = await vscode.window.showWarningMessage(detail, { modal: true }, "Approve", "Reject")

		if (selection !== "Approve") {
			const message = `User rejected destructive operation "${toolName}".`
			pushToolResult(buildJsonToolError(toolName, "user_rejected", message, intentId))
			return false
		}
	} catch (error) {
		console.error("[ToolSecurityMiddleware] Failed to run UI-blocking authorization:", error)
		// Fail open to avoid breaking existing behavior when VS Code UI is unavailable.
	}

	return true
}
