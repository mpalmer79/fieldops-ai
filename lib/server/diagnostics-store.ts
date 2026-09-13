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
    faultCode: "CKP_SIGNAL_DROPOUT",
    component: "Crankshaft position sensor circuit",
    confidence: 72,
    rationale: "The hot-soak no-start, stored P0335, and tachometer signal dropout align with an intermittent crankshaft position signal. Comparable verified repairs support circuit testing before component replacement.",
    verificationStep: "Follow the OEM procedure to reproduce the hot-soak condition, capture crank and cam signals, then inspect sensor power, ground, connector tension, and harness routing.",
    partCode: "CKP-39180-2M100",
    safetyClass: "LOCKOUT_REQUIRED",
    groundingScore: 100,
    sourceIds: ["DS-PROC-204", "DS-HISTORY-117", "DS-SAFETY-001"],
  },
  {
    rank: 2,
    faultCode: "ECM_POWER_GROUND",
    component: "ECM power and ground integrity",
    confidence: 18,
    rationale: "A transient ECM supply or ground fault can produce the same loss of engine-speed signal, but the available case evidence gives it less support than the sensor circuit.",
    verificationStep: "Use the approved breakout procedure to perform loaded voltage-drop checks at ECM power and ground points while monitoring the fault event.",
    partCode: null,
    safetyClass: "LOCKOUT_REQUIRED",
    groundingScore: 100,
    sourceIds: ["DS-PROC-204", "DS-BULLETIN-042", "DS-SAFETY-001"],
  },
  {
    rank: 3,
    faultCode: "STARTER_VOLTAGE_DROP",
    component: "Starter circuit voltage drop",
    confidence: 7,
    rationale: "A heat-sensitive starter or high-resistance connection remains possible, but it does not explain the stored crankshaft signal fault as well as the higher-ranked paths.",
    verificationStep: "Escalate for high-current starting-system testing if crank signal and ECM integrity checks pass. Do not replace the starter from symptom matching alone.",
    partCode: "STRTR-G70-25T",
    safetyClass: "ESCALATE",
    groundingScore: 100,
    sourceIds: ["DS-PROC-204", "DS-BULLETIN-042", "DS-SAFETY-001"],
  },
];

function now() {
  return new Date().toISOString();
}

function resourceIds(operator: Operator) {
  const scope = (value: string) => `${operator.workspace_id}:${value}`;
  return {
    caseId: scope(CASE_ID),
    workOrderId: scope(WORK_ORDER_ID),
    seedRunId: scope(SEED_RUN_ID),
    technicianId: scope("T-147"),
  };
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

function insertRecommendation(database: D1Database, runId: string, caseId: string, operator: Operator, timestamp: string, item: RecommendationFixture, guarded = false) {
  const id = recommendationId(runId, item.rank);
  if (!guarded) {
    return database.prepare(`
      INSERT OR IGNORE INTO diagnostic_recommendations
      (id, run_id, case_id, rank, fault_code, component, confidence, rationale, verification_step, part_code, safety_class, grounding_score, evidence_source_ids_json, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROPOSED', ?, ?, ?)
    `).bind(id, runId, caseId, item.rank, item.faultCode, item.component, item.confidence, item.rationale, item.verificationStep, item.partCode, item.safetyClass, item.groundingScore, JSON.stringify(item.sourceIds), operator.id, timestamp, timestamp);
  }
  return database.prepare(`
    INSERT INTO diagnostic_recommendations
    (id, run_id, case_id, rank, fault_code, component, confidence, rationale, verification_step, part_code, safety_class, grounding_score, evidence_source_ids_json, status, created_by, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROPOSED', ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM diagnostic_cases WHERE id = ? AND latest_run_id = ?)
  `).bind(id, runId, caseId, item.rank, item.faultCode, item.component, item.confidence, item.rationale, item.verificationStep, item.partCode, item.safetyClass, item.groundingScore, JSON.stringify(item.sourceIds), operator.id, timestamp, timestamp, caseId, runId);
}

function insertToolCall(database: D1Database, runId: string, caseId: string, operator: Operator, timestamp: string, toolName: string, input: unknown, output: unknown, guarded = false) {
  const id = `${runId}-${toolName}`;
  const prefix = guarded
    ? `INSERT INTO diagnostic_tool_calls (id, run_id, case_id, tool_name, status, input_json, output_json, created_by, created_at)
       SELECT ?, ?, ?, ?, 'SUCCEEDED', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM diagnostic_cases WHERE id = ? AND latest_run_id = ?)`
    : `INSERT OR IGNORE INTO diagnostic_tool_calls (id, run_id, case_id, tool_name, status, input_json, output_json, created_by, created_at)
       VALUES (?, ?, ?, ?, 'SUCCEEDED', ?, ?, ?, ?)`;
  const values = [id, runId, caseId, toolName, JSON.stringify(input), JSON.stringify(output), operator.id, timestamp];
  return database.prepare(prefix).bind(...values, ...(guarded ? [caseId, runId] : []));
}

export async function ensureDiagnosticState(operator: Operator) {
  const database = db();
  const ids = resourceIds(operator);
  const existing = await database.prepare("SELECT id FROM diagnostic_cases WHERE id = ? AND created_by = ?").bind(ids.caseId, operator.id).first<{ id: string }>();
  if (existing) return;
  const timestamp = now();
  const sources = [
    ["DS-PROC-204", "P0335 diagnostic procedure", "SERVICE_PROCEDURE", "Genesis", "G70 2.5T", "2026.2", "PROC-G70-P0335", "Portfolio reference fixture covering crank signal capture, circuit integrity, connector inspection, and starting-system verification."],
    ["DS-BULLETIN-042", "Hot-soak no-start diagnostic bulletin", "TECHNICAL_BULLETIN", "Genesis", "G70 2.5T", "2026.1", "TSB-G70-042", "Portfolio reference fixture separating intermittent crank signal, ECM supply, and starter-circuit faults."],
    ["DS-HISTORY-117", "Comparable repair outcome set", "REPAIR_HISTORY", "Genesis", "G70 2.5T", "2026-Q2", "HIST-G70-117", "Synthetic outcome set for 117 comparable repair orders, weighted by verified first-time fixes."],
    ["DS-SAFETY-001", "High-current electrical safety policy", "SAFETY_POLICY", "ALL", "ALL", "2026.3", "SAFE-ELEC-001", "Portfolio safety policy requiring vehicle securement, electrical isolation, and technician acknowledgement before protected tests."],
  ];
  const parts = [
    ["PI-FAN-MAN", "CKP-39180-2M100", "Crankshaft position sensor", "Parts department", 3, 1],
    ["PI-FAN-NAS", "CKP-39180-2M100", "Crankshaft position sensor", "Regional PDC", 2, 0],
    ["PI-SENSOR-MAN", "HARNESS-G70-CKP", "Crank sensor repair harness", "Parts department", 2, 1],
    ["PI-SENSOR-VAN", "HARNESS-G70-CKP", "Crank sensor repair harness", "Diagnostic tool room", 1, 0],
    ["PI-PCB-MAN", "STRTR-G70-25T", "Starter motor assembly", "Regional PDC", 1, 1],
  ];
  const statements: D1PreparedStatement[] = [
    database.prepare(`INSERT OR IGNORE INTO work_orders (id, appliance, city, appointment_window, required_skill, part_code, status, assigned_technician_id, original_technician_id, version, updated_at) VALUES (?, 'Intermittent no-start', '2023 G70 2.5T', 'Promise 3:30 PM', 'drivability', 'CKP-39180-2M100', 'IN_SERVICE', ?, ?, 1, ?)`).bind(ids.workOrderId, ids.technicianId, ids.technicianId, timestamp),
    ...sources.map(source => database.prepare(`INSERT OR IGNORE INTO diagnostic_sources (id, title, source_type, appliance_make, appliance_model, revision, reference_code, summary, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...source, timestamp)),
    ...parts.map(part => database.prepare(`INSERT OR IGNORE INTO parts_inventory (id, part_code, description, location, on_hand, reserved, record_version, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`).bind(...part, timestamp)),
    database.prepare(`INSERT OR IGNORE INTO diagnostic_cases (id, work_order_id, technician_id, appliance_make, appliance_model, serial_tail, complaint, symptom_code, status, safety_status, latest_run_id, selected_recommendation_id, record_version, created_by, created_at, updated_at) VALUES (?, ?, ?, 'Genesis', 'G70 2.5T', '4H27', 'Intermittent no-start after hot soak. Engine cranks normally, P0335 is stored, and engine-speed data drops out during the event.', 'HOT_SOAK_NO_START_P0335', 'ANALYZED', 'ACK_REQUIRED', ?, NULL, 1, ?, ?, ?)`).bind(ids.caseId, ids.workOrderId, ids.technicianId, ids.seedRunId, operator.id, timestamp, timestamp),
    database.prepare(`INSERT OR IGNORE INTO diagnostic_runs (id, case_id, model_version, status, grounding_rate, source_count, tool_call_count, created_by, started_at, completed_at) VALUES (?, ?, ?, 'COMPLETED', 100, 4, 3, ?, ?, ?)`).bind(ids.seedRunId, ids.caseId, MODEL_VERSION, operator.id, timestamp, timestamp),
    ...recommendations.map(item => insertRecommendation(database, ids.seedRunId, ids.caseId, operator, timestamp, item)),
    insertToolCall(database, ids.seedRunId, ids.caseId, operator, timestamp, "parts_lookup", { partCodes: recommendations.map(item => item.partCode) }, { availableUnits: 6, constrainedParts: ["STRTR-G70-25T"] }),
    insertToolCall(database, ids.seedRunId, ids.caseId, operator, timestamp, "service_history", { workOrderId: WORK_ORDER_ID }, { priorVisits: 0, repeatRepair: false }),
    insertToolCall(database, ids.seedRunId, ids.caseId, operator, timestamp, "coverage_check", { vinTail: "4H27" }, { manufacturerCoverage: "ACTIVE", servicePlan: "FACTORY" }),
    auditStatement(database, `audit-${ids.seedRunId}`, "diagnostic_case", ids.caseId, "DIAGNOSTIC_ANALYZED", "INTAKE", "ANALYZED", operator, { runId: ids.seedRunId, modelVersion: MODEL_VERSION, sourceCount: 4 }, timestamp),
  ];
  await database.batch(statements);
}

async function caseRow(operator: Operator) {
  const ids = resourceIds(operator);
  const row = await db().prepare(`
    SELECT dc.*, wo.city, wo.appointment_window, t.name AS technician_name
    FROM diagnostic_cases dc
    JOIN work_orders wo ON wo.id = dc.work_order_id
    JOIN technicians t ON t.id = dc.technician_id
    WHERE dc.id = ? AND dc.created_by = ?
  `).bind(ids.caseId, operator.id).first<CaseRow>();
  if (!row) throw new OperationError(404, "Diagnostic case not found", "DIAGNOSTIC_CASE_NOT_FOUND");
  return row;
}

export async function getDiagnosticSnapshot(operator: Operator) {
  await ensureDiagnosticState(operator);
  const database = db();
  const ids = resourceIds(operator);
  const currentCase = await caseRow(operator);
  const [run, recommendationResult, sourceResult, partResult, toolResult, outcomeResult, auditResult] = await Promise.all([
    database.prepare("SELECT * FROM diagnostic_runs WHERE id = ? AND created_by = ?").bind(currentCase.latest_run_id, operator.id).first<RunRow>(),
    database.prepare("SELECT * FROM diagnostic_recommendations WHERE run_id = ? AND created_by = ? ORDER BY rank").bind(currentCase.latest_run_id, operator.id).all<RecommendationRow>(),
    database.prepare("SELECT * FROM diagnostic_sources WHERE (appliance_make = ? AND appliance_model = ?) OR source_type = 'SAFETY_POLICY' ORDER BY source_type, title").bind(currentCase.appliance_make, currentCase.appliance_model).all(),
    database.prepare("SELECT * FROM parts_inventory ORDER BY part_code, location").all(),
    database.prepare("SELECT * FROM diagnostic_tool_calls WHERE run_id = ? AND created_by = ? ORDER BY created_at, tool_name").bind(currentCase.latest_run_id, operator.id).all(),
    database.prepare("SELECT * FROM diagnostic_outcomes WHERE case_id = ? AND created_by = ? ORDER BY created_at DESC LIMIT 1").bind(ids.caseId, operator.id).first(),
    database.prepare("SELECT id, action, from_status, to_status, actor_role, metadata_json, created_at FROM audit_log WHERE entity_type = 'diagnostic_case' AND entity_id = ? AND actor_id = ? ORDER BY created_at DESC LIMIT 8").bind(ids.caseId, operator.id).all(),
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
      id: CASE_ID,
      workOrderId: WORK_ORDER_ID,
      technicianId: "T-147",
      technicianName: currentCase.technician_name,
      city: currentCase.city,
      appointmentWindow: currentCase.appointment_window,
      vehicleMake: currentCase.appliance_make,
      vehicleModel: currentCase.appliance_model,
      vinTail: currentCase.serial_tail,
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
  const ids = resourceIds(operator);
  const current = await caseRow(operator);
  const timestamp = now();
  const runId = `DR-${crypto.randomUUID()}`;
  const nextVersion = input.expectedVersion + 1;
  const statements: D1PreparedStatement[] = [
    database.prepare(`UPDATE diagnostic_cases SET status = 'ANALYZED', safety_status = 'ACK_REQUIRED', latest_run_id = ?, selected_recommendation_id = NULL, record_version = record_version + 1, updated_at = ? WHERE id = ? AND created_by = ? AND record_version = ?`).bind(runId, timestamp, ids.caseId, operator.id, input.expectedVersion),
    database.prepare(`INSERT INTO diagnostic_runs (id, case_id, model_version, status, grounding_rate, source_count, tool_call_count, created_by, started_at, completed_at) SELECT ?, ?, ?, 'COMPLETED', 100, 4, 3, ?, ?, ? WHERE EXISTS (SELECT 1 FROM diagnostic_cases WHERE id = ? AND created_by = ? AND latest_run_id = ? AND record_version = ?)`).bind(runId, ids.caseId, MODEL_VERSION, operator.id, timestamp, timestamp, ids.caseId, operator.id, runId, nextVersion),
    ...recommendations.map(item => insertRecommendation(database, runId, ids.caseId, operator, timestamp, item, true)),
    insertToolCall(database, runId, ids.caseId, operator, timestamp, "parts_lookup", { partCodes: recommendations.map(item => item.partCode) }, { availableUnits: 6, constrainedParts: ["STRTR-G70-25T"] }, true),
    insertToolCall(database, runId, ids.caseId, operator, timestamp, "service_history", { workOrderId: WORK_ORDER_ID }, { priorVisits: 0, repeatRepair: false }, true),
    insertToolCall(database, runId, ids.caseId, operator, timestamp, "coverage_check", { vinTail: "4H27" }, { manufacturerCoverage: "ACTIVE", servicePlan: "FACTORY" }, true),
    database.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, from_status, to_status, actor_id, actor_role, metadata_json, created_at) SELECT ?, 'diagnostic_case', ?, 'DIAGNOSTIC_ANALYZED', ?, 'ANALYZED', ?, ?, ?, ? FROM diagnostic_cases WHERE id = ? AND created_by = ? AND latest_run_id = ? AND record_version = ?`).bind(`audit-${runId}`, ids.caseId, current.status, operator.id, operator.role, JSON.stringify({ runId, modelVersion: MODEL_VERSION, sourceCount: 4 }), timestamp, ids.caseId, operator.id, runId, nextVersion),
  ];
  const results = await database.batch(statements);
  if (results[0].meta.changes !== 1) throw new OperationError(409, "Diagnostic case changed since it was loaded", "STALE_DIAGNOSTIC_CASE");
  return getDiagnosticSnapshot(operator);
}

export async function acceptDiagnosticRecommendation(operator: Operator, input: { caseId: string; recommendationId: string; expectedVersion: number; safetyAcknowledged: boolean }) {
  requireRole(operator, "technician");
  if (input.caseId !== CASE_ID || !Number.isInteger(input.expectedVersion)) throw new OperationError(400, "Valid caseId and expectedVersion are required", "INVALID_DIAGNOSTIC_REQUEST");
  const database = db();
  const ids = resourceIds(operator);
  const currentCase = await caseRow(operator);
  const recommendation = await database.prepare("SELECT * FROM diagnostic_recommendations WHERE id = ? AND case_id = ? AND run_id = ? AND created_by = ?").bind(input.recommendationId, ids.caseId, currentCase.latest_run_id, operator.id).first<RecommendationRow>();
  if (!recommendation) throw new OperationError(404, "Recommendation is not part of the current analysis", "RECOMMENDATION_NOT_FOUND");
  if (recommendation.safety_class !== "STANDARD" && !input.safetyAcknowledged) throw new OperationError(422, "Safety acknowledgement is required before accepting this recommendation", "SAFETY_ACK_REQUIRED");
  const timestamp = now();
  const result = await database.batch([
    database.prepare(`UPDATE diagnostic_cases SET status = 'RECOMMENDATION_ACCEPTED', safety_status = ?, selected_recommendation_id = ?, record_version = record_version + 1, updated_at = ? WHERE id = ? AND created_by = ? AND record_version = ? AND latest_run_id = ? AND status = 'ANALYZED'`).bind(input.safetyAcknowledged ? "ACKNOWLEDGED" : "CLEAR", recommendation.id, timestamp, ids.caseId, operator.id, input.expectedVersion, currentCase.latest_run_id),
    database.prepare(`UPDATE diagnostic_recommendations SET status = CASE WHEN id = ? THEN 'ACCEPTED' ELSE 'REJECTED' END, updated_at = ? WHERE run_id = ? AND created_by = ? AND EXISTS (SELECT 1 FROM diagnostic_cases WHERE id = ? AND created_by = ? AND selected_recommendation_id = ? AND record_version = ?)`).bind(recommendation.id, timestamp, currentCase.latest_run_id, operator.id, ids.caseId, operator.id, recommendation.id, input.expectedVersion + 1),
    database.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, from_status, to_status, actor_id, actor_role, metadata_json, created_at) SELECT ?, 'diagnostic_case', ?, 'RECOMMENDATION_ACCEPTED', 'ANALYZED', 'RECOMMENDATION_ACCEPTED', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM diagnostic_cases WHERE id = ? AND created_by = ? AND selected_recommendation_id = ? AND record_version = ?)`).bind(`audit-accept-${recommendation.id}`, ids.caseId, operator.id, operator.role, JSON.stringify({ recommendationId: recommendation.id, safetyAcknowledged: input.safetyAcknowledged }), timestamp, ids.caseId, operator.id, recommendation.id, input.expectedVersion + 1),
  ]);
  if (result[0].meta.changes !== 1) throw new OperationError(409, "Diagnostic case changed or is no longer awaiting a decision", "STALE_DIAGNOSTIC_CASE");
  return getDiagnosticSnapshot(operator);
}

export async function escalateDiagnosticCase(operator: Operator, input: { caseId: string; expectedVersion: number; reason: string }) {
  requireRole(operator, "technician");
  if (input.caseId !== CASE_ID || !Number.isInteger(input.expectedVersion) || input.reason.trim().length < 8 || input.reason.length > 300) throw new OperationError(400, "A valid case version and escalation reason are required", "INVALID_ESCALATION");
  const database = db();
  const ids = resourceIds(operator);
  const current = await caseRow(operator);
  if (current.status === "RESOLVED") throw new OperationError(409, "Resolved cases cannot be escalated", "CASE_ALREADY_RESOLVED");
  const timestamp = now();
  const auditId = `audit-escalate-${crypto.randomUUID()}`;
  const result = await database.batch([
    database.prepare(`UPDATE diagnostic_cases SET status = 'ESCALATED', record_version = record_version + 1, updated_at = ? WHERE id = ? AND created_by = ? AND record_version = ? AND status != 'RESOLVED'`).bind(timestamp, ids.caseId, operator.id, input.expectedVersion),
    database.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, from_status, to_status, actor_id, actor_role, metadata_json, created_at) SELECT ?, 'diagnostic_case', ?, 'DIAGNOSTIC_ESCALATED', ?, 'ESCALATED', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM diagnostic_cases WHERE id = ? AND created_by = ? AND status = 'ESCALATED' AND record_version = ?)`).bind(auditId, ids.caseId, current.status, operator.id, operator.role, JSON.stringify({ reason: input.reason.trim() }), timestamp, ids.caseId, operator.id, input.expectedVersion + 1),
  ]);
  if (result[0].meta.changes !== 1) throw new OperationError(409, "Diagnostic case changed since it was loaded", "STALE_DIAGNOSTIC_CASE");
  return getDiagnosticSnapshot(operator);
}

export async function resolveDiagnosticCase(operator: Operator, input: { caseId: string; expectedVersion: number; firstTimeFix: boolean; durationMinutes: number; notes: string }) {
  requireRole(operator, "technician");
  if (input.caseId !== CASE_ID || !Number.isInteger(input.expectedVersion) || !Number.isInteger(input.durationMinutes) || input.durationMinutes < 5 || input.durationMinutes > 480 || input.notes.trim().length < 8 || input.notes.length > 500) throw new OperationError(400, "Resolution requires a duration from 5 to 480 minutes and concise technician notes", "INVALID_RESOLUTION");
  const database = db();
  const ids = resourceIds(operator);
  const current = await caseRow(operator);
  if (current.status !== "RECOMMENDATION_ACCEPTED" || !current.selected_recommendation_id) throw new OperationError(409, "Accept a current recommendation before recording an outcome", "RECOMMENDATION_REQUIRED");
  const timestamp = now();
  const outcomeId = `DO-${crypto.randomUUID()}`;
  const results = await database.batch([
    database.prepare(`UPDATE diagnostic_cases SET status = 'RESOLVED', record_version = record_version + 1, updated_at = ? WHERE id = ? AND created_by = ? AND record_version = ? AND status = 'RECOMMENDATION_ACCEPTED'`).bind(timestamp, ids.caseId, operator.id, input.expectedVersion),
    database.prepare(`INSERT INTO diagnostic_outcomes (id, case_id, recommendation_id, resolution_code, first_time_fix, duration_minutes, notes, created_by, created_at) SELECT ?, ?, ?, 'REPAIR_COMPLETED', ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM diagnostic_cases WHERE id = ? AND created_by = ? AND status = 'RESOLVED' AND record_version = ?)`).bind(outcomeId, ids.caseId, current.selected_recommendation_id, input.firstTimeFix ? 1 : 0, input.durationMinutes, input.notes.trim(), operator.id, timestamp, ids.caseId, operator.id, input.expectedVersion + 1),
    database.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, from_status, to_status, actor_id, actor_role, metadata_json, created_at) SELECT ?, 'diagnostic_case', ?, 'DIAGNOSTIC_RESOLVED', 'RECOMMENDATION_ACCEPTED', 'RESOLVED', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM diagnostic_cases WHERE id = ? AND created_by = ? AND status = 'RESOLVED' AND record_version = ?)`).bind(`audit-resolve-${outcomeId}`, ids.caseId, operator.id, operator.role, JSON.stringify({ outcomeId, firstTimeFix: input.firstTimeFix, durationMinutes: input.durationMinutes }), timestamp, ids.caseId, operator.id, input.expectedVersion + 1),
  ]);
  if (results[0].meta.changes !== 1) throw new OperationError(409, "Diagnostic case changed or is no longer ready for resolution", "STALE_DIAGNOSTIC_CASE");
  return getDiagnosticSnapshot(operator);
}
