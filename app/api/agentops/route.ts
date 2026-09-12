import { authenticatedOperator, apiError } from "@/lib/server/api";
import { getAgentOpsSnapshot } from "@/lib/server/agentops-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const operator = await authenticatedOperator();
    return Response.json(await getAgentOpsSnapshot(operator), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
