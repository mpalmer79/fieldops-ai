CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`actor_id` text NOT NULL,
	`actor_role` text NOT NULL,
	`metadata_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_entity_created` ON `audit_log` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `disruptions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`technician_id` text NOT NULL,
	`status` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_disruptions_idempotency_key` ON `disruptions` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_disruptions_technician_status` ON `disruptions` (`technician_id`,`status`);--> statement-breakpoint
CREATE TABLE `operators` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_operators_email` ON `operators` (`email`);--> statement-breakpoint
CREATE TABLE `optimization_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`sla_weight` integer NOT NULL,
	`travel_weight` integer NOT NULL,
	`load_weight` integer NOT NULL,
	`overtime_weight` integer NOT NULL,
	`stability_weight` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plan_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`work_order_id` text NOT NULL,
	`from_technician_id` text NOT NULL,
	`to_technician_id` text,
	`impact_minutes` integer NOT NULL,
	`travel_miles` real NOT NULL,
	`overtime_hours` real NOT NULL,
	`outcome` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_plan_assignments_plan` ON `plan_assignments` (`plan_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_plan_assignments_plan_order` ON `plan_assignments` (`plan_id`,`work_order_id`);--> statement-breakpoint
CREATE TABLE `recovery_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`disruption_id` text NOT NULL,
	`status` text NOT NULL,
	`score` real NOT NULL,
	`confidence` integer NOT NULL,
	`projected_sla` real NOT NULL,
	`added_travel` real NOT NULL,
	`overtime` real NOT NULL,
	`policy_version` integer NOT NULL,
	`optimizer_version` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recovery_plans_disruption` ON `recovery_plans` (`disruption_id`);--> statement-breakpoint
CREATE INDEX `idx_recovery_plans_status_updated` ON `recovery_plans` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `technicians` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`specialty` text NOT NULL,
	`status` text NOT NULL,
	`territory` text NOT NULL,
	`skills_json` text NOT NULL,
	`parts_json` text NOT NULL,
	`route_capacity` integer NOT NULL,
	`active_stops` integer NOT NULL,
	`route_miles` real NOT NULL,
	`utilization` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_technicians_status_territory` ON `technicians` (`status`,`territory`);--> statement-breakpoint
CREATE TABLE `work_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`appliance` text NOT NULL,
	`city` text NOT NULL,
	`appointment_window` text NOT NULL,
	`required_skill` text NOT NULL,
	`part_code` text,
	`status` text NOT NULL,
	`assigned_technician_id` text,
	`original_technician_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_work_orders_status` ON `work_orders` (`status`);--> statement-breakpoint
CREATE INDEX `idx_work_orders_technician_status` ON `work_orders` (`assigned_technician_id`,`status`);--> statement-breakpoint
PRAGMA optimize;
