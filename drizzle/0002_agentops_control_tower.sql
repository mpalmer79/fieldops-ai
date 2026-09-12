CREATE TABLE `agent_deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`version_id` text NOT NULL,
	`environment` text NOT NULL,
	`status` text NOT NULL,
	`traffic_percentage` integer NOT NULL,
	`previous_version_id` text,
	`deployed_by` text NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agent_deployments_agent_created` ON `agent_deployments` (`agent_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_agent_deployments_status_environment` ON `agent_deployments` (`status`,`environment`);--> statement-breakpoint
CREATE TABLE `agent_incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`evaluation_run_id` text,
	`severity` text NOT NULL,
	`category` text NOT NULL,
	`summary` text NOT NULL,
	`status` text NOT NULL,
	`detected_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_agent_incidents_agent_status` ON `agent_incidents` (`agent_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_agent_incidents_severity_detected` ON `agent_incidents` (`severity`,`detected_at`);--> statement-breakpoint
CREATE TABLE `agent_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`version` text NOT NULL,
	`model` text NOT NULL,
	`prompt_hash` text NOT NULL,
	`tools_json` text NOT NULL,
	`permissions_json` text NOT NULL,
	`status` text NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_versions_agent_version` ON `agent_versions` (`agent_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_agent_versions_agent_status` ON `agent_versions` (`agent_id`,`status`);--> statement-breakpoint
CREATE TABLE `ai_agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`responsibility` text NOT NULL,
	`status` text NOT NULL,
	`current_version_id` text NOT NULL,
	`owner_team` text NOT NULL,
	`risk_tier` text NOT NULL,
	`daily_decisions` integer NOT NULL,
	`success_rate` real NOT NULL,
	`avg_latency_ms` integer NOT NULL,
	`escalation_rate` real NOT NULL,
	`cost_per_decision` real NOT NULL,
	`record_version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_agents_status_risk` ON `ai_agents` (`status`,`risk_tier`);--> statement-breakpoint
CREATE TABLE `evaluation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`suite_id` text NOT NULL,
	`status` text NOT NULL,
	`task_success` real NOT NULL,
	`policy_compliance` real NOT NULL,
	`hallucination_rate` real NOT NULL,
	`tool_accuracy` real NOT NULL,
	`p95_latency_ms` integer NOT NULL,
	`sample_size` integer NOT NULL,
	`failures_json` text NOT NULL,
	`created_by` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_evaluation_runs_version_completed` ON `evaluation_runs` (`version_id`,`completed_at`);--> statement-breakpoint
CREATE INDEX `idx_evaluation_runs_status_completed` ON `evaluation_runs` (`status`,`completed_at`);--> statement-breakpoint
CREATE TABLE `evaluation_suites` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`name` text NOT NULL,
	`task_success_threshold` real NOT NULL,
	`policy_compliance_threshold` real NOT NULL,
	`hallucination_threshold` real NOT NULL,
	`tool_accuracy_threshold` real NOT NULL,
	`latency_threshold_ms` integer NOT NULL,
	`sample_size` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_evaluation_suites_agent` ON `evaluation_suites` (`agent_id`);--> statement-breakpoint
CREATE TRIGGER `evaluation_runs_no_update`
BEFORE UPDATE ON `evaluation_runs`
BEGIN
	SELECT RAISE(ABORT, 'evaluation_runs is append-only');
END;--> statement-breakpoint
CREATE TRIGGER `evaluation_runs_no_delete`
BEFORE DELETE ON `evaluation_runs`
BEGIN
	SELECT RAISE(ABORT, 'evaluation_runs is append-only');
END;--> statement-breakpoint
PRAGMA optimize;
