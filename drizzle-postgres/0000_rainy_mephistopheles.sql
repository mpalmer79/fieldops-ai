CREATE TABLE "agent_deployments" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"version_id" text NOT NULL,
	"environment" text NOT NULL,
	"status" text NOT NULL,
	"traffic_percentage" integer NOT NULL,
	"previous_version_id" text,
	"deployed_by" text NOT NULL,
	"created_at" text NOT NULL,
	"completed_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"evaluation_run_id" text,
	"severity" text NOT NULL,
	"category" text NOT NULL,
	"summary" text NOT NULL,
	"status" text NOT NULL,
	"detected_at" text NOT NULL,
	"resolved_at" text
);
--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"version" text NOT NULL,
	"model" text NOT NULL,
	"prompt_hash" text NOT NULL,
	"tools_json" text NOT NULL,
	"permissions_json" text NOT NULL,
	"status" text NOT NULL,
	"record_version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"responsibility" text NOT NULL,
	"status" text NOT NULL,
	"current_version_id" text NOT NULL,
	"owner_team" text NOT NULL,
	"risk_tier" text NOT NULL,
	"daily_decisions" integer NOT NULL,
	"success_rate" real NOT NULL,
	"avg_latency_ms" integer NOT NULL,
	"escalation_rate" real NOT NULL,
	"cost_per_decision" real NOT NULL,
	"record_version" integer DEFAULT 1 NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"actor_id" text NOT NULL,
	"actor_role" text NOT NULL,
	"metadata_json" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_results" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"profile_key" text NOT NULL,
	"label" text NOT NULL,
	"work_orders" integer NOT NULL,
	"technicians" integer NOT NULL,
	"territories" integer NOT NULL,
	"iterations" integer NOT NULL,
	"evaluations" integer NOT NULL,
	"duration_ms" real NOT NULL,
	"throughput" real NOT NULL,
	"p95_shard_ms" real NOT NULL,
	"feasible_rate" real NOT NULL,
	"hard_reject_rate" real NOT NULL,
	"constraint_violations" integer NOT NULL,
	"checksum" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"suite_version" text NOT NULL,
	"engine_version" text NOT NULL,
	"seed" integer NOT NULL,
	"iterations" integer NOT NULL,
	"profile_count" integer NOT NULL,
	"total_evaluations" integer NOT NULL,
	"duration_ms" real NOT NULL,
	"throughput" real NOT NULL,
	"p95_shard_ms" real NOT NULL,
	"deterministic_passed" integer NOT NULL,
	"zero_violation_passed" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"environment_json" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"completed_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capacity_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"forecast_date" text NOT NULL,
	"skill" text NOT NULL,
	"action_type" text NOT NULL,
	"description" text NOT NULL,
	"capacity_delta" integer NOT NULL,
	"estimated_cost" integer NOT NULL,
	"priority" integer NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capacity_scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"forecast_run_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"demand_change_pct" integer NOT NULL,
	"availability_change_pct" integer NOT NULL,
	"overtime_hours" integer NOT NULL,
	"cross_trained_techs" integer NOT NULL,
	"projected_demand" integer NOT NULL,
	"projected_capacity" integer NOT NULL,
	"residual_gap" integer NOT NULL,
	"jobs_protected" integer NOT NULL,
	"estimated_cost" integer NOT NULL,
	"record_version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"approved_at" text
);
--> statement-breakpoint
CREATE TABLE "demand_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"observed_date" text NOT NULL,
	"territory" text NOT NULL,
	"skill" text NOT NULL,
	"requested_jobs" integer NOT NULL,
	"completed_jobs" integer NOT NULL,
	"available_capacity" integer NOT NULL,
	"avg_duration_minutes" integer NOT NULL,
	"source" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagnostic_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"work_order_id" text NOT NULL,
	"technician_id" text NOT NULL,
	"appliance_make" text NOT NULL,
	"appliance_model" text NOT NULL,
	"serial_tail" text NOT NULL,
	"complaint" text NOT NULL,
	"symptom_code" text NOT NULL,
	"status" text NOT NULL,
	"safety_status" text NOT NULL,
	"latest_run_id" text NOT NULL,
	"selected_recommendation_id" text,
	"record_version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagnostic_outcomes" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"recommendation_id" text NOT NULL,
	"resolution_code" text NOT NULL,
	"first_time_fix" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"notes" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagnostic_recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"case_id" text NOT NULL,
	"rank" integer NOT NULL,
	"fault_code" text NOT NULL,
	"component" text NOT NULL,
	"confidence" real NOT NULL,
	"rationale" text NOT NULL,
	"verification_step" text NOT NULL,
	"part_code" text,
	"safety_class" text NOT NULL,
	"grounding_score" real NOT NULL,
	"evidence_source_ids_json" text NOT NULL,
	"status" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagnostic_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"model_version" text NOT NULL,
	"status" text NOT NULL,
	"grounding_rate" real NOT NULL,
	"source_count" integer NOT NULL,
	"tool_call_count" integer NOT NULL,
	"created_by" text NOT NULL,
	"started_at" text NOT NULL,
	"completed_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagnostic_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"source_type" text NOT NULL,
	"appliance_make" text NOT NULL,
	"appliance_model" text NOT NULL,
	"revision" text NOT NULL,
	"reference_code" text NOT NULL,
	"summary" text NOT NULL,
	"verified_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagnostic_tool_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"case_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"status" text NOT NULL,
	"input_json" text NOT NULL,
	"output_json" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disruptions" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"technician_id" text NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"version_id" text NOT NULL,
	"suite_id" text NOT NULL,
	"status" text NOT NULL,
	"task_success" real NOT NULL,
	"policy_compliance" real NOT NULL,
	"hallucination_rate" real NOT NULL,
	"tool_accuracy" real NOT NULL,
	"p95_latency_ms" integer NOT NULL,
	"sample_size" integer NOT NULL,
	"failures_json" text NOT NULL,
	"created_by" text NOT NULL,
	"started_at" text NOT NULL,
	"completed_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_suites" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"name" text NOT NULL,
	"task_success_threshold" real NOT NULL,
	"policy_compliance_threshold" real NOT NULL,
	"hallucination_threshold" real NOT NULL,
	"tool_accuracy_threshold" real NOT NULL,
	"latency_threshold_ms" integer NOT NULL,
	"sample_size" integer NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecast_points" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"forecast_date" text NOT NULL,
	"territory" text NOT NULL,
	"skill" text NOT NULL,
	"expected_demand" integer NOT NULL,
	"lower_bound" integer NOT NULL,
	"upper_bound" integer NOT NULL,
	"available_capacity" integer NOT NULL,
	"risk_level" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecast_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"model_version" text NOT NULL,
	"territory" text NOT NULL,
	"horizon_days" integer NOT NULL,
	"training_window_days" integer NOT NULL,
	"wape" real NOT NULL,
	"bias" real NOT NULL,
	"interval_coverage" real NOT NULL,
	"idempotency_key" text NOT NULL,
	"input_snapshot_json" text NOT NULL,
	"created_by" text NOT NULL,
	"started_at" text NOT NULL,
	"completed_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operators" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimization_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"sla_weight" integer NOT NULL,
	"travel_weight" integer NOT NULL,
	"load_weight" integer NOT NULL,
	"overtime_weight" integer NOT NULL,
	"stability_weight" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parts_inventory" (
	"id" text PRIMARY KEY NOT NULL,
	"part_code" text NOT NULL,
	"description" text NOT NULL,
	"location" text NOT NULL,
	"on_hand" integer NOT NULL,
	"reserved" integer NOT NULL,
	"record_version" integer DEFAULT 1 NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"work_order_id" text NOT NULL,
	"from_technician_id" text NOT NULL,
	"to_technician_id" text,
	"impact_minutes" integer NOT NULL,
	"travel_miles" real NOT NULL,
	"overtime_hours" real NOT NULL,
	"outcome" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"disruption_id" text NOT NULL,
	"status" text NOT NULL,
	"score" real NOT NULL,
	"confidence" integer NOT NULL,
	"projected_sla" real NOT NULL,
	"added_travel" real NOT NULL,
	"overtime" real NOT NULL,
	"policy_version" integer NOT NULL,
	"optimizer_version" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technicians" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"specialty" text NOT NULL,
	"status" text NOT NULL,
	"territory" text NOT NULL,
	"skills_json" text NOT NULL,
	"parts_json" text NOT NULL,
	"route_capacity" integer NOT NULL,
	"active_stops" integer NOT NULL,
	"route_miles" real NOT NULL,
	"utilization" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"appliance" text NOT NULL,
	"city" text NOT NULL,
	"appointment_window" text NOT NULL,
	"required_skill" text NOT NULL,
	"part_code" text,
	"status" text NOT NULL,
	"assigned_technician_id" text,
	"original_technician_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_agent_deployments_agent_created" ON "agent_deployments" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_agent_deployments_status_environment" ON "agent_deployments" USING btree ("status","environment");--> statement-breakpoint
CREATE INDEX "idx_agent_incidents_agent_status" ON "agent_incidents" USING btree ("agent_id","status");--> statement-breakpoint
CREATE INDEX "idx_agent_incidents_severity_detected" ON "agent_incidents" USING btree ("severity","detected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_agent_versions_agent_version" ON "agent_versions" USING btree ("agent_id","version");--> statement-breakpoint
CREATE INDEX "idx_agent_versions_agent_status" ON "agent_versions" USING btree ("agent_id","status");--> statement-breakpoint
CREATE INDEX "idx_ai_agents_status_risk" ON "ai_agents" USING btree ("status","risk_tier");--> statement-breakpoint
CREATE INDEX "idx_audit_entity_created" ON "audit_log" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_benchmark_results_run_profile" ON "benchmark_results" USING btree ("run_id","profile_key");--> statement-breakpoint
CREATE INDEX "idx_benchmark_results_run" ON "benchmark_results" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_benchmark_runs_idempotency_key" ON "benchmark_runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_benchmark_runs_completed" ON "benchmark_runs" USING btree ("completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_capacity_actions_scenario_priority" ON "capacity_actions" USING btree ("scenario_id","priority");--> statement-breakpoint
CREATE INDEX "idx_capacity_actions_scenario_date" ON "capacity_actions" USING btree ("scenario_id","forecast_date");--> statement-breakpoint
CREATE INDEX "idx_capacity_scenarios_run_created" ON "capacity_scenarios" USING btree ("forecast_run_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_capacity_scenarios_status_updated" ON "capacity_scenarios" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_demand_observations_date_territory_skill" ON "demand_observations" USING btree ("observed_date","territory","skill");--> statement-breakpoint
CREATE INDEX "idx_demand_observations_territory_date" ON "demand_observations" USING btree ("territory","observed_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_diagnostic_cases_work_order" ON "diagnostic_cases" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "idx_diagnostic_cases_technician_status" ON "diagnostic_cases" USING btree ("technician_id","status");--> statement-breakpoint
CREATE INDEX "idx_diagnostic_cases_status_updated" ON "diagnostic_cases" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_diagnostic_outcomes_recommendation" ON "diagnostic_outcomes" USING btree ("recommendation_id");--> statement-breakpoint
CREATE INDEX "idx_diagnostic_outcomes_case_created" ON "diagnostic_outcomes" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_diagnostic_recommendations_run_rank" ON "diagnostic_recommendations" USING btree ("run_id","rank");--> statement-breakpoint
CREATE INDEX "idx_diagnostic_recommendations_case_status" ON "diagnostic_recommendations" USING btree ("case_id","status");--> statement-breakpoint
CREATE INDEX "idx_diagnostic_runs_case_completed" ON "diagnostic_runs" USING btree ("case_id","completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_diagnostic_sources_reference" ON "diagnostic_sources" USING btree ("reference_code");--> statement-breakpoint
CREATE INDEX "idx_diagnostic_sources_appliance_type" ON "diagnostic_sources" USING btree ("appliance_make","appliance_model","source_type");--> statement-breakpoint
CREATE INDEX "idx_diagnostic_tool_calls_run_created" ON "diagnostic_tool_calls" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_disruptions_idempotency_key" ON "disruptions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_disruptions_technician_status" ON "disruptions" USING btree ("technician_id","status");--> statement-breakpoint
CREATE INDEX "idx_evaluation_runs_version_completed" ON "evaluation_runs" USING btree ("version_id","completed_at");--> statement-breakpoint
CREATE INDEX "idx_evaluation_runs_status_completed" ON "evaluation_runs" USING btree ("status","completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_evaluation_suites_agent" ON "evaluation_suites" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_forecast_points_run_date_skill" ON "forecast_points" USING btree ("run_id","forecast_date","skill");--> statement-breakpoint
CREATE INDEX "idx_forecast_points_run_date" ON "forecast_points" USING btree ("run_id","forecast_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_forecast_runs_idempotency_key" ON "forecast_runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_forecast_runs_territory_completed" ON "forecast_runs" USING btree ("territory","completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_operators_email" ON "operators" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_parts_inventory_part_location" ON "parts_inventory" USING btree ("part_code","location");--> statement-breakpoint
CREATE INDEX "idx_parts_inventory_part" ON "parts_inventory" USING btree ("part_code");--> statement-breakpoint
CREATE INDEX "idx_plan_assignments_plan" ON "plan_assignments" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_plan_assignments_plan_order" ON "plan_assignments" USING btree ("plan_id","work_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_recovery_plans_disruption" ON "recovery_plans" USING btree ("disruption_id");--> statement-breakpoint
CREATE INDEX "idx_recovery_plans_status_updated" ON "recovery_plans" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_technicians_status_territory" ON "technicians" USING btree ("status","territory");--> statement-breakpoint
CREATE INDEX "idx_work_orders_status" ON "work_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_work_orders_technician_status" ON "work_orders" USING btree ("assigned_technician_id","status");