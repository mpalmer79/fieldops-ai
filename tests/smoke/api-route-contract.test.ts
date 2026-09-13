import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const apiRoot = path.join(projectRoot, "app/api");
const supportedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const expectedRoutes: Record<string, (typeof supportedMethods)[number]> = {
  "agentops/deployments": "POST",
  "agentops/evaluations": "POST",
  agentops: "GET",
  "benchmarks/report": "GET",
  "benchmarks/run": "POST",
  benchmarks: "GET",
  "capacity/forecast": "POST",
  "capacity/scenarios/approve": "POST",
  "capacity/scenarios": "POST",
  capacity: "GET",
  "diagnostics/actions": "POST",
  "diagnostics/analyze": "POST",
  diagnostics: "GET",
  disruptions: "POST",
  health: "GET",
  operations: "GET",
  policy: "PUT",
  "recovery-plans/transition": "POST",
};

function findRouteFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return findRouteFiles(absolutePath);
    }

    return entry.name === "route.ts" ? [absolutePath] : [];
  });
}

describe("API route contract", () => {
  it("keeps every published endpoint backed by its intended HTTP handler", () => {
    const discoveredRoutes = Object.fromEntries(findRouteFiles(apiRoot).map((routeFile) => {
      const source = fs.readFileSync(routeFile, "utf8");
      const route = path.relative(apiRoot, path.dirname(routeFile)).replaceAll(path.sep, "/");
      const method = supportedMethods.find((candidate) => new RegExp(`export\\s+(?:async\\s+)?function\\s+${candidate}\\b`).test(source));

      expect(method, `${routeFile} must export a supported route handler`).toBeDefined();
      return [route, method];
    }));

    expect(discoveredRoutes).toEqual(expectedRoutes);
  });
});
