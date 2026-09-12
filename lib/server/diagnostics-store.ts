import "server-only";
import { auditStatement, db, OperationError, requireRole, type Operator } from "@/lib/server/operations-store";

const CASE_ID = "DC-48509";
const WORK_ORDER_ID = "WO-48509";
const SEED_RUN_ID = "DR-48509-SEED";
const MODEL_VERSION = "diagnostic-policy-v1.0";

type CaseRow = {
  id: string;
  work_order_id: string;
  technician_id: string;
  appliance_make: string;
  appliance_model: string;
  serial_tail: string;
  complaint: string;
  symptom_code: string;
  status: string;
  safety_status: string;
  latest_run_id: string;
  selected_recommendation_id: string | null;
  record_version: number;
  created_at: string;
  updated_at: string;
  city?: string;
  appointment_window?: string;
  technician_name?: string;
};

type RunRow = {
  id: string;
  case_id: string;
  model_version: string;
  status: string;
  grounding_rate: number;
  source_count: number;
  tool_call_count: number;
  started_at: string;
  completed_at: string;
};

type RecommendationRow = {
  id: string;
  run_id: string;
  case_id: string;
  rank: number;
  fault_code: string;
  component: string;
  confidence: number;
  rationale: string;
  verification_step: string;
  part_code: string | null;
  safety_class: string;
  grounding_score: number;
  evidence_source_ids_json: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type RecommendationFixture = {
  rank: number;
  faultCode: string;
  component: string;
  confidence: number;
  rationale: string;
  verificationStep: string;
  partCode: string | null;
  safetyClass: "STANDARD" | "LOCKOUT_REQUIRED" | "ESCALATE";
  groundingScore: number;
  sourceIds: string[];
};

const recommendations: RecommendationFixture[] = [
  {
    rank: 1,
    faultCode: "EVAP_FAN_CIRCUIT",
    component: "Freezer evaporator fan circuit",
    confidence: 72,
    rationale: "A warm freezer with normal refrigerator temperature is consistent with impaired freezer air circulation. The symptom pattern and prior repair outcomes support checking the fan circuit before replacing controls.",
    verificationStep: "Disconnect power, inspect the fan path for obstruction, then follow the protected fan-circuit test in the referenced service procedure.",
    partCode: "FAN-EVAP-220",
    safetyClass: "LOCKOUT_REQUIRED",
    groundingScore: 100,
    sourceIds: ["DS-PROC-204", "DS-HISTORY-117", "DS-SAFETY-001"],
  },
  {
    rank: 2,
    faultCode: "DEFROST_SENSOR",
    component: "Defrost temperature sensor",
    confidence: 18,
    rationale: "A biased sensor can interrupt the defrost cycle and reduce freezer airflow, but the current symptom pattern has less historical support than the fan circuit.",
    verificationStep: "With power isolated, inspect the evaporator area and test the sensor using the limits in the referenced procedure.",
    partCode: "SENSOR-DEFROST-14K",
    safetyClass: "LOCKOUT_REQUIRED",
    groundingScore: 100,
    sourceIds: ["DS-PROC-204", "DS-BULLETIN-042", "DS-SAFETY-001"],
  },
  {
    rank: 3,
    faultCode: "MAIN_CONTROL",
    component: "Main control board",
    confidence: 7,
    rationale: "Control output failure remains possible, but the evidence does not support board replacement before fan and sensor verification.",
    verificationStep: "Escalate for electrical diagnostics if fan and sensor checks pass. Do not replace the control board from symptom matching alone.",
    partCode: "PCB-MAIN-RF28",
    safetyClass: "ESCALATE",
    groundingScore: 100,
    sourceIds: ["DS-PROC-204", "DS-BULLETIN-042", "DS-SAFETY-001"],
  },
];

function now() {
  return new Date().toISOString();
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function recommendationId(runId: string, rank: number) {
  return `${runId}-R${rank}`;
}

function insertRecommendation(database: D1Database, runId: string, operator: Operator, timestamp: string, item: RecommendationFixture, guarded = false) {
  const id = recommendationId(runId, item.rank);
  if (!guarded) {
    return database.prepare(`
      INSERT OR IGNORE INTO diagnostic_recommendations
      (id, run_id, case_id, rank, fault_code, component, confidence, rationale, verification_step, part_code, safety_class, grounding_score, evidence_source_ids_json, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROPOSED', ?, ?, ?)
    `).bind(id, runId, CASE_ID, item.rank, item.faultCode, item.component, item.confidence, item.rationale, item.verificationStep, item.partCode, item.safetyClass, item.groundingScore, JSON.stringify(item.sourceIds), operator.id, timestamp, timestamp);
  }
  return database.prepare(`
    INSERT INTO diagnostic_recommendations
    (id, run_id, case_id, rank, fault_code, component, confidence, rationale, verification_step, part_code, safety_class, grounding_score, evidence_source_ids_json, status, created_by, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROPOSED', ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM diagnostic_cases WHERE id = ? AND latest_run_id = ?)
  `).bind(id, runId, CASE_ID, item.rank, item.faultCode, item.component, item.confidence, item.rationale, item.verificationStep, item.partCode, item.safetyClass, item.groundingScore, JSON.stringify(item.sourceIds), operator.id, timestamp, timestamp, CASE_ID, runId);
}

function insertToolCall(database: D1Database, runId: string, operator: Operator, timestamp: string, toolName: string, input: unknown, output: unknown, guarded = false) {
  const id = `${runId}-${toolName}`;
  const prefix = guarded
    ? `INSERT INTO diagnostic_tool_calls (id, run_id, case_id, tool_name, status, input_json, output_json, created_by, created_at)
       SELECT ?, ?, ?, ?, 'SUCCEEDED', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM diagnostic_cases WHERE id = ? AND latest_run_id = ?)`
    : `INSERT OR IGNORE INTO diagnostic_tool_calls (id, run_id, case_id, tool_name, status, input_json, output_json, created_by, created_at)
       VALUES (?, ?, ?, ?, 'SUCCEEDED', ?, ?, ?, ?)`;
  const values = [id, runId, CASE_ID, toolName, JSON.stringify(input), JSON.stringify(output), operator.id, timestamp];
  return database.prepare(prefix).bind(...values, ...(guarded ? [CASE_ID, runId] : []));
}

export async function ensureDiagnosticState(operator: Operator) {
  const database = db();
  const existing = await database.prepare("SELECT id FROM diagnostic_cases WHERE id = ?").bind(CASE_ID).first<{ id: string }>();
  if (existing) return;
  const timestamp = now();
  const sources = [
    ["DS-PROC-204", "Cooling-system diagnostic procedure", "SERVICE_PROCEDURE", "Samsung", "RF28T5001SR", "2026.2", "PROC-RF28-204", "Portfolio reference fixture covering airflow, fan-circuit, sensor, and control-output verification."],
    ["DS-BULLETIN-042", "Intermittent freezer airflow bulletin", "TECHNICAL_BULLETIN", "Samsung", "RF28T5001SR", "2026.1", "TSB-RF28-042", "Portfolio reference fixture describing symptom separation for fan, sensor, and control faults."],
    ["DS-HISTORY-117", "Comparable repair outcome set", "REPAIR_HISTORY", "Samsung", "RF28T5001SR", "2026-Q2", "HIST-RF28-117", "Synthetic outcome set for 117 comparable service visits, weighted by verified first-time fixes."],
    ["DS-SAFETY-001", "Electrical isolation policy", "SAFETY_POLICY", "ALL", "ALL", "2026.3", "SAFE-LOTO-001", "Portfolio safety policy requiring power isolation and technician acknowledgement before protected electrical tests."],
  ];
  const parts = [
    ["PI-FAN-MAN", "FAN-EVAP-220", "Evaporator fan assembly", "Manchester Depot", 3, 1],
    ["PI-FAN-NAS", "FAN-EVAP-220", "Evaporator fan assembly", "Nashua Depot", 0, 0],
    ["PI-SENSOR-MAN", "SENSOR-DEFROST-14K", "Defrost temperature sensor", "Manchester Depot", 5, 1],
    ["PI-SENSOR-VAN", "SENSOR-DEFROST-14K", "Defrost temperature sensor", "Technician T-147 van", 1, 0],
    ["PI-PCB-MAN", "PCB-MAIN-RF28", "Main control board", "Manchester Depot", 1, 1],
  ];
  const statements: D1PreparedStatement[] = [
    database.prepare(`INSERT OR IGNORE INTO work_orders (id, appliance, city, appointment_window, required_skill, part_code, status, assigned_technician_id, original_technician_id, version, updated_at) VALUES (?, 'Refrigerator', 'Waltham', '2:00-4:00', 'refrigeration', 'FAN-EVAP-220', 'IN_SERVICE', 'T-147', 'T-147', 1, ?)`).bind(WORK_ORDER_ID, timestamp),
    ...sources.map(source => database.prepare(`INSERT OR IGNORE INTO diagnostic_sources (id, title, source_type, appliance_make, appliance_model, revision, reference_code, summary, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...source, timestamp)),
    ...parts.map(part => database.prepare(`INSERT OR IGNORE INTO parts_inventory (id, part_code, description, location, on_hand, reserved, record_version, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`).bind(...part, timestamp)),
    database.prepare(`INSERT OR IGNORE INTO diagnostic_cases (id, work_order_id, technician_id, appliance_make, appliance_model, serial_tail, complaint, symptom_code, status, safety_status, latest_run_id, selected_recommendation_id, record_version, created_by, created_at, updated_at) VALUES (?, ?, 'T-147', 'Samsung', 'RF28T5001SR', '7N4K', 'Freezer is warm while refrigerator compartment remains at normal temperature. No alarm is displayed.', 'FREEZER_WARM_FRIDGE_NORMAL', 'ANALYZED', 'ACK_REQUIRED', ?, NULL, 1, ?, ?, ?)`).bind(CASE_ID, WORK_ORDER_ID, SEED_RUN_ID, operator.id, timestamp, timestamp),
    database.prepare(`INSERT OR IGNORE INTO diagnostic_runs (id, case_id, model_version, status, grounding_rate, source_count, tool_call_count, created_by, started_at, completed_at) VALUES (?, ?, ?, 'COMPLETED', 100, 4, 3, ?, ?, ?)`).bind(SEED_RUN_ID, CASE_ID, MODEL_VERSION, operator.id, timestamp, timestamp),
    ...recommendations.map(item => insertRecommendation(database, SEED_RUN_ID, operator, timestamp, item)),
    insertToolCall(database, SEED_RUN_ID, operator, timestamp, "parts_lookup", { partCodes: recommendations.map(item => item.partCode) }, { availableUnits: 7, constrainedParts: ["PCB-MAIN-RF28"] }),
    insertToolCall(database, SEED_RUN_ID, operator, timestamp, "service_history", { workOrderId: WORK_ORDER_ID }, { priorVisits: 0, repeatRepair: false }),
    insertToolCall(database, SEED_RUN_ID, operator, timestamp, "coverage_check", { serialTail: "7N4K" }, { manufacturerCoverage: "EXPIRED", servicePlan: "ACTIVE" }),
    auditStatement(database, `audit-${SEED_RUN_ID}`, "diagnostic_case", CASE_ID, "DIAGNOSTIC_ANALYZED", "INTAKE", "ANALYZED", operator, { runId: SEED_RUN_ID, modelVersion: MODEL_VERSION, sourceCount: 4 }, timestamp),
  ];
  await database.batch(statements);
}

async function caseRow() {
  const row = await db().prepare(`
    SELECT dc.*, wo.city, wo.appointment_window, t.name AS technician_name
    FROM diagnostic_cases dc
    JOIN work_orders wo ON wo.id = dc.work_order_id
    JOIN technicians t ON t.id = dc.technician_id
    WHERE dc.id = ?
  `).bind(CASE_ID).first<CaseRow>();
  if (!row) throw new OperationError(404, "Diagnostic case not found", "DIAGNOSTIC_CASE_NOT_FOUND");
  return row;
}

export async function getDiagnosticSnapshot(operator: Operator) {
  await ensureDiagnosticState(operator);
  const database = db();
  const currentCase = await caseRow();
  const [run, recommendationResult, sourceResult, partResult, toolResult, outcomeResult, auditResult] = await Promise.all([
    database.prepare("SELECT * FROM diagnostic_runs WHERE id = ?").bind(currentCase.latest_run_id).first<RunRow>(),
    database.prepare("SELECT * FROM diagnostic_recommendations WHERE run_id = ? ORDER BY rank").bind(currentCase.latest_run_id).all<RecommendationRow>(),
    database.prepare("SELECT * FROM diagnostic_sources WHERE (appliance_make = ? AND appliance_model = ?) OR source_type = 'SAFETY_POLICY' ORDER BY source_type, title").bind(currentCase.appliance_make, currentCase.appliance_model).all(),
    database.prepare("SELECT * FROM parts_inventory ORDER BY part_code, location").all(),
    database.prepare("SELECT * FROM diagnostic_tool_calls WHERE run_id = ? ORDER BY created_at, tool_name").bind(currentCase.latest_run_id).all(),
    database.prepare("SELECT * FROM diagnostic_outcomes WHERE case_id = ? ORDER BY created_at DESC LIMIT 1").bind(CASE_ID).first(),
    database.prepare("SELECT id, action, from_status, to_status, actor_role, metadata_json, created_at FROM audit_log WHERE entity_type = 'diagnostic_case' AND entity_id = ? ORDER BY created_at DESC LIMIT 8").bind(CASE_ID).all(),
  ]);
  if (!run) throw new OperationError(500, "Diagnostic analysis unavailable", "DIAGNOSTIC_RUN_NOT_FOUND");
  const recs = recommendationResult.results.map(row => ({
    id: row.id,
    rank: row.rank,
    faultCode: row.fault_code,
    component: row.component,
    confidence: row.confidence,
    rationale: row.rationale,
    verificationStep: row.verification_step,
    partCode: row.part_code,
    safetyClass: row.safety_class,
    groundingScore: row.grounding_score,
    sourceIds: parseJson<string[]>(row.evidence_source_ids_json, []),
    status: row.status,
  }));
  return {
    operator: { id: operator.id, displayName: operator.display_name, role: operator.role },
    case: {
      id: currentCase.id,
      workOrderId: currentCase.work_order_id,
      technicianId: currentCase.technician_id,
      technicianName: currentCase.technician_name,
      city: currentCase.city,
      appointmentWindow: currentCase.appointment_window,
      applianceMake: currentCase.appliance_make,
      applianceModel: currentCase.appliance_model,
      serialTail: currentCase.serial_tail,
      complaint: currentCase.complaint,
      symptomCode: currentCase.symptom_code,
      status: currentCase.status,
      safetyStatus: currentCase.safety_status,
      selectedRecommendationId: currentCase.selected_recommendation_id,
      recordVersion: currentCase.record_version,
      createdAt: currentCase.created_at,
      updatedAt: currentCase.updated_at,
    },
    run: {
      id: run.id,
      modelVersion: run.model_version,
      status: run.status,
      groundingRate: run.grounding_rate,
      sourceCount: run.source_count,
      toolCallCount: run.tool_call_count,
      startedAt: run.started_at,
      completedAt: run.completed_at,
    },
    recommendations: recs,
    sources: sourceResult.results,
    parts: partResult.results,
    toolCalls: toolResult.results.map(row => ({ ...row, input: parseJson(String(row.input_json), {}), output: parseJson(String(row.output_json), {}) })),
    outcome: outcomeResult ?? null,
    audit: auditResult.results,
    metrics: {
      topConfidence: recs[0]?.confidence ?? 0,
      groundedRecommendations: recs.filter(item => item.sourceIds.length >= 2 && item.groundingScore === 100).length,
      availableUnits: partResult.results.reduce((sum, row) => sum + Math.max(0, Number(row.on_hand) - Number(row.reserved)), 0),
      unknownProbability: Math.max(0, 100 - recs.reduce((sum, item) => sum + item.confidence, 0)),
    },
    boundaries: {
      scenario: "Synthetic enterprise service case",
      evidence: "Curated portfolio reference fixtures",
      autonomy: "Recommendation only. Technician acknowledgement and final judgment are required.",
    },
  };
}

export async function analyzeDiagnosticCase(operator: Operator, input: { caseId: string; expectedVersion: number }) {
  requireRole(operator, "technician");
  if (input.caseId !== CASE_ID || !Number.isInteger(input.expectedVersion)) throw new OperationError(400, "Valid caseId and expectedVersion are required", "INVALID_DIAGNOSTIC_REQUEST");
  const database = db();
  const current = await caseRow();
  const timestamp = now();
  const runId = `DR-${crypto.randomUUID()}`;
  const nextVersion = input.expectedVersion + 1;
  const statements: D1PreparedStatement[] = [
    database.prepare(`UPDATE diagnostic_cases SET status = 'ANALYZED', safety_status = 'ACK_REQUIRED', latest_run_id = ?, selected_recommendation_id = NULL, record_version = record_version + 1, updated_at = ? WHERE id = ? AND record_version = ?`).bind(runId, timestamp, CASE_ID, input.expectedVersion),
    database.prepare(`INSERT INTO diagnostic_runs (id, case_id, model_version, status, grounding_rate, source_count, tool_call_count, created_by, started_at, completed_at) SELECT ?, ?, ?, 'COMPLETED', 100, 4, 3, ?, ?, ? WHERE EXISTS (SELECT 1 FROM diagnostic_cases WHERE id = ? AND latest_run_id = ? AND record_version = ?)`).bind(runId, CASE_ID, MODEL_VERSION, operator.id, timestamp, timestamp, CASE_ID, runId, nextVersion),
    ...recommendations.map(item => insertRecommendation(database, runId, operator, timestamp, item, true)),
    insertToolCall(database, runId, operator, timestamp, "parts_lookup", { partCodes: recommendations.map(item => item.partCode) }, { availableUnits: 7, constrainedParts: ["PCB-MAIN-RF28"] }, true),
    insertToolCall(database, runId, operator, timestamp, "service_history", { workOrderId: WORK_ORDER_ID }, { priorVisits: 0, repeatRepair: false }, true),
    insertToolCall(database, runId, operator, timestamp, "coverage_check", { serialTail: "7N4K" }, { manufacturerCoverage: "EXPIRED", servicePlan: "ACTIVE" }, true),
    database.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, from_status, to_status, actor_id, actor_role, metadata_json, created_at) SELECT ?, 'diagnostic_case', ?, 'DIAGNOSTIC_ANALYZED', ?, 'ANALYZED', ?, ?, ?, ? FROM diagnostic_cases WHERE id = ? AND latest_run_id = ? AND record_version = ?`).bind(`audit-${runId}`, CASE_ID, current.status, operator.id, operator.role, JSON.stringify({ runId, modelVersion: MODEL_VERSION, sourceCount: 4 }), timestamp, CASE_ID, runId, nextVersion),
  ];
  const results = await database.batch(statements);
  if (results[0].meta.changes !== 1) throw new OperationError(409, "Diagnostic case changed since it was loaded", "STALE_DIAGNOSTIC_CASE");
  return getDiagnosticSnapshot(operator);
}

export async function acceptDiagnosticRecommendation(operator: Operator, input: { caseId: string; recommendationId: string; expectedVersion: number; safetyAcknowledged: boolean }) {
  requireRole(operator, "technician");
  if (input.caseId !== CASE_ID || !Number.isInteger(input.expectedVersion)) throw new OperationError(400, "Valid caseId and expectedVersion are required", "INVALID_DIAGNOSTIC_REQUEST");
  const database = db();
  const currentCase = await caseRow();
  const recommendation = await database.prepare("SELECT * FROM diagnostic_recommendations WHERE id = ? AND case_id = ? AND run_id = ?").bind(input.recommendationId, CASE_ID, currentCase.latest_run_id).first<RecommendationRow>();
  if (!recommendation) throw new OperationError(404, "Recommendation is not part of the current analysis", "RECOMMENDATION_NOT_FOUND");
  if (recommendation.safety_class !== "STANDARD" && !input.safetyAcknowledged) throw new OperationError(422, "Safety acknowledgement is required before accepting this recommendation", "SAFETY_ACK_REQUIRED");
  const timestamp = now();
  const result = await database.batch([
    database.prepare(`UPDATE diagnostic_cases SET status = 'RECOMMENDATION_ACCEPTED', safety_status = ?, selected_recommendation_id = ?, record_version = record_version + 1, updated_at = ? WHERE id = ? AND record_version = ? AND latest_run_id = ? AND status = 'ANALYZED'`).bind(input.safetyAcknowledged ? "ACKNOWLEDGED" : "CLEAR", recommendation.id, timestamp, CASE_ID, input.expectedVersion, currentCase.latest_run_id),
    database.prepare(`UPDATE diagnostic_recommendations SET status = CASE WHEN id = ? THEN 'ACCEPTED' ELSE 'REJECTED' END, updated_at = ? WHERE run_id = ? AND EXISTS (SELECT 1 FROM diagnostic_cases WHERE id = ? AND selected_recommendation_id = ? AND record_version = ?)`).bind(recommendation.id, timestamp, currentCase.latest_run_id, CASE_ID, recommendation.id, input.expectedVersion + 1),
    database.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, from_status, to_status, actor_id, actor_role, metadata_json, created_at) SELECT ?, 'diagnostic_case', ?, 'RECOMMENDATION_ACCEPTED', 'ANALYZED', 'RECOMMENDATION_ACCEPTED', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM diagnostic_cases WHERE id = ? AND selected_recommendation_id = ? AND record_version = ?)`).bind(`audit-accept-${recommendation.id}`, CASE_ID, operator.id, operator.role, JSON.stringify({ recommendationId: recommendation.id, safetyAcknowledged: input.safetyAcknowledged }), timestamp, CASE_ID, recommendation.id, input.expectedVersion + 1),
  ]);
  if (result[0].meta.changes !== 1) throw new OperationError(409, "Diagnostic case changed or is no longer awaiting a decision", "STALE_DIAGNOSTIC_CASE");
  return getDiagnosticSnapshot(operator);
}

export async function escalateDiagnosticCase(operator: Operator, input: { caseId: string; expectedVersion: number; reason: string }) {
  requireRole(operator, "technician");
  if (input.caseId !== CASE_ID || !Number.isInteger(input.expectedVersion) || input.reason.trim().length < 8 || input.reason.length > 300) throw new OperationError(400, "A valid case version and escalation reason are required", "INVALID_ESCALATION");
  const database = db();
  const current = await caseRow();
  if (current.status === "RESOLVED") throw new OperationError(409, "Resolved cases cannot be escalated", "CASE_ALREADY_RESOLVED");
  const timestamp = now();
  const auditId = `audit-escalate-${crypto.randomUUID()}`;
  const result = await database.batch([
    database.prepare(`UPDATE diagnostic_cases SET status = 'ESCALATED', record_version = record_version + 1, updated_at = ? WHERE id = ? AND record_version = ? AND status != 'RESOLVED'`).bind(timestamp, CASE_ID, input.expectedVersion),
    database.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, from_status, to_status, actor_id, actor_role, metadata_json, created_at) SELECT ?, 'diagnostic_case', ?, 'DIAGNOSTIC_ESCALATED', ?, 'ESCALATED', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM diagnostic_cases WHERE id = ? AND status = 'ESCALATED' AND record_version = ?)`).bind(auditId, CASE_ID, current.status, operator.id, operator.role, JSON.stringify({ reason: input.reason.trim() }), timestamp, CASE_ID, input.expectedVersion + 1),
  ]);
  if (result[0].meta.changes !== 1) throw new OperationError(409, "Diagnostic case changed since it was loaded", "STALE_DIAGNOSTIC_CASE");
  return getDiagnosticSnapshot(operator);
}

export async function resolveDiagnosticCase(operator: Operator, input: { caseId: string; expectedVersion: number; firstTimeFix: boolean; durationMinutes: number; notes: string }) {
  requireRole(operator, "technician");
  if (input.caseId !== CASE_ID || !Number.isInteger(input.expectedVersion) || !Number.isInteger(input.durationMinutes) || input.durationMinutes < 5 || input.durationMinutes > 480 || input.notes.trim().length < 8 || input.notes.length > 500) throw new OperationError(400, "Resolution requires a duration from 5 to 480 minutes and concise technician notes", "INVALID_RESOLUTION");
  const database = db();
  const current = await caseRow();
  if (current.status !== "RECOMMENDATION_ACCEPTED" || !current.selected_recommendation_id) throw new OperationError(409, "Accept a current recommendation before recording an outcome", "RECOMMENDATION_REQUIRED");
  const timestamp = now();
  const outcomeId = `DO-${crypto.randomUUID()}`;
  const results = await database.batch([
    database.prepare(`UPDATE diagnostic_cases SET status = 'RESOLVED', record_version = record_version + 1, updated_at = ? WHERE id = ? AND record_version = ? AND status = 'RECOMMENDATION_ACCEPTED'`).bind(timestamp, CASE_ID, input.expectedVersion),
    database.prepare(`INSERT INTO diagnostic_outcomes (id, case_id, recommendation_id, resolution_code, first_time_fix, duration_minutes, notes, created_by, created_at) SELECT ?, ?, ?, 'REPAIR_COMPLETED', ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM diagnostic_cases WHERE id = ? AND status = 'RESOLVED' AND record_version = ?)`).bind(outcomeId, CASE_ID, current.selected_recommendation_id, input.firstTimeFix ? 1 : 0, input.durationMinutes, input.notes.trim(), operator.id, timestamp, CASE_ID, input.expectedVersion + 1),
    database.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, from_status, to_status, actor_id, actor_role, metadata_json, created_at) SELECT ?, 'diagnostic_case', ?, 'DIAGNOSTIC_RESOLVED', 'RECOMMENDATION_ACCEPTED', 'RESOLVED', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM diagnostic_cases WHERE id = ? AND status = 'RESOLVED' AND record_version = ?)`).bind(`audit-resolve-${outcomeId}`, CASE_ID, operator.id, operator.role, JSON.stringify({ outcomeId, firstTimeFix: input.firstTimeFix, durationMinutes: input.durationMinutes }), timestamp, CASE_ID, input.expectedVersion + 1),
  ]);
  if (results[0].meta.changes !== 1) throw new OperationError(409, "Diagnostic case changed or is no longer ready for resolution", "STALE_DIAGNOSTIC_CASE");
  return getDiagnosticSnapshot(operator);
}
