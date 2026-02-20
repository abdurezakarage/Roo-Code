import * as fs from "node:fs/promises"
import * as path from "node:path"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { fileExistsAtPath, createDirectoriesForFile } from "../../utils/fs"
import { getWorkspacePath } from "../../utils/path"
import type { ToolUse } from "../../shared/tools"

import { BaseTool, ToolCallbacks } from "./BaseTool"

interface RecordLessonParams {
	lesson: string
	context?: string
}

export class RecordLessonTool extends BaseTool<"record_lesson"> {
	readonly name = "record_lesson" as const

	async execute(params: RecordLessonParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult, handleError } = callbacks
		const { lesson, context } = params

		if (!lesson || lesson.trim().length === 0) {
			task.consecutiveMistakeCount++
			task.recordToolError("record_lesson")
			pushToolResult(await task.sayAndCreateMissingParamError("record_lesson", "lesson"))
			return
		}

		try {
			const workspaceRoot = getWorkspacePath() || task.cwd
			const claudeMdPath = path.join(workspaceRoot, "CLAUDE.md")

			// Ensure directory exists
			await createDirectoriesForFile(claudeMdPath)

			// Read existing content if file exists
			let existingContent = ""
			if (await fileExistsAtPath(claudeMdPath)) {
				existingContent = await fs.readFile(claudeMdPath, "utf-8")
			}

			// Format the lesson entry
			const timestamp = new Date().toISOString()
			const lessonEntry = `## Lesson Learned (${timestamp})

${lesson.trim()}

${context ? `**Context:** ${context.trim()}\n\n` : ""}---\n\n`

			// Append to file
			const newContent = existingContent + lessonEntry
			await fs.writeFile(claudeMdPath, newContent, "utf-8")

			pushToolResult(
				formatResponse.toolResult(
					`Lesson recorded in CLAUDE.md:\n\n${lesson.trim()}${context ? `\n\nContext: ${context.trim()}` : ""}`,
				),
			)
		} catch (error) {
			await handleError("recording lesson", error as Error)
		}
	}
}

export const recordLessonTool = new RecordLessonTool()
