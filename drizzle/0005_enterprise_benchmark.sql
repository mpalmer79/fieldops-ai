CREATE TABLE `benchmark_results` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`profile_key` text NOT NULL,
	`label` text NOT NULL,
	`work_orders` integer NOT NULL,
	`technicians` integer NOT NULL,
	`territories` integer NOT NULL,
	`iterations` integer NOT NULL,
	`evaluations` integer NOT NULL,
	`duration_ms` real NOT NULL,
	`throughput` real NOT NULL,
	`p95_shard_ms` real NOT NULL,
	`feasible_rate` real NOT NULL,
	`hard_reject_rate` real NOT NULL,
	`constraint_violations` integer NOT NULL,
	`checksum` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_benchmark_results_run_profile` ON `benchmark_results` (`run_id`,`profile_key`);--> statement-breakpoint
CREATE INDEX `idx_benchmark_results_run` ON `benchmark_results` (`run_id`);--> statement-breakpoint
CREATE TABLE `benchmark_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`suite_version` text NOT NULL,
	`engine_version` text NOT NULL,
	`seed` integer NOT NULL,
	`iterations` integer NOT NULL,
	`profile_count` integer NOT NULL,
	`total_evaluations` integer NOT NULL,
	`duration_ms` real NOT NULL,
	`throughput` real NOT NULL,
	`p95_shard_ms` real NOT NULL,
	`deterministic_passed` integer NOT NULL,
	`zero_violation_passed` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`environment_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_benchmark_runs_idempotency_key` ON `benchmark_runs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_benchmark_runs_completed` ON `benchmark_runs` (`completed_at`);--> statement-breakpoint
PRAGMA optimize;
