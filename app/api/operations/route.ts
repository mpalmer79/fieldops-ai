import { authenticatedOperator, apiError } from "@/lib/server/api";
import { getOperationSnapshot } from "@/lib/server/operations-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const operator = await authenticatedOperator();
    return Response.json(await getOperationSnapshot(operator), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
