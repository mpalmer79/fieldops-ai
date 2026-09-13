import "server-only";
import { auditStatement, db, OperationError, requireRole, type Operator } from "@/lib/server/operations-store";

type AgentRow = { id: string; name: string; responsibility: string; status: string; current_version_id: string; owner_team: string; risk_tier: string; daily_decisions: number; success_rate: number; avg_latency_ms: number; escalation_rate: number; cost_per_decision: number; record_version: number; updated_at: string };
type VersionRow = { id: string; agent_id: string; version: string; model: string; prompt_hash: string; tools_json: string; permissions_json: string; status: string; record_version: number; created_at: string; updated_at: string };
type SuiteRow = { id: string; agent_id: string; name: string; task_success_threshold: number; policy_compliance_threshold: number; hallucination_threshold: number; tool_accuracy_threshold: number; latency_threshold_ms: number; sample_size: number };
type EvaluationRow = { id: string; version_id: string; suite_id: string; status: "PASSED" | "FAILED"; task_success: number; policy_compliance: number; hallucination_rate: number; tool_accuracy: number; p95_latency_ms: number; sample_size: number; failures_json: string; started_at: string; completed_at: string };

const profiles: Record<string, Omit<EvaluationRow, "id" | "version_id" | "suite_id" | "status" | "started_at" | "completed_at">> = {
  "dispatch-v2.4.0": { task_success: 98.7, policy_compliance: 100, hallucination_rate: 0.2, tool_accuracy: 99.8, p95_latency_ms: 3820, sample_size: 500, failures_json: JSON.stringify([{ category: "Tool timeout", count: 4 }, { category: "Low confidence", count: 2 }]) },
  "dispatch-v2.5.0": { task_success: 96.8, policy_compliance: 100, hallucination_rate: 0.4, tool_accuracy: 99.3, p95_latency_ms: 4180, sample_size: 500, failures_json: JSON.stringify([{ category: "Missing availability data", count: 7 }, { category: "Tool timeout", count: 5 }, { category: "Low confidence", count: 4 }]) },
  "recovery-v1.8.2": { task_success: 95.4, policy_compliance: 100, hallucination_rate: 0.6, tool_accuracy: 98.9, p95_latency_ms: 5710, sample_size: 500, failures_json: JSON.stringify([{ category: "Tool timeout", count: 11 }, { category: "Policy conflict", count: 7 }]) },
  "recovery-v1.9.0": { task_success: 93.8, policy_compliance: 99.6, hallucination_rate: 1.3, tool_accuracy: 97.4, p95_latency_ms: 6340, sample_size: 500, failures_json: JSON.stringify([{ category: "Missing technician data", count: 31 }, { category: "Tool timeout", count: 18 }, { category: "Policy conflict", count: 11 }, { category: "Low-confidence reasoning", count: 8 }]) },
  "parts-v3.1.0": { task_success: 99.1, policy_compliance: 100, hallucination_rate: 0.1, tool_accuracy: 99.8, p95_latency_ms: 1760, sample_size: 500, failures_json: JSON.stringify([{ category: "Inventory lag", count: 3 }]) },
  "communications-v2.2.1": { task_success: 97.9, policy_compliance: 100, hallucination_rate: 0.3, tool_accuracy: 99.4, p95_latency_ms: 2460, sample_size: 500, failures_json: JSON.stringify([{ category: "Template fallback", count: 6 }]) },
};

const gates = { taskSuccess: 95, policyCompliance: 100, hallucinationRate: 1, toolAccuracy: 98, p95LatencyMs: 6000, sampleSize: 500 };

function timestamp() {
  return new Date().toISOString();
}

function scopedId(operator: Operator, value: string) {
  return `${operator.workspace_id}:${value}`;
}

function fixtureId(operator: Operator, value: string) {
  const prefix = `${operator.workspace_id}:`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

export async function ensureAgentOpsState(operator: Operator) {
  const database = db();
  const existing = await database.prepare("SELECT id FROM ai_agents WHERE id = ?").bind(scopedId(operator, "dispatch")).first<{ id: string }>();
  if (existing) return;
  const createdAt = timestamp();
  const agents = [
    ["dispatch", "Shop Load Agent", "Repair-order assignment and technician capacity recovery", "HEALTHY", "dispatch-v2.4.0", "Service Technology", "HIGH", 12840, 98.7, 2840, 3.1, 0.018],
    ["recovery", "Promise Recovery Agent", "Same-day promise protection and exception handling", "DEGRADED", "recovery-v1.8.2", "Fixed Operations", "HIGH", 4180, 91.2, 6420, 12.3, 0.043],
    ["parts", "Parts Agent", "Inventory validation and parts-counter availability", "HEALTHY", "parts-v3.1.0", "Parts Operations", "MEDIUM", 9610, 99.1, 1180, 1.4, 0.006],
    ["communications", "Advisor Communication Agent", "Bounded promise-time and delay notifications", "HEALTHY", "communications-v2.2.1", "Service Experience", "MEDIUM", 7340, 97.9, 1980, 5.2, 0.012],
  ];
  const versions = [
    ["dispatch-v2.4.0", "dispatch", "2.4.0", "gpt-5.2", "sha256:8f2a17c", '["shop_load_optimizer","technician_directory","policy_engine"]', '["read_repair_orders","propose_assignments"]', "PRODUCTION"],
    ["dispatch-v2.5.0", "dispatch", "2.5.0", "gpt-5.2", "sha256:47bd110", '["shop_load_optimizer","technician_directory","policy_engine","event_stream"]', '["read_repair_orders","propose_assignments"]', "EVALUATED"],
    ["recovery-v1.8.2", "recovery", "1.8.2", "gpt-5.2", "sha256:315d6bb", '["impact_analyzer","shop_load_optimizer","policy_engine"]', '["read_repair_orders","propose_recovery"]', "PRODUCTION"],
    ["recovery-v1.9.0", "recovery", "1.9.0", "gpt-5.2", "sha256:ea16490", '["impact_analyzer","shop_load_optimizer","policy_engine","promise_time"]', '["read_repair_orders","propose_recovery"]', "EVALUATED"],
    ["parts-v3.1.0", "parts", "3.1.0", "gpt-5-mini", "sha256:a93f4d2", '["inventory_api","parts_location_directory"]', '["read_inventory"]', "PRODUCTION"],
    ["communications-v2.2.1", "communications", "2.2.1", "gpt-5-mini", "sha256:10df7ce", '["template_library","notification_queue"]', '["draft_notification","queue_with_approval"]', "PRODUCTION"],
  ];
  const statements: D1PreparedStatement[] = [
    ...agents.map(values => database.prepare("INSERT OR IGNORE INTO ai_agents (id,name,responsibility,status,current_version_id,owner_team,risk_tier,daily_decisions,success_rate,avg_latency_ms,escalation_rate,cost_per_decision,record_version,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?)").bind(scopedId(operator, String(values[0])), values[1], values[2], values[3], scopedId(operator, String(values[4])), values[5], values[6], values[7], values[8], values[9], values[10], values[11], createdAt)),
    ...versions.map(values => database.prepare("INSERT OR IGNORE INTO agent_versions (id,agent_id,version,model,prompt_hash,tools_json,permissions_json,status,record_version,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?,?)").bind(scopedId(operator, String(values[0])), scopedId(operator, String(values[1])), values[2], values[3], values[4], values[5], values[6], values[7], operator.id, createdAt, createdAt)),
    ...agents.map(values => database.prepare("INSERT OR IGNORE INTO evaluation_suites (id,agent_id,name,task_success_threshold,policy_compliance_threshold,hallucination_threshold,tool_accuracy_threshold,latency_threshold_ms,sample_size,created_at) VALUES (?,?,?,95,100,1,98,6000,500,?)").bind(scopedId(operator, `suite-${values[0]}`), scopedId(operator, String(values[0])), `${values[1]} production gate`, createdAt)),
  ];
  await database.batch(statements);

  const baselineVersions = ["dispatch-v2.4.0", "dispatch-v2.5.0", "recovery-v1.8.2", "recovery-v1.9.0", "parts-v3.1.0", "communications-v2.2.1"];
  await database.batch(baselineVersions.map((versionId, index) => evaluationStatement(database, scopedId(operator, `eval-seed-${index}`), scopedId(operator, versionId), scopedId(operator, `suite-${versionId.split("-")[0]}`), profiles[versionId], operator.id, createdAt)));
  await database.batch([
    database.prepare("INSERT OR IGNORE INTO agent_deployments (id,agent_id,version_id,environment,status,traffic_percentage,previous_version_id,deployed_by,created_at,completed_at) VALUES (?,?,?,'PRODUCTION','ACTIVE',100,NULL,?,?,?)").bind(scopedId(operator, "deployment-dispatch-baseline"), scopedId(operator, "dispatch"), scopedId(operator, "dispatch-v2.4.0"), operator.id, createdAt, createdAt),
    database.prepare("INSERT OR IGNORE INTO agent_deployments (id,agent_id,version_id,environment,status,traffic_percentage,previous_version_id,deployed_by,created_at,completed_at) VALUES (?,?,?,'PRODUCTION','ACTIVE',100,NULL,?,?,?)").bind(scopedId(operator, "deployment-recovery-baseline"), scopedId(operator, "recovery"), scopedId(operator, "recovery-v1.8.2"), operator.id, createdAt, createdAt),
    database.prepare("INSERT OR IGNORE INTO agent_incidents (id,agent_id,evaluation_run_id,severity,category,summary,status,detected_at,resolved_at) VALUES (?,?,?,'HIGH','Tool timeout','Recovery planning exceeded the six-second production gate in 18 cases.','OPEN',?,NULL)").bind(scopedId(operator, "incident-recovery-timeout"), scopedId(operator, "recovery"), scopedId(operator, "eval-seed-3"), createdAt),
    database.prepare("INSERT OR IGNORE INTO agent_incidents (id,agent_id,evaluation_run_id,severity,category,summary,status,detected_at,resolved_at) VALUES (?,?,?,'HIGH','Policy conflict','Two policy paths produced actions outside the approved escalation boundary.','OPEN',?,NULL)").bind(scopedId(operator, "incident-recovery-policy"), scopedId(operator, "recovery"), scopedId(operator, "eval-seed-3"), createdAt),
  ]);
}

function evaluationStatement(database: D1Database, id: string, versionId: string, suiteId: string, profile: typeof profiles[string], operatorId: string, completedAt: string) {
  const status = passes(profile) ? "PASSED" : "FAILED";
  return database.prepare("INSERT OR IGNORE INTO evaluation_runs (id,version_id,suite_id,status,task_success,policy_compliance,hallucination_rate,tool_accuracy,p95_latency_ms,sample_size,failures_json,created_by,started_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, versionId, suiteId, status, profile.task_success, profile.policy_compliance, profile.hallucination_rate, profile.tool_accuracy, profile.p95_latency_ms, profile.sample_size, profile.failures_json, operatorId, completedAt, completedAt);
}

function passes(profile: typeof profiles[string]) {
  return profile.task_success >= gates.taskSuccess && profile.policy_compliance >= gates.policyCompliance && profile.hallucination_rate <= gates.hallucinationRate && profile.tool_accuracy >= gates.toolAccuracy && profile.p95_latency_ms <= gates.p95LatencyMs;
}

function serializeEvaluation(row: EvaluationRow | null) {
  if (!row) return null;
  return { id: row.id, status: row.status, taskSuccess: row.task_success, policyCompliance: row.policy_compliance, hallucinationRate: row.hallucination_rate, toolAccuracy: row.tool_accuracy, p95LatencyMs: row.p95_latency_ms, sampleSize: row.sample_size, failures: JSON.parse(row.failures_json), startedAt: row.started_at, completedAt: row.completed_at };
}

export async function getAgentOpsSnapshot(operator: Operator) {
  await ensureAgentOpsState(operator);
  const database = db();
  const workspacePattern = `${operator.workspace_id}:%`;
  const [agentResult, versionResult, suiteResult, deploymentResult, incidentResult] = await Promise.all([
    database.prepare("SELECT * FROM ai_agents WHERE id LIKE ? ORDER BY CASE status WHEN 'DEGRADED' THEN 0 WHEN 'PAUSED' THEN 1 ELSE 2 END, name").bind(workspacePattern).all<AgentRow>(),
    database.prepare("SELECT * FROM agent_versions WHERE created_by = ? ORDER BY agent_id, created_at DESC, version DESC").bind(operator.id).all<VersionRow>(),
    database.prepare("SELECT * FROM evaluation_suites WHERE agent_id LIKE ? ORDER BY agent_id").bind(workspacePattern).all<SuiteRow>(),
    database.prepare("SELECT * FROM agent_deployments WHERE deployed_by = ? ORDER BY created_at DESC LIMIT 20").bind(operator.id).all(),
    database.prepare("SELECT * FROM agent_incidents WHERE agent_id LIKE ? ORDER BY CASE severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, detected_at DESC LIMIT 20").bind(workspacePattern).all(),
  ]);
  const latestEvaluations = new Map<string, ReturnType<typeof serializeEvaluation>>();
  for (const version of versionResult.results) {
    const evaluation = await database.prepare("SELECT * FROM evaluation_runs WHERE version_id = ? AND created_by = ? ORDER BY completed_at DESC, id DESC LIMIT 1").bind(version.id, operator.id).first<EvaluationRow>();
    latestEvaluations.set(version.id, serializeEvaluation(evaluation));
  }
  const suites = new Map(suiteResult.results.map(suite => [suite.agent_id, { id: suite.id, name: suite.name, taskSuccessThreshold: suite.task_success_threshold, policyComplianceThreshold: suite.policy_compliance_threshold, hallucinationThreshold: suite.hallucination_threshold, toolAccuracyThreshold: suite.tool_accuracy_threshold, latencyThresholdMs: suite.latency_threshold_ms, sampleSize: suite.sample_size }]));
  const agents = agentResult.results.map(agent => ({
    id: agent.id, name: agent.name, responsibility: agent.responsibility, status: agent.status, currentVersionId: agent.current_version_id, ownerTeam: agent.owner_team, riskTier: agent.risk_tier, dailyDecisions: agent.daily_decisions, successRate: agent.success_rate, avgLatencyMs: agent.avg_latency_ms, escalationRate: agent.escalation_rate, costPerDecision: agent.cost_per_decision, recordVersion: agent.record_version, updatedAt: agent.updated_at,
    suite: suites.get(agent.id),
    versions: versionResult.results.filter(version => version.agent_id === agent.id).map(version => ({ id: version.id, version: version.version, model: version.model, promptHash: version.prompt_hash, tools: JSON.parse(version.tools_json), permissions: JSON.parse(version.permissions_json), status: version.status, recordVersion: version.record_version, createdAt: version.created_at, updatedAt: version.updated_at, evaluation: latestEvaluations.get(version.id) })),
  }));
  const dailyCost = agents.reduce((sum, agent) => sum + agent.dailyDecisions * agent.costPerDecision, 0);
  return {
    operator: { id: operator.id, displayName: operator.display_name, role: operator.role },
    summary: { totalAgents: agents.length, healthyAgents: agents.filter(agent => agent.status === "HEALTHY").length, dailyDecisions: agents.reduce((sum, agent) => sum + agent.dailyDecisions, 0), openIncidents: incidentResult.results.filter(row => row.status === "OPEN").length, dailyCost: Math.round(dailyCost * 100) / 100 },
    agents,
    deployments: deploymentResult.results,
    incidents: incidentResult.results,
    gates,
    generatedAt: timestamp(),
  };
}

export async function runAgentEvaluation(operator: Operator, versionId: string) {
  requireRole(operator, "supervisor");
  const database = db();
  const version = await database.prepare("SELECT * FROM agent_versions WHERE id = ? AND created_by = ?").bind(versionId, operator.id).first<VersionRow>();
  if (!version) throw new OperationError(404, "Agent version not found", "VERSION_NOT_FOUND");
  if (version.status === "ROLLED_BACK" || version.status === "SUPERSEDED") throw new OperationError(409, "Archived versions cannot be evaluated", "INVALID_VERSION_STATE");
  const profile = profiles[fixtureId(operator, versionId)];
  if (!profile) throw new OperationError(422, "No bounded evaluation fixture exists for this version", "UNSUPPORTED_EVALUATION");
  const suite = await database.prepare("SELECT * FROM evaluation_suites WHERE agent_id = ?").bind(version.agent_id).first<SuiteRow>();
  if (!suite) throw new OperationError(500, "Evaluation suite not found", "SUITE_NOT_FOUND");
  const completedAt = timestamp();
  const runId = `eval-${crypto.randomUUID()}`;
  const status = passes(profile) ? "PASSED" : "FAILED";
  await database.batch([
    evaluationStatement(database, runId, versionId, suite.id, profile, operator.id, completedAt),
    database.prepare("UPDATE agent_versions SET status = CASE WHEN status IN ('DRAFT','EVALUATED') THEN 'EVALUATED' ELSE status END, record_version = record_version + 1, updated_at = ? WHERE id = ? AND created_by = ?").bind(completedAt, versionId, operator.id),
    auditStatement(database, `audit-${runId}`, "agent_version", versionId, `EVALUATION_${status}`, version.status, version.status, operator, { runId, sampleSize: profile.sample_size, gates }),
  ]);
  if (status === "FAILED") {
    const failures = JSON.parse(profile.failures_json) as Array<{ category: string; count: number }>;
    await database.batch(failures.slice(0, 3).map((failure, index) => database.prepare("INSERT OR IGNORE INTO agent_incidents (id,agent_id,evaluation_run_id,severity,category,summary,status,detected_at,resolved_at) VALUES (?,?,?,?,?,?, 'OPEN',?,NULL)").bind(`incident-${runId}-${index}`, version.agent_id, runId, index === 0 ? "HIGH" : "MEDIUM", failure.category, `${failure.count} of ${profile.sample_size} evaluation cases failed in this category.`, completedAt)));
  }
  const evaluation = await database.prepare("SELECT * FROM evaluation_runs WHERE id = ? AND created_by = ?").bind(runId, operator.id).first<EvaluationRow>();
  return serializeEvaluation(evaluation);
}

async function latestPassingEvaluation(operator: Operator, versionId: string) {
  const evaluation = await db().prepare("SELECT * FROM evaluation_runs WHERE version_id = ? AND created_by = ? ORDER BY completed_at DESC, id DESC LIMIT 1").bind(versionId, operator.id).first<EvaluationRow>();
  if (!evaluation || evaluation.status !== "PASSED") throw new OperationError(409, "The latest evaluation does not pass every production gate", "EVALUATION_GATE_FAILED");
  return evaluation;
}

export async function promoteAgentVersion(operator: Operator, input: { versionId: string; target: "SHADOW" | "PRODUCTION"; expectedVersion: number }) {
  requireRole(operator, "admin");
  const database = db();
  const version = await database.prepare("SELECT * FROM agent_versions WHERE id = ? AND created_by = ?").bind(input.versionId, operator.id).first<VersionRow>();
  if (!version) throw new OperationError(404, "Agent version not found", "VERSION_NOT_FOUND");
  if (version.record_version !== input.expectedVersion) throw new OperationError(409, "Agent version changed since it was loaded", "STALE_VERSION");
  await latestPassingEvaluation(operator, version.id);
  const requiredStatus = input.target === "SHADOW" ? "EVALUATED" : "SHADOW";
  if (version.status !== requiredStatus) throw new OperationError(409, `Version must be ${requiredStatus.toLowerCase()} before promotion to ${input.target.toLowerCase()}`, "INVALID_PROMOTION");
  const promotedAt = timestamp();
  const promoted = await database.prepare("UPDATE agent_versions SET status = ?, record_version = record_version + 1, updated_at = ? WHERE id = ? AND record_version = ? AND status = ? RETURNING *").bind(input.target, promotedAt, version.id, input.expectedVersion, requiredStatus).first<VersionRow>();
  if (!promoted) throw new OperationError(409, "Agent version changed during promotion", "STALE_VERSION");
  const deploymentId = `deployment-${crypto.randomUUID()}`;
  if (input.target === "SHADOW") {
    await database.batch([
      database.prepare("UPDATE agent_deployments SET status = 'SUPERSEDED' WHERE agent_id = ? AND environment = 'SHADOW' AND status = 'ACTIVE'").bind(version.agent_id),
      database.prepare("INSERT INTO agent_deployments (id,agent_id,version_id,environment,status,traffic_percentage,previous_version_id,deployed_by,created_at,completed_at) VALUES (?,?,?,'SHADOW','ACTIVE',10,NULL,?,?,?)").bind(deploymentId, version.agent_id, version.id, operator.id, promotedAt, promotedAt),
      auditStatement(database, `audit-${deploymentId}`, "agent_version", version.id, "VERSION_PROMOTED_TO_SHADOW", version.status, "SHADOW", operator, { deploymentId, trafficPercentage: 10 }),
    ]);
  } else {
    const agent = await database.prepare("SELECT * FROM ai_agents WHERE id = ?").bind(version.agent_id).first<AgentRow>();
    if (!agent) throw new OperationError(404, "Agent not found", "AGENT_NOT_FOUND");
    const evaluation = await latestPassingEvaluation(operator, version.id);
    await database.batch([
      database.prepare("UPDATE agent_versions SET status = 'SUPERSEDED', record_version = record_version + 1, updated_at = ? WHERE id = ? AND id != ?").bind(promotedAt, agent.current_version_id, version.id),
      database.prepare("UPDATE ai_agents SET current_version_id = ?, status = 'HEALTHY', success_rate = ?, avg_latency_ms = ?, escalation_rate = ?, record_version = record_version + 1, updated_at = ? WHERE id = ?").bind(version.id, evaluation.task_success, evaluation.p95_latency_ms, Math.max(0.5, 100 - evaluation.task_success), promotedAt, agent.id),
      database.prepare("UPDATE agent_deployments SET status = 'SUPERSEDED' WHERE agent_id = ? AND environment = 'PRODUCTION' AND status = 'ACTIVE'").bind(agent.id),
      database.prepare("INSERT INTO agent_deployments (id,agent_id,version_id,environment,status,traffic_percentage,previous_version_id,deployed_by,created_at,completed_at) VALUES (?,?,?,'PRODUCTION','ACTIVE',100,?,?,?,?)").bind(deploymentId, agent.id, version.id, agent.current_version_id, operator.id, promotedAt, promotedAt),
      auditStatement(database, `audit-${deploymentId}`, "agent_version", version.id, "VERSION_PROMOTED_TO_PRODUCTION", version.status, "PRODUCTION", operator, { deploymentId, previousVersionId: agent.current_version_id, trafficPercentage: 100 }),
    ]);
  }
  return { deploymentId, versionId: promoted.id, status: promoted.status, recordVersion: promoted.record_version };
}

export async function rollbackAgentDeployment(operator: Operator, input: { agentId: string; expectedVersion: number }) {
  requireRole(operator, "admin");
  const database = db();
  const agent = await database.prepare("SELECT * FROM ai_agents WHERE id = ? AND id LIKE ?").bind(input.agentId, `${operator.workspace_id}:%`).first<AgentRow>();
  if (!agent) throw new OperationError(404, "Agent not found", "AGENT_NOT_FOUND");
  if (agent.record_version !== input.expectedVersion) throw new OperationError(409, "Agent changed since it was loaded", "STALE_AGENT");
  const deployment = await database.prepare("SELECT * FROM agent_deployments WHERE agent_id = ? AND version_id = ? AND environment = 'PRODUCTION' AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1").bind(agent.id, agent.current_version_id).first<{ id: string; previous_version_id: string | null }>();
  if (!deployment?.previous_version_id) throw new OperationError(409, "No prior production version is available for rollback", "ROLLBACK_UNAVAILABLE");
  const previous = await database.prepare("SELECT * FROM agent_versions WHERE id = ? AND created_by = ?").bind(deployment.previous_version_id, operator.id).first<VersionRow>();
  if (!previous) throw new OperationError(404, "Prior production version not found", "VERSION_NOT_FOUND");
  const priorEvaluation = await database.prepare("SELECT * FROM evaluation_runs WHERE version_id = ? AND created_by = ? ORDER BY completed_at DESC, id DESC LIMIT 1").bind(previous.id, operator.id).first<EvaluationRow>();
  const rolledBackAt = timestamp();
  const updated = await database.prepare("UPDATE ai_agents SET current_version_id = ?, success_rate = COALESCE(?,success_rate), avg_latency_ms = COALESCE(?,avg_latency_ms), record_version = record_version + 1, updated_at = ? WHERE id = ? AND record_version = ? RETURNING *").bind(previous.id, priorEvaluation?.task_success ?? null, priorEvaluation?.p95_latency_ms ?? null, rolledBackAt, agent.id, input.expectedVersion).first<AgentRow>();
  if (!updated) throw new OperationError(409, "Agent changed during rollback", "STALE_AGENT");
  await database.batch([
    database.prepare("UPDATE agent_versions SET status = 'ROLLED_BACK', record_version = record_version + 1, updated_at = ? WHERE id = ?").bind(rolledBackAt, agent.current_version_id),
    database.prepare("UPDATE agent_versions SET status = 'PRODUCTION', record_version = record_version + 1, updated_at = ? WHERE id = ?").bind(rolledBackAt, previous.id),
    database.prepare("UPDATE agent_deployments SET status = 'ROLLED_BACK', traffic_percentage = 0 WHERE id = ?").bind(deployment.id),
    auditStatement(database, `audit-rollback-${deployment.id}`, "ai_agent", agent.id, "PRODUCTION_ROLLBACK", agent.current_version_id, previous.id, operator, { deploymentId: deployment.id }),
  ]);
  return { agentId: agent.id, restoredVersionId: previous.id, recordVersion: updated.record_version };
}
