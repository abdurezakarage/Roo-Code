import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"

import { loadIntentContext } from "../intent/IntentContextLoader"
import { getWorkspacePath } from "../../utils/path"

interface SelectActiveIntentParams {
	intent_id: string
}

export class SelectActiveIntentTool extends BaseTool<"select_active_intent"> {
	readonly name = "select_active_intent" as const

	async execute(params: SelectActiveIntentParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult, handleError } = callbacks

		try {
			const intentId = params.intent_id?.trim()

			if (!intentId) {
				task.consecutiveMistakeCount++
				task.recordToolError("select_active_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError("intent_id is required for select_active_intent"))
				return
			}

			// Resolve workspace root for intent files: prefer VS Code workspace, fall back to task.cwd.
			const workspaceRoot = getWorkspacePath() || task.cwd

			const context = await loadIntentContext(workspaceRoot, intentId)

			if (!context) {
				task.consecutiveMistakeCount++
				task.recordToolError("select_active_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(
					formatResponse.toolError(
						`No matching intent found for id "${intentId}" in .roo/active_intents.yaml. ` +
							"Ensure the ID exists and is spelled correctly.",
					),
				)
				return
			}

			// Persist the active intent on the task so pre-hooks can validate and inject context.
			task.setActiveIntentId(context.intentId)

			// Return the XML block as the tool result. This is what the model will consume.
			pushToolResult(formatResponse.toolResult(context.xml))
		} catch (error) {
			await handleError("select active intent", error as Error)
		}
	}

	// For this tool, partial handling is simple: we only act on complete payloads.
	override async handlePartial(task: Task, _block: ToolUse<"select_active_intent">): Promise<void> {
		// No-op for partial updates; wait for the final tool call before executing.
		await task.ask("tool", undefined, true).catch(() => {})
	}
}

export const selectActiveIntentTool = new SelectActiveIntentTool()
