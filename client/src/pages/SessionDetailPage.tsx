import { useParams, Link } from "react-router-dom";
import { useSessionDetail } from "@/hooks/useSessionDetail";
import { useRenameSession } from "@/hooks/useSessions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { NavBreadcrumb } from "@/components/shared/NavBreadcrumb";
import { SessionNameEditor } from "@/components/sessions/SessionNameEditor";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";
import {
  MessageSquare, DollarSign, Hash, Clock, Activity, FolderOpen, ExternalLink,
} from "lucide-react";
import { formatUSD, formatNumber, formatTokens, formatDate } from "@/lib/formatters";
import { getSourceLabel, MODEL_COLORS, normalizeModelFamily } from "@/lib/constants";
import { TOOLTIP_PROPS } from "@/lib/chartConfig";
import { toast } from "sonner";

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s === 0) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0 && m === 0) return `${s}s`;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function Skeletons() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-96" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useSessionDetail(id);
  const rename = useRenameSession();

  if (isLoading) return <Skeletons />;
  if (isError || !data) {
    return (
      <EmptyState icon={Activity} message="Erro ao carregar sessão" />
    );
  }

  const { session, aggregates, timeline, by_model, entries } = data;

  const duration = aggregates.first_ts && aggregates.last_ts
    ? (new Date(aggregates.last_ts).getTime() - new Date(aggregates.first_ts).getTime()) / 1000
    : 0;

  function handleRename(name: string) {
    if (!session.id) return;
    rename.mutate(
      { id: session.id, custom_name: name },
      {
        onSuccess: () => toast.success("Nome atualizado"),
        onError: () => toast.error("Erro ao renomear sessão"),
      }
    );
  }

  // Pie grouped by model family
  const modelGrouped = by_model.reduce<Record<string, number>>((acc, d) => {
    const family = normalizeModelFamily(d.model);
    acc[family] = (acc[family] || 0) + d.cost_usd;
    return acc;
  }, {});
  const modelPie = Object.entries(modelGrouped)
    .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
    .sort((a, b) => b.value - a.value);
  const modelTotal = modelPie.reduce((s, d) => s + d.value, 0);

  // Token composition bar
  const tokenBreakdown = [
    { name: "Input", value: Number(aggregates.total_input) },
    { name: "Output", value: Number(aggregates.total_output) },
    { name: "Cache Read", value: Number(aggregates.total_cache_read) },
    { name: "Cache Write", value: Number(aggregates.total_cache_write) },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <NavBreadcrumb
        items={[
          { type: "link", label: "Sessões", href: "/sessions", icon: MessageSquare },
          { type: "page", label: session.custom_name || session.session_id.slice(0, 16) },
        ]}
      />

      {/* Header: nome editável + projeto + source */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <SessionNameEditor
            currentName={session.custom_name}
            sessionId={session.session_id}
            onSave={handleRename}
            source={session.source}
            firstSeen={session.first_seen}
            entryCount={session.entry_count}
          />
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="outline" className="text-xs">{getSourceLabel(session.source)}</Badge>
            {session.project_id && session.project_name && (
              <Link to={`/projects/${session.project_id}`}>
                <Badge variant="secondary" className="text-xs gap-1 hover:bg-secondary/80 transition-colors cursor-pointer">
                  <FolderOpen className="h-3 w-3" />
                  {session.project_name}
                </Badge>
              </Link>
            )}
            <span className="text-xs text-muted-foreground">
              {formatDate(session.first_seen)} → {formatDate(session.last_seen)}
            </span>
          </div>
        </div>
        {session.project_id && (
          <Link to={`/projects/${session.project_id}`}>
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Abrir projeto
            </Button>
          </Link>
        )}
      </div>

      {/* Metrics bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-muted p-2 text-green-400">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Custo Total</p>
              <p className="text-lg font-bold tabular-nums">{formatUSD(aggregates.total_cost_usd)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-muted p-2 text-blue-400">
              <Hash className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Tokens</p>
              <p className="text-lg font-bold tabular-nums">{formatTokens(aggregates.total_tokens)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-muted p-2 text-amber-400">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Duração</p>
              <p className="text-lg font-bold tabular-nums">{formatDuration(duration)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-muted p-2 text-purple-400">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Entradas</p>
              <p className="text-lg font-bold tabular-nums">{formatNumber(aggregates.entry_count)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart: cumulative cost */}
      {timeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Custo acumulado</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={timeline} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(v) => formatDate(v).split(" ")[1] || ""}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                  tick={{ fontSize: 11 }}
                  width={60}
                />
                <Tooltip
                  formatter={(v) => formatUSD(Number(v))}
                  labelFormatter={(v) => formatDate(String(v))}
                  {...TOOLTIP_PROPS}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative_cost"
                  name="Custo acumulado"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Grid 2-col: modelos + composição de tokens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Custo por Modelo</CardTitle>
          </CardHeader>
          <CardContent>
            {modelPie.length === 0 ? (
              <EmptyState icon={Activity} message="Sem dados" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={modelPie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {modelPie.map((d) => (
                      <Cell key={d.name} fill={MODEL_COLORS[d.name.toLowerCase()] || MODEL_COLORS.outro} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [
                      `${formatUSD(Number(value))} (${modelTotal > 0 ? ((Number(value) / modelTotal) * 100).toFixed(1) : 0}%)`,
                      "Custo",
                    ]}
                    {...TOOLTIP_PROPS}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Composição de Tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={tokenBreakdown} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => formatTokens(v)} tick={{ fontSize: 11 }} width={60} />
                <Tooltip formatter={(v) => formatTokens(Number(v))} {...TOOLTIP_PROPS} />
                <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Entries */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entradas recentes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <EmptyState icon={Activity} message="Nenhuma entrada" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Horário</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-right">Input</TableHead>
                  <TableHead className="text-right">Output</TableHead>
                  <TableHead className="text-right">Cache</TableHead>
                  <TableHead className="text-right pr-4">Custo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm text-muted-foreground pl-4 tabular-nums whitespace-nowrap">
                      {formatDate(e.timestamp)}
                    </TableCell>
                    <TableCell className="text-sm">{e.model}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTokens(e.input_tokens)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTokens(e.output_tokens)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTokens(Number(e.cache_read) + Number(e.cache_write))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium pr-4">{formatUSD(e.cost_usd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
