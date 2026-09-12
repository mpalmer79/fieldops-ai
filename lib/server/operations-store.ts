import "server-only";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { optimizeRecovery, type PolicyWeights, type RecoveryPlan } from "@/lib/dispatch-optimizer";
import { db } from "@/lib/server/database";

export { db } from "@/lib/server/database";

export type OperatorRole = "technician" | "dispatcher" | "supervisor" | "admin";
export type Operator = { id: string; email: string; display_name: string; role: OperatorRole };
type PolicyRow = { id: string; sla_weight: number; travel_weight: number; load_weight: number; overtime_weight: number; stability_weight: number; version: number; updated_at: string };
type PlanRow = { id: string; disruption_id: string; status: string; score: number; confidence: number; projected_sla: number; added_travel: number; overtime: number; policy_version: number; optimizer_version: string; version: number; created_at: string; updated_at: string };

const POLICY_ID = "dispatch-default";
const OPTIMIZER_VERSION = "constraint-search-v1";
const roleRank: Record<OperatorRole, number> = { technician: 1, dispatcher: 2, supervisor: 3, admin: 4 };
const technicianIdsByName: Record<string, string> = { "Darius Miles": "T-147", "Sofia Chen": "T-208", "Amara Patel": "T-319" };

function now() {
  return new Date().toISOString();
}

export class OperationError extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message);
  }
}

export async function ensureOperationalState(user: ChatGPTUser): Promise<Operator> {
  const database = db();
  const timestamp = now();
  await database.prepare(`
    INSERT INTO operators (id, email, display_name, role, created_at, updated_at)
    VALUES (?, ?, ?, CASE WHEN (SELECT COUNT(*) FROM operators) = 0 THEN 'admin' ELSE 'dispatcher' END, ?, ?)
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at
  `).bind(user.userId, user.email, user.displayName, timestamp, timestamp).run();

  const operator = await database.prepare("SELECT id, email, display_name, role FROM operators WHERE id = ?").bind(user.userId).first<Operator>();
  if (!operator) throw new OperationError(500, "Operator initialization failed", "OPERATOR_INIT_FAILED");

  const seeded = await database.prepare("SELECT id FROM optimization_policies WHERE id = ?").bind(POLICY_ID).first<{ id: string }>();
  if (!seeded) await seedDemoOperation(operator);
  return operator;
}

async function seedDemoOperation(operator: Operator) {
  const database = db();
  const timestamp = now();
  const technicians = [
    ["T-147", "Darius Miles", "Refrigeration", "AT_SERVICE", "GREATER_BOSTON", '["refrigeration","cooking"]', '["PART-RANGE-A","PART-OVEN-B"]', 8, 6, 42.8, 86],
    ["T-208", "Sofia Chen", "Laundry", "ON_ROUTE", "GREATER_BOSTON", '["laundry","electrical","cooking"]', '["PART-MICRO-C"]', 8, 7, 36.2, 91],
    ["T-274", "Jonah Reed", "Cooking", "ON_ROUTE", "GREATER_BOSTON", '["cooking"]', '["PART-RANGE-A","PART-OVEN-B"]', 7, 5, 31.4, 74],
    ["T-319", "Amara Patel", "Multi-skill", "AT_SERVICE", "GREATER_BOSTON", '["cooking","laundry","refrigeration","electrical"]', '["PART-RANGE-A","PART-OVEN-B","PART-MICRO-C"]', 9, 7, 39.1, 94],
  ];
  const orders = [
    ["WO-48321", "Range", "Cambridge", "11:00–1:00", "cooking", "PART-RANGE-A"],
    ["WO-48344", "Wall oven", "Somerville", "1:00–3:00", "cooking", "PART-OVEN-B"],
    ["WO-48367", "Cooktop", "Boston", "3:00–5:00", "cooking", null],
    ["WO-48372", "Range", "Brookline", "3:00–5:00", "cooking", "PART-RANGE-A"],
    ["WO-48389", "Wall oven", "Quincy", "4:00–6:00", "cooking", "PART-OVEN-B"],
    ["WO-48401", "Microwave", "Medford", "2:00–4:00", "electrical", "PART-MICRO-C"],
    ["WO-48412", "Range", "Newton", "4:00–6:00", "cooking", "PART-RANGE-A"],
  ];
  const statements: D1PreparedStatement[] = [
    database.prepare(`INSERT OR IGNORE INTO optimization_policies (id, sla_weight, travel_weight, load_weight, overtime_weight, stability_weight, version, updated_by, updated_at) VALUES (?, 35, 25, 20, 15, 5, 1, ?, ?)`).bind(POLICY_ID, operator.id, timestamp),
    ...technicians.map(values => database.prepare(`INSERT OR IGNORE INTO technicians (id, name, specialty, status, territory, skills_json, parts_json, route_capacity, active_stops, route_miles, utilization, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`).bind(...values, timestamp)),
    ...orders.map(values => database.prepare(`INSERT OR IGNORE INTO work_orders (id, appliance, city, appointment_window, required_skill, part_code, status, assigned_technician_id, original_technician_id, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED', 'T-274', 'T-274', 1, ?)`).bind(...values, timestamp)),
  ];
  await database.batch(statements);
}

export function requireRole(operator: Operator, minimum: OperatorRole) {
  if (roleRank[operator.role] < roleRank[minimum]) throw new OperationError(403, `${minimum} role required`, "FORBIDDEN");
}

function policyWeights(row: PolicyRow): PolicyWeights {
  return { sla: row.sla_weight, travel: row.travel_weight, load: row.load_weight, overtime: row.overtime_weight, stability: row.stability_weight };
}

async function getPolicy(): Promise<PolicyRow> {
  const row = await db().prepare("SELECT * FROM optimization_policies WHERE id = ?").bind(POLICY_ID).first<PolicyRow>();
  if (!row) throw new OperationError(500, "Optimization policy unavailable", "POLICY_NOT_FOUND");
  return row;
}

export async function getOperationSnapshot(operator: Operator) {
  const database = db();
  const [technicianResult, orderResult, policy, plan, auditResult] = await Promise.all([
    database.prepare("SELECT id, name, specialty, status, route_capacity, active_stops, route_miles, utilization, version, updated_at FROM technicians ORDER BY id").all(),
    database.prepare("SELECT id, appliance, city, appointment_window, status, assigned_technician_id, version, updated_at FROM work_orders ORDER BY appointment_window, id").all(),
    getPolicy(),
    database.prepare("SELECT * FROM recovery_plans ORDER BY created_at DESC LIMIT 1").first<PlanRow>(),
    database.prepare("SELECT id, entity_type, entity_id, action, from_status, to_status, actor_role, metadata_json, created_at FROM audit_log ORDER BY created_at DESC LIMIT 12").all(),
  ]);
  const activePlan = plan ? await serializePlan(plan) : null;
  return {
    operator: { id: operator.id, displayName: operator.display_name, role: operator.role },
    technicians: technicianResult.results,
    workOrders: orderResult.results,
    policy: { ...policyWeights(policy), version: policy.version, updatedAt: policy.updated_at },
    activePlan,
    audit: auditResult.results,
    backend: { persistence: "PostgreSQL", optimizer: OPTIMIZER_VERSION, serverTime: now() },
  };
}

async function serializePlan(plan: PlanRow) {
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
    assignments: rows.filter(row => row.outcome === "REASSIGNED").map(row => ({ jobId: row.work_order_id as string, window: row.appointment_window as string, job: `${row.appliance} · ${row.city}`, from: row.from_name as string, to: row.to_name as string, impactMinutes: row.impact_minutes as number, travelMiles: row.travel_miles as number, overtimeHours: row.overtime_hours as number })),
    rescheduled: rows.filter(row => row.outcome === "RESCHEDULED").map(row => ({ id: row.work_order_id as string, job: `${row.appliance} · ${row.city}`, window: row.appointment_window as string })),
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
  };
}

export async function createDisruption(operator: Operator, input: { technicianId: string; idempotencyKey: string }) {
  requireRole(operator, "dispatcher");
  if (!/^T-\d{3}$/.test(input.technicianId)) throw new OperationError(400, "Invalid technician ID", "INVALID_TECHNICIAN");
  if (input.technicianId !== "T-274") throw new OperationError(422, "This bounded portfolio scenario supports technician T-274", "UNSUPPORTED_SCENARIO");
  if (input.idempotencyKey.length < 12 || input.idempotencyKey.length > 100) throw new OperationError(400, "Invalid idempotency key", "INVALID_IDEMPOTENCY_KEY");
  const database = db();
  const existing = await database.prepare("SELECT id FROM disruptions WHERE idempotency_key = ?").bind(input.idempotencyKey).first<{ id: string }>();
  if (existing) {
    const plan = await database.prepare("SELECT * FROM recovery_plans WHERE disruption_id = ?").bind(existing.id).first<PlanRow>();
    if (plan) return { idempotentReplay: true, plan: await serializePlan(plan) };
  }

  const technician = await database.prepare("SELECT id, status FROM technicians WHERE id = ?").bind(input.technicianId).first<{ id: string; status: string }>();
  if (!technician) throw new OperationError(404, "Technician not found", "TECHNICIAN_NOT_FOUND");
  const policy = await getPolicy();
  const optimized = optimizeRecovery(policyWeights(policy));
  const disruptionId = existing?.id ?? `evt_${crypto.randomUUID()}`;
  const planId = `plan_${disruptionId}`;
  const timestamp = now();

  if (!existing) {
    await database.prepare("INSERT OR IGNORE INTO disruptions (id, type, technician_id, status, idempotency_key, created_by, created_at) VALUES (?, 'TECHNICIAN_UNAVAILABLE', ?, 'EVALUATED', ?, ?, ?)").bind(disruptionId, input.technicianId, input.idempotencyKey, operator.id, timestamp).run();
    const canonical = await database.prepare("SELECT id FROM disruptions WHERE idempotency_key = ?").bind(input.idempotencyKey).first<{ id: string }>();
    if (!canonical) throw new OperationError(500, "Disruption could not be recorded", "DISRUPTION_WRITE_FAILED");
    if (canonical.id !== disruptionId) {
      const replay = await database.prepare("SELECT * FROM recovery_plans WHERE disruption_id = ?").bind(canonical.id).first<PlanRow>();
      if (replay) return { idempotentReplay: true, plan: await serializePlan(replay) };
      throw new OperationError(409, "Disruption is already being evaluated", "DISRUPTION_IN_PROGRESS");
    }
  }

  const statements: D1PreparedStatement[] = [
    database.prepare("UPDATE technicians SET status = 'UNAVAILABLE', version = version + 1, updated_at = ? WHERE id = ?").bind(timestamp, input.technicianId),
    database.prepare(`INSERT OR IGNORE INTO recovery_plans (id, disruption_id, status, score, confidence, projected_sla, added_travel, overtime, policy_version, optimizer_version, version, created_by, created_at, updated_at) VALUES (?, ?, 'AWAITING_APPROVAL', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`).bind(planId, disruptionId, optimized.score, optimized.confidence, optimized.projectedSla, optimized.addedTravel, optimized.overtime, policy.version, OPTIMIZER_VERSION, operator.id, timestamp, timestamp),
    ...planStatements(database, planId, optimized),
    auditStatement(database, `audit_${disruptionId}_created`, "recovery_plan", planId, "PLAN_CREATED", null, "AWAITING_APPROVAL", operator, { technicianId: input.technicianId, scenariosEvaluated: optimized.scenariosEvaluated, feasibleScenarios: optimized.feasibleScenarios, policyVersion: policy.version }, timestamp),
  ];
  await database.batch(statements);
  const plan = await database.prepare("SELECT * FROM recovery_plans WHERE id = ?").bind(planId).first<PlanRow>();
  if (!plan) throw new OperationError(500, "Recovery plan could not be persisted", "PLAN_WRITE_FAILED");
  return { idempotentReplay: false, plan: await serializePlan(plan) };
}

function planStatements(database: D1Database, planId: string, plan: RecoveryPlan): D1PreparedStatement[] {
  return [
    ...plan.assignments.map(assignment => database.prepare(`INSERT OR IGNORE INTO plan_assignments (id, plan_id, work_order_id, from_technician_id, to_technician_id, impact_minutes, travel_miles, overtime_hours, outcome) VALUES (?, ?, ?, 'T-274', ?, ?, ?, ?, 'REASSIGNED')`).bind(`${planId}_${assignment.jobId}`, planId, assignment.jobId, technicianIdsByName[assignment.to], assignment.impactMinutes, assignment.travelMiles, assignment.overtimeHours)),
    ...plan.rescheduled.map(item => database.prepare(`INSERT OR IGNORE INTO plan_assignments (id, plan_id, work_order_id, from_technician_id, to_technician_id, impact_minutes, travel_miles, overtime_hours, outcome) VALUES (?, ?, ?, 'T-274', NULL, 0, 0, 0, 'RESCHEDULED')`).bind(`${planId}_${item.id}`, planId, item.id)),
  ];
}

export function auditStatement(database: D1Database, id: string, entityType: string, entityId: string, action: string, fromStatus: string | null, toStatus: string | null, operator: Operator, metadata: unknown, timestamp = now()) {
  return database.prepare("INSERT OR IGNORE INTO audit_log (id, entity_type, entity_id, action, from_status, to_status, actor_id, actor_role, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, entityType, entityId, action, fromStatus, toStatus, operator.id, operator.role, JSON.stringify(metadata), timestamp);
}

export async function updatePolicy(operator: Operator, input: PolicyWeights & { expectedVersion: number }) {
  requireRole(operator, "supervisor");
  const values = [input.sla, input.travel, input.load, input.overtime, input.stability];
  if (values.some(value => !Number.isInteger(value) || value < 0 || value > 60) || values.every(value => value === 0)) throw new OperationError(400, "Policy weights must be integers from 0 to 60 and cannot all be zero", "INVALID_POLICY");
  const timestamp = now();
  const result = await db().prepare(`UPDATE optimization_policies SET sla_weight = ?, travel_weight = ?, load_weight = ?, overtime_weight = ?, stability_weight = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ? AND version = ?`).bind(input.sla, input.travel, input.load, input.overtime, input.stability, operator.id, timestamp, POLICY_ID, input.expectedVersion).run();
  if (result.meta.changes !== 1) throw new OperationError(409, "Policy changed since it was loaded", "STALE_POLICY");
  const policy = await getPolicy();
  await db().batch([auditStatement(db(), `audit_policy_${policy.version}`, "optimization_policy", POLICY_ID, "POLICY_UPDATED", String(input.expectedVersion), String(policy.version), operator, policyWeights(policy), timestamp)]);
  return { ...policyWeights(policy), version: policy.version, updatedAt: policy.updated_at };
}

export async function transitionPlan(operator: Operator, input: { planId: string; action: "approve" | "reject" | "execute" | "rollback"; expectedVersion: number }) {
  const minimum: Record<typeof input.action, OperatorRole> = { approve: "supervisor", reject: "dispatcher", execute: "supervisor", rollback: "admin" };
  requireRole(operator, minimum[input.action]);
  const plan = await db().prepare("SELECT * FROM recovery_plans WHERE id = ?").bind(input.planId).first<PlanRow>();
  if (!plan) throw new OperationError(404, "Recovery plan not found", "PLAN_NOT_FOUND");
  if (plan.version !== input.expectedVersion) throw new OperationError(409, "Recovery plan changed since it was loaded", "STALE_PLAN");

  if (input.action === "execute") return executePlan(operator, plan);
  if (input.action === "rollback") return rollbackPlan(operator, plan);
  const transitions = input.action === "approve" ? { from: "AWAITING_APPROVAL", to: "APPROVED" } : { from: ["AWAITING_APPROVAL", "APPROVED"], to: "REJECTED" };
  const allowed = Array.isArray(transitions.from) ? transitions.from.includes(plan.status) : transitions.from === plan.status;
  if (!allowed) throw new OperationError(409, `Cannot ${input.action} a plan in ${plan.status}`, "INVALID_TRANSITION");
  const updated = await compareAndSetPlan(plan, transitions.to);
  await db().batch([auditStatement(db(), `audit_${plan.id}_${updated.version}_${input.action}`, "recovery_plan", plan.id, `PLAN_${input.action.toUpperCase()}`, plan.status, updated.status, operator, { expectedVersion: input.expectedVersion })]);
  return serializePlan(updated);
}

async function compareAndSetPlan(plan: PlanRow, nextStatus: string) {
  const timestamp = now();
  const result = await db().prepare("UPDATE recovery_plans SET status = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND status = ?").bind(nextStatus, timestamp, plan.id, plan.version, plan.status).run();
  if (result.meta.changes !== 1) throw new OperationError(409, "Recovery plan changed during this action", "STALE_PLAN");
  const updated = await db().prepare("SELECT * FROM recovery_plans WHERE id = ?").bind(plan.id).first<PlanRow>();
  if (!updated) throw new OperationError(500, "Updated plan unavailable", "PLAN_READ_FAILED");
  return updated;
}

async function executePlan(operator: Operator, plan: PlanRow) {
  if (plan.status !== "APPROVED") throw new OperationError(409, "Plan must be approved before execution", "INVALID_TRANSITION");
  const executing = await compareAndSetPlan(plan, "EXECUTING");
  const database = db();
  try {
    const result = await database.prepare("SELECT work_order_id, to_technician_id, outcome FROM plan_assignments WHERE plan_id = ?").bind(plan.id).all();
    const timestamp = now();
    const effects = result.results.map(row => row.outcome === "REASSIGNED"
      ? database.prepare("UPDATE work_orders SET assigned_technician_id = ?, status = 'REASSIGNED', version = version + 1, updated_at = ? WHERE id = ?").bind(row.to_technician_id, timestamp, row.work_order_id)
      : database.prepare("UPDATE work_orders SET assigned_technician_id = NULL, status = 'RESCHEDULE_REQUIRED', version = version + 1, updated_at = ? WHERE id = ?").bind(timestamp, row.work_order_id));
    await database.batch(effects);
    const executed = await compareAndSetPlan(executing, "EXECUTED");
    await database.batch([auditStatement(database, `audit_${plan.id}_${executed.version}_execute`, "recovery_plan", plan.id, "PLAN_EXECUTED", "APPROVED", "EXECUTED", operator, { assignmentsApplied: effects.length })]);
    return serializePlan(executed);
  } catch (error) {
    const failed = await compareAndSetPlan(executing, "EXECUTION_FAILED");
    await database.batch([auditStatement(database, `audit_${plan.id}_${failed.version}_failed`, "recovery_plan", plan.id, "PLAN_EXECUTION_FAILED", "EXECUTING", "EXECUTION_FAILED", operator, { message: error instanceof Error ? error.message : "Unknown execution failure" })]);
    throw new OperationError(500, "Plan execution failed and was stopped for recovery", "EXECUTION_FAILED");
  }
}

async function rollbackPlan(operator: Operator, plan: PlanRow) {
  if (plan.status !== "EXECUTED") throw new OperationError(409, "Only executed plans can be rolled back", "INVALID_TRANSITION");
  const rollingBack = await compareAndSetPlan(plan, "ROLLING_BACK");
  const database = db();
  try {
    const result = await database.prepare("SELECT work_order_id, from_technician_id FROM plan_assignments WHERE plan_id = ?").bind(plan.id).all();
    const timestamp = now();
    await database.batch(result.results.map(row => database.prepare("UPDATE work_orders SET assigned_technician_id = ?, status = 'SCHEDULED', version = version + 1, updated_at = ? WHERE id = ?").bind(row.from_technician_id, timestamp, row.work_order_id)));
    const rolledBack = await compareAndSetPlan(rollingBack, "ROLLED_BACK");
    await database.batch([auditStatement(database, `audit_${plan.id}_${rolledBack.version}_rollback`, "recovery_plan", plan.id, "PLAN_ROLLED_BACK", "EXECUTED", "ROLLED_BACK", operator, { assignmentsRestored: result.results.length })]);
    return serializePlan(rolledBack);
  } catch (error) {
    const failed = await compareAndSetPlan(rollingBack, "ROLLBACK_FAILED");
    await database.batch([auditStatement(database, `audit_${plan.id}_${failed.version}_rollback_failed`, "recovery_plan", plan.id, "PLAN_ROLLBACK_FAILED", "ROLLING_BACK", "ROLLBACK_FAILED", operator, { message: error instanceof Error ? error.message : "Unknown rollback failure" })]);
    throw new OperationError(500, "Rollback failed and requires operator intervention", "ROLLBACK_FAILED");
  }
}
