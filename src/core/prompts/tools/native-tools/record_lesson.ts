import type OpenAI from "openai"

const RECORD_LESSON_DESCRIPTION = `Record a lesson learned to CLAUDE.md. Use this tool when verification steps (linter, tests, type checking) fail, or when you discover important patterns or constraints that should be remembered for future work.

The lesson will be appended to CLAUDE.md with a timestamp, making it available for future AI assistants working on this codebase.

Example: After a linter error reveals a coding pattern that must be followed, record it as a lesson so future agents know to avoid the same mistake.`

const LESSON_PARAMETER_DESCRIPTION = `The lesson learned. Should be clear, actionable, and specific. Include what went wrong, why it happened, and how to avoid it in the future.`

const CONTEXT_PARAMETER_DESCRIPTION = `Optional context about when/where this lesson was learned (e.g., "During TypeScript type checking", "When running unit tests", "Linter error in utils/helper.ts").`

export default {
	type: "function",
	function: {
		name: "record_lesson",
		description: RECORD_LESSON_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				lesson: {
					type: "string",
					description: LESSON_PARAMETER_DESCRIPTION,
				},
				context: {
					type: "string",
					description: CONTEXT_PARAMETER_DESCRIPTION,
				},
			},
			required: ["lesson"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
