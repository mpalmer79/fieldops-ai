import { authenticatedOperator, apiError, parseJson } from "@/lib/server/api";
import { createDisruption, OperationError } from "@/lib/server/operations-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const operator = await authenticatedOperator();
    const body = await parseJson(request);
    if (typeof body.technicianId !== "string" || typeof body.idempotencyKey !== "string") throw new OperationError(400, "technicianId and idempotencyKey are required", "INVALID_REQUEST");
    const result = await createDisruption(operator, { technicianId: body.technicianId, idempotencyKey: body.idempotencyKey });
    return Response.json(result, { status: result.idempotentReplay ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
