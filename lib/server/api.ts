import "server-only";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureOperationalState, OperationError } from "@/lib/server/operations-store";

export async function authenticatedOperator() {
  const user = await getChatGPTUser();
  if (!user) throw new OperationError(401, "Authentication required", "UNAUTHENTICATED");
  return ensureOperationalState(user);
}

export function apiError(error: unknown) {
  if (error instanceof OperationError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
  console.error("Unhandled operational API error", error);
  return Response.json({ error: "Operational service unavailable", code: "INTERNAL_ERROR" }, { status: 500 });
}

export async function parseJson(request: Request) {
  try {
    return await request.json() as Record<string, unknown>;
  } catch {
    throw new OperationError(400, "Request body must be valid JSON", "INVALID_JSON");
  }
}
