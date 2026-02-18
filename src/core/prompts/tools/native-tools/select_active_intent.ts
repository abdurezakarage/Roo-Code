import type OpenAI from "openai"

const DESCRIPTION = `Select the active intent by its ID and load its corresponding context.

This tool MUST be your first action when starting a new reasoning loop.

Behavior:
- You MUST analyze the user request and choose an appropriate intent_id.
- When called, the IDE will load the matching entry from active_intents.yaml and any related agent trace entries.
- The tool will return an <intent_context> XML block containing ONLY the constraints and scope for the selected intent, plus any related agent traces.

You MUST NOT attempt to infer or fabricate intent context on your own; always rely on this tool to load it.`

export default {
	type: "function",
	function: {
		name: "select_active_intent",
		description: DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				intent_id: {
					type: "string",
					description:
						"Identifier of the intent to activate. This must correspond to an entry in active_intents.yaml.",
				},
			},
			required: ["intent_id"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
