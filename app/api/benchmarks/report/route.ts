import { authenticatedOperator, apiError } from "@/lib/server/api";
import { getBenchmarkCsv } from "@/lib/server/benchmark-store";
import { OperationError } from "@/lib/server/operations-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const operator = await authenticatedOperator();
    const url = new URL(request.url);
    const runId = url.searchParams.get("runId");
    const format = url.searchParams.get("format") ?? "csv";
    if (!runId) throw new OperationError(400, "runId is required", "INVALID_REQUEST");
    if (format !== "csv") throw new OperationError(400, "Only CSV reports are supported", "INVALID_FORMAT");
    const report = await getBenchmarkCsv(operator, runId);
    return new Response(report, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="fieldops-benchmark-${runId.slice(-8)}.csv"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
