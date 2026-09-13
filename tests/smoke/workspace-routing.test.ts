import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { workspaceRoutes } from "@/app/control-room/workspace-routes";

const projectRoot = path.resolve(import.meta.dirname, "../..");

describe("control-room route contract", () => {
  it("publishes a unique URL for every workspace", () => {
    const slugs = workspaceRoutes.map(({ slug }) => slug);
    const labels = workspaceRoutes.map(({ label }) => label);

    expect(workspaceRoutes).toHaveLength(9);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(labels).size).toBe(labels.length);
    expect(slugs).toEqual([
      "service-command",
      "shop-board",
      "repair-orders",
      "technicians",
      "performance",
      "capacity-planning",
      "simulation-lab",
      "diagnostic-copilot",
      "agentops",
    ]);
    expect(slugs.every((slug) => /^[a-z]+(?:-[a-z]+)*$/.test(slug))).toBe(true);
  });

  it("keeps the dynamic workspace page and canonical index redirect", () => {
    expect(fs.existsSync(path.join(projectRoot, "app/control-room/page.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, "app/control-room/[workspace]/page.tsx"))).toBe(true);
  });
});
