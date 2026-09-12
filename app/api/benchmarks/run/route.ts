import { authenticatedOperator, apiError, parseJson } from "@/lib/server/api";
import { runBenchmarkSuite } from "@/lib/server/benchmark-store";
import { OperationError } from "@/lib/server/operations-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const operator = await authenticatedOperator();
    const body = await parseJson(request);
    if (typeof body.idempotencyKey !== "string") throw new OperationError(400, "idempotencyKey is required", "INVALID_REQUEST");
    return Response.json(await runBenchmarkSuite(operator, { idempotencyKey: body.idempotencyKey }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
