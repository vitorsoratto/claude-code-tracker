import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api, ApiError } from "@/lib/api";

interface User {
  id: string;
  email: string;
  display_name: string | null;
  webhook_token: string;
  role: string;
  brl_rate: number;
  plan_cost_usd: number;
  daily_budget_usd: number | null;
  session_budget_usd: number | null;
  plan_start_date: string | null;
  weekly_reset_dow: number;
  weekly_reset_hour: number;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ status: string; message?: string }>;
  register: (email: string, password: string) => Promise<{ status: string; message?: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.get<User>("/auth/me");
      setUser(data);
    } catch {
      setUser(null);
      localStorage.removeItem("token");
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      refreshUser().finally(() => setLoading(false));
    } else {
      // Try auto-login from localhost
      api.get<{ status: string; token: string }>("/auth/local-token")
        .then((res) => {
          if (res.status === "active" && res.token) {
            localStorage.setItem("token", res.token);
            return refreshUser();
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    try {
      const res = await api.post<{ status: string; token?: string; user?: User; message?: string }>(
        "/auth/login",
        { email, password },
      );
      if (res.status === "active" && res.token) {
        localStorage.setItem("token", res.token);
        await refreshUser();
        return { status: "active" };
      }
      return { status: res.status, message: res.message };
    } catch (err) {
      if (err instanceof ApiError) {
        return { status: "error", message: err.message };
      }
      return { status: "error", message: "Connection failed" };
    }
  };

  const register = async (email: string, password: string) => {
    try {
      const res = await api.post<{ status: string; token?: string; message?: string }>(
        "/auth/register",
        { email, password },
      );
      if (res.status === "active" && res.token) {
        localStorage.setItem("token", res.token);
        await refreshUser();
        return { status: "active" };
      }
      return { status: res.status, message: res.message };
    } catch (err) {
      if (err instanceof ApiError) {
        return { status: "error", message: err.message };
      }
      return { status: "error", message: "Connection failed" };
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
