/**
 * Agent Trace Schema for semantic tracking ledger.
 * Represents a single mutation event with full traceability.
 */
export interface AgentTraceEntry {
	/**
	 * Unique identifier for this trace entry (REQ-ID from Phase 1)
	 */
	req_id: string

	/**
	 * Intent ID linking this mutation to a specific intent
	 */
	intent_id: string

	/**
	 * File path relative to workspace root
	 */
	file: string

	/**
	 * ISO 8601 timestamp of the mutation
	 */
	timestamp: string

	/**
	 * Mutation classification: AST_REFACTOR or INTENT_EVOLUTION
	 */
	mutation_class: "AST_REFACTOR" | "INTENT_EVOLUTION"

	/**
	 * SHA-256 hash of the file content after mutation
	 */
	content_hash: string

	/**
	 * Model identifier that generated this mutation
	 */
	model_identifier?: string

	/**
	 * Array of related REQ-IDs for trace chaining
	 */
	related: string[]

	/**
	 * Ranges object containing content_hash for spatial indexing
	 */
	ranges: {
		content_hash: string
	}

	/**
	 * VCS revision ID (e.g., git commit hash) at the time of mutation
	 */
	vcs?: {
		revision: string
		branch?: string
	}
}

/**
 * Parameters for creating an agent trace entry
 */
export interface AgentTraceParams {
	reqId: string
	intentId: string
	filePath: string
	content: string
	mutationClass: "AST_REFACTOR" | "INTENT_EVOLUTION"
	modelIdentifier?: string
	relatedReqIds?: string[]
	vcsRevision?: string
	vcsBranch?: string
}

import { generateContentHash } from "../utils/spatial-hash"

/**
 * Create an Agent Trace Entry from parameters.
 *
 * @param params - Trace parameters
 * @returns Complete Agent Trace Entry
 */
export function createAgentTraceEntry(params: AgentTraceParams): AgentTraceEntry {
	const contentHash = generateContentHash(params.content)

	const entry: AgentTraceEntry = {
		req_id: params.reqId,
		intent_id: params.intentId,
		file: params.filePath,
		timestamp: new Date().toISOString(),
		mutation_class: params.mutationClass,
		content_hash: contentHash,
		model_identifier: params.modelIdentifier,
		related: params.relatedReqIds || [],
		ranges: {
			content_hash: contentHash,
		},
	}

	// Add VCS information if available
	if (params.vcsRevision) {
		entry.vcs = {
			revision: params.vcsRevision,
		}
		if (params.vcsBranch) {
			entry.vcs.branch = params.vcsBranch
		}
	}

	return entry
}
