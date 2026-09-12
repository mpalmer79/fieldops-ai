import { authenticatedOperator, apiError, parseJson } from "@/lib/server/api";
import { OperationError, updatePolicy } from "@/lib/server/operations-store";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  try {
    const operator = await authenticatedOperator();
    const body = await parseJson(request);
    const fields = ["sla", "travel", "load", "overtime", "stability", "expectedVersion"] as const;
    if (fields.some(field => typeof body[field] !== "number")) throw new OperationError(400, "All policy weights and expectedVersion are required", "INVALID_REQUEST");
    const policy = await updatePolicy(operator, {
      sla: body.sla as number,
      travel: body.travel as number,
      load: body.load as number,
      overtime: body.overtime as number,
      stability: body.stability as number,
      expectedVersion: body.expectedVersion as number,
    });
    return Response.json({ policy });
  } catch (error) {
    return apiError(error);
  }
}
