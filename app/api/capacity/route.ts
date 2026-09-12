import { authenticatedOperator, apiError } from "@/lib/server/api";
import { getCapacityPlanningSnapshot } from "@/lib/server/capacity-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const operator = await authenticatedOperator();
    return Response.json(await getCapacityPlanningSnapshot(operator), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
