import { useState } from "react";
import { useEntries } from "@/hooks/useEntries";
import { EntriesTable } from "@/components/entries/EntriesTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Loader2 } from "lucide-react";
import { NativeSelect } from "@/components/shared/NativeSelect";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState } from "@/components/shared/EmptyState";
import { toast } from "sonner";
import { SOURCE_OPTIONS } from "@/lib/constants";

async function downloadCsv(params: URLSearchParams) {
  const token = localStorage.getItem("token");
  const res = await fetch(`/api/entries/export?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Erro ao exportar CSV");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `entries-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function EntriesPage() {
  const [page, setPage] = useState(1);
  const [model, setModel] = useState("");
  const [source, setSource] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const { data, isLoading } = useEntries({ page, model, source, from, to });
  const d = data;

  function clearFilters() {
    setModel("");
    setSource("");
    setFrom("");
    setTo("");
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Entradas</h1>

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border p-4">
        <div className="space-y-1">
          <Label className="text-xs">Modelo</Label>
          <NativeSelect
            sizing="default"
            value={model}
            onChange={(e) => { setModel(e.target.value); setPage(1); }}
          >
            <option value="">Todos</option>
            <option value="opus">opus</option>
            <option value="sonnet">sonnet</option>
            <option value="haiku">haiku</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fonte</Label>
          <NativeSelect
            sizing="default"
            value={source}
            onChange={(e) => { setSource(e.target.value); setPage(1); }}
          >
            <option value="">Todas</option>
            {SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">De</Label>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Até</Label>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" />
        </div>
        <Button variant="outline" size="sm" onClick={clearFilters}>
          Limpar filtros
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={isExporting}
          onClick={async () => {
            const p = new URLSearchParams();
            if (model) p.set("model", model);
            if (source) p.set("source", source);
            if (from) p.set("from", from);
            if (to) p.set("to", to);
            setIsExporting(true);
            try {
              await downloadCsv(p);
              toast.success("CSV baixado");
            } catch {
              toast.error("Erro ao exportar CSV");
            } finally {
              setIsExporting(false);
            }
          }}
        >
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {isExporting ? "Exportando..." : "Exportar CSV"}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : d?.entries?.length ? (
        <>
          <div className="overflow-x-auto">
            <EntriesTable entries={d!.entries} />
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-muted-foreground">
              Mostrando {d.entries.length} de {d.total.toLocaleString("pt-BR")} entradas
            </p>
            <Pagination page={page} pages={d!.pages} onPageChange={setPage} />
          </div>
        </>
      ) : (
        <EmptyState message="Nenhuma entrada encontrada." />
      )}
    </div>
  );
}
