import { authenticatedOperator, apiError } from "@/lib/server/api";
import { getBenchmarkSnapshot } from "@/lib/server/benchmark-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const operator = await authenticatedOperator();
    return Response.json(await getBenchmarkSnapshot(operator), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
