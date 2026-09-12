CREATE TABLE `diagnostic_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`work_order_id` text NOT NULL,
	`technician_id` text NOT NULL,
	`appliance_make` text NOT NULL,
	`appliance_model` text NOT NULL,
	`serial_tail` text NOT NULL,
	`complaint` text NOT NULL,
	`symptom_code` text NOT NULL,
	`status` text NOT NULL,
	`safety_status` text NOT NULL,
	`latest_run_id` text NOT NULL,
	`selected_recommendation_id` text,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_diagnostic_cases_work_order` ON `diagnostic_cases` (`work_order_id`);--> statement-breakpoint
CREATE INDEX `idx_diagnostic_cases_technician_status` ON `diagnostic_cases` (`technician_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_diagnostic_cases_status_updated` ON `diagnostic_cases` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `diagnostic_outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`recommendation_id` text NOT NULL,
	`resolution_code` text NOT NULL,
	`first_time_fix` integer NOT NULL,
	`duration_minutes` integer NOT NULL,
	`notes` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_diagnostic_outcomes_recommendation` ON `diagnostic_outcomes` (`recommendation_id`);--> statement-breakpoint
CREATE INDEX `idx_diagnostic_outcomes_case_created` ON `diagnostic_outcomes` (`case_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `diagnostic_recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`case_id` text NOT NULL,
	`rank` integer NOT NULL,
	`fault_code` text NOT NULL,
	`component` text NOT NULL,
	`confidence` real NOT NULL,
	`rationale` text NOT NULL,
	`verification_step` text NOT NULL,
	`part_code` text,
	`safety_class` text NOT NULL,
	`grounding_score` real NOT NULL,
	`evidence_source_ids_json` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_diagnostic_recommendations_run_rank` ON `diagnostic_recommendations` (`run_id`,`rank`);--> statement-breakpoint
CREATE INDEX `idx_diagnostic_recommendations_case_status` ON `diagnostic_recommendations` (`case_id`,`status`);--> statement-breakpoint
CREATE TABLE `diagnostic_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`model_version` text NOT NULL,
	`status` text NOT NULL,
	`grounding_rate` real NOT NULL,
	`source_count` integer NOT NULL,
	`tool_call_count` integer NOT NULL,
	`created_by` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_diagnostic_runs_case_completed` ON `diagnostic_runs` (`case_id`,`completed_at`);--> statement-breakpoint
CREATE TABLE `diagnostic_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`source_type` text NOT NULL,
	`appliance_make` text NOT NULL,
	`appliance_model` text NOT NULL,
	`revision` text NOT NULL,
	`reference_code` text NOT NULL,
	`summary` text NOT NULL,
	`verified_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_diagnostic_sources_reference` ON `diagnostic_sources` (`reference_code`);--> statement-breakpoint
CREATE INDEX `idx_diagnostic_sources_appliance_type` ON `diagnostic_sources` (`appliance_make`,`appliance_model`,`source_type`);--> statement-breakpoint
CREATE TABLE `diagnostic_tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`case_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`status` text NOT NULL,
	`input_json` text NOT NULL,
	`output_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_diagnostic_tool_calls_run_created` ON `diagnostic_tool_calls` (`run_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `parts_inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`part_code` text NOT NULL,
	`description` text NOT NULL,
	`location` text NOT NULL,
	`on_hand` integer NOT NULL,
	`reserved` integer NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_parts_inventory_part_location` ON `parts_inventory` (`part_code`,`location`);--> statement-breakpoint
CREATE INDEX `idx_parts_inventory_part` ON `parts_inventory` (`part_code`);
--> statement-breakpoint
CREATE TRIGGER `diagnostic_runs_no_update`
BEFORE UPDATE ON `diagnostic_runs`
BEGIN
	SELECT RAISE(ABORT, 'diagnostic_runs is append-only');
END;--> statement-breakpoint
CREATE TRIGGER `diagnostic_runs_no_delete`
BEFORE DELETE ON `diagnostic_runs`
BEGIN
	SELECT RAISE(ABORT, 'diagnostic_runs is append-only');
END;--> statement-breakpoint
CREATE TRIGGER `diagnostic_tool_calls_no_update`
BEFORE UPDATE ON `diagnostic_tool_calls`
BEGIN
	SELECT RAISE(ABORT, 'diagnostic_tool_calls is append-only');
END;--> statement-breakpoint
CREATE TRIGGER `diagnostic_tool_calls_no_delete`
BEFORE DELETE ON `diagnostic_tool_calls`
BEGIN
	SELECT RAISE(ABORT, 'diagnostic_tool_calls is append-only');
END;--> statement-breakpoint
CREATE TRIGGER `diagnostic_outcomes_no_update`
BEFORE UPDATE ON `diagnostic_outcomes`
BEGIN
	SELECT RAISE(ABORT, 'diagnostic_outcomes is append-only');
END;--> statement-breakpoint
CREATE TRIGGER `diagnostic_outcomes_no_delete`
BEFORE DELETE ON `diagnostic_outcomes`
BEGIN
	SELECT RAISE(ABORT, 'diagnostic_outcomes is append-only');
END;--> statement-breakpoint
PRAGMA optimize;
