import { createHash } from "node:crypto"

/**
 * Generate a SHA-256 hash of string content for spatial hashing.
 * Used for content deduplication and traceability in the Agent Trace Schema.
 *
 * @param content - The string content to hash
 * @returns SHA-256 hash as a hexadecimal string
 */
export function generateContentHash(content: string): string {
	return createHash("sha256").update(content, "utf8").digest("hex")
}
