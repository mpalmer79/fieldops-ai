import { authenticatedOperator, apiError } from "@/lib/server/api";
import { getDiagnosticSnapshot } from "@/lib/server/diagnostics-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const operator = await authenticatedOperator();
    return Response.json(await getDiagnosticSnapshot(operator), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
