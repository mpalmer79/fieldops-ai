import { index, integer, pgTable as sqliteTable, real, text, uniqueIndex } from "drizzle-orm/pg-core";

export const operators = sqliteTable("operators", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["technician", "dispatcher", "supervisor", "admin"] }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("idx_operators_email").on(table.email)]);

export const technicians = sqliteTable("technicians", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  specialty: text("specialty").notNull(),
  status: text("status").notNull(),
  territory: text("territory").notNull(),
  skillsJson: text("skills_json").notNull(),
  partsJson: text("parts_json").notNull(),
  routeCapacity: integer("route_capacity").notNull(),
  activeStops: integer("active_stops").notNull(),
  routeMiles: real("route_miles").notNull(),
  utilization: integer("utilization").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
}, table => [index("idx_technicians_status_territory").on(table.status, table.territory)]);

export const workOrders = sqliteTable("work_orders", {
  id: text("id").primaryKey(),
  appliance: text("appliance").notNull(),
  city: text("city").notNull(),
  appointmentWindow: text("appointment_window").notNull(),
  requiredSkill: text("required_skill").notNull(),
  partCode: text("part_code"),
  status: text("status").notNull(),
  assignedTechnicianId: text("assigned_technician_id"),
  originalTechnicianId: text("original_technician_id").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
}, table => [index("idx_work_orders_status").on(table.status), index("idx_work_orders_technician_status").on(table.assignedTechnicianId, table.status)]);

export const optimizationPolicies = sqliteTable("optimization_policies", {
  id: text("id").primaryKey(),
  slaWeight: integer("sla_weight").notNull(),
  travelWeight: integer("travel_weight").notNull(),
  loadWeight: integer("load_weight").notNull(),
  overtimeWeight: integer("overtime_weight").notNull(),
  stabilityWeight: integer("stability_weight").notNull(),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const disruptions = sqliteTable("disruptions", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  technicianId: text("technician_id").notNull(),
  previousTechnicianStatus: text("previous_technician_status").notNull().default("IN_BAY"),
  status: text("status").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("idx_disruptions_idempotency_key").on(table.idempotencyKey), index("idx_disruptions_technician_status").on(table.technicianId, table.status)]);

export const recoveryPlans = sqliteTable("recovery_plans", {
  id: text("id").primaryKey(),
  disruptionId: text("disruption_id").notNull(),
  status: text("status").notNull(),
  score: real("score").notNull(),
  confidence: integer("confidence").notNull(),
  projectedSla: real("projected_sla").notNull(),
  addedTravel: real("added_travel").notNull(),
  overtime: real("overtime").notNull(),
  policyVersion: integer("policy_version").notNull(),
  optimizerVersion: text("optimizer_version").notNull(),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("idx_recovery_plans_disruption").on(table.disruptionId), index("idx_recovery_plans_status_updated").on(table.status, table.updatedAt)]);

export const planAssignments = sqliteTable("plan_assignments", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull(),
  workOrderId: text("work_order_id").notNull(),
  fromTechnicianId: text("from_technician_id").notNull(),
  toTechnicianId: text("to_technician_id"),
  impactMinutes: integer("impact_minutes").notNull(),
  travelMiles: real("travel_miles").notNull(),
  overtimeHours: real("overtime_hours").notNull(),
  outcome: text("outcome").notNull(),
}, table => [index("idx_plan_assignments_plan").on(table.planId), uniqueIndex("idx_plan_assignments_plan_order").on(table.planId, table.workOrderId)]);

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  actorId: text("actor_id").notNull(),
  actorRole: text("actor_role").notNull(),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [index("idx_audit_entity_created").on(table.entityType, table.entityId, table.createdAt)]);

export const aiAgents = sqliteTable("ai_agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  responsibility: text("responsibility").notNull(),
  status: text("status", { enum: ["HEALTHY", "DEGRADED", "PAUSED"] }).notNull(),
  currentVersionId: text("current_version_id").notNull(),
  ownerTeam: text("owner_team").notNull(),
  riskTier: text("risk_tier", { enum: ["LOW", "MEDIUM", "HIGH"] }).notNull(),
  dailyDecisions: integer("daily_decisions").notNull(),
  successRate: real("success_rate").notNull(),
  avgLatencyMs: integer("avg_latency_ms").notNull(),
  escalationRate: real("escalation_rate").notNull(),
  costPerDecision: real("cost_per_decision").notNull(),
  recordVersion: integer("record_version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
}, table => [index("idx_ai_agents_status_risk").on(table.status, table.riskTier)]);

export const agentVersions = sqliteTable("agent_versions", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  version: text("version").notNull(),
  model: text("model").notNull(),
  promptHash: text("prompt_hash").notNull(),
  toolsJson: text("tools_json").notNull(),
  permissionsJson: text("permissions_json").notNull(),
  status: text("status").notNull(),
  recordVersion: integer("record_version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("idx_agent_versions_agent_version").on(table.agentId, table.version), index("idx_agent_versions_agent_status").on(table.agentId, table.status)]);

export const evaluationSuites = sqliteTable("evaluation_suites", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  name: text("name").notNull(),
  taskSuccessThreshold: real("task_success_threshold").notNull(),
  policyComplianceThreshold: real("policy_compliance_threshold").notNull(),
  hallucinationThreshold: real("hallucination_threshold").notNull(),
  toolAccuracyThreshold: real("tool_accuracy_threshold").notNull(),
  latencyThresholdMs: integer("latency_threshold_ms").notNull(),
  sampleSize: integer("sample_size").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("idx_evaluation_suites_agent").on(table.agentId)]);

export const evaluationRuns = sqliteTable("evaluation_runs", {
  id: text("id").primaryKey(),
  versionId: text("version_id").notNull(),
  suiteId: text("suite_id").notNull(),
  status: text("status", { enum: ["PASSED", "FAILED"] }).notNull(),
  taskSuccess: real("task_success").notNull(),
  policyCompliance: real("policy_compliance").notNull(),
  hallucinationRate: real("hallucination_rate").notNull(),
  toolAccuracy: real("tool_accuracy").notNull(),
  p95LatencyMs: integer("p95_latency_ms").notNull(),
  sampleSize: integer("sample_size").notNull(),
  failuresJson: text("failures_json").notNull(),
  createdBy: text("created_by").notNull(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at").notNull(),
}, table => [index("idx_evaluation_runs_version_completed").on(table.versionId, table.completedAt), index("idx_evaluation_runs_status_completed").on(table.status, table.completedAt)]);

export const agentDeployments = sqliteTable("agent_deployments", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  versionId: text("version_id").notNull(),
  environment: text("environment", { enum: ["SHADOW", "PRODUCTION"] }).notNull(),
  status: text("status", { enum: ["ACTIVE", "SUPERSEDED", "ROLLED_BACK"] }).notNull(),
  trafficPercentage: integer("traffic_percentage").notNull(),
  previousVersionId: text("previous_version_id"),
  deployedBy: text("deployed_by").notNull(),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at").notNull(),
}, table => [index("idx_agent_deployments_agent_created").on(table.agentId, table.createdAt), index("idx_agent_deployments_status_environment").on(table.status, table.environment)]);

export const agentIncidents = sqliteTable("agent_incidents", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  evaluationRunId: text("evaluation_run_id"),
  severity: text("severity", { enum: ["LOW", "MEDIUM", "HIGH"] }).notNull(),
  category: text("category").notNull(),
  summary: text("summary").notNull(),
  status: text("status", { enum: ["OPEN", "MONITORING", "RESOLVED"] }).notNull(),
  detectedAt: text("detected_at").notNull(),
  resolvedAt: text("resolved_at"),
}, table => [index("idx_agent_incidents_agent_status").on(table.agentId, table.status), index("idx_agent_incidents_severity_detected").on(table.severity, table.detectedAt)]);

export const diagnosticCases = sqliteTable("diagnostic_cases", {
  id: text("id").primaryKey(),
  workOrderId: text("work_order_id").notNull(),
  technicianId: text("technician_id").notNull(),
  applianceMake: text("appliance_make").notNull(),
  applianceModel: text("appliance_model").notNull(),
  serialTail: text("serial_tail").notNull(),
  complaint: text("complaint").notNull(),
  symptomCode: text("symptom_code").notNull(),
  status: text("status", { enum: ["INTAKE", "ANALYZED", "RECOMMENDATION_ACCEPTED", "RESOLVED", "ESCALATED"] }).notNull(),
  safetyStatus: text("safety_status", { enum: ["CLEAR", "ACK_REQUIRED", "ACKNOWLEDGED"] }).notNull(),
  latestRunId: text("latest_run_id").notNull(),
  selectedRecommendationId: text("selected_recommendation_id"),
  recordVersion: integer("record_version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  uniqueIndex("idx_diagnostic_cases_work_order").on(table.workOrderId),
  index("idx_diagnostic_cases_technician_status").on(table.technicianId, table.status),
  index("idx_diagnostic_cases_status_updated").on(table.status, table.updatedAt),
]);

export const diagnosticSources = sqliteTable("diagnostic_sources", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  sourceType: text("source_type", { enum: ["SERVICE_PROCEDURE", "TECHNICAL_BULLETIN", "REPAIR_HISTORY", "SAFETY_POLICY"] }).notNull(),
  applianceMake: text("appliance_make").notNull(),
  applianceModel: text("appliance_model").notNull(),
  revision: text("revision").notNull(),
  referenceCode: text("reference_code").notNull(),
  summary: text("summary").notNull(),
  verifiedAt: text("verified_at").notNull(),
}, table => [
  uniqueIndex("idx_diagnostic_sources_reference").on(table.referenceCode),
  index("idx_diagnostic_sources_appliance_type").on(table.applianceMake, table.applianceModel, table.sourceType),
]);

export const diagnosticRuns = sqliteTable("diagnostic_runs", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull(),
  modelVersion: text("model_version").notNull(),
  status: text("status", { enum: ["COMPLETED", "FAILED"] }).notNull(),
  groundingRate: real("grounding_rate").notNull(),
  sourceCount: integer("source_count").notNull(),
  toolCallCount: integer("tool_call_count").notNull(),
  createdBy: text("created_by").notNull(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at").notNull(),
}, table => [index("idx_diagnostic_runs_case_completed").on(table.caseId, table.completedAt)]);

export const diagnosticRecommendations = sqliteTable("diagnostic_recommendations", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  caseId: text("case_id").notNull(),
  rank: integer("rank").notNull(),
  faultCode: text("fault_code").notNull(),
  component: text("component").notNull(),
  confidence: real("confidence").notNull(),
  rationale: text("rationale").notNull(),
  verificationStep: text("verification_step").notNull(),
  partCode: text("part_code"),
  safetyClass: text("safety_class", { enum: ["STANDARD", "LOCKOUT_REQUIRED", "ESCALATE"] }).notNull(),
  groundingScore: real("grounding_score").notNull(),
  evidenceSourceIdsJson: text("evidence_source_ids_json").notNull(),
  status: text("status", { enum: ["PROPOSED", "ACCEPTED", "REJECTED"] }).notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  uniqueIndex("idx_diagnostic_recommendations_run_rank").on(table.runId, table.rank),
  index("idx_diagnostic_recommendations_case_status").on(table.caseId, table.status),
]);

export const partsInventory = sqliteTable("parts_inventory", {
  id: text("id").primaryKey(),
  partCode: text("part_code").notNull(),
  description: text("description").notNull(),
  location: text("location").notNull(),
  onHand: integer("on_hand").notNull(),
  reserved: integer("reserved").notNull(),
  recordVersion: integer("record_version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
}, table => [
  uniqueIndex("idx_parts_inventory_part_location").on(table.partCode, table.location),
  index("idx_parts_inventory_part").on(table.partCode),
]);

export const diagnosticToolCalls = sqliteTable("diagnostic_tool_calls", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  caseId: text("case_id").notNull(),
  toolName: text("tool_name").notNull(),
  status: text("status", { enum: ["SUCCEEDED", "FAILED"] }).notNull(),
  inputJson: text("input_json").notNull(),
  outputJson: text("output_json").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [index("idx_diagnostic_tool_calls_run_created").on(table.runId, table.createdAt)]);

export const diagnosticOutcomes = sqliteTable("diagnostic_outcomes", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull(),
  recommendationId: text("recommendation_id").notNull(),
  resolutionCode: text("resolution_code").notNull(),
  firstTimeFix: integer("first_time_fix").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  notes: text("notes").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("idx_diagnostic_outcomes_recommendation").on(table.recommendationId), index("idx_diagnostic_outcomes_case_created").on(table.caseId, table.createdAt)]);

export const demandObservations = sqliteTable("demand_observations", {
  id: text("id").primaryKey(),
  observedDate: text("observed_date").notNull(),
  territory: text("territory").notNull(),
  skill: text("skill").notNull(),
  requestedJobs: integer("requested_jobs").notNull(),
  completedJobs: integer("completed_jobs").notNull(),
  availableCapacity: integer("available_capacity").notNull(),
  avgDurationMinutes: integer("avg_duration_minutes").notNull(),
  source: text("source").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [
  uniqueIndex("idx_demand_observations_date_territory_skill").on(table.observedDate, table.territory, table.skill),
  index("idx_demand_observations_territory_date").on(table.territory, table.observedDate),
]);

export const forecastRuns = sqliteTable("forecast_runs", {
  id: text("id").primaryKey(),
  status: text("status", { enum: ["COMPLETED", "FAILED"] }).notNull(),
  modelVersion: text("model_version").notNull(),
  territory: text("territory").notNull(),
  horizonDays: integer("horizon_days").notNull(),
  trainingWindowDays: integer("training_window_days").notNull(),
  wape: real("wape").notNull(),
  bias: real("bias").notNull(),
  intervalCoverage: real("interval_coverage").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  inputSnapshotJson: text("input_snapshot_json").notNull(),
  createdBy: text("created_by").notNull(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at").notNull(),
}, table => [
  uniqueIndex("idx_forecast_runs_idempotency_key").on(table.idempotencyKey),
  index("idx_forecast_runs_territory_completed").on(table.territory, table.completedAt),
]);

export const forecastPoints = sqliteTable("forecast_points", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  forecastDate: text("forecast_date").notNull(),
  territory: text("territory").notNull(),
  skill: text("skill").notNull(),
  expectedDemand: integer("expected_demand").notNull(),
  lowerBound: integer("lower_bound").notNull(),
  upperBound: integer("upper_bound").notNull(),
  availableCapacity: integer("available_capacity").notNull(),
  riskLevel: text("risk_level", { enum: ["LOW", "MEDIUM", "HIGH"] }).notNull(),
  createdAt: text("created_at").notNull(),
}, table => [
  uniqueIndex("idx_forecast_points_run_date_skill").on(table.runId, table.forecastDate, table.skill),
  index("idx_forecast_points_run_date").on(table.runId, table.forecastDate),
]);

export const capacityScenarios = sqliteTable("capacity_scenarios", {
  id: text("id").primaryKey(),
  forecastRunId: text("forecast_run_id").notNull(),
  name: text("name").notNull(),
  status: text("status", { enum: ["DRAFT", "APPROVED"] }).notNull(),
  demandChangePct: integer("demand_change_pct").notNull(),
  availabilityChangePct: integer("availability_change_pct").notNull(),
  overtimeHours: integer("overtime_hours").notNull(),
  crossTrainedTechs: integer("cross_trained_techs").notNull(),
  projectedDemand: integer("projected_demand").notNull(),
  projectedCapacity: integer("projected_capacity").notNull(),
  residualGap: integer("residual_gap").notNull(),
  jobsProtected: integer("jobs_protected").notNull(),
  estimatedCost: integer("estimated_cost").notNull(),
  recordVersion: integer("record_version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  approvedBy: text("approved_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  approvedAt: text("approved_at"),
}, table => [
  index("idx_capacity_scenarios_run_created").on(table.forecastRunId, table.createdAt),
  index("idx_capacity_scenarios_status_updated").on(table.status, table.updatedAt),
]);

export const capacityActions = sqliteTable("capacity_actions", {
  id: text("id").primaryKey(),
  scenarioId: text("scenario_id").notNull(),
  forecastDate: text("forecast_date").notNull(),
  skill: text("skill").notNull(),
  actionType: text("action_type").notNull(),
  description: text("description").notNull(),
  capacityDelta: integer("capacity_delta").notNull(),
  estimatedCost: integer("estimated_cost").notNull(),
  priority: integer("priority").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [
  uniqueIndex("idx_capacity_actions_scenario_priority").on(table.scenarioId, table.priority),
  index("idx_capacity_actions_scenario_date").on(table.scenarioId, table.forecastDate),
]);

export const benchmarkRuns = sqliteTable("benchmark_runs", {
  id: text("id").primaryKey(),
  status: text("status", { enum: ["PASSED", "FAILED"] }).notNull(),
  suiteVersion: text("suite_version").notNull(),
  engineVersion: text("engine_version").notNull(),
  seed: integer("seed").notNull(),
  iterations: integer("iterations").notNull(),
  profileCount: integer("profile_count").notNull(),
  totalEvaluations: integer("total_evaluations").notNull(),
  durationMs: real("duration_ms").notNull(),
  throughput: real("throughput").notNull(),
  p95ShardMs: real("p95_shard_ms").notNull(),
  deterministicPassed: integer("deterministic_passed").notNull(),
  zeroViolationPassed: integer("zero_violation_passed").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  environmentJson: text("environment_json").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at").notNull(),
}, table => [
  uniqueIndex("idx_benchmark_runs_idempotency_key").on(table.idempotencyKey),
  index("idx_benchmark_runs_completed").on(table.completedAt),
]);

export const benchmarkResults = sqliteTable("benchmark_results", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  profileKey: text("profile_key").notNull(),
  label: text("label").notNull(),
  workOrders: integer("work_orders").notNull(),
  technicians: integer("technicians").notNull(),
  territories: integer("territories").notNull(),
  iterations: integer("iterations").notNull(),
  evaluations: integer("evaluations").notNull(),
  durationMs: real("duration_ms").notNull(),
  throughput: real("throughput").notNull(),
  p95ShardMs: real("p95_shard_ms").notNull(),
  feasibleRate: real("feasible_rate").notNull(),
  hardRejectRate: real("hard_reject_rate").notNull(),
  constraintViolations: integer("constraint_violations").notNull(),
  checksum: text("checksum").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [
  uniqueIndex("idx_benchmark_results_run_profile").on(table.runId, table.profileKey),
  index("idx_benchmark_results_run").on(table.runId),
]);
