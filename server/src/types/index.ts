import type { Request } from "express";

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export interface WebhookUser {
  userId: string;
  email: string;
}

export interface WebhookRequest extends Request {
  webhookUser?: WebhookUser;
}

export interface TokenPayload {
  timestamp: string;
  source: "claude-code" | "claude.ai" | "opencode" | "codex" | "pi" | "droid";
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_write: number;
  total_tokens: number;
  cost_usd: number;
  session_id?: string;
  conversation_url?: string;
}
