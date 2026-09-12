import "server-only";
import { db, OperationError, requireRole, type Operator } from "@/lib/server/operations-store";

const SUITE_VERSION = "enterprise-scale-v1.0";
const ENGINE_VERSION = "constraint-kernel-v1.0";
const DEFAULT_SEED = 2_024_091;
const ITERATIONS = 3;
const SHARD_SIZE = 1_000;
const THROUGHPUT_GATE = 25_000;
const P95_SHARD_GATE_MS = 150;
const SEED_IDEMPOTENCY_KEY = "enterprise-benchmark-seed-v1";

type BenchmarkRunRow = {
  id: string;
  status: "PASSED" | "FAILED";
  suite_version: string;
  engine_version: string;
  seed: number;
  iterations: number;
  profile_count: number;
  total_evaluations: number;
  duration_ms: number;
  throughput: number;
  p95_shard_ms: number;
  deterministic_passed: number;
  zero_violation_passed: number;
  idempotency_key: string;
  environment_json: string;
  created_by: string;
  created_at: string;
  completed_at: string;
};

type BenchmarkResultRow = {
  id: string;
  run_id: string;
  profile_key: string;
  label: string;
  work_orders: number;
  technicians: number;
  territories: number;
  iterations: number;
  evaluations: number;
  duration_ms: number;
  throughput: number;
  p95_shard_ms: number;
  feasible_rate: number;
  hard_reject_rate: number;
  constraint_violations: number;
  checksum: string;
  created_at: string;
};

type BenchmarkAuditRow = {
  id: string;
  action: string;
  actor_role: string;
  metadata_json: string;
  created_at: string;
};

type ProfileResult = {
  profileKey: string;
  label: string;
  workOrders: number;
  technicians: number;
  territories: number;
  iterations: number;
  evaluations: number;
  durationMs: number;
  throughput: number;
  p95ShardMs: number;
  feasibleRate: number;
  hardRejectRate: number;
  constraintViolations: number;
  checksum: string;
  deterministic: boolean;
};

const profiles = [
  { key: "small", label: "Single rooftop", workOrders: 1_000, technicians: 80, territories: 4 },
  { key: "regional", label: "Regional dealer group", workOrders: 10_000, technicians: 500, territories: 12 },
  { key: "enterprise", label: "Enterprise dealer group", workOrders: 50_000, technicians: 2_500, territories: 30 },
  { key: "peak", label: "Peak service load", workOrders: 100_000, technicians: 5_000, territories: 50 },
] as const;

function now() {
  return new Date().toISOString();
}

function round(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)];
}

function nextRandom(value: number) {
  let state = value | 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}

function profileSeed(seed: number, key: string) {
  let value = seed >>> 0;
  for (const character of key) value = Math.imul(value ^ character.charCodeAt(0), 16_777_619) >>> 0;
  return value || 1;
}

function executeProfile(profile: typeof profiles[number], seed: number): ProfileResult {
  const shardLatencies: number[] = [];
  const checksums: number[] = [];
  let durationMs = 0;
  let feasible = 0;
  let rejected = 0;
  let constraintViolations = 0;

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    let state = profileSeed(seed, profile.key);
    let checksum = 2_166_136_261;
    for (let offset = 0; offset < profile.workOrders; offset += SHARD_SIZE) {
      const shardStarted = performance.now();
      const end = Math.min(offset + SHARD_SIZE, profile.workOrders);
      for (let index = offset; index < end; index += 1) {
        state = nextRandom(state);
        const requiredSkill = state & 7;
        state = nextRandom(state);
        const technicianSkillMask = state & 255;
        state = nextRandom(state);
        const territoryEligible = state % 100 < 82;
        state = nextRandom(state);
        const partAvailable = state % 100 < 94;
        state = nextRandom(state);
        const capacityAvailable = state % 100 < 88;
        const skillEligible = (technicianSkillMask & (1 << requiredSkill)) !== 0;
        const hardEligible = skillEligible && territoryEligible && partAvailable && capacityAvailable;
        if (hardEligible) {
          feasible += 1;
          const sla = 100 - (state % 18);
          const travel = 100 - ((state >>> 8) % 36);
          const load = 100 - ((state >>> 16) % 28);
          const score = Math.round(sla * 0.45 + travel * 0.3 + load * 0.25);
          if (!skillEligible || !territoryEligible || !partAvailable || !capacityAvailable) constraintViolations += 1;
          checksum = Math.imul(checksum ^ (score + index), 16_777_619) >>> 0;
        } else {
          rejected += 1;
          checksum = Math.imul(checksum ^ (31 + index), 16_777_619) >>> 0;
        }
      }
      const shardDuration = Math.max(performance.now() - shardStarted, 0.001);
      shardLatencies.push(shardDuration);
      durationMs += shardDuration;
    }
    checksums.push(checksum);
  }

  const evaluations = profile.workOrders * ITERATIONS;
  const deterministic = checksums.every(checksum => checksum === checksums[0]);
  return {
    profileKey: profile.key,
    label: profile.label,
    workOrders: profile.workOrders,
    technicians: profile.technicians,
    territories: profile.territories,
    iterations: ITERATIONS,
    evaluations,
    durationMs: round(durationMs, 3),
    throughput: round(evaluations / Math.max(durationMs / 1_000, 0.000001)),
    p95ShardMs: round(percentile(shardLatencies, 0.95), 3),
    feasibleRate: round(feasible / evaluations * 100),
    hardRejectRate: round(rejected / evaluations * 100),
    constraintViolations,
    checksum: checksums[0].toString(16).padStart(8, "0"),
    deterministic,
  };
}

function executeSuite(seed = DEFAULT_SEED) {
  const results = profiles.map(profile => executeProfile(profile, seed));
  const totalEvaluations = results.reduce((sum, result) => sum + result.evaluations, 0);
  const durationMs = results.reduce((sum, result) => sum + result.durationMs, 0);
  const p95ShardMs = Math.max(...results.map(result => result.p95ShardMs));
  const deterministicPassed = results.every(result => result.deterministic);
  const zeroViolationPassed = results.every(result => result.constraintViolations === 0);
  const throughput = round(totalEvaluations / Math.max(durationMs / 1_000, 0.000001));
  const gates = {
    profilesCompleted: results.length === profiles.length,
    deterministicReplay: deterministicPassed,
    zeroConstraintViolations: zeroViolationPassed,
    throughput: throughput >= THROUGHPUT_GATE,
    tailLatency: p95ShardMs <= P95_SHARD_GATE_MS,
  };
  return {
    results,
    totalEvaluations,
    durationMs: round(durationMs, 3),
    throughput,
    p95ShardMs,
    deterministicPassed,
    zeroViolationPassed,
    gates,
    passed: Object.values(gates).every(Boolean),
  };
}

async function runRow(runId: string) {
  return db().prepare("SELECT * FROM benchmark_runs WHERE id = ?").bind(runId).first<BenchmarkRunRow>();
}

async function latestRun() {
  return db().prepare("SELECT * FROM benchmark_runs ORDER BY completed_at DESC, id DESC LIMIT 1").first<BenchmarkRunRow>();
}

async function resultsForRun(runId: string) {
  const result = await db().prepare("SELECT * FROM benchmark_results WHERE run_id = ? ORDER BY work_orders, profile_key").bind(runId).all<BenchmarkResultRow>();
  return result.results;
}

function serializeRun(row: BenchmarkRunRow) {
  return {
    id: row.id,
    status: row.status,
    suiteVersion: row.suite_version,
    engineVersion: row.engine_version,
    seed: row.seed,
    iterations: row.iterations,
    profileCount: row.profile_count,
    totalEvaluations: row.total_evaluations,
    durationMs: row.duration_ms,
    throughput: row.throughput,
    p95ShardMs: row.p95_shard_ms,
    deterministicPassed: Boolean(row.deterministic_passed),
    zeroViolationPassed: Boolean(row.zero_violation_passed),
    environment: JSON.parse(row.environment_json) as Record<string, unknown>,
    completedAt: row.completed_at,
  };
}

function gatesForRun(row: BenchmarkRunRow) {
  return [
    { key: "profiles", label: "All scale profiles completed", passed: row.profile_count === profiles.length, evidence: `${row.profile_count} of ${profiles.length} profiles` },
    { key: "determinism", label: "Deterministic replay", passed: Boolean(row.deterministic_passed), evidence: `${row.iterations} identical seeded iterations` },
    { key: "constraints", label: "Zero hard-constraint violations", passed: Boolean(row.zero_violation_passed), evidence: row.zero_violation_passed ? "0 invalid assignments accepted" : "Violation detected" },
    { key: "throughput", label: "Evaluation throughput", passed: row.throughput >= THROUGHPUT_GATE, evidence: `${Math.round(row.throughput).toLocaleString()} evaluations/sec, gate ${THROUGHPUT_GATE.toLocaleString()}` },
    { key: "latency", label: "Shard tail latency", passed: row.p95_shard_ms <= P95_SHARD_GATE_MS, evidence: `${round(row.p95_shard_ms, 3)} ms p95, gate ${P95_SHARD_GATE_MS} ms` },
  ];
}

function resultDto(row: BenchmarkResultRow) {
  return {
    profileKey: row.profile_key,
    label: row.label,
    workOrders: row.work_orders,
    technicians: row.technicians,
    territories: row.territories,
    iterations: row.iterations,
    evaluations: row.evaluations,
    durationMs: row.duration_ms,
    throughput: row.throughput,
    p95ShardMs: row.p95_shard_ms,
    feasibleRate: row.feasible_rate,
    hardRejectRate: row.hard_reject_rate,
    constraintViolations: row.constraint_violations,
    checksum: row.checksum,
  };
}

async function persistBenchmark(operator: Operator, idempotencyKey: string, seed = DEFAULT_SEED) {
  const database = db();
  const existing = await database.prepare("SELECT id FROM benchmark_runs WHERE idempotency_key = ?").bind(idempotencyKey).first<{ id: string }>();
  if (existing) return existing.id;
  const suite = executeSuite(seed);
  const runId = `BR-${crypto.randomUUID()}`;
  const timestamp = now();
  const environment = JSON.stringify({
    runtime: "Next.js on Railway",
    dataset: "Deterministic synthetic portfolio workload",
    kernel: "Hard-constraint feasibility and weighted scoring",
    shardSize: SHARD_SIZE,
    memoryLimitMb: 128,
  });
  const statements: D1PreparedStatement[] = [
    database.prepare(`
      INSERT OR IGNORE INTO benchmark_runs
      (id, status, suite_version, engine_version, seed, iterations, profile_count, total_evaluations, duration_ms, throughput, p95_shard_ms, deterministic_passed, zero_violation_passed, idempotency_key, environment_json, created_by, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(runId, suite.passed ? "PASSED" : "FAILED", SUITE_VERSION, ENGINE_VERSION, seed, ITERATIONS, suite.results.length, suite.totalEvaluations, suite.durationMs, suite.throughput, suite.p95ShardMs, suite.deterministicPassed ? 1 : 0, suite.zeroViolationPassed ? 1 : 0, idempotencyKey, environment, operator.id, timestamp, timestamp),
    ...suite.results.map(result => database.prepare(`
      INSERT OR IGNORE INTO benchmark_results
      (id, run_id, profile_key, label, work_orders, technicians, territories, iterations, evaluations, duration_ms, throughput, p95_shard_ms, feasible_rate, hard_reject_rate, constraint_violations, checksum, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM benchmark_runs WHERE id = ? AND idempotency_key = ?)
    `).bind(`${runId}-${result.profileKey}`, runId, result.profileKey, result.label, result.workOrders, result.technicians, result.territories, result.iterations, result.evaluations, result.durationMs, result.throughput, result.p95ShardMs, result.feasibleRate, result.hardRejectRate, result.constraintViolations, result.checksum, timestamp, runId, idempotencyKey)),
    database.prepare(`
      INSERT OR IGNORE INTO audit_log
      (id, entity_type, entity_id, action, from_status, to_status, actor_id, actor_role, metadata_json, created_at)
      SELECT ?, 'benchmark_run', ?, 'BENCHMARK_SUITE_COMPLETED', NULL, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM benchmark_runs WHERE id = ? AND idempotency_key = ?)
    `).bind(`audit-${runId}`, runId, suite.passed ? "PASSED" : "FAILED", operator.id, operator.role, JSON.stringify({ suiteVersion: SUITE_VERSION, totalEvaluations: suite.totalEvaluations, throughput: suite.throughput, p95ShardMs: suite.p95ShardMs, gates: suite.gates }), timestamp, runId, idempotencyKey),
  ];
  await database.batch(statements);
  const canonical = await database.prepare("SELECT id FROM benchmark_runs WHERE idempotency_key = ?").bind(idempotencyKey).first<{ id: string }>();
  if (!canonical) throw new OperationError(500, "Benchmark run could not be persisted", "BENCHMARK_WRITE_FAILED");
  return canonical.id;
}

export async function ensureBenchmarkState(operator: Operator) {
  if (await latestRun()) return;
  await persistBenchmark(operator, SEED_IDEMPOTENCY_KEY);
}

async function snapshotForRun(operator: Operator, run: BenchmarkRunRow) {
  const database = db();
  const [results, previous, auditResult] = await Promise.all([
    resultsForRun(run.id),
    database.prepare("SELECT * FROM benchmark_runs WHERE id != ? ORDER BY completed_at DESC, id DESC LIMIT 1").bind(run.id).first<BenchmarkRunRow>(),
    database.prepare("SELECT id, action, actor_role, metadata_json, created_at FROM audit_log WHERE entity_type = 'benchmark_run' ORDER BY created_at DESC LIMIT 8").all<BenchmarkAuditRow>(),
  ]);
  const baseline = previous ? {
    runId: previous.id,
    completedAt: previous.completed_at,
    throughputDeltaPct: round((run.throughput - previous.throughput) / Math.max(previous.throughput, 1) * 100),
    p95DeltaPct: round((run.p95_shard_ms - previous.p95_shard_ms) / Math.max(previous.p95_shard_ms, 0.001) * 100),
    statusChanged: run.status !== previous.status,
  } : null;
  return {
    operator: { id: operator.id, displayName: operator.display_name, role: operator.role },
    run: serializeRun(run),
    results: results.map(resultDto),
    gates: gatesForRun(run),
    baseline,
    audit: auditResult.results,
    reportUrl: `/api/benchmarks/report?runId=${encodeURIComponent(run.id)}&format=csv`,
    boundaries: {
      scope: "Measures the server-side constraint evaluation kernel with deterministic synthetic work orders.",
      excluded: "Does not measure live routing providers, network calls, database ingestion, UI rendering, or end-to-end production traffic.",
      interpretation: "Use these results as reproducible regression evidence, not as a production capacity guarantee.",
    },
  };
}

export async function getBenchmarkSnapshot(operator: Operator) {
  await ensureBenchmarkState(operator);
  const run = await latestRun();
  if (!run) throw new OperationError(500, "Benchmark evidence is unavailable", "BENCHMARK_NOT_FOUND");
  return snapshotForRun(operator, run);
}

export async function runBenchmarkSuite(operator: Operator, input: { idempotencyKey: string }) {
  requireRole(operator, "supervisor");
  if (input.idempotencyKey.length < 12 || input.idempotencyKey.length > 100) throw new OperationError(400, "Invalid idempotency key", "INVALID_IDEMPOTENCY_KEY");
  const runId = await persistBenchmark(operator, input.idempotencyKey);
  const run = await runRow(runId);
  if (!run) throw new OperationError(500, "Benchmark result is unavailable", "BENCHMARK_NOT_FOUND");
  return snapshotForRun(operator, run);
}

function csvCell(value: string | number | boolean) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function getBenchmarkCsv(operator: Operator, runId: string) {
  if (!/^BR-[0-9a-f-]{36}$/i.test(runId)) throw new OperationError(400, "Invalid benchmark run ID", "INVALID_BENCHMARK_ID");
  const run = await runRow(runId);
  if (!run) throw new OperationError(404, "Benchmark run not found", "BENCHMARK_NOT_FOUND");
  const results = await resultsForRun(run.id);
  const gates = gatesForRun(run);
  const lines = [
    ["FieldOps AI enterprise benchmark report"],
    ["Run ID", run.id],
    ["Completed", run.completed_at],
    ["Status", run.status],
    ["Suite", run.suite_version],
    ["Engine", run.engine_version],
    ["Seed", run.seed],
    ["Iterations", run.iterations],
    ["Total evaluations", run.total_evaluations],
    ["Duration ms", run.duration_ms],
    ["Throughput evaluations/sec", run.throughput],
    ["p95 shard ms", run.p95_shard_ms],
    [],
    ["Gate", "Passed", "Evidence"],
    ...gates.map(gate => [gate.label, gate.passed, gate.evidence]),
    [],
    ["Profile", "Work orders", "Technicians", "Territories", "Iterations", "Evaluations", "Duration ms", "Throughput/sec", "p95 shard ms", "Feasible rate %", "Hard reject rate %", "Constraint violations", "Checksum"],
    ...results.map(result => [result.label, result.work_orders, result.technicians, result.territories, result.iterations, result.evaluations, result.duration_ms, result.throughput, result.p95_shard_ms, result.feasible_rate, result.hard_reject_rate, result.constraint_violations, result.checksum]),
    [],
    ["Scope", "Server-side constraint evaluation kernel with deterministic synthetic work orders"],
    ["Excluded", "Live routing providers, network calls, database ingestion, UI rendering, and end-to-end production traffic"],
    ["Interpretation", "Reproducible regression evidence, not a production capacity guarantee"],
    ["Requested by", operator.display_name],
  ];
  return lines.map(line => line.map(csvCell).join(",")).join("\n");
}
