/**
 * FileHashTracker - Tracks content hashes for optimistic locking.
 *
 * When an agent reads a file, we store its content hash.
 * Before writing, we compare the current file hash to the stored hash.
 * If they differ, the file was modified by another agent/human and we block the write.
 */
import { generateContentHash } from "../../utils/spatial-hash"

export class FileHashTracker {
	/**
	 * Map of file path -> content hash (from when file was last read)
	 */
	private fileHashes = new Map<string, string>()

	/**
	 * Store the content hash for a file after it's been read.
	 *
	 * @param filePath - Relative file path
	 * @param content - File content that was read
	 */
	storeFileHash(filePath: string, content: string): void {
		const hash = generateContentHash(content)
		this.fileHashes.set(filePath, hash)
	}

	/**
	 * Get the stored content hash for a file (from when it was last read).
	 *
	 * @param filePath - Relative file path
	 * @returns Content hash or undefined if file hasn't been read
	 */
	getStoredHash(filePath: string): string | undefined {
		return this.fileHashes.get(filePath)
	}

	/**
	 * Check if a file's current content matches the stored hash.
	 * Used for optimistic locking before writes.
	 *
	 * @param filePath - Relative file path
	 * @param currentContent - Current file content from disk
	 * @returns true if hash matches (file unchanged), false if different (file was modified)
	 */
	isFileUnchanged(filePath: string, currentContent: string): boolean {
		const storedHash = this.fileHashes.get(filePath)
		if (!storedHash) {
			// File hasn't been read yet, allow write (new file scenario)
			return true
		}

		const currentHash = generateContentHash(currentContent)
		return storedHash === currentHash
	}

	/**
	 * Clear the stored hash for a file (e.g., after successful write).
	 *
	 * @param filePath - Relative file path
	 */
	clearFileHash(filePath: string): void {
		this.fileHashes.delete(filePath)
	}

	/**
	 * Clear all stored hashes (e.g., when task resets).
	 */
	clearAll(): void {
		this.fileHashes.clear()
	}
}
