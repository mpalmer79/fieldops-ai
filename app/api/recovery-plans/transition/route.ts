import { authenticatedOperator, apiError, parseJson } from "@/lib/server/api";
import { OperationError, transitionPlan } from "@/lib/server/operations-store";

export const dynamic = "force-dynamic";

const actions = new Set(["approve", "reject", "execute", "rollback"]);

export async function POST(request: Request) {
  try {
    const operator = await authenticatedOperator();
    const body = await parseJson(request);
    if (typeof body.planId !== "string" || typeof body.action !== "string" || !actions.has(body.action) || typeof body.expectedVersion !== "number") throw new OperationError(400, "Valid planId, action, and expectedVersion are required", "INVALID_REQUEST");
    const plan = await transitionPlan(operator, { planId: body.planId, action: body.action as "approve" | "reject" | "execute" | "rollback", expectedVersion: body.expectedVersion });
    return Response.json({ plan });
  } catch (error) {
    return apiError(error);
  }
}
