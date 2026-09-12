import { authenticatedOperator, apiError, parseJson } from "@/lib/server/api";
import { createCapacityScenario } from "@/lib/server/capacity-store";
import { OperationError } from "@/lib/server/operations-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const operator = await authenticatedOperator();
    const body = await parseJson(request);
    if (typeof body.forecastRunId !== "string" || typeof body.name !== "string" || typeof body.demandChangePct !== "number" || typeof body.availabilityChangePct !== "number" || typeof body.overtimeHours !== "number" || typeof body.crossTrainedTechs !== "number") {
      throw new OperationError(400, "Complete capacity scenario inputs are required", "INVALID_REQUEST");
    }
    return Response.json(await createCapacityScenario(operator, {
      forecastRunId: body.forecastRunId,
      name: body.name,
      demandChangePct: body.demandChangePct,
      availabilityChangePct: body.availabilityChangePct,
      overtimeHours: body.overtimeHours,
      crossTrainedTechs: body.crossTrainedTechs,
    }));
  } catch (error) {
    return apiError(error);
  }
}
