import type { ToolName } from "@roo-code/types"

import { Task } from "../core/task/Task"
import type { PushToolResult } from "../shared/tools"
import type { PreHook, PreHookResult } from "./HookRegistry"
import { enforceToolSecurityPreHook } from "./ToolSecurityMiddleware"

/**
 * Pre-hook wrapper for tool security middleware.
 * Implements the PreHook interface for registration in the hook registry.
 */
export class ToolSecurityPreHook implements PreHook {
	readonly id = "tool-security"

	async execute(toolName: ToolName, params: any, task: Task, pushToolResult: PushToolResult): Promise<PreHookResult> {
		const allow = await enforceToolSecurityPreHook(toolName, params, task, pushToolResult)
		return { allow }
	}
}
