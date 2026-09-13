import { db } from "@/lib/server/database";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await db().prepare("SELECT 1 AS ok").first<{ ok: number }>();
    if (Number(result?.ok) !== 1) throw new Error("Database health check failed");
    return Response.json({ status: "ok", database: "postgresql" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
