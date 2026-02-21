// src/hooks/index.ts
export { loadIntentContext, type LoadedIntentContext } from "./IntentContextLoader"
export { enforceToolSecurityPreHook } from "./ToolSecurityMiddleware"
export { logAgentTrace } from "./TraceLogger"
export { appendAgentTrace } from "./AgentTraceLogger"
export { createAgentTraceEntry, type AgentTraceEntry, type AgentTraceParams } from "./AgentTraceSchema"
export { hookRegistry, HookRegistry, type PreHook, type PostHook, type PreHookResult } from "./HookRegistry"
export { ToolSecurityPreHook } from "./ToolSecurityPreHook"
export { AgentTracePostHook } from "./AgentTracePostHook"
