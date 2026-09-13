import "server-only";
import { auditStatement, db, OperationError, requireRole, type Operator } from "@/lib/server/operations-store";

const TERRITORY = "ROOFTOP_01";
const MODEL_VERSION = "weekday-recency-v1.0";
const HORIZON_DAYS = 14;
const TRAINING_WINDOW_DAYS = 56;
const SEED_IDEMPOTENCY_KEY = "capacity-automotive-seed-v2";

type ObservationRow = {
  observed_date: string;
  skill: string;
  requested_jobs: number;
  completed_jobs: number;
  available_capacity: number;
};

type ForecastRunRow = {
  id: string;
  status: string;
  model_version: string;
  territory: string;
  horizon_days: number;
  training_window_days: number;
  wape: number;
  bias: number;
  interval_coverage: number;
  idempotency_key: string;
  input_snapshot_json: string;
  created_by: string;
  started_at: string;
  completed_at: string;
};

type ForecastPointRow = {
  id: string;
  run_id: string;
  forecast_date: string;
  territory: string;
  skill: string;
  expected_demand: number;
  lower_bound: number;
  upper_bound: number;
  available_capacity: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  created_at: string;
};

type ScenarioRow = {
  id: string;
  forecast_run_id: string;
  name: string;
  status: "DRAFT" | "APPROVED";
  demand_change_pct: number;
  availability_change_pct: number;
  overtime_hours: number;
  cross_trained_techs: number;
  projected_demand: number;
  projected_capacity: number;
  residual_gap: number;
  jobs_protected: number;
  estimated_cost: number;
  record_version: number;
  created_by: string;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
};

type ScenarioInput = {
  forecastRunId: string;
  name: string;
  demandChangePct: number;
  availabilityChangePct: number;
  overtimeHours: number;
  crossTrainedTechs: number;
};

type ForecastFixture = {
  date: string;
  skill: string;
  expectedDemand: number;
  lowerBound: number;
  upperBound: number;
  availableCapacity: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
};

type CapacityActionFixture = {
  date: string;
  skill: string;
  type: string;
  description: string;
  capacityDelta: number;
  estimatedCost: number;
  priority: number;
};

const skillProfiles = [
  { skill: "Drivability", demand: 21, capacity: 19, duration: 118 },
  { skill: "Electrical & ADAS", demand: 18, capacity: 18, duration: 104 },
  { skill: "Maintenance", demand: 16, capacity: 17, duration: 82 },
] as const;

const demandDayFactor = [0.4, 1.13, 1.04, 1, 1.06, 1.11, 0.68];
const capacityDayFactor = [0.28, 1, 1, 1, 1, 0.95, 0.58];

function now() {
  return new Date().toISOString();
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function offsetDate(value: Date | string, offset: number) {
  const source = typeof value === "string" ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  source.setUTCDate(source.getUTCDate() + offset);
  return dateOnly(source);
}

function utcDay(value: string) {
  return new Date(`${value}T00:00:00.000Z`).getUTCDay();
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function weightedWeekdayForecast(history: ObservationRow[], skill: string, targetDate: string) {
  const weekday = utcDay(targetDate);
  const candidates = history
    .filter(row => row.skill === skill && utcDay(row.observed_date) === weekday && row.observed_date < targetDate)
    .sort((a, b) => b.observed_date.localeCompare(a.observed_date))
    .slice(0, 4);
  const weights = [0.4, 0.3, 0.2, 0.1];
  if (!candidates.length) return skillProfiles.find(item => item.skill === skill)?.demand ?? 0;
  const appliedWeights = candidates.map((_, index) => weights[index]);
  const denominator = appliedWeights.reduce((sum, value) => sum + value, 0);
  return candidates.reduce((sum, row, index) => sum + row.requested_jobs * appliedWeights[index], 0) / denominator;
}

function trendFactor(history: ObservationRow[], skill: string) {
  const rows = history.filter(row => row.skill === skill).sort((a, b) => a.observed_date.localeCompare(b.observed_date));
  const recent = rows.slice(-14);
  const prior = rows.slice(-28, -14);
  if (!recent.length || !prior.length) return 0;
  const recentAverage = recent.reduce((sum, row) => sum + row.requested_jobs, 0) / recent.length;
  const priorAverage = prior.reduce((sum, row) => sum + row.requested_jobs, 0) / prior.length;
  return clamp((recentAverage - priorAverage) / Math.max(priorAverage, 1), -0.08, 0.12);
}

function forecastFixtures(history: ObservationRow[]): ForecastFixture[] {
  const latestDate = history.reduce((latest, row) => row.observed_date > latest ? row.observed_date : latest, "");
  if (!latestDate) throw new OperationError(500, "Demand history is unavailable", "DEMAND_HISTORY_NOT_FOUND");
  const points: ForecastFixture[] = [];
  for (let dayOffset = 1; dayOffset <= HORIZON_DAYS; dayOffset += 1) {
    const date = offsetDate(latestDate, dayOffset);
    const weekday = utcDay(date);
    for (const profile of skillProfiles) {
      const expected = Math.max(1, Math.round(weightedWeekdayForecast(history, profile.skill, date) * (1 + trendFactor(history, profile.skill))));
      const interval = Math.max(2, Math.round(expected * 0.13));
      const capacity = Math.max(1, Math.round(profile.capacity * capacityDayFactor[weekday]));
      const gap = expected - capacity;
      points.push({
        date,
        skill: profile.skill,
        expectedDemand: expected,
        lowerBound: Math.max(0, expected - interval),
        upperBound: expected + interval,
        availableCapacity: capacity,
        riskLevel: gap >= 4 || expected + interval - capacity >= 7 ? "HIGH" : gap > 0 || expected + interval > capacity ? "MEDIUM" : "LOW",
      });
    }
  }
  return points;
}

function backtest(history: ObservationRow[]) {
  const evaluation = history.slice(-42);
  let absoluteError = 0;
  let signedError = 0;
  let actualTotal = 0;
  let covered = 0;
  for (const actual of evaluation) {
    const prior = history.filter(row => row.observed_date < actual.observed_date);
    const prediction = weightedWeekdayForecast(prior, actual.skill, actual.observed_date);
    const interval = Math.max(2, Math.round(prediction * 0.13));
    absoluteError += Math.abs(prediction - actual.requested_jobs);
    signedError += prediction - actual.requested_jobs;
    actualTotal += actual.requested_jobs;
    if (actual.requested_jobs >= prediction - interval && actual.requested_jobs <= prediction + interval) covered += 1;
  }
  return {
    wape: round1(absoluteError / Math.max(actualTotal, 1) * 100),
    bias: round1(signedError / Math.max(actualTotal, 1) * 100),
    intervalCoverage: round1(covered / Math.max(evaluation.length, 1) * 100),
  };
}

async function ensureDemandHistory() {
  const database = db();
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - 1);
  const timestamp = now();
  const statements: D1PreparedStatement[] = [];
  for (let offset = -(TRAINING_WINDOW_DAYS - 1); offset <= 0; offset += 1) {
    const date = offsetDate(end, offset);
    const weekday = utcDay(date);
    const week = Math.floor((offset + TRAINING_WINDOW_DAYS) / 7);
    skillProfiles.forEach((profile, skillIndex) => {
      const noise = ((new Date(`${date}T00:00:00.000Z`).getUTCDate() + week + skillIndex * 3) % 5) - 2;
      const requested = Math.max(2, Math.round(profile.demand * demandDayFactor[weekday] + noise));
      const capacity = Math.max(1, Math.round(profile.capacity * capacityDayFactor[weekday]));
      const completed = Math.min(requested, capacity + ((week + skillIndex) % 2));
      statements.push(database.prepare(`
        INSERT OR IGNORE INTO demand_observations
        (id, observed_date, territory, skill, requested_jobs, completed_jobs, available_capacity, avg_duration_minutes, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SYNTHETIC_PORTFOLIO_FIXTURE', ?)
      `).bind(`DO-${TERRITORY}-${date}-${profile.skill.toLowerCase()}`, date, TERRITORY, profile.skill, requested, completed, capacity, profile.duration, timestamp));
    });
  }
  for (let index = 0; index < statements.length; index += 50) await database.batch(statements.slice(index, index + 50));
}

async function demandHistory() {
  const result = await db().prepare(`
    SELECT observed_date, skill, requested_jobs, completed_jobs, available_capacity
    FROM demand_observations
    WHERE territory = ?
    ORDER BY observed_date, skill
  `).bind(TERRITORY).all<ObservationRow>();
  return result.results;
}

async function latestRun(operator: Operator) {
  return db().prepare("SELECT * FROM forecast_runs WHERE territory = ? AND created_by = ? ORDER BY completed_at DESC, id DESC LIMIT 1").bind(TERRITORY, operator.id).first<ForecastRunRow>();
}

async function pointsForRun(runId: string) {
  const result = await db().prepare("SELECT * FROM forecast_points WHERE run_id = ? ORDER BY forecast_date, skill").bind(runId).all<ForecastPointRow>();
  return result.results;
}

export async function ensureCapacityPlanningState(operator: Operator) {
  await ensureDemandHistory();
  if (await latestRun(operator)) return;
  await persistForecast(operator, SEED_IDEMPOTENCY_KEY, "INITIAL_FORECAST");
}

async function persistForecast(operator: Operator, idempotencyKey: string, source: string) {
  const database = db();
  const scopedIdempotencyKey = `${operator.id}:${idempotencyKey}`;
  const existing = await database.prepare("SELECT id FROM forecast_runs WHERE idempotency_key = ? AND created_by = ?").bind(scopedIdempotencyKey, operator.id).first<{ id: string }>();
  if (existing) return existing.id;
  const history = await demandHistory();
  const points = forecastFixtures(history);
  const metrics = backtest(history);
  const runId = `FR-${crypto.randomUUID()}`;
  const timestamp = now();
  const historyStart = history[0]?.observed_date;
  const historyEnd = history.at(-1)?.observed_date;
  const statements: D1PreparedStatement[] = [
    database.prepare(`
      INSERT OR IGNORE INTO forecast_runs
      (id, status, model_version, territory, horizon_days, training_window_days, wape, bias, interval_coverage, idempotency_key, input_snapshot_json, created_by, started_at, completed_at)
      VALUES (?, 'COMPLETED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(runId, MODEL_VERSION, TERRITORY, HORIZON_DAYS, TRAINING_WINDOW_DAYS, metrics.wape, metrics.bias, metrics.intervalCoverage, scopedIdempotencyKey, JSON.stringify({ source, historyStart, historyEnd, observationCount: history.length }), operator.id, timestamp, timestamp),
    ...points.map(point => database.prepare(`
      INSERT OR IGNORE INTO forecast_points
      (id, run_id, forecast_date, territory, skill, expected_demand, lower_bound, upper_bound, available_capacity, risk_level, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM forecast_runs WHERE id = ? AND idempotency_key = ?)
    `).bind(`${runId}-${point.date}-${point.skill.toLowerCase()}`, runId, point.date, TERRITORY, point.skill, point.expectedDemand, point.lowerBound, point.upperBound, point.availableCapacity, point.riskLevel, timestamp, runId, scopedIdempotencyKey)),
    database.prepare(`
      INSERT OR IGNORE INTO audit_log
      (id, entity_type, entity_id, action, from_status, to_status, actor_id, actor_role, metadata_json, created_at)
      SELECT ?, 'forecast_run', ?, 'DEMAND_FORECAST_COMPLETED', NULL, 'COMPLETED', ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM forecast_runs WHERE id = ? AND idempotency_key = ?)
    `).bind(`audit-${runId}`, runId, operator.id, operator.role, JSON.stringify({ modelVersion: MODEL_VERSION, horizonDays: HORIZON_DAYS, ...metrics }), timestamp, runId, scopedIdempotencyKey),
  ];
  await database.batch(statements);
  const canonical = await database.prepare("SELECT id FROM forecast_runs WHERE idempotency_key = ? AND created_by = ?").bind(scopedIdempotencyKey, operator.id).first<{ id: string }>();
  if (!canonical) throw new OperationError(500, "Demand forecast could not be persisted", "FORECAST_WRITE_FAILED");
  return canonical.id;
}

function parseInputSnapshot(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function serializeSnapshot(operator: Operator) {
  const database = db();
  const run = await latestRun(operator);
  if (!run) throw new OperationError(500, "Demand forecast is unavailable", "FORECAST_NOT_FOUND");
  const points = await pointsForRun(run.id);
  const scenario = await database.prepare("SELECT * FROM capacity_scenarios WHERE forecast_run_id = ? AND created_by = ? ORDER BY created_at DESC, id DESC LIMIT 1").bind(run.id, operator.id).first<ScenarioRow>();
  const [actions, auditResult, observationCount] = await Promise.all([
    scenario ? database.prepare("SELECT * FROM capacity_actions WHERE scenario_id = ? ORDER BY priority").bind(scenario.id).all() : Promise.resolve({ results: [] }),
    database.prepare("SELECT id, entity_type, entity_id, action, from_status, to_status, actor_role, metadata_json, created_at FROM audit_log WHERE entity_type IN ('forecast_run', 'capacity_scenario') AND actor_id = ? ORDER BY created_at DESC LIMIT 10").bind(operator.id).all(),
    database.prepare("SELECT COUNT(*) AS count FROM demand_observations WHERE territory = ?").bind(TERRITORY).first<{ count: number }>(),
  ]);
  const totalExpected = points.reduce((sum, point) => sum + point.expected_demand, 0);
  const totalCapacity = points.reduce((sum, point) => sum + point.available_capacity, 0);
  const grossGap = points.reduce((sum, point) => sum + Math.max(0, point.expected_demand - point.available_capacity), 0);
  const daily = new Map<string, { date: string; expected: number; lower: number; upper: number; capacity: number; gap: number }>();
  points.forEach(point => {
    const current = daily.get(point.forecast_date) ?? { date: point.forecast_date, expected: 0, lower: 0, upper: 0, capacity: 0, gap: 0 };
    current.expected += point.expected_demand;
    current.lower += point.lower_bound;
    current.upper += point.upper_bound;
    current.capacity += point.available_capacity;
    current.gap += Math.max(0, point.expected_demand - point.available_capacity);
    daily.set(point.forecast_date, current);
  });
  const dailyValues = [...daily.values()];
  const peakDay = dailyValues.reduce((peak, item) => item.expected > peak.expected ? item : peak, dailyValues[0]);
  return {
    operator: { id: operator.id, displayName: operator.display_name, role: operator.role },
    run: {
      id: run.id,
      status: run.status,
      modelVersion: run.model_version,
      territory: run.territory,
      horizonDays: run.horizon_days,
      trainingWindowDays: run.training_window_days,
      wape: run.wape,
      bias: run.bias,
      intervalCoverage: run.interval_coverage,
      inputSnapshot: parseInputSnapshot(run.input_snapshot_json),
      completedAt: run.completed_at,
    },
    points,
    daily: dailyValues,
    scenario: scenario ? {
      id: scenario.id,
      forecastRunId: scenario.forecast_run_id,
      name: scenario.name,
      status: scenario.status,
      demandChangePct: scenario.demand_change_pct,
      availabilityChangePct: scenario.availability_change_pct,
      overtimeHours: scenario.overtime_hours,
      crossTrainedTechs: scenario.cross_trained_techs,
      projectedDemand: scenario.projected_demand,
      projectedCapacity: scenario.projected_capacity,
      residualGap: scenario.residual_gap,
      jobsProtected: scenario.jobs_protected,
      estimatedCost: scenario.estimated_cost,
      recordVersion: scenario.record_version,
      createdAt: scenario.created_at,
      updatedAt: scenario.updated_at,
      approvedAt: scenario.approved_at,
    } : null,
    actions: actions.results,
    audit: auditResult.results,
    metrics: {
      totalExpected,
      totalCapacity,
      grossGap,
      highRiskPoints: points.filter(point => point.risk_level === "HIGH").length,
      peakDate: peakDay?.date ?? "",
      peakDemand: peakDay?.expected ?? 0,
      observationCount: Number(observationCount?.count ?? 0),
    },
    boundaries: {
      data: "Synthetic 56-day service-demand history",
      model: "Deterministic same-weekday recency forecast with measured backtest error",
      autonomy: "Capacity recommendations require supervisor approval and do not create employee schedules.",
    },
  };
}

export async function getCapacityPlanningSnapshot(operator: Operator) {
  await ensureCapacityPlanningState(operator);
  return serializeSnapshot(operator);
}

export async function createForecastRun(operator: Operator, input: { idempotencyKey: string }) {
  requireRole(operator, "supervisor");
  if (input.idempotencyKey.length < 12 || input.idempotencyKey.length > 100) throw new OperationError(400, "Invalid idempotency key", "INVALID_IDEMPOTENCY_KEY");
  await ensureDemandHistory();
  await persistForecast(operator, input.idempotencyKey, "MANUAL_REFRESH");
  return serializeSnapshot(operator);
}

function validateScenario(input: ScenarioInput) {
  if (!input.forecastRunId || input.name.trim().length < 3 || input.name.trim().length > 80) throw new OperationError(400, "A current forecast and scenario name are required", "INVALID_CAPACITY_SCENARIO");
  const integers = [input.demandChangePct, input.availabilityChangePct, input.overtimeHours, input.crossTrainedTechs];
  if (integers.some(value => !Number.isInteger(value))) throw new OperationError(400, "Scenario controls must use whole numbers", "INVALID_CAPACITY_SCENARIO");
  if (input.demandChangePct < -20 || input.demandChangePct > 40) throw new OperationError(400, "Demand change must be between -20% and 40%", "INVALID_CAPACITY_SCENARIO");
  if (input.availabilityChangePct < -30 || input.availabilityChangePct > 20) throw new OperationError(400, "Availability change must be between -30% and 20%", "INVALID_CAPACITY_SCENARIO");
  if (input.overtimeHours < 0 || input.overtimeHours > 4 || input.crossTrainedTechs < 0 || input.crossTrainedTechs > 6) throw new OperationError(400, "Overtime or cross-training input is outside the supported range", "INVALID_CAPACITY_SCENARIO");
}

function buildCapacityActions(points: ForecastPointRow[], flexibleCapacity: number, overtimeHours: number, crossTrainedTechs: number, totalCost: number) {
  const grouped = new Map<string, { skill: string; gap: number; dates: string[] }>();
  points.forEach(point => {
    const gap = Math.max(0, point.expected_demand - point.available_capacity);
    if (!gap) return;
    const current = grouped.get(point.skill) ?? { skill: point.skill, gap: 0, dates: [] };
    current.gap += gap;
    current.dates.push(point.forecast_date);
    grouped.set(point.skill, current);
  });
  const gaps = [...grouped.values()].sort((a, b) => b.gap - a.gap);
  const actions: CapacityActionFixture[] = [];
  let remaining = flexibleCapacity;
  for (const item of gaps) {
    if (remaining <= 0) break;
    const capacityDelta = Math.min(item.gap, remaining);
    const method = overtimeHours > 0 && crossTrainedTechs > 0 ? "cross-trained support and controlled overtime" : crossTrainedTechs > 0 ? "cross-trained support" : "controlled overtime";
    actions.push({
      date: item.dates.sort()[0],
      skill: item.skill,
      type: overtimeHours > 0 && crossTrainedTechs > 0 ? "BLENDED_CAPACITY" : crossTrainedTechs > 0 ? "CROSS_TRAINED_SUPPORT" : "OVERTIME_BLOCK",
      description: `Reserve ${capacityDelta} ${item.skill.toLowerCase()} appointment slots across ${item.dates.length} constrained days using ${method}.`,
      capacityDelta,
      estimatedCost: flexibleCapacity ? Math.round(totalCost * capacityDelta / flexibleCapacity) : 0,
      priority: actions.length + 1,
    });
    remaining -= capacityDelta;
  }
  if (remaining > 0 && points.length) {
    actions.push({
      date: points[0].forecast_date,
      skill: "Flexible pool",
      type: "CAPACITY_BUFFER",
      description: `Hold ${remaining} appointment slots as a forecast-uncertainty buffer rather than committing them to a specific service skill.`,
      capacityDelta: remaining,
      estimatedCost: flexibleCapacity ? Math.round(totalCost * remaining / flexibleCapacity) : 0,
      priority: actions.length + 1,
    });
  }
  if (!actions.length && gaps.length) actions.push({ date: gaps[0].dates.sort()[0], skill: gaps[0].skill, type: "OVERFLOW_REVIEW", description: "Review overflow appointments before customer commitments are changed.", capacityDelta: 0, estimatedCost: 0, priority: 1 });
  return actions;
}

export async function createCapacityScenario(operator: Operator, input: ScenarioInput) {
  requireRole(operator, "supervisor");
  validateScenario(input);
  const run = await latestRun(operator);
  if (!run || run.id !== input.forecastRunId) throw new OperationError(409, "A newer forecast is available. Reload before evaluating this scenario", "STALE_FORECAST");
  const points = await pointsForRun(run.id);
  const adjusted = points.map(point => ({
    ...point,
    expected_demand: Math.max(0, Math.round(point.expected_demand * (1 + input.demandChangePct / 100))),
    available_capacity: Math.max(0, Math.round(point.available_capacity * (1 + input.availabilityChangePct / 100))),
  }));
  const projectedDemand = adjusted.reduce((sum, point) => sum + point.expected_demand, 0);
  const baseAdjustedCapacity = adjusted.reduce((sum, point) => sum + point.available_capacity, 0);
  const grossGap = adjusted.reduce((sum, point) => sum + Math.max(0, point.expected_demand - point.available_capacity), 0);
  const weekdays = new Set(adjusted.filter(point => ![0, 6].includes(utcDay(point.forecast_date))).map(point => point.forecast_date)).size;
  const flexibleCapacity = input.overtimeHours * weekdays * 2 + input.crossTrainedTechs * 4;
  const jobsProtected = Math.min(grossGap, flexibleCapacity);
  const residualGap = Math.max(0, grossGap - jobsProtected);
  const projectedCapacity = baseAdjustedCapacity + flexibleCapacity;
  const estimatedCost = input.overtimeHours * weekdays * 95 + input.crossTrainedTechs * 275;
  const actions = buildCapacityActions(adjusted, flexibleCapacity, input.overtimeHours, input.crossTrainedTechs, estimatedCost);
  const scenarioId = `CS-${crypto.randomUUID()}`;
  const timestamp = now();
  const database = db();
  await database.batch([
    database.prepare(`
      INSERT INTO capacity_scenarios
      (id, forecast_run_id, name, status, demand_change_pct, availability_change_pct, overtime_hours, cross_trained_techs, projected_demand, projected_capacity, residual_gap, jobs_protected, estimated_cost, record_version, created_by, approved_by, created_at, updated_at, approved_at)
      VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, ?, ?, NULL)
    `).bind(scenarioId, run.id, input.name.trim(), input.demandChangePct, input.availabilityChangePct, input.overtimeHours, input.crossTrainedTechs, projectedDemand, projectedCapacity, residualGap, jobsProtected, estimatedCost, operator.id, timestamp, timestamp),
    ...actions.map(action => database.prepare(`
      INSERT INTO capacity_actions
      (id, scenario_id, forecast_date, skill, action_type, description, capacity_delta, estimated_cost, priority, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(`${scenarioId}-A${action.priority}`, scenarioId, action.date, action.skill, action.type, action.description, action.capacityDelta, action.estimatedCost, action.priority, timestamp)),
    auditStatement(database, `audit-${scenarioId}-created`, "capacity_scenario", scenarioId, "CAPACITY_SCENARIO_CREATED", null, "DRAFT", operator, { forecastRunId: run.id, projectedDemand, projectedCapacity, residualGap, jobsProtected, assumptions: input }, timestamp),
  ]);
  return serializeSnapshot(operator);
}

export async function approveCapacityScenario(operator: Operator, input: { scenarioId: string; expectedVersion: number }) {
  requireRole(operator, "supervisor");
  if (!input.scenarioId || !Number.isInteger(input.expectedVersion)) throw new OperationError(400, "scenarioId and expectedVersion are required", "INVALID_CAPACITY_APPROVAL");
  const database = db();
  const scenario = await database.prepare("SELECT * FROM capacity_scenarios WHERE id = ? AND created_by = ?").bind(input.scenarioId, operator.id).first<ScenarioRow>();
  if (!scenario) throw new OperationError(404, "Capacity scenario not found", "CAPACITY_SCENARIO_NOT_FOUND");
  if (scenario.status !== "DRAFT") throw new OperationError(409, "Only a draft capacity scenario can be approved", "INVALID_CAPACITY_TRANSITION");
  const timestamp = now();
  const nextVersion = input.expectedVersion + 1;
  const results = await database.batch([
    database.prepare(`
      UPDATE capacity_scenarios
      SET status = 'APPROVED', record_version = record_version + 1, approved_by = ?, approved_at = ?, updated_at = ?
      WHERE id = ? AND created_by = ? AND status = 'DRAFT' AND record_version = ?
    `).bind(operator.id, timestamp, timestamp, scenario.id, operator.id, input.expectedVersion),
    database.prepare(`
      INSERT OR IGNORE INTO audit_log
      (id, entity_type, entity_id, action, from_status, to_status, actor_id, actor_role, metadata_json, created_at)
      SELECT ?, 'capacity_scenario', ?, 'CAPACITY_PLAN_APPROVED', 'DRAFT', 'APPROVED', ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM capacity_scenarios WHERE id = ? AND created_by = ? AND status = 'APPROVED' AND record_version = ?)
    `).bind(`audit-${scenario.id}-approved-v${nextVersion}`, scenario.id, operator.id, operator.role, JSON.stringify({ forecastRunId: scenario.forecast_run_id, jobsProtected: scenario.jobs_protected, residualGap: scenario.residual_gap, approvalBoundary: "Workforce scheduling handoff only" }), timestamp, scenario.id, operator.id, nextVersion),
  ]);
  if (results[0].meta.changes !== 1) throw new OperationError(409, "Capacity scenario changed since it was loaded", "STALE_CAPACITY_SCENARIO");
  return serializeSnapshot(operator);
}
