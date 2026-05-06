import { query } from "../config/database.js";
import { MS_PER_DAY } from "../utils/routeHelpers.js";

export async function getAnalytics(userId: string, from?: string, to?: string) {
  const now = new Date();
  const startTs = from || "1970-01-01T00:00:00.000Z";
  const endTs = to || now.toISOString();

  // Para project_trend e model_trend: usa from/to se fornecido, senão padrão 60d/12w
  const projectStart = from || new Date(now.getTime() - 60 * MS_PER_DAY).toISOString();
  const modelStart = from || new Date(now.getTime() - 12 * 7 * MS_PER_DAY).toISOString();

  const [projectTrend, modelTrend, sessionDist, periodComparison, heatmap, dataRange, hourlyData, dailyCostData, streaksData] = await Promise.all([
    // 1. Custo por projeto ao longo do tempo
    query(
      `SELECT p.name AS project,
              (te.timestamp AT TIME ZONE 'America/Sao_Paulo')::date AS day,
              COALESCE(SUM(te.cost_usd), 0)::float AS cost_usd
       FROM token_entries te
       JOIN sessions s ON s.session_id = te.session_id AND s.user_id = te.user_id
       JOIN projects p ON p.id = s.project_id
       WHERE te.user_id = $1 AND te.timestamp >= $2 AND te.timestamp <= $3
         AND s.project_id IS NOT NULL
       GROUP BY p.name, day
       ORDER BY day, p.name`,
      [userId, projectStart, endTs]
    ),
    // 2. Tendência de modelos — custo por semana por modelo
    query(
      `SELECT date_trunc('week', timestamp AT TIME ZONE 'America/Sao_Paulo') AS week,
              model,
              COALESCE(SUM(cost_usd), 0)::float AS cost_usd,
              COUNT(*)::int AS entries
       FROM token_entries
       WHERE user_id = $1 AND timestamp >= $2 AND timestamp <= $3
       GROUP BY week, model
       ORDER BY week, model`,
      [userId, modelStart, endTs]
    ),
    // 3. Top 10 sessões mais caras (filtradas pelo período)
    query(
      `SELECT s.id, s.session_id, s.custom_name, s.source,
              COALESCE(SUM(te.cost_usd), 0)::float AS total_cost_usd,
              COUNT(te.id)::int AS entry_count,
              MAX(te.timestamp) AS last_seen
       FROM sessions s
       JOIN token_entries te ON te.session_id = s.session_id AND te.user_id = s.user_id
       WHERE s.user_id = $1 AND te.timestamp >= $2 AND te.timestamp <= $3
       GROUP BY s.id, s.session_id, s.custom_name, s.source
       ORDER BY total_cost_usd DESC
       LIMIT 10`,
      [userId, startTs, endTs]
    ),
    // 4. Comparação este mês vs mês passado (sempre absoluto, ignora filtro)
    query(
      `SELECT
         COALESCE(SUM(CASE WHEN timestamp >= date_trunc('month', NOW()) THEN cost_usd END), 0)::float AS current_month,
         COALESCE(SUM(CASE WHEN timestamp >= date_trunc('month', NOW() - INTERVAL '1 month')
                            AND timestamp < date_trunc('month', NOW()) THEN cost_usd END), 0)::float AS last_month,
         COALESCE(SUM(CASE WHEN timestamp >= date_trunc('month', NOW()) THEN total_tokens END), 0)::bigint AS current_tokens,
         COALESCE(SUM(CASE WHEN timestamp >= date_trunc('month', NOW() - INTERVAL '1 month')
                            AND timestamp < date_trunc('month', NOW()) THEN total_tokens END), 0)::bigint AS last_tokens,
         COUNT(CASE WHEN timestamp >= date_trunc('month', NOW()) THEN 1 END)::int AS current_entries,
         COUNT(CASE WHEN timestamp >= date_trunc('month', NOW() - INTERVAL '1 month')
                     AND timestamp < date_trunc('month', NOW()) THEN 1 END)::int AS last_entries
       FROM token_entries
       WHERE user_id = $1`,
      [userId]
    ),
    // 5. Heatmap: hora do dia × dia da semana — período filtrado
    query(
      `SELECT
         EXTRACT(DOW FROM timestamp AT TIME ZONE 'America/Sao_Paulo')::int AS dow,
         EXTRACT(HOUR FROM timestamp AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
         COUNT(*)::int AS entries,
         COALESCE(SUM(cost_usd), 0)::float AS cost_usd
       FROM token_entries
       WHERE user_id = $1 AND timestamp >= $2 AND timestamp <= $3
       GROUP BY dow, hour
       ORDER BY dow, hour`,
      [userId, startTs, endTs]
    ),
    // 6. Data range real dos dados (do período filtrado)
    query(
      `SELECT
         MIN(timestamp AT TIME ZONE 'America/Sao_Paulo')::date AS first_day,
         MAX(timestamp AT TIME ZONE 'America/Sao_Paulo')::date AS last_day,
         (MAX(timestamp AT TIME ZONE 'America/Sao_Paulo')::date - MIN(timestamp AT TIME ZONE 'America/Sao_Paulo')::date + 1)::int AS total_days
       FROM token_entries
       WHERE user_id = $1 AND timestamp >= $2 AND timestamp <= $3`,
      [userId, startTs, endTs]
    ),
    // 7. Custo por hora ativa — horas com ≥1 entry no período
    query(
      `SELECT
         COUNT(DISTINCT date_trunc('hour', timestamp AT TIME ZONE 'America/Sao_Paulo'))::int AS active_hours,
         COALESCE(SUM(cost_usd), 0)::float AS total_cost,
         CASE
           WHEN COUNT(DISTINCT date_trunc('hour', timestamp AT TIME ZONE 'America/Sao_Paulo')) > 0
           THEN (COALESCE(SUM(cost_usd), 0) / COUNT(DISTINCT date_trunc('hour', timestamp AT TIME ZONE 'America/Sao_Paulo')))::float
           ELSE 0
         END AS cost_per_active_hour,
         COUNT(DISTINCT CASE WHEN timestamp >= date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo' AT TIME ZONE 'UTC')
                         THEN date_trunc('hour', timestamp AT TIME ZONE 'America/Sao_Paulo') END)::int AS active_hours_today,
         COALESCE(SUM(CASE WHEN timestamp >= date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo' AT TIME ZONE 'UTC') THEN cost_usd END), 0)::float AS cost_today
       FROM token_entries
       WHERE user_id = $1 AND timestamp >= $2 AND timestamp <= $3`,
      [userId, startTs, endTs]
    ),
    // 8. Daily cost series (para contribution graph)
    query(
      `SELECT (timestamp AT TIME ZONE 'America/Sao_Paulo')::date AS day,
              COALESCE(SUM(cost_usd), 0)::float AS cost
       FROM token_entries
       WHERE user_id = $1 AND timestamp >= $2 AND timestamp <= $3
       GROUP BY day
       ORDER BY day`,
      [userId, startTs, endTs]
    ),
    // 9. Streaks (sempre histórico completo — não filtra por período)
    query(
      `WITH daily AS (
         SELECT DISTINCT (timestamp AT TIME ZONE 'America/Sao_Paulo')::date AS day
         FROM token_entries WHERE user_id = $1
       ),
       numbered AS (
         SELECT day, day - (ROW_NUMBER() OVER (ORDER BY day) || ' days')::interval AS grp
         FROM daily
       ),
       runs AS (
         SELECT MIN(day) AS start_day, MAX(day) AS end_day, COUNT(*)::int AS streak
         FROM numbered GROUP BY grp
       ),
       most_expensive_day AS (
         SELECT (timestamp AT TIME ZONE 'America/Sao_Paulo')::date AS day,
                SUM(cost_usd)::float AS day_cost
         FROM token_entries WHERE user_id = $1
         GROUP BY 1 ORDER BY day_cost DESC LIMIT 1
       )
       SELECT
         COALESCE((SELECT streak FROM runs WHERE end_day >= CURRENT_DATE - 1 ORDER BY end_day DESC LIMIT 1), 0) AS current_streak,
         COALESCE((SELECT MAX(streak) FROM runs), 0) AS record_streak,
         (SELECT day FROM most_expensive_day) AS most_expensive_day,
         (SELECT day_cost FROM most_expensive_day) AS most_expensive_day_cost,
         (SELECT COUNT(DISTINCT (timestamp AT TIME ZONE 'America/Sao_Paulo')::date)::int FROM token_entries WHERE user_id = $1) AS active_days_total`,
      [userId]
    ),
  ]);

  return {
    project_trend: projectTrend.rows,
    model_trend: modelTrend.rows,
    top_sessions: sessionDist.rows,
    period_comparison: periodComparison.rows[0],
    heatmap: heatmap.rows,
    data_range: dataRange.rows[0],
    hourly: hourlyData.rows[0],
    daily_cost: dailyCostData.rows,
    streaks: streaksData.rows[0],
  };
}

// Achievements/badges baseados em dados reais
export async function getAchievements(userId: string) {
  const result = await query(
    `SELECT
       COUNT(*)::int AS total_entries,
       COALESCE(SUM(cost_usd), 0)::float AS total_cost,
       COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
       COUNT(DISTINCT session_id)::int AS total_sessions,
       COUNT(DISTINCT (timestamp AT TIME ZONE 'America/Sao_Paulo')::date)::int AS active_days,
       COUNT(DISTINCT model)::int AS models_used,
       MAX(cost_usd)::float AS max_single_entry_cost,
       COALESCE(SUM(cache_read), 0)::bigint AS total_cache_read,
       COALESCE(SUM(input_tokens), 0)::bigint AS total_input,
       (SELECT COUNT(DISTINCT p.id)::int FROM projects p JOIN sessions s ON s.project_id = p.id WHERE s.user_id = $1) AS project_count,
       (SELECT MAX(entry_count)::int FROM sessions WHERE user_id = $1) AS max_session_entries,
       (SELECT MAX(total_cost_usd)::float FROM sessions WHERE user_id = $1) AS max_session_cost,
       COALESCE(SUM(cache_read * (CASE
         WHEN model ILIKE '%opus%' THEN 13.5
         WHEN model ILIKE '%haiku%' THEN 0.72
         ELSE 2.7
       END) / 1000000.0), 0)::float AS cache_savings_usd
     FROM token_entries
     WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0];
}

// Comparação de projetos (Wave 2C)
export async function getProjectComparison(userId: string, projectIds: string[], from?: string, to?: string) {
  if (!projectIds.length) return [];

  const now = new Date();
  const startTs = from || new Date(now.getTime() - 30 * MS_PER_DAY).toISOString();
  const endTs = to || now.toISOString();

  // Garante que os IDs são UUIDs válidos (segurança)
  const uuidRegex = /^[0-9a-f-]{36}$/i;
  const safeIds = projectIds.filter((id) => uuidRegex.test(id));
  if (!safeIds.length) return [];

  const placeholders = safeIds.map((_, i) => `$${i + 4}`).join(", ");

  const [summary, daily] = await Promise.all([
    query(
      `SELECT p.id AS project_id, p.name AS project,
              COALESCE(SUM(te.cost_usd), 0)::float AS total_cost_usd,
              COALESCE(SUM(te.total_tokens), 0)::bigint AS total_tokens,
              COUNT(DISTINCT te.session_id)::int AS session_count,
              COUNT(te.id)::int AS entry_count,
              CASE WHEN COUNT(DISTINCT te.session_id) > 0
                   THEN (SUM(te.cost_usd) / COUNT(DISTINCT te.session_id))::float
                   ELSE 0 END AS cost_per_session
       FROM projects p
       LEFT JOIN sessions s ON s.project_id = p.id AND s.user_id = $1
       LEFT JOIN token_entries te ON te.session_id = s.session_id AND te.user_id = $1
                                  AND te.timestamp >= $2 AND te.timestamp <= $3
       WHERE p.id = ANY(ARRAY[${placeholders}]::uuid[])
       GROUP BY p.id, p.name
       ORDER BY total_cost_usd DESC`,
      [userId, startTs, endTs, ...safeIds]
    ),
    query(
      `SELECT p.id AS project_id, p.name AS project,
              (te.timestamp AT TIME ZONE 'America/Sao_Paulo')::date AS day,
              COALESCE(SUM(te.cost_usd), 0)::float AS cost_usd
       FROM projects p
       JOIN sessions s ON s.project_id = p.id AND s.user_id = $1
       JOIN token_entries te ON te.session_id = s.session_id AND te.user_id = $1
                             AND te.timestamp >= $2 AND te.timestamp <= $3
       WHERE p.id = ANY(ARRAY[${placeholders}]::uuid[])
       GROUP BY p.id, p.name, day
       ORDER BY day, p.name`,
      [userId, startTs, endTs, ...safeIds]
    ),
  ]);

  return { summary: summary.rows, daily: daily.rows };
}

// Tempo útil por sessão com gap configurável
export async function getSessionTime(
  userId: string,
  gapMinutes: number,
  from?: string,
  to?: string
) {
  const now = new Date();
  const startTs = from || "1970-01-01T00:00:00.000Z";
  const endTs = to || now.toISOString();

  const result = await query(
    `WITH ordered AS (
       SELECT
         te.session_id,
         s.id AS session_db_id,
         COALESCE(s.custom_name, te.session_id) AS sessao,
         te.timestamp AT TIME ZONE 'America/Sao_Paulo' AS ts,
         LAG(te.timestamp AT TIME ZONE 'America/Sao_Paulo')
           OVER (PARTITION BY te.session_id ORDER BY te.timestamp) AS prev_ts,
         te.cost_usd,
         te.total_tokens,
         s.project_id,
         p.name AS project_name
       FROM token_entries te
       LEFT JOIN sessions s ON s.session_id = te.session_id AND s.user_id = te.user_id
       LEFT JOIN projects p ON p.id = s.project_id
       WHERE te.user_id = $1
         AND te.timestamp >= $2
         AND te.timestamp <= $3
         AND te.session_id IS NOT NULL
     ),
     calc AS (
       SELECT
         session_id,
         session_db_id,
         sessao,
         project_id,
         project_name,
         cost_usd,
         total_tokens,
         ts,
         CASE
           WHEN prev_ts IS NOT NULL AND (ts - prev_ts) < make_interval(mins => $4)
           THEN EXTRACT(EPOCH FROM (ts - prev_ts))
           ELSE 0
         END AS tempo_util_seg
       FROM ordered
     )
     SELECT
       session_id,
       MAX(session_db_id::text) AS session_db_id,
       sessao,
       MAX(project_id::text) AS project_id,
       MAX(project_name) AS project_name,
       SUM(cost_usd)::float AS custo_usd,
       SUM(total_tokens)::bigint AS total_tokens,
       COUNT(*)::int AS calls,
       SUM(tempo_util_seg)::int AS tempo_util_segundos,
       MIN(ts) AS inicio,
       MAX(ts) AS fim
     FROM calc
     GROUP BY session_id, sessao
     ORDER BY custo_usd DESC`,
    [userId, startTs, endTs, gapMinutes]
  );

  return result.rows;
}
