import { describe, expect, it } from "vitest";
import {
  createDisruption,
  db,
  transitionPlan,
  type Operator,
} from "@/lib/server/operations-store";

const hasDatabase = Boolean(process.env.DATABASE_URL);

function uniqueSuffix() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
}

async function seedOperation(): Promise<Operator> {
  const suffix = uniqueSuffix();
  const workspace = `itest-${suffix}`;
  const operator: Operator = {
    id: `operator:${workspace}`,
    email: `${workspace}@fieldops-ai.local`,
    display_name: "Integration Test Admin",
    role: "admin",
    workspace_id: workspace,
  };
  const database = db();
  const timestamp = new Date().toISOString();
  const scoped = (id: string) => `${workspace}:${id}`;
  const technicians = [
    ["T-147", "Darius Miles", "Engine performance", "IN_BAY", '["engine","drivability","electrical"]', '["CKP-39180-2M100","PAD-FRT-G80"]', 8, 6, 42.8, 86],
    ["T-208", "Sofia Chen", "Electrical & ADAS", "ROAD_TEST", '["electrical","adas","maintenance"]', '["CAM-ADAS-GV60"]', 8, 7, 36.2, 91],
    ["T-274", "Jonah Reed", "Drivability", "IN_BAY", '["drivability","engine","maintenance"]', '["CKP-39180-2M100","THERM-G90"]', 7, 5, 31.4, 74],
    ["T-319", "Amara Patel", "Master technician", "IN_BAY", '["engine","drivability","brakes","electrical","adas","maintenance"]', '["CKP-39180-2M100","PAD-FRT-G80","CAM-ADAS-GV60","THERM-G90"]', 9, 7, 39.1, 94],
  ] as const;
  const orders = [
    ["WO-48321", "Check-engine diagnosis", "2023 GV70", "11:00 AM", "drivability", "CKP-39180-2M100"],
    ["WO-48344", "Brake vibration", "2022 G80", "1:00 PM", "brakes", "PAD-FRT-G80"],
    ["WO-48367", "60K maintenance", "2021 GV80", "3:00 PM", "maintenance", null],
    ["WO-48372", "Intermittent no-start", "2023 G70", "3:30 PM", "drivability", "CKP-39180-2M100"],
    ["WO-48389", "Recall campaign", "2024 GV80", "4:00 PM", "engine", null],
    ["WO-48401", "ADAS calibration", "2023 GV60", "2:00 PM", "adas", "CAM-ADAS-GV60"],
    ["WO-48412", "Cooling-system repair", "2022 G90", "4:30 PM", "engine", "THERM-G90"],
  ] as const;

  await database.batch([
    database.prepare("INSERT INTO operators (id, email, display_name, role, created_at, updated_at) VALUES (?, ?, ?, 'admin', ?, ?)").bind(operator.id, operator.email, operator.display_name, timestamp, timestamp),
    database.prepare("INSERT INTO optimization_policies (id, sla_weight, travel_weight, load_weight, overtime_weight, stability_weight, version, updated_by, updated_at) VALUES (?, 35, 25, 20, 15, 5, 1, ?, ?)").bind(scoped("dispatch-default"), operator.id, timestamp),
    ...technicians.map(values => database.prepare("INSERT INTO technicians (id, name, specialty, status, territory, skills_json, parts_json, route_capacity, active_stops, route_miles, utilization, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)").bind(scoped(values[0]), values[1], values[2], values[3], workspace, values[4], values[5], values[6], values[7], values[8], values[9], timestamp)),
    ...orders.map(values => database.prepare("INSERT INTO work_orders (id, appliance, city, appointment_window, required_skill, part_code, status, assigned_technician_id, original_technician_id, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?, 1, ?)").bind(scoped(values[0]), values[1], values[2], values[3], values[4], values[5], scoped("T-274"), scoped("T-274"), timestamp)),
  ]);

  return operator;
}

async function technicianStatus(operator: Operator) {
  return db().prepare("SELECT status FROM technicians WHERE id = ?").bind(`${operator.workspace_id}:T-274`).first<{ status: string }>();
}

async function planStatus(planId: string) {
  return db().prepare("SELECT status, version FROM recovery_plans WHERE id = ?").bind(planId).first<{ status: string; version: number }>();
}

describe.skipIf(!hasDatabase)("recovery lifecycle with PostgreSQL", () => {
  it("restores technician availability when a recovery plan is rejected", async () => {
    const operator = await seedOperation();
    const created = await createDisruption(operator, {
      technicianId: "T-274",
      idempotencyKey: `integration-reject-${uniqueSuffix()}`,
    });

    expect((await technicianStatus(operator))?.status).toBe("UNAVAILABLE");

    const rejected = await transitionPlan(operator, {
      planId: created.plan.id,
      action: "reject",
      expectedVersion: created.plan.version,
    });

    expect(rejected.status).toBe("REJECTED");
    expect((await technicianStatus(operator))?.status).toBe("IN_BAY");

    const next = await createDisruption(operator, {
      technicianId: "T-274",
      idempotencyKey: `integration-after-reject-${uniqueSuffix()}`,
    });
    expect(next.plan.status).toBe("AWAITING_APPROVAL");
  });

  it("executes and rolls back repair-order state atomically", async () => {
    const operator = await seedOperation();
    const created = await createDisruption(operator, {
      technicianId: "T-274",
      idempotencyKey: `integration-execute-${uniqueSuffix()}`,
    });
    const approved = await transitionPlan(operator, {
      planId: created.plan.id,
      action: "approve",
      expectedVersion: created.plan.version,
    });
    const executed = await transitionPlan(operator, {
      planId: approved.id,
      action: "execute",
      expectedVersion: approved.version,
    });

    expect(executed.status).toBe("EXECUTED");
    const changed = await db().prepare("SELECT COUNT(*) AS count FROM work_orders WHERE id LIKE ? AND status IN ('REASSIGNED', 'RESCHEDULE_REQUIRED')").bind(`${operator.workspace_id}:%`).first<{ count: number | string }>();
    expect(Number(changed?.count ?? 0)).toBe(7);

    await expect(createDisruption(operator, {
      technicianId: "T-274",
      idempotencyKey: `integration-overlap-${uniqueSuffix()}`,
    })).rejects.toMatchObject({ code: "ACTIVE_PLAN_EXISTS" });

    const rolledBack = await transitionPlan(operator, {
      planId: executed.id,
      action: "rollback",
      expectedVersion: executed.version,
    });
    expect(rolledBack.status).toBe("ROLLED_BACK");
    expect((await technicianStatus(operator))?.status).toBe("IN_BAY");

    const restored = await db().prepare("SELECT COUNT(*) AS count FROM work_orders WHERE id LIKE ? AND status = 'SCHEDULED' AND assigned_technician_id = original_technician_id").bind(`${operator.workspace_id}:%`).first<{ count: number | string }>();
    expect(Number(restored?.count ?? 0)).toBe(7);

    const audits = await db().prepare("SELECT action FROM audit_log WHERE actor_id = ? AND entity_id = ? ORDER BY created_at").bind(operator.id, executed.id).all<{ action: string }>();
    expect(audits.results.map(row => row.action)).toEqual(expect.arrayContaining(["PLAN_EXECUTED", "PLAN_ROLLED_BACK"]));
  });

  it("rolls back the entire execution transaction when a repair order becomes stale", async () => {
    const operator = await seedOperation();
    const created = await createDisruption(operator, {
      technicianId: "T-274",
      idempotencyKey: `integration-stale-${uniqueSuffix()}`,
    });
    const approved = await transitionPlan(operator, {
      planId: created.plan.id,
      action: "approve",
      expectedVersion: created.plan.version,
    });

    const assignment = await db().prepare("SELECT work_order_id FROM plan_assignments WHERE plan_id = ? ORDER BY work_order_id LIMIT 1").bind(approved.id).first<{ work_order_id: string }>();
    expect(assignment).not.toBeNull();
    await db().prepare("UPDATE work_orders SET status = 'MANUAL_HOLD', version = version + 1 WHERE id = ?").bind(assignment!.work_order_id).run();

    await expect(transitionPlan(operator, {
      planId: approved.id,
      action: "execute",
      expectedVersion: approved.version,
    })).rejects.toMatchObject({ code: "STALE_WORK_ORDER" });

    expect(await planStatus(approved.id)).toMatchObject({ status: "APPROVED", version: approved.version });
    const partiallyApplied = await db().prepare("SELECT COUNT(*) AS count FROM work_orders WHERE id LIKE ? AND status IN ('REASSIGNED', 'RESCHEDULE_REQUIRED')").bind(`${operator.workspace_id}:%`).first<{ count: number | string }>();
    expect(Number(partiallyApplied?.count ?? 0)).toBe(0);
  });
});
