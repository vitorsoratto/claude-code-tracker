import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjects } from "@/hooks/useProjects";
import type { DashboardFilters } from "@/hooks/useDashboard";
import { DateRangeFilter } from "@/components/shared/DateRangeFilter";
import { NativeSelect } from "@/components/shared/NativeSelect";
import { SOURCE_OPTIONS } from "@/lib/constants";

interface Props {
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
}

const PERIOD_PRESETS = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "month", label: "Este mês" },
  { value: "all", label: "Tudo" },
];

export function DashboardFilters({ filters, onChange }: Props) {
  const { data: projectsData } = useProjects();
  const projects = projectsData || [];

  const hasActiveFilters = !!(filters.model || filters.source || filters.project_id);

  function clearExtra() {
    onChange({ period: filters.period, from: filters.from, to: filters.to });
  }

  return (
    <div className="space-y-2">
      {/* Date range / presets */}
      <DateRangeFilter
        value={{ preset: filters.period, from: filters.from, to: filters.to }}
        onChange={(range) =>
          onChange({
            ...filters,
            period: range.preset,
            from: range.from,
            to: range.to,
          })
        }
        presets={PERIOD_PRESETS}
      />

      {/* Filtros extras */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Modelo */}
        <Input
          placeholder="Filtrar modelo..."
          value={filters.model || ""}
          onChange={(e) => onChange({ ...filters, model: e.target.value || undefined })}
          className="h-8 w-36 text-sm"
        />

        {/* Fonte */}
        <NativeSelect
          value={filters.source || ""}
          onChange={(e) => onChange({ ...filters, source: e.target.value || undefined })}
          className="w-36"
        >
          <option value="">Todas as fontes</option>
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </NativeSelect>

        {/* Projeto */}
        {projects.length > 0 && (
          <NativeSelect
            value={filters.project_id || ""}
            onChange={(e) => onChange({ ...filters, project_id: e.target.value || undefined })}
            className="w-36"
          >
            <option value="">Todos os projetos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </NativeSelect>
        )}

        {/* Limpar filtros extras */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearExtra} className="h-8 gap-1 text-muted-foreground">
            <X className="h-3.5 w-3.5" />
            Limpar
          </Button>
        )}
      </div>
    </div>
  );
}
