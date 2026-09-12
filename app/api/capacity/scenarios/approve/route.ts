import { authenticatedOperator, apiError, parseJson } from "@/lib/server/api";
import { approveCapacityScenario } from "@/lib/server/capacity-store";
import { OperationError } from "@/lib/server/operations-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const operator = await authenticatedOperator();
    const body = await parseJson(request);
    if (typeof body.scenarioId !== "string" || typeof body.expectedVersion !== "number") throw new OperationError(400, "scenarioId and expectedVersion are required", "INVALID_REQUEST");
    return Response.json(await approveCapacityScenario(operator, { scenarioId: body.scenarioId, expectedVersion: body.expectedVersion }));
  } catch (error) {
    return apiError(error);
  }
}
