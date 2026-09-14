ALTER TABLE "disruptions" ADD COLUMN "previous_technician_status" text DEFAULT 'IN_BAY' NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "audit_log_no_update"
BEFORE UPDATE ON "audit_log"
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_mutation();
--> statement-breakpoint
CREATE TRIGGER "audit_log_no_delete"
BEFORE DELETE ON "audit_log"
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_mutation();
