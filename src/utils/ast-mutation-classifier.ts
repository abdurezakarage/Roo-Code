/**
 * AST-based mutation classification for semantic tracking.
 * Uses heuristics to distinguish between refactoring and intent evolution.
 */

export type MutationClass = "AST_REFACTOR" | "INTENT_EVOLUTION"

interface ClassificationMetrics {
	structuralSimilarity: number // 0-1, higher = more similar structure
	contentChangeRatio: number // 0-1, ratio of changed content
	hasNewFunctions: boolean
	hasNewClasses: boolean
	hasNewImports: boolean
	hasRemovedFunctions: boolean
	hasRemovedClasses: boolean
	lineCountChange: number
}

/**
 * Extract function/class signatures from code using regex heuristics.
 * This is a lightweight alternative to full AST parsing.
 */
function extractCodeStructure(content: string): {
	functions: string[]
	classes: string[]
	imports: string[]
} {
	const functions: string[] = []
	const classes: string[] = []
	const imports: string[] = []

	// Extract function signatures (handles various styles)
	const functionRegex =
		/(?:export\s+)?(?:async\s+)?(?:function\s+)?(\w+)\s*[=:]\s*(?:async\s+)?\([^)]*\)\s*(?:[:=]\s*[^{]*)?\{/g
	let match
	while ((match = functionRegex.exec(content)) !== null) {
		functions.push(match[1])
	}

	// Extract class declarations
	const classRegex = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[^{]+)?\s*\{/g
	while ((match = classRegex.exec(content)) !== null) {
		classes.push(match[1])
	}

	// Extract imports
	const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g
	while ((match = importRegex.exec(content)) !== null) {
		imports.push(match[1])
	}

	return { functions, classes, imports }
}

/**
 * Calculate structural similarity between two code structures.
 * Returns a value between 0 and 1, where 1 means identical structure.
 */
function calculateStructuralSimilarity(
	old: { functions: string[]; classes: string[]; imports: string[] },
	new_: { functions: string[]; classes: string[]; imports: string[] },
): number {
	// Compare function sets
	const oldFuncSet = new Set(old.functions)
	const newFuncSet = new Set(new_.functions)
	const commonFuncs = [...oldFuncSet].filter((f) => newFuncSet.has(f)).length
	const totalFuncs = new Set([...oldFuncs, ...new_.functions]).size
	const funcSimilarity = totalFuncs > 0 ? commonFuncs / totalFuncs : 1

	// Compare class sets
	const oldClassSet = new Set(old.classes)
	const newClassSet = new Set(new_.classes)
	const commonClasses = [...oldClassSet].filter((c) => newClassSet.has(c)).length
	const totalClasses = new Set([...old.classes, ...new_.classes]).size
	const classSimilarity = totalClasses > 0 ? commonClasses / totalClasses : 1

	// Compare import sets (less weight since imports change frequently)
	const oldImportSet = new Set(old.imports)
	const newImportSet = new Set(new_.imports)
	const commonImports = [...oldImportSet].filter((i) => newImportSet.has(i)).length
	const totalImports = new Set([...old.imports, ...new_.imports]).size
	const importSimilarity = totalImports > 0 ? commonImports / totalImports : 1

	// Weighted average: functions and classes are more important than imports
	return funcSimilarity * 0.4 + classSimilarity * 0.4 + importSimilarity * 0.2
}

/**
 * Calculate classification metrics by comparing old and new content.
 */
function calculateMetrics(oldContent: string, newContent: string): ClassificationMetrics {
	const oldStructure = extractCodeStructure(oldContent)
	const newStructure = extractCodeStructure(newContent)

	const structuralSimilarity = calculateStructuralSimilarity(oldStructure, newStructure)

	// Calculate content change ratio using line-by-line comparison
	const oldLines = oldContent.split("\n")
	const newLines = newContent.split("\n")
	const maxLines = Math.max(oldLines.length, newLines.length)
	const changedLines = oldLines.filter((line, i) => {
		if (i >= newLines.length) return true
		return line.trim() !== newLines[i].trim()
	}).length
	const contentChangeRatio = maxLines > 0 ? changedLines / maxLines : 0

	// Detect new/removed entities
	const oldFuncSet = new Set(oldStructure.functions)
	const newFuncSet = new Set(newStructure.functions)
	const hasNewFunctions = [...newFuncSet].some((f) => !oldFuncSet.has(f))
	const hasRemovedFunctions = [...oldFuncSet].some((f) => !newFuncSet.has(f))

	const oldClassSet = new Set(oldStructure.classes)
	const newClassSet = new Set(newStructure.classes)
	const hasNewClasses = [...newClassSet].some((c) => !oldClassSet.has(c))
	const hasRemovedClasses = [...oldClassSet].some((c) => !newClassSet.has(c))

	const oldImportSet = new Set(oldStructure.imports)
	const newImportSet = new Set(newStructure.imports)
	const hasNewImports = [...newImportSet].some((i) => !oldImportSet.has(i))

	const lineCountChange = newLines.length - oldLines.length

	return {
		structuralSimilarity,
		contentChangeRatio,
		hasNewFunctions,
		hasNewClasses,
		hasNewImports,
		hasRemovedFunctions,
		hasRemovedClasses,
		lineCountChange,
	}
}

/**
 * Classify a mutation using AST-based heuristics.
 *
 * This function uses structural analysis to distinguish between:
 * - AST_REFACTOR: Changes that preserve structure (renames, formatting, refactoring)
 * - INTENT_EVOLUTION: Changes that modify structure (new features, behavior changes)
 *
 * @param oldContent - Previous file content (if available)
 * @param newContent - New file content
 * @param llmProvidedClass - Classification provided by LLM (used as hint, but verified)
 * @returns The mutation classification
 */
export function classifyMutationAST(
	oldContent: string | undefined,
	newContent: string,
	llmProvidedClass?: MutationClass,
): MutationClass {
	// If no old content, this is a new file = intent evolution
	if (!oldContent) {
		return "INTENT_EVOLUTION"
	}

	// If old and new are identical, it's a no-op (treat as refactor)
	if (oldContent === newContent) {
		return "AST_REFACTOR"
	}

	// Calculate metrics
	const metrics = calculateMetrics(oldContent, newContent)

	// Heuristic 1: High structural similarity + low content change = refactor
	if (metrics.structuralSimilarity > 0.8 && metrics.contentChangeRatio < 0.3) {
		return "AST_REFACTOR"
	}

	// Heuristic 2: New functions/classes = intent evolution
	if (metrics.hasNewFunctions || metrics.hasNewClasses) {
		return "INTENT_EVOLUTION"
	}

	// Heuristic 3: Removed functions/classes = intent evolution (behavior change)
	if (metrics.hasRemovedFunctions || metrics.hasRemovedClasses) {
		return "INTENT_EVOLUTION"
	}

	// Heuristic 4: Significant line count change (>20% or >50 lines) = intent evolution
	const lineChangePercent = Math.abs(metrics.lineCountChange) / Math.max(oldContent.split("\n").length, 1)
	if (lineChangePercent > 0.2 || Math.abs(metrics.lineCountChange) > 50) {
		return "INTENT_EVOLUTION"
	}

	// Heuristic 5: Low structural similarity = intent evolution
	if (metrics.structuralSimilarity < 0.5) {
		return "INTENT_EVOLUTION"
	}

	// Heuristic 6: High content change ratio = intent evolution
	if (metrics.contentChangeRatio > 0.5) {
		return "INTENT_EVOLUTION"
	}

	// Default: if LLM provided a class and heuristics are ambiguous, trust LLM
	// Otherwise, default to refactor for minor changes
	if (llmProvidedClass && metrics.structuralSimilarity > 0.6 && metrics.contentChangeRatio < 0.4) {
		return llmProvidedClass
	}

	// Default to refactor for ambiguous cases (preserves existing behavior)
	return "AST_REFACTOR"
}
