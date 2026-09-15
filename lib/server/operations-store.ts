import "server-only";
import { cookies } from "next/headers";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { optimizeRecovery, type PolicyWeights, type RecoveryPlan } from "@/lib/dispatch-optimizer";
import { db, withDatabaseTransaction } from "@/lib/server/database";

export { db } from "@/lib/server/database";

export type OperatorRole = "technician" | "dispatcher" | "supervisor" | "admin";
export type Operator = { id: string; email: string; display_name: string; role: OperatorRole; workspace_id: string };
type PolicyRow = { id: string; sla_weight: number; travel_weight: number; load_weight: number; overtime_weight: number; stability_weight: number; version: number; updated_at: string };
type PlanRow = { id: string; disruption_id: string; status: string; score: number; confidence: number; projected_sla: number; added_travel: number; overtime: number; policy_version: number; optimizer_version: string; version: number; created_by: string; created_at: string; updated_at: string };

const DEMO_USER_ID = "fieldops-public-demo";
const DEMO_SESSION_COOKIE = "fieldops_demo_session";
const DEMO_SESSION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEMO_WORKSPACE_CREATION_LIMIT = 120;
const DEMO_WORKSPACE_WINDOW_MS = 60 * 60 * 1_000;
const MAX_MUTATION_WINDOWS = 512;
const OPTIMIZER_VERSION = "constraint-search-v1";
const roleRank: Record<OperatorRole, number> = { technician: 1, dispatcher: 2, supervisor: 3, admin: 4 };
const technicianIdsByName: Record<string, string> = { "Darius Miles": "T-147", "Sofia Chen": "T-208", "Amara Patel": "T-319" };
const mutationWindows = new Map<string, { count: number; resetAt: number }>();

function now() {
  return new Date().toISOString();
}

export class OperationError extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message);
  }
}

export function scopedId(operator: Operator, id: string) {
  return `${operator.workspace_id}:${id}`;
}

export function publicId(operator: Operator, id: string) {
  const prefix = `${operator.workspace_id}:`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

async function digestId(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

function isPublicDemoUser(user: ChatGPTUser) {
  return process.env.PUBLIC_DEMO_MODE === "true" && user.userId === DEMO_USER_ID;
}

async function resolveWorkspaceId(user: ChatGPTUser, isPublicDemo: boolean) {
  if (!isPublicDemo) return `user-${await digestId(user.userId)}`;

  const cookieStore = await cookies();
  let sessionId = cookieStore.get(DEMO_SESSION_COOKIE)?.value;
  if (!sessionId || !DEMO_SESSION_PATTERN.test(sessionId)) {
    sessionId = crypto.randomUUID();
    cookieStore.set(DEMO_SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }
  return `demo-${sessionId}`;
}

function policyId(operator: Operator) {
  return scopedId(operator, "dispatch-default");
}

function pruneMutationWindows(currentTime: number) {
  for (const [key, window] of mutationWindows) {
    if (currentTime >= window.resetAt) mutationWindows.delete(key);
  }
  while (mutationWindows.size >= MAX_MUTATION_WINDOWS) {
    const oldest = mutationWindows.keys().next().value as string | undefined;
    if (!oldest) break;
    mutationWindows.delete(oldest);
  }
}

function assertMutationRate(operator: Operator, action: string, limit = 12, windowMs = 60_000) {
  const key = `${operator.id}:${action}`;
  const currentTime = Date.now();
  pruneMutationWindows(currentTime);
  const window = mutationWindows.get(key);
  if (!window || currentTime >= window.resetAt) {
    mutationWindows.set(key, { count: 1, resetAt: currentTime + windowMs });
    return;
  }
  if (window.count >= limit) throw new OperationError(429, "Too many demo mutations. Try again shortly.", "RATE_LIMITED");
  window.count += 1;
}

async function assertDemoWorkspaceBudget(database: D1Database, operatorId: string) {
  const existing = await database.prepare("SELECT id FROM operators WHERE id = ?").bind(operatorId).first<{ id: string }>();
  if (existing) return;

  const cutoff = new Date(Date.now() - DEMO_WORKSPACE_WINDOW_MS).toISOString();
  const row = await database.prepare("SELECT COUNT(*) AS count FROM operators WHERE id LIKE 'operator:demo-%' AND created_at >= ?").bind(cutoff).first<{ count: number | string }>();
  if (Number(row?.count ?? 0) >= DEMO_WORKSPACE_CREATION_LIMIT) {
    throw new OperationError(429, "Public demo workspace capacity is temporarily full. Try again later.", "DEMO_CAPACITY_LIMIT");
  }
}

export async function ensureOperationalState(user: ChatGPTUser): Promise<Operator> {
  const database = db();
  const timestamp = now();
  const isPublicDemo = isPublicDemoUser(user);
  const workspaceId = await resolveWorkspaceId(user, isPublicDemo);
  const operatorId = isPublicDemo ? `operator:${workspaceId}` : user.userId;
  const email = isPublicDemo ? `demo+${workspaceId.slice(5)}@fieldops-ai.local` : user.email;
  const desiredRole: OperatorRole = isPublicDemo ? "admin" : "supervisor";

  if (isPublicDemo) await assertDemoWorkspaceBudget(database, operatorId);

  await database.prepare(`
    INSERT INTO operators (id, email, display_name, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      role = CASE WHEN excluded.role = 'admin' THEN 'admin' ELSE operators.role END,
      updated_at = excluded.updated_at
  `).bind(operatorId, email, user.displayName, desiredRole, timestamp, timestamp).run();

  const stored = await database.prepare("SELECT id, email, display_name, role FROM operators WHERE id = ?").bind(operatorId).first<Omit<Operator, "workspace_id">>();
  const operator = stored ? { ...stored, workspace_id: workspaceId } : null;
  if (!operator) throw new OperationError(500, "Operator initialization failed", "OPERATOR_INIT_FAILED");

  const seeded = await database.prepare("SELECT id FROM optimization_policies WHERE id = ?").bind(policyId(operator)).first<{ id: string }>();
  if (!seeded) await seedDemoOperation(operator);
  return operator;
}

async function seedDemoOperation(operator: Operator) {
  const database = db();
  const timestamp = now();
  const internalTechnicianId = (id: string) => scopedId(operator, id);
  const technicians = [
    ["T-147", "Darius Miles", "Engine performance", "IN_BAY", "ROOFTOP_01", '["engine","drivability","electrical"]', '["CKP-39180-2M100","PAD-FRT-G80"]', 8, 6, 42.8, 86],
    ["T-208", "Sofia Chen", "Electrical & ADAS", "ROAD_TEST", "ROOFTOP_01", '["electrical","adas","maintenance"]', '["CAM-ADAS-GV60"]', 8, 7, 36.2, 91],
    ["T-274", "Jonah Reed", "Drivability", "IN_BAY", "ROOFTOP_01", '["drivability","engine","maintenance"]', '["CKP-39180-2M100","THERM-G90"]', 7, 5, 31.4, 74],
    ["T-319", "Amara Patel", "Master technician", "IN_BAY", "ROOFTOP_01", '["engine","drivability","brakes","electrical","adas","maintenance"]', '["CKP-39180-2M100","PAD-FRT-G80","CAM-ADAS-GV60","THERM-G90"]', 9, 7, 39.1, 94],
  ];
  const orders = [
    ["WO-48321", "Check-engine diagnosis", "2023 GV70", "11:00 AM", "drivability", "CKP-39180-2M100"],
    ["WO-48344", "Brake vibration", "2022 G80", "1:00 PM", "brakes", "PAD-FRT-G80"],
    ["WO-48367", "60K maintenance", "2021 GV80", "3:00 PM", "maintenance", null],
    ["WO-48372", "Intermittent no-start", "2023 G70", "3:30 PM", "drivability", "CKP-39180-2M100"],
    ["WO-48389", "Recall campaign", "2024 GV80", "4:00 PM", "engine", null],
    ["WO-48401", "ADAS calibration", "2023 GV60", "2:00 PM", "adas", "CAM-ADAS-GV60"],
    ["WO-48412", "Cooling-system repair", "2022 G90", "4:30 PM", "engine", "THERM-G90"],
  ];
  const statements: D1PreparedStatement[] = [
    database.prepare(`INSERT OR IGNORE INTO optimization_policies (id, sla_weight, travel_weight, load_weight, overtime_weight, stability_weight, version, updated_by, updated_at) VALUES (?, 35, 25, 20, 15, 5, 1, ?, ?)`).bind(policyId(operator), operator.id, timestamp),
    ...technicians.map(values => database.prepare(`INSERT OR IGNORE INTO technicians (id, name, specialty, status, territory, skills_json, parts_json, route_capacity, active_stops, route_miles, utilization, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`).bind(internalTechnicianId(String(values[0])), values[1], values[2], values[3], operator.workspace_id, values[5], values[6], values[7], values[8], values[9], values[10], timestamp)),
    ...orders.map(values => database.prepare(`INSERT OR IGNORE INTO work_orders (id, appliance, city, appointment_window, required_skill, part_code, status, assigned_technician_id, original_technician_id, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?, 1, ?)`).bind(scopedId(operator, String(values[0])), values[1], values[2], values[3], values[4], values[5], internalTechnicianId("T-274"), internalTechnicianId("T-274"), timestamp)),
  ];
  await database.batch(statements);
}

export function requireRole(operator: Operator, minimum: OperatorRole) {
  if (roleRank[operator.role] < roleRank[minimum]) throw new OperationError(403, `${minimum} role required`, "FORBIDDEN");
}

function policyWeights(row: PolicyRow): PolicyWeights {
  return { sla: row.sla_weight, travel: row.travel_weight, load: row.load_weight, overtime: row.overtime_weight, stability: row.stability_weight };
}

async function getPolicy(operator: Operator): Promise<PolicyRow> {
  const row = await db().prepare("SELECT * FROM optimization_policies WHERE id = ?").bind(policyId(operator)).first<PolicyRow>();
  if (!row) throw new OperationError(500, "Optimization policy unavailable", "POLICY_NOT_FOUND");
  return row;
}

export async function getOperationSnapshot(operator: Operator) {
  const database = db();
  const [technicianResult, orderResult, policy, plan, auditResult] = await Promise.all([
    database.prepare("SELECT id, name, specialty, status, route_capacity, active_stops, route_miles, utilization, version, updated_at FROM technicians WHERE territory = ? ORDER BY id").bind(operator.workspace_id).all<{ id: string; name: string; specialty: string; status: string; route_capacity: number; active_stops: number; route_miles: number; utilization: number; version: number; updated_at: string }>(),
    database.prepare(`SELECT wo.id, wo.appliance, wo.city, wo.appointment_window, wo.status, wo.assigned_technician_id, wo.version, wo.updated_at
      FROM work_orders wo
      JOIN technicians original ON original.id = wo.original_technician_id
      WHERE original.territory = ?
      ORDER BY wo.appointment_window, wo.id`).bind(operator.workspace_id).all<{ id: string; appliance: string; city: string; appointment_window: string; status: string; assigned_technician_id: string | null; version: number; updated_at: string }>(),
    getPolicy(operator),
    database.prepare("SELECT * FROM recovery_plans WHERE created_by = ? ORDER BY created_at DESC LIMIT 1").bind(operator.id).first<PlanRow>(),
    database.prepare("SELECT id, entity_type, entity_id, action, from_status, to_status, actor_role, metadata_json, created_at FROM audit_log WHERE actor_id = ? ORDER BY created_at DESC LIMIT 12").bind(operator.id).all(),
  ]);
  const activePlan = plan ? await serializePlan(operator, plan) : null;
  const technicians = technicianResult.results.map(row => ({ ...row, id: publicId(operator, String(row.id)) }));
  const workOrders = orderResult.results.map(row => ({
    ...row,
    id: publicId(operator, String(row.id)),
    assigned_technician_id: row.assigned_technician_id ? publicId(operator, String(row.assigned_technician_id)) : null,
  }));
  const unavailableIds = new Set(technicianResult.results.filter(row => row.status === "UNAVAILABLE").map(row => String(row.id)));
  const operationalRisk = orderResult.results.filter(row => row.assigned_technician_id && unavailableIds.has(String(row.assigned_technician_id))).length;
  const planRisk = activePlan?.rescheduled.length ?? 0;
  const utilizationValues = technicianResult.results.map(row => Number(row.utilization)).filter(Number.isFinite);
  return {
    operator: { id: operator.id, displayName: operator.display_name, role: operator.role },
    workspace: { id: operator.workspace_id, mode: operator.workspace_id.startsWith("demo-") ? "isolated-demo" : "authenticated" },
    technicians,
    workOrders,
    policy: { ...policyWeights(policy), version: policy.version, updatedAt: policy.updated_at },
    activePlan,
    audit: auditResult.results,
    metrics: {
      openRepairOrders: workOrders.filter(row => !["COMPLETED", "CANCELLED"].includes(String(row.status))).length,
      atRiskPromises: Math.max(operationalRisk, planRisk),
      unavailableTechnicians: unavailableIds.size,
      reassignedRepairOrders: activePlan?.assignments.length ?? 0,
      averageTechnicianUtilization: utilizationValues.length > 0
        ? Math.round((utilizationValues.reduce((sum, value) => sum + value, 0) / utilizationValues.length) * 10) / 10
        : null,
      projectedPromiseAttainment: activePlan?.projectedSla ?? null,
    },
    backend: { persistence: "PostgreSQL", optimizer: OPTIMIZER_VERSION, serverTime: now() },
  };
}

async function serializePlan(operator: Operator, plan: PlanRow) {
  if (plan.created_by !== operator.id) throw new OperationError(404, "Recovery plan not found", "PLAN_NOT_FOUND");
  const result = await db().prepare(`
    SELECT pa.*, wo.appointment_window, wo.appliance, wo.city, source.name AS from_name, target.name AS to_name
    FROM plan_assignments pa
    JOIN work_orders wo ON wo.id = pa.work_order_id
    LEFT JOIN technicians source ON source.id = pa.from_technician_id
    LEFT JOIN technicians target ON target.id = pa.to_technician_id
    WHERE pa.plan_id = ?
    ORDER BY pa.work_order_id
  `).bind(plan.id).all();
  const rows = result.results as Array<Record<string, unknown>>;
  return {
    id: plan.id,
    disruptionId: plan.disruption_id,
    status: plan.status,
    version: plan.version,
    score: plan.score,
    confidence: plan.confidence,
    projectedSla: plan.projected_sla,
    addedTravel: plan.added_travel,
    overtime: plan.overtime,
    policyVersion: plan.policy_version,
    optimizerVersion: plan.optimizer_version,
    scenariosEvaluated: 896,
    feasibleScenarios: 150,
    rejectedCandidates: 2,
    assignments: rows.filter(row => row.outcome === "REASSIGNED").map(row => ({ jobId: publicId(operator, row.work_order_id as string), window: row.appointment_window as string, job: `${row.appliance} · ${row.city}`, from: row.from_name as string, to: row.to_name as string, impactMinutes: row.impact_minutes as number, travelMiles: row.travel_miles as number, overtimeHours: row.overtime_hours as number })),
    rescheduled: rows.filter(row => row.outcome === "RESCHEDULED").map(row => ({ id: publicId(operator, row.work_order_id as string), job: `${row.appliance} · ${row.city}`, window: row.appointment_window as string })),
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
  };
}

export async function createDisruption(operator: Operator, input: { technicianId: string; idempotencyKey: string }) {
  requireRole(operator, "dispatcher");
  assertMutationRate(operator, "create-disruption", 6);
  if (!/^T-\d{3}$/.test(input.technicianId)) throw new OperationError(400, "Invalid technician ID", "INVALID_TECHNICIAN");
  if (input.technicianId !== "T-274") throw new OperationError(422, "This bounded portfolio scenario supports technician T-274", "UNSUPPORTED_SCENARIO");
  if (input.idempotencyKey.length < 12 || input.idempotencyKey.length > 100) throw new OperationError(400, "Invalid idempotency key", "INVALID_IDEMPOTENCY_KEY");
  const database = db();
  const technicianId = scopedId(operator, input.technicianId);
  const idempotencyKey = scopedId(operator, input.idempotencyKey);
  const existing = await database.prepare("SELECT id FROM disruptions WHERE idempotency_key = ? AND created_by = ?").bind(idempotencyKey, operator.id).first<{ id: string }>();
  if (existing) {
    const plan = await database.prepare("SELECT * FROM recovery_plans WHERE disruption_id = ? AND created_by = ?").bind(existing.id, operator.id).first<PlanRow>();
    if (plan) return { idempotentReplay: true, plan: await serializePlan(operator, plan) };
  }

  const activePlan = await database.prepare("SELECT id, status FROM recovery_plans WHERE created_by = ? AND status NOT IN ('REJECTED', 'ROLLED_BACK') ORDER BY created_at DESC LIMIT 1").bind(operator.id).first<{ id: string; status: string }>();
  if (activePlan) throw new OperationError(409, `Resolve the existing ${activePlan.status.toLowerCase().replaceAll("_", " ")} recovery plan before creating another disruption`, "ACTIVE_PLAN_EXISTS");

  const technician = await database.prepare("SELECT id, status FROM technicians WHERE id = ? AND territory = ?").bind(technicianId, operator.workspace_id).first<{ id: string; status: string }>();
  if (!technician) throw new OperationError(404, "Technician not found", "TECHNICIAN_NOT_FOUND");
  if (technician.status === "UNAVAILABLE") throw new OperationError(409, "Technician is already unavailable and requires recovery before another disruption", "TECHNICIAN_ALREADY_UNAVAILABLE");
  const policy = await getPolicy(operator);
  const optimized = optimizeRecovery(policyWeights(policy));
  const disruptionId = existing?.id ?? scopedId(operator, `evt_${crypto.randomUUID()}`);
  const planId = `plan_${disruptionId}`;
  const timestamp = now();

  if (!existing) {
    await database.prepare("INSERT OR IGNORE INTO disruptions (id, type, technician_id, previous_technician_status, status, idempotency_key, created_by, created_at) VALUES (?, 'TECHNICIAN_UNAVAILABLE', ?, ?, 'EVALUATED', ?, ?, ?)").bind(disruptionId, technicianId, technician.status, idempotencyKey, operator.id, timestamp).run();
    const canonical = await database.prepare("SELECT id FROM disruptions WHERE idempotency_key = ? AND created_by = ?").bind(idempotencyKey, operator.id).first<{ id: string }>();
    if (!canonical) throw new OperationError(500, "Disruption could not be recorded", "DISRUPTION_WRITE_FAILED");
    if (canonical.id !== disruptionId) {
      const replay = await database.prepare("SELECT * FROM recovery_plans WHERE disruption_id = ? AND created_by = ?").bind(canonical.id, operator.id).first<PlanRow>();
      if (replay) return { idempotentReplay: true, plan: await serializePlan(operator, replay) };
      throw new OperationError(409, "Disruption is already being evaluated", "DISRUPTION_IN_PROGRESS");
    }
  }

  const statements: D1PreparedStatement[] = [
    database.prepare("UPDATE technicians SET status = 'UNAVAILABLE', version = version + 1, updated_at = ? WHERE id = ? AND territory = ?").bind(timestamp, technicianId, operator.workspace_id),
    database.prepare(`INSERT OR IGNORE INTO recovery_plans (id, disruption_id, status, score, confidence, projected_sla, added_travel, overtime, policy_version, optimizer_version, version, created_by, created_at, updated_at) VALUES (?, ?, 'AWAITING_APPROVAL', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`).bind(planId, disruptionId, optimized.score, optimized.confidence, optimized.projectedSla, optimized.addedTravel, optimized.overtime, policy.version, OPTIMIZER_VERSION, operator.id, timestamp, timestamp),
    ...planStatements(database, operator, planId, optimized),
    auditStatement(database, `audit_${disruptionId}_created`, "recovery_plan", planId, "PLAN_CREATED", null, "AWAITING_APPROVAL", operator, { technicianId: input.technicianId, scenariosEvaluated: optimized.scenariosEvaluated, feasibleScenarios: optimized.feasibleScenarios, policyVersion: policy.version }, timestamp),
  ];
  await database.batch(statements);
  const plan = await database.prepare("SELECT * FROM recovery_plans WHERE id = ? AND created_by = ?").bind(planId, operator.id).first<PlanRow>();
  if (!plan) throw new OperationError(500, "Recovery plan could not be persisted", "PLAN_WRITE_FAILED");
  return { idempotentReplay: false, plan: await serializePlan(operator, plan) };
}

function planStatements(database: D1Database, operator: Operator, planId: string, plan: RecoveryPlan): D1PreparedStatement[] {
  return [
    ...plan.assignments.map(assignment => database.prepare(`INSERT OR IGNORE INTO plan_assignments (id, plan_id, work_order_id, from_technician_id, to_technician_id, impact_minutes, travel_miles, overtime_hours, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'REASSIGNED')`).bind(`${planId}_${assignment.jobId}`, planId, scopedId(operator, assignment.jobId), scopedId(operator, "T-274"), scopedId(operator, technicianIdsByName[assignment.to]), assignment.impactMinutes, assignment.travelMiles, assignment.overtimeHours)),
    ...plan.rescheduled.map(item => database.prepare(`INSERT OR IGNORE INTO plan_assignments (id, plan_id, work_order_id, from_technician_id, to_technician_id, impact_minutes, travel_miles, overtime_hours, outcome) VALUES (?, ?, ?, ?, NULL, 0, 0, 0, 'RESCHEDULED')`).bind(`${planId}_${item.id}`, planId, scopedId(operator, item.id), scopedId(operator, "T-274"))),
  ];
}

export function auditStatement(database: D1Database, id: string, entityType: string, entityId: string, action: string, fromStatus: string | null, toStatus: string | null, operator: Operator, metadata: unknown, timestamp = now()) {
  return database.prepare("INSERT OR IGNORE INTO audit_log (id, entity_type, entity_id, action, from_status, to_status, actor_id, actor_role, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, entityType, entityId, action, fromStatus, toStatus, operator.id, operator.role, JSON.stringify(metadata), timestamp);
}

export async function updatePolicy(operator: Operator, input: PolicyWeights & { expectedVersion: number }) {
  requireRole(operator, "supervisor");
  assertMutationRate(operator, "update-policy", 10);
  const values = [input.sla, input.travel, input.load, input.overtime, input.stability];
  if (values.some(value => !Number.isInteger(value) || value < 0 || value > 60) || values.every(value => value === 0)) throw new OperationError(400, "Policy weights must be integers from 0 to 60 and cannot all be zero", "INVALID_POLICY");
  const timestamp = now();
  const result = await db().prepare(`UPDATE optimization_policies SET sla_weight = ?, travel_weight = ?, load_weight = ?, overtime_weight = ?, stability_weight = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ? AND version = ?`).bind(input.sla, input.travel, input.load, input.overtime, input.stability, operator.id, timestamp, policyId(operator), input.expectedVersion).run();
  if (result.meta.changes !== 1) throw new OperationError(409, "Policy changed since it was loaded", "STALE_POLICY");
  const policy = await getPolicy(operator);
  await db().batch([auditStatement(db(), scopedId(operator, `audit_policy_${policy.version}`), "optimization_policy", policyId(operator), "POLICY_UPDATED", String(input.expectedVersion), String(policy.version), operator, policyWeights(policy), timestamp)]);
  return { ...policyWeights(policy), version: policy.version, updatedAt: policy.updated_at };
}

async function lockedPlan(database: D1Database, operator: Operator, planId: string) {
  return database.prepare("SELECT * FROM recovery_plans WHERE id = ? AND created_by = ? FOR UPDATE").bind(planId, operator.id).first<PlanRow>();
}

function assertExpectedPlan(plan: PlanRow | null, expectedVersion: number) {
  if (!plan) throw new OperationError(404, "Recovery plan not found", "PLAN_NOT_FOUND");
  if (plan.version !== expectedVersion) throw new OperationError(409, "Recovery plan changed since it was loaded", "STALE_PLAN");
  return plan;
}

export async function transitionPlan(operator: Operator, input: { planId: string; action: "approve" | "reject" | "execute" | "rollback"; expectedVersion: number }) {
  const minimum: Record<typeof input.action, OperatorRole> = { approve: "supervisor", reject: "dispatcher", execute: "supervisor", rollback: "admin" };
  requireRole(operator, minimum[input.action]);
  assertMutationRate(operator, `transition-${input.action}`, 10);

  if (input.action === "execute") return executePlan(operator, input.planId, input.expectedVersion);
  if (input.action === "rollback") return rollbackPlan(operator, input.planId, input.expectedVersion);

  const updated = await withDatabaseTransaction(async database => {
    const plan = assertExpectedPlan(await lockedPlan(database, operator, input.planId), input.expectedVersion);
    const transitions = input.action === "approve"
      ? { from: ["AWAITING_APPROVAL"], to: "APPROVED" }
      : { from: ["AWAITING_APPROVAL", "APPROVED"], to: "REJECTED" };
    if (!transitions.from.includes(plan.status)) throw new OperationError(409, `Cannot ${input.action} a plan in ${plan.status}`, "INVALID_TRANSITION");

    if (input.action === "reject") {
      const disruption = await database.prepare("SELECT technician_id, previous_technician_status FROM disruptions WHERE id = ? AND created_by = ?").bind(plan.disruption_id, operator.id).first<{ technician_id: string; previous_technician_status: string }>();
      if (!disruption) throw new OperationError(409, "Disruption state is unavailable", "DISRUPTION_STATE_MISSING");
      await database.prepare("UPDATE technicians SET status = ?, version = version + 1, updated_at = ? WHERE id = ? AND territory = ? AND status = 'UNAVAILABLE'").bind(disruption.previous_technician_status, now(), disruption.technician_id, operator.workspace_id).run();
    }

    const next = await compareAndSetPlan(operator, plan, transitions.to, database);
    await auditStatement(database, `${plan.id}:audit:${next.version}:${input.action}`, "recovery_plan", plan.id, `PLAN_${input.action.toUpperCase()}`, plan.status, next.status, operator, { expectedVersion: input.expectedVersion }).run();
    return next;
  });

  return serializePlan(operator, updated);
}

async function compareAndSetPlan(operator: Operator, plan: PlanRow, nextStatus: string, database: D1Database = db()) {
  const timestamp = now();
  const result = await database.prepare("UPDATE recovery_plans SET status = ?, version = version + 1, updated_at = ? WHERE id = ? AND created_by = ? AND version = ? AND status = ?").bind(nextStatus, timestamp, plan.id, operator.id, plan.version, plan.status).run();
  if (result.meta.changes !== 1) throw new OperationError(409, "Recovery plan changed during this action", "STALE_PLAN");
  const updated = await database.prepare("SELECT * FROM recovery_plans WHERE id = ? AND created_by = ?").bind(plan.id, operator.id).first<PlanRow>();
  if (!updated) throw new OperationError(500, "Updated plan unavailable", "PLAN_READ_FAILED");
  return updated;
}

async function executePlan(operator: Operator, planId: string, expectedVersion: number) {
  let executed: PlanRow;
  try {
    executed = await withDatabaseTransaction(async database => {
      const plan = assertExpectedPlan(await lockedPlan(database, operator, planId), expectedVersion);
      if (plan.status !== "APPROVED") throw new OperationError(409, "Plan must be approved before execution", "INVALID_TRANSITION");

      const assignments = await database.prepare("SELECT work_order_id, to_technician_id, from_technician_id, outcome FROM plan_assignments WHERE plan_id = ? ORDER BY work_order_id").bind(plan.id).all();
      const timestamp = now();
      const effects = assignments.results.map(row => row.outcome === "REASSIGNED"
        ? database.prepare("UPDATE work_orders SET assigned_technician_id = ?, status = 'REASSIGNED', version = version + 1, updated_at = ? WHERE id = ? AND original_technician_id = ? AND assigned_technician_id = ? AND status = 'SCHEDULED'").bind(row.to_technician_id, timestamp, row.work_order_id, row.from_technician_id, row.from_technician_id)
        : database.prepare("UPDATE work_orders SET assigned_technician_id = NULL, status = 'RESCHEDULE_REQUIRED', version = version + 1, updated_at = ? WHERE id = ? AND original_technician_id = ? AND assigned_technician_id = ? AND status = 'SCHEDULED'").bind(timestamp, row.work_order_id, row.from_technician_id, row.from_technician_id));
      const results = await database.batch(effects);
      if (results.some(result => result.meta.changes !== 1)) throw new OperationError(409, "A repair order changed after the recovery plan was created", "STALE_WORK_ORDER");

      const next = await compareAndSetPlan(operator, plan, "EXECUTED", database);
      await auditStatement(database, `${plan.id}:audit:${next.version}:execute`, "recovery_plan", plan.id, "PLAN_EXECUTED", "APPROVED", "EXECUTED", operator, { assignmentsApplied: effects.length }).run();
      return next;
    });
  } catch (error) {
    if (error instanceof OperationError) throw error;
    throw new OperationError(500, "Plan execution failed without changing operational state", "EXECUTION_FAILED");
  }

  return serializePlan(operator, executed);
}

async function rollbackPlan(operator: Operator, planId: string, expectedVersion: number) {
  let rolledBack: PlanRow;
  try {
    rolledBack = await withDatabaseTransaction(async database => {
      const plan = assertExpectedPlan(await lockedPlan(database, operator, planId), expectedVersion);
      if (plan.status !== "EXECUTED") throw new OperationError(409, "Only executed plans can be rolled back", "INVALID_TRANSITION");

      const [assignments, disruption] = await Promise.all([
        database.prepare("SELECT work_order_id, from_technician_id FROM plan_assignments WHERE plan_id = ? ORDER BY work_order_id").bind(plan.id).all(),
        database.prepare("SELECT technician_id, previous_technician_status FROM disruptions WHERE id = ? AND created_by = ?").bind(plan.disruption_id, operator.id).first<{ technician_id: string; previous_technician_status: string }>(),
      ]);
      if (!disruption) throw new OperationError(409, "Disruption state is unavailable", "DISRUPTION_STATE_MISSING");

      const timestamp = now();
      const orderRestores = assignments.results.map(row => database.prepare("UPDATE work_orders SET assigned_technician_id = ?, status = 'SCHEDULED', version = version + 1, updated_at = ? WHERE id = ? AND original_technician_id = ? AND status IN ('REASSIGNED', 'RESCHEDULE_REQUIRED')").bind(row.from_technician_id, timestamp, row.work_order_id, disruption.technician_id));
      const orderResults = await database.batch(orderRestores);
      if (orderResults.some(result => result.meta.changes !== 1)) throw new OperationError(409, "A repair order changed after plan execution", "STALE_WORK_ORDER");

      const technicianRestore = await database.prepare("UPDATE technicians SET status = ?, version = version + 1, updated_at = ? WHERE id = ? AND territory = ? AND status = 'UNAVAILABLE'").bind(disruption.previous_technician_status, timestamp, disruption.technician_id, operator.workspace_id).run();
      if (technicianRestore.meta.changes !== 1) throw new OperationError(409, "Technician state changed after plan execution", "STALE_TECHNICIAN");

      const next = await compareAndSetPlan(operator, plan, "ROLLED_BACK", database);
      await auditStatement(database, `${plan.id}:audit:${next.version}:rollback`, "recovery_plan", plan.id, "PLAN_ROLLED_BACK", "EXECUTED", "ROLLED_BACK", operator, { assignmentsRestored: assignments.results.length, technicianStatusRestored: disruption.previous_technician_status }).run();
      return next;
    });
  } catch (error) {
    if (error instanceof OperationError) throw error;
    throw new OperationError(500, "Rollback failed without changing operational state", "ROLLBACK_FAILED");
  }

  return serializePlan(operator, rolledBack);
}
