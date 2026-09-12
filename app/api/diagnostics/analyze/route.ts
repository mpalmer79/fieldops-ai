import { authenticatedOperator, apiError, parseJson } from "@/lib/server/api";
import { analyzeDiagnosticCase, ensureDiagnosticState } from "@/lib/server/diagnostics-store";
import { OperationError } from "@/lib/server/operations-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const operator = await authenticatedOperator();
    await ensureDiagnosticState(operator);
    const body = await parseJson(request);
    if (typeof body.caseId !== "string" || typeof body.expectedVersion !== "number") throw new OperationError(400, "caseId and expectedVersion are required", "INVALID_REQUEST");
    return Response.json(await analyzeDiagnosticCase(operator, { caseId: body.caseId, expectedVersion: body.expectedVersion }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
