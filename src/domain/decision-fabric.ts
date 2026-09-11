export type PipelineName =
  | "deterministic-rules"
  | "optimization"
  | "predictive-ml"
  | "simulation"
  | "llm-reasoning"
  | "historical-analogue"
  | "cross-branch"
  | "human-heuristic";

export interface PipelineCandidate {
  pipeline: PipelineName;
  action: string;
  objectives: Record<string, number>;
}

export interface RankedDecision {
  action: string;
  supporting: PipelineName[];
  disagreement: boolean;
  onFrontier: boolean;
}

export function reconcilePipelines(candidates: PipelineCandidate[]): RankedDecision[] {
  const byAction = new Map<string, PipelineName[]>();
  for (const candidate of candidates) {
    const list = byAction.get(candidate.action) ?? [];
    list.push(candidate.pipeline);
    byAction.set(candidate.action, list);
  }
  const actions = [...byAction.keys()];
  const frontier = paretoFrontier(candidates);
  return actions.map((action) => ({
    action,
    supporting: byAction.get(action) ?? [],
    disagreement: byAction.size > 1,
    onFrontier: frontier.has(action)
  }));
}

export function paretoFrontier(candidates: PipelineCandidate[]): Set<string> {
  const frontier = new Set<string>();
  for (const candidate of candidates) {
    const dominated = candidates.some((other) => other !== candidate && dominates(other.objectives, candidate.objectives));
    if (!dominated) frontier.add(candidate.action);
  }
  return frontier;
}

function dominates(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let better = false;
  for (const key of keys) {
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    if (av < bv) return false;
    if (av > bv) better = true;
  }
  return better;
}
