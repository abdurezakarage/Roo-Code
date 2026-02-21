import { execSync } from "child_process"
import * as path from "node:path"
import * as fs from "node:fs/promises"

/**
 * Get the current git revision (commit hash) for a workspace.
 * @param workspaceRoot - Root directory of the workspace
 * @returns Git commit hash, or undefined if not a git repository or git is unavailable
 */
export async function getVcsRevision(workspaceRoot: string): Promise<string | undefined> {
	try {
		// Check if .git directory exists
		const gitDir = path.join(workspaceRoot, ".git")
		try {
			await fs.access(gitDir)
		} catch {
			// Not a git repository
			return undefined
		}

		// Get current commit hash
		const revision = execSync("git rev-parse HEAD", {
			cwd: workspaceRoot,
			encoding: "utf8",
		}).trim()

		return revision || undefined
	} catch (error) {
		// Git not installed, not a repo, or other error
		return undefined
	}
}

/**
 * Get the current git branch name for a workspace.
 * @param workspaceRoot - Root directory of the workspace
 * @returns Git branch name, or undefined if not available
 */
export async function getVcsBranch(workspaceRoot: string): Promise<string | undefined> {
	try {
		const gitDir = path.join(workspaceRoot, ".git")
		try {
			await fs.access(gitDir)
		} catch {
			return undefined
		}

		const branch = execSync("git rev-parse --abbrev-ref HEAD", {
			cwd: workspaceRoot,
			encoding: "utf8",
		}).trim()

		return branch || undefined
	} catch (error) {
		return undefined
	}
}
