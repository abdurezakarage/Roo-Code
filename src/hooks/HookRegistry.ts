import type { ToolName } from "@roo-code/types"

import { Task } from "../core/task/Task"
import type { PushToolResult } from "../shared/tools"

/**
 * Result of a pre-execution hook.
 * - allow: true = allow execution to proceed, false = block execution
 * - error: optional error message to return to the agent
 */
export interface PreHookResult {
	allow: boolean
	error?: string
}

/**
 * Interface for pre-execution hooks.
 * Pre-hooks run before tool execution and can block or allow the operation.
 */
export interface PreHook {
	/**
	 * Unique identifier for this hook
	 */
	readonly id: string

	/**
	 * Execute the pre-hook.
	 * @param toolName - Name of the tool being executed
	 * @param params - Tool parameters
	 * @param task - Task instance
	 * @param pushToolResult - Callback to push tool results/errors
	 * @returns Result indicating whether execution should proceed
	 */
	execute(toolName: ToolName, params: any, task: Task, pushToolResult: PushToolResult): Promise<PreHookResult>
}

/**
 * Interface for post-execution hooks.
 * Post-hooks run after successful tool execution for logging, tracing, etc.
 */
export interface PostHook {
	/**
	 * Unique identifier for this hook
	 */
	readonly id: string

	/**
	 * Execute the post-hook.
	 * @param toolName - Name of the tool that was executed
	 * @param params - Tool parameters that were used
	 * @param task - Task instance
	 * @param callbacks - Tool execution callbacks
	 */
	execute(toolName: ToolName, params: any, task: Task, callbacks: any): Promise<void>
}

/**
 * Central registry for tool execution hooks.
 * Allows hooks to be registered without modifying BaseTool or individual tool classes.
 */
export class HookRegistry {
	private preHooks: PreHook[] = []
	private postHooks: PostHook[] = []

	/**
	 * Register a pre-execution hook.
	 * Hooks are executed in registration order.
	 * @param hook - Pre-hook to register
	 */
	registerPreHook(hook: PreHook): void {
		// Prevent duplicate registrations
		if (this.preHooks.some((h) => h.id === hook.id)) {
			console.warn(`[HookRegistry] Pre-hook "${hook.id}" is already registered. Skipping.`)
			return
		}
		this.preHooks.push(hook)
	}

	/**
	 * Register a post-execution hook.
	 * Hooks are executed in registration order.
	 * @param hook - Post-hook to register
	 */
	registerPostHook(hook: PostHook): void {
		// Prevent duplicate registrations
		if (this.postHooks.some((h) => h.id === hook.id)) {
			console.warn(`[HookRegistry] Post-hook "${hook.id}" is already registered. Skipping.`)
			return
		}
		this.postHooks.push(hook)
	}

	/**
	 * Unregister a pre-hook by ID.
	 * @param hookId - ID of the hook to unregister
	 */
	unregisterPreHook(hookId: string): boolean {
		const index = this.preHooks.findIndex((h) => h.id === hookId)
		if (index >= 0) {
			this.preHooks.splice(index, 1)
			return true
		}
		return false
	}

	/**
	 * Unregister a post-hook by ID.
	 * @param hookId - ID of the hook to unregister
	 */
	unregisterPostHook(hookId: string): boolean {
		const index = this.postHooks.findIndex((h) => h.id === hookId)
		if (index >= 0) {
			this.postHooks.splice(index, 1)
			return true
		}
		return false
	}

	/**
	 * Execute all registered pre-hooks in order.
	 * Stops at the first hook that blocks execution.
	 * @param toolName - Name of the tool being executed
	 * @param params - Tool parameters
	 * @param task - Task instance
	 * @param pushToolResult - Callback to push tool results/errors
	 * @returns true if execution should proceed, false if blocked
	 */
	async executePreHooks(
		toolName: ToolName,
		params: any,
		task: Task,
		pushToolResult: PushToolResult,
	): Promise<boolean> {
		for (const hook of this.preHooks) {
			try {
				const result = await hook.execute(toolName, params, task, pushToolResult)
				if (!result.allow) {
					// Hook blocked execution
					if (result.error) {
						pushToolResult(result.error)
					}
					return false
				}
			} catch (error) {
				// Fail-safe: log error but continue to next hook
				console.error(`[HookRegistry] Error in pre-hook "${hook.id}":`, error)
				// Continue execution - don't block due to hook errors
			}
		}
		return true
	}

	/**
	 * Execute all registered post-hooks in order.
	 * Errors in post-hooks are logged but don't affect tool execution.
	 * @param toolName - Name of the tool that was executed
	 * @param params - Tool parameters that were used
	 * @param task - Task instance
	 * @param callbacks - Tool execution callbacks
	 */
	async executePostHooks(toolName: ToolName, params: any, task: Task, callbacks: any): Promise<void> {
		for (const hook of this.postHooks) {
			try {
				await hook.execute(toolName, params, task, callbacks)
			} catch (error) {
				// Fail-safe: log error but continue to next hook
				console.error(`[HookRegistry] Error in post-hook "${hook.id}":`, error)
			}
		}
	}

	/**
	 * Get all registered pre-hook IDs.
	 */
	getPreHookIds(): string[] {
		return this.preHooks.map((h) => h.id)
	}

	/**
	 * Get all registered post-hook IDs.
	 */
	getPostHookIds(): string[] {
		return this.postHooks.map((h) => h.id)
	}
}

/**
 * Global hook registry instance.
 * This is the single entry point for all hook operations.
 */
export const hookRegistry = new HookRegistry()
