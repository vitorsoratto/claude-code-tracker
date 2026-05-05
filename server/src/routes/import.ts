import { Router, json } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { insertTokenEntry } from "../services/tokenService.js";
import { getUserId } from "../utils/routeHelpers.js";

const router = Router();

router.use(authMiddleware);
router.use(json({ limit: "5mb" }));

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCostUsd(raw: string): number {
  const cleaned = raw.replace(/^\$/, "").trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

router.post("/", async (req, res) => {
  const userId = getUserId(req);
  const csvText: string = req.body.csv_text;

  if (!csvText || typeof csvText !== "string") {
    res.status(400).json({ status: "error", message: "csv_text is required" });
    return;
  }

  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    res
      .status(400)
      .json({ status: "error", message: "CSV must have a header and at least one data row" });
    return;
  }

  // Skip header
  const dataLines = lines.slice(1);
  let imported = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    try {
      const fields = parseCsvLine(dataLines[i]);

      // Expected columns:
      // 0: Timestamp, 1: Source, 2: Model, 3: Input Tokens, 4: Output Tokens,
      // 5: Cache Read, 6: Cache Write, 7: Total Tokens, 8: Cost (USD),
      // 9: Cost (BRL) [ignored], 10: Session ID, 11: Conversation URL
      if (fields.length < 9) {
        errors++;
        errorDetails.push(`Row ${i + 2}: not enough columns (${fields.length})`);
        continue;
      }

      const timestamp = fields[0];
      const source = fields[1] as "claude-code" | "claude.ai" | "opencode" | "codex" | "pi" | "droid";
      const model = fields[2];
      const inputTokens = parseInt(fields[3], 10) || 0;
      const outputTokens = parseInt(fields[4], 10) || 0;
      const cacheRead = parseInt(fields[5], 10) || 0;
      const cacheWrite = parseInt(fields[6], 10) || 0;
      const totalTokens = parseInt(fields[7], 10) || 0;
      const costUsd = parseCostUsd(fields[8]);
      // fields[9] = Cost (BRL) - ignored
      const sessionId = fields[10] || undefined;
      const conversationUrl = fields[11] || undefined;

      if (!timestamp || !source || !model) {
        errors++;
        errorDetails.push(`Row ${i + 2}: missing timestamp, source, or model`);
        continue;
      }

      if (!["claude-code", "claude.ai", "opencode", "codex", "pi", "droid"].includes(source)) {
        errors++;
        errorDetails.push(`Row ${i + 2}: invalid source "${source}"`);
        continue;
      }

      await insertTokenEntry(userId, {
        timestamp,
        source,
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read: cacheRead,
        cache_write: cacheWrite,
        total_tokens: totalTokens,
        cost_usd: costUsd,
        session_id: sessionId,
        conversation_url: conversationUrl,
      });

      imported++;
    } catch (err: unknown) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errorDetails.push(`Row ${i + 2}: ${msg}`);
    }
  }

  res.json({
    status: "ok",
    imported,
    errors,
    total: dataLines.length,
    error_details: errorDetails.slice(0, 20),
  });
});

export default router;
