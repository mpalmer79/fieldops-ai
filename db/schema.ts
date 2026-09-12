import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const operators = sqliteTable("operators", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["dispatcher", "supervisor", "admin"] }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("idx_operators_email").on(table.email)]);

export const technicians = sqliteTable("technicians", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  specialty: text("specialty").notNull(),
  status: text("status").notNull(),
  territory: text("territory").notNull(),
  skillsJson: text("skills_json").notNull(),
  partsJson: text("parts_json").notNull(),
  routeCapacity: integer("route_capacity").notNull(),
  activeStops: integer("active_stops").notNull(),
  routeMiles: real("route_miles").notNull(),
  utilization: integer("utilization").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
}, table => [index("idx_technicians_status_territory").on(table.status, table.territory)]);

export const workOrders = sqliteTable("work_orders", {
  id: text("id").primaryKey(),
  appliance: text("appliance").notNull(),
  city: text("city").notNull(),
  appointmentWindow: text("appointment_window").notNull(),
  requiredSkill: text("required_skill").notNull(),
  partCode: text("part_code"),
  status: text("status").notNull(),
  assignedTechnicianId: text("assigned_technician_id"),
  originalTechnicianId: text("original_technician_id").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
}, table => [index("idx_work_orders_status").on(table.status), index("idx_work_orders_technician_status").on(table.assignedTechnicianId, table.status)]);

export const optimizationPolicies = sqliteTable("optimization_policies", {
  id: text("id").primaryKey(),
  slaWeight: integer("sla_weight").notNull(),
  travelWeight: integer("travel_weight").notNull(),
  loadWeight: integer("load_weight").notNull(),
  overtimeWeight: integer("overtime_weight").notNull(),
  stabilityWeight: integer("stability_weight").notNull(),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const disruptions = sqliteTable("disruptions", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  technicianId: text("technician_id").notNull(),
  status: text("status").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("idx_disruptions_idempotency_key").on(table.idempotencyKey), index("idx_disruptions_technician_status").on(table.technicianId, table.status)]);

export const recoveryPlans = sqliteTable("recovery_plans", {
  id: text("id").primaryKey(),
  disruptionId: text("disruption_id").notNull(),
  status: text("status").notNull(),
  score: real("score").notNull(),
  confidence: integer("confidence").notNull(),
  projectedSla: real("projected_sla").notNull(),
  addedTravel: real("added_travel").notNull(),
  overtime: real("overtime").notNull(),
  policyVersion: integer("policy_version").notNull(),
  optimizerVersion: text("optimizer_version").notNull(),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("idx_recovery_plans_disruption").on(table.disruptionId), index("idx_recovery_plans_status_updated").on(table.status, table.updatedAt)]);

export const planAssignments = sqliteTable("plan_assignments", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull(),
  workOrderId: text("work_order_id").notNull(),
  fromTechnicianId: text("from_technician_id").notNull(),
  toTechnicianId: text("to_technician_id"),
  impactMinutes: integer("impact_minutes").notNull(),
  travelMiles: real("travel_miles").notNull(),
  overtimeHours: real("overtime_hours").notNull(),
  outcome: text("outcome").notNull(),
}, table => [index("idx_plan_assignments_plan").on(table.planId), uniqueIndex("idx_plan_assignments_plan_order").on(table.planId, table.workOrderId)]);

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  actorId: text("actor_id").notNull(),
  actorRole: text("actor_role").notNull(),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [index("idx_audit_entity_created").on(table.entityType, table.entityId, table.createdAt)]);
