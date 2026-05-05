export const MS_PER_DAY = 86_400_000;

export const CHART_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#14b8a6",
];

export const DOW_LABELS_FULL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const DOW_LABELS_SPARSE = ["", "Seg", "", "Qua", "", "Sex", ""];
export const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export const MODEL_COLORS: Record<string, string> = {
  opus: "#a855f7",
  sonnet: "#3b82f6",
  haiku: "#22c55e",
  outro: "#6b7280",
};

export const SOURCE_COLORS: Record<string, string> = {
  "claude-code": "#f59e0b",
  "claude.ai": "#06b6d4",
  opencode: "#10b981",
  codex: "#111827",
  pi: "#ec4899",
  droid: "#84cc16",
};

export const SOURCE_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  "claude.ai": "claude.ai",
  opencode: "OpenCode",
  codex: "Codex",
  pi: "Pi",
  droid: "Droid",
};

export const SOURCE_OPTIONS = [
  { value: "claude-code", label: SOURCE_LABELS["claude-code"] },
  { value: "claude.ai", label: SOURCE_LABELS["claude.ai"] },
  { value: "opencode", label: SOURCE_LABELS.opencode },
  { value: "codex", label: SOURCE_LABELS.codex },
  { value: "pi", label: SOURCE_LABELS.pi },
  { value: "droid", label: SOURCE_LABELS.droid },
];

export function getSourceLabel(source: string): string {
  return SOURCE_LABELS[source] || source;
}

export const VALUE_COLORS = {
  good: "#22c55e",
  medium: "#eab308",
  poor: "#ef4444",
};

export function normalizeModelFamily(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("opus")) return "opus";
  if (lower.includes("sonnet")) return "sonnet";
  if (lower.includes("haiku")) return "haiku";
  return "outro";
}

export function getModelColor(raw: string): string {
  return MODEL_COLORS[normalizeModelFamily(raw)] || MODEL_COLORS.outro;
}
