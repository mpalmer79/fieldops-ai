import { authenticatedOperator, apiError } from "@/lib/server/api";
import { getBenchmarkSnapshot } from "@/lib/server/benchmark-store";
import { db } from "@/lib/server/operations-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const operator = await authenticatedOperator();
    const existing = await db().prepare("SELECT id FROM benchmark_runs WHERE created_by = ? ORDER BY completed_at DESC, id DESC LIMIT 1").bind(operator.id).first<{ id: string }>();
    if (!existing) {
      return Response.json({
        ready: false,
        operator: { id: operator.id, displayName: operator.display_name, role: operator.role },
        message: "No stress suite has been run in this isolated workspace. Run it explicitly to create benchmark evidence.",
      }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json(await getBenchmarkSnapshot(operator), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
