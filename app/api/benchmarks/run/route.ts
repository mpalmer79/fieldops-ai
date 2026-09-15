import { authenticatedOperator, apiError, parseJson } from "@/lib/server/api";
import { runBenchmarkSuite } from "@/lib/server/benchmark-store";
import { db, OperationError } from "@/lib/server/operations-store";

export const dynamic = "force-dynamic";

const DEMO_BENCHMARK_WINDOW_MS = 10 * 60 * 1_000;
const DEMO_BENCHMARK_GLOBAL_LIMIT = 12;
const DEMO_BENCHMARK_OPERATOR_LIMIT = 2;

async function assertDemoBenchmarkBudget(operator: Awaited<ReturnType<typeof authenticatedOperator>>, idempotencyKey: string) {
  if (!operator.workspace_id.startsWith("demo-")) return;

  const database = db();
  const scopedKey = `${operator.id}:${idempotencyKey}`;
  const replay = await database.prepare("SELECT id FROM benchmark_runs WHERE idempotency_key = ? AND created_by = ?").bind(scopedKey, operator.id).first<{ id: string }>();
  if (replay) return;

  const cutoff = new Date(Date.now() - DEMO_BENCHMARK_WINDOW_MS).toISOString();
  const [globalRow, operatorRow] = await Promise.all([
    database.prepare("SELECT COUNT(*) AS count FROM benchmark_runs WHERE created_at >= ?").bind(cutoff).first<{ count: number | string }>(),
    database.prepare("SELECT COUNT(*) AS count FROM benchmark_runs WHERE created_by = ? AND created_at >= ?").bind(operator.id, cutoff).first<{ count: number | string }>(),
  ]);

  if (Number(operatorRow?.count ?? 0) >= DEMO_BENCHMARK_OPERATOR_LIMIT) {
    throw new OperationError(429, "This demo workspace has reached its benchmark run limit. Try again later.", "BENCHMARK_RATE_LIMITED");
  }
  if (Number(globalRow?.count ?? 0) >= DEMO_BENCHMARK_GLOBAL_LIMIT) {
    throw new OperationError(429, "The public benchmark runner is temporarily at capacity. Try again later.", "BENCHMARK_CAPACITY_LIMIT");
  }
}

export async function POST(request: Request) {
  try {
    const operator = await authenticatedOperator();
    const body = await parseJson(request);
    if (typeof body.idempotencyKey !== "string") throw new OperationError(400, "idempotencyKey is required", "INVALID_REQUEST");
    if (body.idempotencyKey.length < 12 || body.idempotencyKey.length > 100) throw new OperationError(400, "Invalid idempotency key", "INVALID_IDEMPOTENCY_KEY");
    await assertDemoBenchmarkBudget(operator, body.idempotencyKey);
    return Response.json(await runBenchmarkSuite(operator, { idempotencyKey: body.idempotencyKey }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
