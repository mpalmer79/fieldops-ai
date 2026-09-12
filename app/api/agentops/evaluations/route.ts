import { authenticatedOperator, apiError, parseJson } from "@/lib/server/api";
import { ensureAgentOpsState, runAgentEvaluation } from "@/lib/server/agentops-store";
import { OperationError } from "@/lib/server/operations-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const operator = await authenticatedOperator();
    await ensureAgentOpsState(operator);
    const body = await parseJson(request);
    if (typeof body.versionId !== "string") throw new OperationError(400, "versionId is required", "INVALID_REQUEST");
    return Response.json({ evaluation: await runAgentEvaluation(operator, body.versionId) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
