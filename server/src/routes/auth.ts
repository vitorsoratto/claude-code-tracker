import { Router } from "express";
import { z } from "zod";
import { registerUser, loginUser, getMe } from "../services/authService.js";
import { authMiddleware } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  display_name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/register", async (req, res) => {
  console.log("[AUTH] Register attempt:", req.body?.email);
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ status: "error", message: parsed.error.issues[0].message });
    return;
  }

  try {
    const result = await registerUser(parsed.data.email, parsed.data.password, parsed.data.display_name);
    if (result.status === "pending") {
      res.status(201).json({
        status: "pending",
        message: "Account created. Waiting for admin approval.",
      });
    } else {
      res.status(201).json({
        status: "active",
        token: result.token,
        user: result.user,
      });
    }
  } catch (err: any) {
    console.error("[REGISTER ERROR]", err);
    if (err.code === "23505") {
      res.status(409).json({ status: "error", message: "Email already registered" });
      return;
    }
    res.status(500).json({ status: "error", message: "internal error" });
  }
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ status: "error", message: "Invalid credentials" });
    return;
  }

  const result = await loginUser(parsed.data.email, parsed.data.password);
  if (!result) {
    res.status(401).json({ status: "error", message: "Invalid email or password" });
    return;
  }

  if (result.status === "pending") {
    res.status(403).json({
      status: "pending",
      message: "Account pending approval.",
    });
    return;
  }

  res.json({ status: "active", token: result.token, user: result.user });
});

// Auto-login: only accessible from localhost, no credentials needed
router.get("/local-token", async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "";
  const isLocal = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  if (!isLocal) {
    res.status(403).json({ status: "error", message: "Local only" });
    return;
  }

  const { query } = await import("../config/database.js");
  const result = await query(
    `SELECT u.id, u.email, us.role
     FROM users u
     JOIN user_settings us ON us.user_id = u.id
     WHERE us.role != 'pending'
     ORDER BY u.created_at ASC
     LIMIT 1`,
    []
  );

  if (result.rows.length === 0) {
    res.status(404).json({ status: "error", message: "No active user found" });
    return;
  }

  const user = result.rows[0];
  const jwt = await import("jsonwebtoken");
  const { env } = await import("../config/env.js");
  const token = jwt.default.sign(
    { userId: user.id, email: user.email, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN } as any
  );

  res.json({ status: "active", token });
});

router.get("/me", authMiddleware, async (req, res) => {
  const { getUserId } = await import("../utils/routeHelpers.js");
  const user = await getMe(getUserId(req));
  if (!user) {
    res.status(404).json({ status: "error", message: "User not found" });
    return;
  }
  res.json(user);
});

export default router;
