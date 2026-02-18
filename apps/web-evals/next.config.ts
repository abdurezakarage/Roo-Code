import * as path from "node:path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
	turbopack: {
		root: path.join(__dirname, "../.."),
	},
	transpilePackages: ["@roo-code/types", "@roo-code/evals"],
}

export default nextConfig
