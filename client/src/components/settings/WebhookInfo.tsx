import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Props {
  webhookToken: string;
}

export function WebhookInfo({ webhookToken }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showClaudeAiGuide, setShowClaudeAiGuide] = useState(false);
  const [showHarnessGuide, setShowHarnessGuide] = useState(false);

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  const webhookUrl = `${window.location.origin}/api/webhook/track-tokens`;
  const harnessImportCommand = `TOKEN_TRACKER_WEBHOOK="${webhookUrl}" \\
TOKEN_TRACKER_TOKEN="${webhookToken}" \\
python3 scripts/harness_importer.py --source all`;

  const claudeAiCurlExample = `curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Token: ${webhookToken}" \\
  -d '{
    "source": "claude.ai",
    "model": "claude-opus-4-6",
    "input_tokens": 1500,
    "output_tokens": 800,
    "cache_read_tokens": 0,
    "cache_write_tokens": 0,
    "session_id": "minha-sessao-123",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }'`;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Webhook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">URL do Webhook</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-muted p-2 text-sm break-all">{webhookUrl}</code>
              <Button size="icon" variant="outline" onClick={() => copyText(webhookUrl, "url")}>
                {copied === "url" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Token (header X-Webhook-Token)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-muted p-2 text-sm font-mono">{webhookToken}</code>
              <Button size="icon" variant="outline" onClick={() => copyText(webhookToken, "token")}>
                {copied === "token" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Claude Code Setup */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">Configuração — Claude Code</p>
            <p className="text-sm text-muted-foreground mb-3">
              Configure o hook no <code className="rounded bg-muted px-1 py-0.5">~/.claude/settings.json</code> apontando para o script Python:
            </p>
            <div className="rounded bg-muted p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto">
{`{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python3 /caminho/para/claude_code_hook.py"
          }
        ]
      }
    ]
  }
}`}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Configure as variáveis de ambiente <code className="rounded bg-muted px-1">TOKEN_TRACKER_WEBHOOK</code> e{" "}
              <code className="rounded bg-muted px-1">TOKEN_TRACKER_TOKEN</code> no seu sistema.
            </p>
          </div>

          {/* Agent harness importer */}
          <div className="border-t pt-4">
            <button
              className="flex items-center gap-2 text-sm font-medium hover:text-foreground transition-colors text-muted-foreground w-full text-left"
              onClick={() => setShowHarnessGuide(!showHarnessGuide)}
            >
              {showHarnessGuide ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Configuração — Codex / Pi / Droid
            </button>

            {showHarnessGuide && (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Rode o importador local para ler os registros em <code className="rounded bg-muted px-1">~/.codex</code>,{" "}
                  <code className="rounded bg-muted px-1">~/.pi/agent</code> e <code className="rounded bg-muted px-1">~/.factory</code>.
                </p>
                <div className="rounded bg-muted p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto relative">
                  {harnessImportCommand}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-2 right-2 h-6 w-6"
                    onClick={() => copyText(harnessImportCommand, "harness")}
                  >
                    {copied === "harness" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use <code className="rounded bg-muted px-1">--dry-run</code> para conferir a leitura sem enviar dados.
                </p>
              </div>
            )}
          </div>

          {/* Guia claude.ai */}
          <div className="border-t pt-4">
            <button
              className="flex items-center gap-2 text-sm font-medium hover:text-foreground transition-colors text-muted-foreground w-full text-left"
              onClick={() => setShowClaudeAiGuide(!showClaudeAiGuide)}
            >
              {showClaudeAiGuide ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Configuração — claude.ai / API Anthropic
            </button>

            {showClaudeAiGuide && (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Para rastrear uso da API Anthropic diretamente ou via scripts externos, envie um POST para o webhook após cada chamada:
                </p>

                <div>
                  <p className="text-xs font-medium mb-1 text-muted-foreground">Exemplo com cURL:</p>
                  <div className="rounded bg-muted p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto relative">
                    {claudeAiCurlExample}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={() => copyText(claudeAiCurlExample, "curl")}
                    >
                      {copied === "curl" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium mb-1 text-muted-foreground">Campos do payload:</p>
                  <div className="rounded-md border text-xs">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="text-left p-2 font-medium">Campo</th>
                          <th className="text-left p-2 font-medium">Tipo</th>
                          <th className="text-left p-2 font-medium">Descrição</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ["source", "string", "Ex: claude.ai, claude-code, opencode, codex, pi, droid"],
                          ["model", "string", "Nome do modelo usado"],
                          ["input_tokens", "int", "Tokens de entrada"],
                          ["output_tokens", "int", "Tokens de saída"],
                          ["cache_read_tokens", "int", "Tokens lidos do cache (opcional)"],
                          ["cache_write_tokens", "int", "Tokens escritos no cache (opcional)"],
                          ["session_id", "string", "ID da sessão (opcional, agrupa entries)"],
                          ["timestamp", "ISO8601", "Quando ocorreu (opcional, usa now() se omitido)"],
                          ["auto_name", "string", "Nome automático da sessão (opcional)"],
                        ].map(([campo, tipo, desc]) => (
                          <tr key={campo} className="border-b last:border-0">
                            <td className="p-2 font-mono">{campo}</td>
                            <td className="p-2 text-muted-foreground">{tipo}</td>
                            <td className="p-2 text-muted-foreground">{desc}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  💡 O webhook é stateless — cada chamada registra 1 entry. Para agrupar em sessões, use o mesmo <code className="rounded bg-muted px-1">session_id</code> em todas as calls da mesma conversa.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Referência de Preços por Modelo</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Modelo</TableHead>
                <TableHead className="text-right">Input/1M</TableHead>
                <TableHead className="text-right">Output/1M</TableHead>
                <TableHead className="text-right">Cache Read/1M</TableHead>
                <TableHead className="text-right">Cache Write/1M</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">claude-opus-4-6</TableCell>
                <TableCell className="text-right">$15.00</TableCell>
                <TableCell className="text-right">$75.00</TableCell>
                <TableCell className="text-right">$1.50</TableCell>
                <TableCell className="text-right">$18.75</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">claude-sonnet-4-6</TableCell>
                <TableCell className="text-right">$3.00</TableCell>
                <TableCell className="text-right">$15.00</TableCell>
                <TableCell className="text-right">$0.30</TableCell>
                <TableCell className="text-right">$3.75</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">claude-haiku-4-5</TableCell>
                <TableCell className="text-right">$0.80</TableCell>
                <TableCell className="text-right">$4.00</TableCell>
                <TableCell className="text-right">$0.08</TableCell>
                <TableCell className="text-right">$1.00</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
