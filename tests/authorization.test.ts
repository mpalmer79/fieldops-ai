import { describe, expect, it } from "vitest";
import {
  OperationError,
  publicId,
  requireRole,
  scopedId,
  type Operator,
  type OperatorRole,
} from "@/lib/server/operations-store";

function operator(role: OperatorRole, workspaceId = "demo-session-a"): Operator {
  return {
    id: `operator:${workspaceId}`,
    email: `${workspaceId}@fieldops-ai.local`,
    display_name: "Portfolio Operator",
    role,
    workspace_id: workspaceId,
  };
}

describe("authorization and tenant boundaries", () => {
  it("allows the isolated demo supervisor to exercise supervisor workflows", () => {
    expect(() => requireRole(operator("supervisor"), "dispatcher")).not.toThrow();
    expect(() => requireRole(operator("supervisor"), "supervisor")).not.toThrow();
  });

  it("rejects roles below the required workflow boundary", () => {
    expect(() => requireRole(operator("dispatcher"), "supervisor")).toThrowError(OperationError);
    expect(() => requireRole(operator("supervisor"), "admin")).toThrowError(/admin role required/);
  });

  it("creates non-colliding resource identities for separate visitor workspaces", () => {
    const first = operator("supervisor", "demo-session-a");
    const second = operator("supervisor", "demo-session-b");

    expect(scopedId(first, "WO-48321")).not.toBe(scopedId(second, "WO-48321"));
    expect(publicId(first, scopedId(first, "WO-48321"))).toBe("WO-48321");
  });
});
