// Which model a subagent really runs on. Claude Code resolves it in this order (docs: sub-agents, "Choose a model"):
// the per-call `model` > the agent file's `model` > CLAUDE_CODE_SUBAGENT_MODEL > the main conversation's model.
// SubagentStart/Stop carry no model field (only agent_id and agent_type), so the board computes it from the same inputs.
export type ModelSource = "call" | "file" | "env" | "main";
export interface ModelFacts { requested?: string; declared?: string; effective: string; source: ModelSource }

const FAMILIES = ["opus", "sonnet", "haiku", "fable"];

// "Sonnet", "claude-opus-5-5" -> the family word; "inherit" or empty -> undefined; anything else is kept, lower-cased.
export function normalizeModel(raw: unknown): string | undefined {
  const s = String(raw ?? "").toLowerCase().replace(/\s+/g, "").slice(0, 40);
  if (!s || s === "inherit") return undefined;
  return FAMILIES.find((f) => s.includes(f)) ?? s;
}

export function resolveModel(requested: unknown, declared: unknown, env: Record<string, string | undefined> = process.env): ModelFacts {
  const ask = normalizeModel(requested), file = normalizeModel(declared), fromEnv = normalizeModel(env.CLAUDE_CODE_SUBAGENT_MODEL);
  const [effective, source]: [string, ModelSource] = ask ? [ask, "call"] : file ? [file, "file"] : fromEnv ? [fromEnv, "env"] : ["main", "main"];
  return { requested: ask, declared: file, effective, source };
}

// A cost leak: the call asked for a model that is not the one the agent file declares.
export const isOverride = (requested?: string, declared?: string): boolean => !!requested && requested !== declared;
