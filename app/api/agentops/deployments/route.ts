import { authenticatedOperator, apiError, parseJson } from "@/lib/server/api";
import { ensureAgentOpsState, promoteAgentVersion, rollbackAgentDeployment } from "@/lib/server/agentops-store";
import { OperationError } from "@/lib/server/operations-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const operator = await authenticatedOperator();
    await ensureAgentOpsState(operator);
    const body = await parseJson(request);
    if (body.action === "promote") {
      if (typeof body.versionId !== "string" || (body.target !== "SHADOW" && body.target !== "PRODUCTION") || typeof body.expectedVersion !== "number") throw new OperationError(400, "versionId, target, and expectedVersion are required", "INVALID_REQUEST");
      return Response.json({ deployment: await promoteAgentVersion(operator, { versionId: body.versionId, target: body.target, expectedVersion: body.expectedVersion }) }, { status: 201 });
    }
    if (body.action === "rollback") {
      if (typeof body.agentId !== "string" || typeof body.expectedVersion !== "number") throw new OperationError(400, "agentId and expectedVersion are required", "INVALID_REQUEST");
      return Response.json({ rollback: await rollbackAgentDeployment(operator, { agentId: body.agentId, expectedVersion: body.expectedVersion }) });
    }
    throw new OperationError(400, "action must be promote or rollback", "INVALID_REQUEST");
  } catch (error) {
    return apiError(error);
  }
}
