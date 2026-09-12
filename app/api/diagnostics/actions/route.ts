import { authenticatedOperator, apiError, parseJson } from "@/lib/server/api";
import { acceptDiagnosticRecommendation, ensureDiagnosticState, escalateDiagnosticCase, resolveDiagnosticCase } from "@/lib/server/diagnostics-store";
import { OperationError } from "@/lib/server/operations-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const operator = await authenticatedOperator();
    await ensureDiagnosticState(operator);
    const body = await parseJson(request);
    if (typeof body.caseId !== "string" || typeof body.expectedVersion !== "number" || typeof body.action !== "string") throw new OperationError(400, "action, caseId, and expectedVersion are required", "INVALID_REQUEST");
    if (body.action === "accept") {
      if (typeof body.recommendationId !== "string" || typeof body.safetyAcknowledged !== "boolean") throw new OperationError(400, "recommendationId and safetyAcknowledged are required", "INVALID_REQUEST");
      return Response.json(await acceptDiagnosticRecommendation(operator, { caseId: body.caseId, expectedVersion: body.expectedVersion, recommendationId: body.recommendationId, safetyAcknowledged: body.safetyAcknowledged }));
    }
    if (body.action === "escalate") {
      if (typeof body.reason !== "string") throw new OperationError(400, "Escalation reason is required", "INVALID_REQUEST");
      return Response.json(await escalateDiagnosticCase(operator, { caseId: body.caseId, expectedVersion: body.expectedVersion, reason: body.reason }));
    }
    if (body.action === "resolve") {
      if (typeof body.firstTimeFix !== "boolean" || typeof body.durationMinutes !== "number" || typeof body.notes !== "string") throw new OperationError(400, "Resolution outcome fields are required", "INVALID_REQUEST");
      return Response.json(await resolveDiagnosticCase(operator, { caseId: body.caseId, expectedVersion: body.expectedVersion, firstTimeFix: body.firstTimeFix, durationMinutes: body.durationMinutes, notes: body.notes }));
    }
    throw new OperationError(400, "action must be accept, escalate, or resolve", "INVALID_REQUEST");
  } catch (error) {
    return apiError(error);
  }
}
