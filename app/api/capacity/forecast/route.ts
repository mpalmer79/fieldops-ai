import { authenticatedOperator, apiError, parseJson } from "@/lib/server/api";
import { createForecastRun } from "@/lib/server/capacity-store";
import { OperationError } from "@/lib/server/operations-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const operator = await authenticatedOperator();
    const body = await parseJson(request);
    if (typeof body.idempotencyKey !== "string") throw new OperationError(400, "idempotencyKey is required", "INVALID_REQUEST");
    return Response.json(await createForecastRun(operator, { idempotencyKey: body.idempotencyKey }));
  } catch (error) {
    return apiError(error);
  }
}
