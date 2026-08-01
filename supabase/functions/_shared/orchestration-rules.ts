// Shared eligibility, rule-application and notification-dedupe helpers for the
// Task Orchestration edge functions. Kept free of any closure over a specific
// Supabase client so both `admin-task-orchestration-action` and
// `admin-task-orchestration-overview` can import the same logic.

/** Availability statuses that make an agent ineligible for automatic work. */
export const INELIGIBLE_STATUSES = new Set(["offline", "on_leave", "suspended"]);

export function isEligibleStatus(status: string | null | undefined): boolean {
  return !INELIGIBLE_STATUSES.has(status ?? "offline");
}

export type AgentSnapshot = {
  agent_id: string;
  status: string;
  current_active: number;
  max_active_tasks: number;
  overdue_count?: number;
  skills: Set<string>;
  is_senior?: boolean;
};

export type TaskSnapshot = {
  id: string;
  task_code: string;
  priority?: string | null;
  required_permissions?: string[] | null;
};

export type RulesConfig = {
  mode?: string;
  queue_scope?: string;
  online_only?: boolean;
  skip_at_capacity?: boolean;
  priority_to_senior_pool?: boolean;
  max_overdue_before_skip?: number;
  fallback_target?: "senior_agent_pool" | "escalation_queue" | "leave_unassigned";
  [k: string]: unknown;
};

export type PickResult =
  | { agent_id: string; rule_used: string }
  | { agent_id: null; reason: string };

/**
 * Normalise a rules payload against defaults so callers never have to guard
 * for missing keys. Numeric fields are coerced; unknown modes fall back to
 * `manual`.
 */
export function applyRules(config: RulesConfig | null | undefined): Required<
  Pick<RulesConfig, "mode" | "queue_scope" | "online_only" | "skip_at_capacity" | "priority_to_senior_pool" | "max_overdue_before_skip" | "fallback_target">
> & RulesConfig {
  const cfg = { ...(config ?? {}) } as RulesConfig;
  const MODES = ["manual", "round_robin", "least_loaded", "skill_based", "priority_based"];
  const mode = MODES.includes(String(cfg.mode)) ? String(cfg.mode) : "manual";
  const num = (v: unknown, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  return {
    ...cfg,
    mode,
    queue_scope: String(cfg.queue_scope ?? "global"),
    online_only: cfg.online_only !== false,
    skip_at_capacity: cfg.skip_at_capacity !== false,
    priority_to_senior_pool: cfg.priority_to_senior_pool === true,
    max_overdue_before_skip: num(cfg.max_overdue_before_skip, 3),
    fallback_target: (cfg.fallback_target as RulesConfig["fallback_target"]) ?? "leave_unassigned",
  };
}

/**
 * Pick a single agent for one task under the configured mode.
 *
 * `seats` carries the remaining capacity per agent across a planning run so
 * repeated calls within the same batch do not over-allocate. `rrCursor` is the
 * last agent picked for the queue (round-robin pointer persistence).
 */
export function pickAgent(
  mode: string,
  task: TaskSnapshot,
  rules: RulesConfig,
  agents: AgentSnapshot[],
  seats: Map<string, number>,
  rrCursor?: string | null,
): PickResult {
  const cfg = applyRules(rules);
  const required = new Set<string>((task.required_permissions ?? []) as string[]);

  let pool = agents.filter((a) => {
    if (cfg.online_only && !isEligibleStatus(a.status)) return false;
    if (cfg.skip_at_capacity && (seats.get(a.agent_id) ?? 0) <= 0) return false;
    if ((a.overdue_count ?? 0) > cfg.max_overdue_before_skip) return false;
    for (const p of required) if (!a.skills.has(p)) return false;
    return true;
  });

  if (!pool.length) {
    return { agent_id: null, reason: required.size > 0 ? "no_eligible_agent_with_skill" : "no_available_seats" };
  }

  const isHot = task.priority === "critical" || task.priority === "high";
  if ((cfg.priority_to_senior_pool || mode === "priority_based") && isHot) {
    const seniors = pool.filter((a) => a.is_senior);
    if (seniors.length) {
      const best = [...seniors].sort((a, b) => (seats.get(b.agent_id) ?? 0) - (seats.get(a.agent_id) ?? 0))[0];
      return { agent_id: best.agent_id, rule_used: "priority_to_senior_pool" };
    }
  }

  if (mode === "round_robin" && pool.length > 1) {
    const order = pool.map((a) => a.agent_id);
    const idx = rrCursor ? order.indexOf(rrCursor) : -1;
    const rotated = order.slice(idx + 1).concat(order.slice(0, idx + 1));
    const nextId = rotated[0];
    return { agent_id: nextId, rule_used: "round_robin" };
  }

  if (mode === "skill_based" && required.size > 0) {
    // Prefer the most specialised eligible agent (fewest extra skills), then
    // the one with the most free seats.
    pool = [...pool].sort((a, b) => {
      const specA = a.skills.size, specB = b.skills.size;
      if (specA !== specB) return specA - specB;
      return (seats.get(b.agent_id) ?? 0) - (seats.get(a.agent_id) ?? 0);
    });
    return { agent_id: pool[0].agent_id, rule_used: "skill_based" };
  }

  // least_loaded (and default for manual-triggered auto runs)
  const best = [...pool].sort((a, b) => {
    const loadA = a.current_active ?? 0, loadB = b.current_active ?? 0;
    if (loadA !== loadB) return loadA - loadB;
    return (seats.get(b.agent_id) ?? 0) - (seats.get(a.agent_id) ?? 0);
  })[0];
  return { agent_id: best.agent_id, rule_used: mode === "least_loaded" ? "least_loaded" : `auto:${mode}` };
}

/**
 * Durable notification dedupe. Reserves `(event, key, recipient)` for
 * `windowMinutes` in `orchestration_notification_dedupe` and returns the
 * recipients that were NOT already notified inside the window.
 *
 * Falls back to "allow all" if the reservation table is unreachable so an
 * infrastructure hiccup never silently swallows an SLA alert.
 */
export async function dedupeNotification(
  // deno-lint-ignore no-explicit-any
  admin: any,
  event: string,
  key: string,
  recipients: string[],
  windowMinutes = 60,
): Promise<string[]> {
  const unique = [...new Set(recipients.filter(Boolean))];
  if (!unique.length) return [];
  const now = Date.now();
  const expiresAt = new Date(now + windowMinutes * 60_000).toISOString();
  const allowed: string[] = [];

  for (const recipient of unique) {
    try {
      // Clear an expired reservation first so the unique index can be re-taken.
      await admin
        .from("orchestration_notification_dedupe")
        .delete()
        .eq("event", event)
        .eq("key", key)
        .eq("recipient_id", recipient)
        .lt("expires_at", new Date(now).toISOString());

      const { error } = await admin
        .from("orchestration_notification_dedupe")
        .insert({ event, key, recipient_id: recipient, expires_at: expiresAt });

      if (!error) {
        allowed.push(recipient);
        continue;
      }
      // Unique violation => already notified inside the window: suppress.
      if (String((error as { code?: string }).code) === "23505") continue;
      allowed.push(recipient);
    } catch {
      allowed.push(recipient);
    }
  }
  return allowed;
}
