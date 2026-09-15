import { authenticatedOperator, apiError } from "@/lib/server/api";
import { getBenchmarkSnapshot } from "@/lib/server/benchmark-store";
import { db } from "@/lib/server/operations-store";

export const dynamic = "force-dynamic";

async function reuseLatestReferenceBenchmark(operator: Awaited<ReturnType<typeof authenticatedOperator>>) {
  const database = db();
  const existing = await database.prepare("SELECT id FROM benchmark_runs WHERE created_by = ? ORDER BY completed_at DESC, id DESC LIMIT 1").bind(operator.id).first<{ id: string }>();
  if (existing) return;

  const reference = await database.prepare("SELECT id FROM benchmark_runs WHERE status = 'PASSED' ORDER BY completed_at DESC, id DESC LIMIT 1").first<{ id: string }>();
  if (!reference) return;

  const runId = `BR-${crypto.randomUUID()}`;
  const idempotencyKey = `${operator.id}:shared-reference-v1`;
  const timestamp = new Date().toISOString();
  await database.batch([
    database.prepare(`
      INSERT OR IGNORE INTO benchmark_runs
      (id, status, suite_version, engine_version, seed, iterations, profile_count, total_evaluations, duration_ms, throughput, p95_shard_ms, deterministic_passed, zero_violation_passed, idempotency_key, environment_json, created_by, created_at, completed_at)
      SELECT ?, status, suite_version, engine_version, seed, iterations, profile_count, total_evaluations, duration_ms, throughput, p95_shard_ms, deterministic_passed, zero_violation_passed, ?,
        (environment_json::jsonb || jsonb_build_object('referenceRunId', id, 'referenceReused', true))::text,
        ?, created_at, completed_at
      FROM benchmark_runs WHERE id = ?
    `).bind(runId, idempotencyKey, operator.id, reference.id),
    database.prepare(`
      INSERT OR IGNORE INTO benchmark_results
      (id, run_id, profile_key, label, work_orders, technicians, territories, iterations, evaluations, duration_ms, throughput, p95_shard_ms, feasible_rate, hard_reject_rate, constraint_violations, checksum, created_at)
      SELECT ? || '-' || profile_key, ?, profile_key, label, work_orders, technicians, territories, iterations, evaluations, duration_ms, throughput, p95_shard_ms, feasible_rate, hard_reject_rate, constraint_violations, checksum, created_at
      FROM benchmark_results WHERE run_id = ?
    `).bind(runId, runId, reference.id),
    database.prepare(`
      INSERT OR IGNORE INTO audit_log
      (id, entity_type, entity_id, action, from_status, to_status, actor_id, actor_role, metadata_json, created_at)
      VALUES (?, 'benchmark_run', ?, 'BENCHMARK_REFERENCE_REUSED', NULL, 'PASSED', ?, ?, ?, ?)
    `).bind(`audit-${runId}-reference`, runId, operator.id, operator.role, JSON.stringify({ referenceRunId: reference.id }), timestamp),
  ]);
}

export async function GET() {
  try {
    const operator = await authenticatedOperator();
    await reuseLatestReferenceBenchmark(operator);
    return Response.json(await getBenchmarkSnapshot(operator), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
