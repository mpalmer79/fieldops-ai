CREATE TABLE `capacity_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`forecast_date` text NOT NULL,
	`skill` text NOT NULL,
	`action_type` text NOT NULL,
	`description` text NOT NULL,
	`capacity_delta` integer NOT NULL,
	`estimated_cost` integer NOT NULL,
	`priority` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_capacity_actions_scenario_priority` ON `capacity_actions` (`scenario_id`,`priority`);--> statement-breakpoint
CREATE INDEX `idx_capacity_actions_scenario_date` ON `capacity_actions` (`scenario_id`,`forecast_date`);--> statement-breakpoint
CREATE TABLE `capacity_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`forecast_run_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`demand_change_pct` integer NOT NULL,
	`availability_change_pct` integer NOT NULL,
	`overtime_hours` integer NOT NULL,
	`cross_trained_techs` integer NOT NULL,
	`projected_demand` integer NOT NULL,
	`projected_capacity` integer NOT NULL,
	`residual_gap` integer NOT NULL,
	`jobs_protected` integer NOT NULL,
	`estimated_cost` integer NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`approved_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`approved_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_capacity_scenarios_run_created` ON `capacity_scenarios` (`forecast_run_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_capacity_scenarios_status_updated` ON `capacity_scenarios` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `demand_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`observed_date` text NOT NULL,
	`territory` text NOT NULL,
	`skill` text NOT NULL,
	`requested_jobs` integer NOT NULL,
	`completed_jobs` integer NOT NULL,
	`available_capacity` integer NOT NULL,
	`avg_duration_minutes` integer NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_demand_observations_date_territory_skill` ON `demand_observations` (`observed_date`,`territory`,`skill`);--> statement-breakpoint
CREATE INDEX `idx_demand_observations_territory_date` ON `demand_observations` (`territory`,`observed_date`);--> statement-breakpoint
CREATE TABLE `forecast_points` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`forecast_date` text NOT NULL,
	`territory` text NOT NULL,
	`skill` text NOT NULL,
	`expected_demand` integer NOT NULL,
	`lower_bound` integer NOT NULL,
	`upper_bound` integer NOT NULL,
	`available_capacity` integer NOT NULL,
	`risk_level` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_forecast_points_run_date_skill` ON `forecast_points` (`run_id`,`forecast_date`,`skill`);--> statement-breakpoint
CREATE INDEX `idx_forecast_points_run_date` ON `forecast_points` (`run_id`,`forecast_date`);--> statement-breakpoint
CREATE TABLE `forecast_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`model_version` text NOT NULL,
	`territory` text NOT NULL,
	`horizon_days` integer NOT NULL,
	`training_window_days` integer NOT NULL,
	`wape` real NOT NULL,
	`bias` real NOT NULL,
	`interval_coverage` real NOT NULL,
	`idempotency_key` text NOT NULL,
	`input_snapshot_json` text NOT NULL,
	`created_by` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_forecast_runs_idempotency_key` ON `forecast_runs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_forecast_runs_territory_completed` ON `forecast_runs` (`territory`,`completed_at`);--> statement-breakpoint
PRAGMA optimize;
