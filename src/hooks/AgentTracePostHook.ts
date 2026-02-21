import * as fs from "node:fs/promises"
import * as path from "node:path"

import type { ToolName } from "@roo-code/types"

import { Task } from "../core/task/Task"
import { getWorkspacePath } from "../utils/path"
import { getVcsRevision, getVcsBranch } from "../utils/vcs"
import { classifyMutationAST } from "../utils/ast-mutation-classifier"
import type { PostHook } from "./HookRegistry"
import { appendAgentTrace, createAgentTraceEntry } from "./AgentTraceSchema"

/**
 * Post-hook for logging agent trace entries.
 * Automatically generates trace entries for write_to_file operations with:
 * - AST-based mutation classification
 * - VCS revision tracking
 * - Content hashing
 */
export class AgentTracePostHook implements PostHook {
	readonly id = "agent-trace"

	async execute(toolName: ToolName, params: any, task: Task, _callbacks: any): Promise<void> {
		// Only trace write_to_file operations
		if (toolName !== "write_to_file") {
			return
		}

		try {
			const workspaceRoot = getWorkspacePath() || task.cwd
			const modelIdentifier = task.api.getModel().id

			// Get intent_id from params (required for write_to_file)
			const intentId = params.intent_id
			if (!intentId) {
				console.warn("[AgentTracePostHook] write_to_file missing intent_id, skipping trace")
				return
			}

			// Get old content for AST-based classification
			// Note: Since this is a post-hook, the file has already been written.
			// We try to get the old content from git HEAD if available.
			// If the file wasn't in git, we treat it as a new file (INTENT_EVOLUTION).
			let oldContent: string | undefined
			try {
				const { execSync } = await import("child_process")
				const filePath = path.resolve(task.cwd, params.path)
				const relPath = path.relative(workspaceRoot, filePath).replace(/\\/g, "/")

				// Try to get old content from git HEAD (before this write)
				// This works if the file was previously committed
				try {
					const gitContent = execSync(`git show HEAD:${relPath}`, {
						cwd: workspaceRoot,
						encoding: "utf8",
						stdio: "pipe",
					}).trim()
					oldContent = gitContent
				} catch {
					// File not in git HEAD (new file or not committed), treat as new
					oldContent = undefined
				}
			} catch {
				// Git not available or other error, oldContent remains undefined
				// Will default to INTENT_EVOLUTION for new files
			}

			// Classify mutation using AST-based heuristics
			const llmProvidedClass = params.mutation_class as "AST_REFACTOR" | "INTENT_EVOLUTION" | undefined
			const mutationClass = classifyMutationAST(oldContent, params.content, llmProvidedClass)

			// Get VCS revision information
			const vcsRevision = await getVcsRevision(workspaceRoot)
			const vcsBranch = await getVcsBranch(workspaceRoot)

			// Create trace entry with all metadata
			const traceEntry = createAgentTraceEntry({
				reqId: task.taskId, // REQ-ID
				intentId,
				filePath: params.path,
				content: params.content,
				mutationClass,
				modelIdentifier,
				relatedReqIds: [task.taskId], // Inject REQ-ID into related array
				vcsRevision,
				vcsBranch,
			})

			// Append to agent_trace.jsonl (JSON Lines format)
			await appendAgentTrace(workspaceRoot, traceEntry)
		} catch (error) {
			// Log but don't fail - trace logging is non-critical
			console.error("[AgentTracePostHook] Failed to log agent trace:", error)
		}
	}
}
