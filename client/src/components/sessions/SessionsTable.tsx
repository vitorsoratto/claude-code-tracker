import { useNavigate, Link } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { SessionNameEditor } from "./SessionNameEditor";
import { useRenameSession } from "@/hooks/useSessions";
import { formatDate, formatUSD } from "@/lib/formatters";
import { getSourceLabel } from "@/lib/constants";
import { toast } from "sonner";

interface Session {
  id: string;
  session_id: string;
  custom_name: string | null;
  source: string;
  first_seen: string;
  last_seen: string;
  total_cost_usd: number;
  total_input: number;
  total_output: number;
  entry_count: number;
  project_id?: string | null;
  project_name?: string | null;
}

interface Props {
  sessions: Session[];
  sortBy?: string;
  sortDir?: "asc" | "desc";
  onSort?: (col: string) => void;
}

function SortIcon({ col, sortBy, sortDir }: { col: string; sortBy?: string; sortDir?: "asc" | "desc" }) {
  if (sortBy !== col) return <ArrowUpDown className="inline ml-1 h-3.5 w-3.5 opacity-40" />;
  if (sortDir === "asc") return <ArrowUp className="inline ml-1 h-3.5 w-3.5" />;
  return <ArrowDown className="inline ml-1 h-3.5 w-3.5" />;
}

export function SessionsTable({ sessions, sortBy, sortDir, onSort }: Props) {
  const navigate = useNavigate();
  const rename = useRenameSession();

  function sortableHead(col: string, label: string, className?: string) {
    return (
      <TableHead className={`cursor-pointer select-none hover:text-foreground ${className ?? ""}`} onClick={() => onSort?.(col)}>
        {label}<SortIcon col={col} sortBy={sortBy} sortDir={sortDir} />
      </TableHead>
    );
  }

  function handleRename(id: string, name: string) {
    rename.mutate(
      { id, custom_name: name },
      {
        onSuccess: () => toast.success("Nome atualizado"),
        onError: () => toast.error("Erro ao renomear sessão"),
      },
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead>Fonte</TableHead>
          <TableHead>Projeto</TableHead>
          {sortableHead("first_seen", "Primeira entrada")}
          {sortableHead("last_seen", "Última atividade")}
          {sortableHead("entry_count", "Entradas", "text-right")}
          {sortableHead("total_cost_usd", "Custo", "text-right")}
          <TableHead className="w-8"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((s) => (
          <TableRow
            key={s.id}
            className="cursor-pointer transition-colors hover:bg-accent/50 group"
            onClick={() => navigate(`/sessions/${s.id}`)}
          >
            <TableCell onClick={(e) => e.stopPropagation()}>
              <SessionNameEditor
                currentName={s.custom_name}
                sessionId={s.session_id}
                onSave={(name) => handleRename(s.id, name)}
                source={s.source}
                firstSeen={s.first_seen}
                entryCount={s.entry_count}
              />
            </TableCell>
            <TableCell>
              <Badge variant="outline" className="text-xs">{getSourceLabel(s.source)}</Badge>
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              {s.project_name && s.project_id ? (
                <Link to={`/projects/${s.project_id}`}>
                  <Badge variant="secondary" className="text-xs hover:bg-secondary/80 transition-colors">{s.project_name}</Badge>
                </Link>
              ) : s.project_name ? (
                <Badge variant="secondary" className="text-xs">{s.project_name}</Badge>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-sm">{formatDate(s.first_seen)}</TableCell>
            <TableCell className="text-sm">{formatDate(s.last_seen)}</TableCell>
            <TableCell className="text-right tabular-nums">{s.entry_count}</TableCell>
            <TableCell className="text-right tabular-nums font-medium">{formatUSD(s.total_cost_usd)}</TableCell>
            <TableCell className="w-8 px-2">
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
