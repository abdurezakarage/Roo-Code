/**
 * Mutation classification types for semantic tracking.
 * - AST_REFACTOR: Syntax changes that preserve intent (renames, formatting, refactoring)
 * - INTENT_EVOLUTION: Changes that introduce new features or modify behavior
 */
export type MutationClass = "AST_REFACTOR" | "INTENT_EVOLUTION"

/**
 * Classify a mutation based on content analysis.
 * This is a simple heuristic - in a full implementation, this could use AST analysis
 * to distinguish between refactoring (same AST structure, different names/formatting)
 * and intent evolution (new AST nodes, changed behavior).
 *
 * @param oldContent - Previous file content (if available)
 * @param newContent - New file content
 * @param mutationClass - Explicitly provided mutation class from tool params
 * @returns The mutation classification
 */
export function classifyMutation(
	oldContent: string | undefined,
	newContent: string,
	mutationClass: MutationClass,
): MutationClass {
	// If explicitly provided, use it
	if (mutationClass === "AST_REFACTOR" || mutationClass === "INTENT_EVOLUTION") {
		return mutationClass
	}

	// Fallback heuristic: if no old content, assume intent evolution (new file)
	if (!oldContent) {
		return "INTENT_EVOLUTION"
	}

	// Simple heuristic: if content length changed significantly (>20%), likely intent evolution
	const lengthDiff = Math.abs(newContent.length - oldContent.length)
	const avgLength = (newContent.length + oldContent.length) / 2
	const percentChange = avgLength > 0 ? (lengthDiff / avgLength) * 100 : 0

	if (percentChange > 20) {
		return "INTENT_EVOLUTION"
	}

	// Default to AST_REFACTOR for minor changes
	return "AST_REFACTOR"
}
