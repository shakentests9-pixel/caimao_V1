/** Which backing store and auth provider this deployment uses. */
export type DataMode = "memory" | "supabase";

export function dataMode(): DataMode {
  const explicit = process.env.UNIFLOW_DATA_MODE;
  if (explicit === "memory" || explicit === "supabase") return explicit;
  return process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? "supabase"
    : "memory";
}

export function agentMode(): "llm" | "scripted" {
  const explicit = process.env.AGENT_MODE;
  if (explicit === "scripted") return "scripted";
  if (explicit === "llm") return "llm";
  return process.env.ANTHROPIC_API_KEY ? "llm" : "scripted";
}
