import { readFile, stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { workspaceRoutes } from "@/app/control-room/workspace-routes";
import { csvCell } from "@/lib/server/benchmark-store";

const projectFile = (path: string) => new URL(`../${path}`, import.meta.url);

describe("remediation contracts", () => {
  it("keeps the shared stylesheet limited to document primitives", async () => {
    const globals = await readFile(projectFile("app/globals.css"), "utf8");
    const details = await stat(projectFile("app/globals.css"));

    expect(details.size).toBeLessThan(2_000);
    expect(globals).not.toContain(".agentops");
    expect(globals).not.toContain("--background:#f3f5f8");
  });

  it("keeps operational structure separate from visual theme declarations", async () => {
    const structure = await readFile(projectFile("app/control-room-structure.css"), "utf8");

    expect(Buffer.byteLength(structure)).toBeLessThan(45_000);
    expect(structure).not.toMatch(/(^|[;{]\s*)(color|background|box-shadow|border-radius)\s*:/m);
    expect(structure).toContain(".app-shell {");
    expect(structure).toContain("display: flex;");
  });

  it("keeps the landing hero content-driven in tall desktop-mode viewports", async () => {
    const landing = await readFile(projectFile("app/landing.module.css"), "utf8");
    const heroRule = landing.match(/\.hero\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(heroRule).not.toContain("100vh");
    expect(heroRule).toContain("grid-template-columns");
  });

  it("uses a layered landing canvas instead of a flat black background", async () => {
    const landing = await readFile(projectFile("app/landing.module.css"), "utf8");
    const pageRule = landing.match(/\.page\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(pageRule.match(/radial-gradient/g)?.length).toBeGreaterThanOrEqual(3);
    expect(pageRule).toContain("linear-gradient");
    expect(pageRule).not.toContain("#070b0f");
  });

  it("identifies the provenance of every addressable workspace", () => {
    expect(workspaceRoutes).toHaveLength(9);
    expect(workspaceRoutes.every(route => route.dataProvenance.length > 0)).toBe(true);
    expect(workspaceRoutes.find(route => route.slug === "shop-board")?.dataProvenance).toBe("REFERENCE VIEW");
    expect(workspaceRoutes.find(route => route.slug === "performance")?.dataProvenance).toBe("HYBRID VIEW");
  });

  it("renders workspace destinations as links with explicit light-theme navigation surfaces", async () => {
    const [shell, theme] = await Promise.all([
      readFile(projectFile("app/control-room/_components/control-room-shell.tsx"), "utf8"),
      readFile(projectFile("app/control-room.css"), "utf8"),
    ]);

    expect(shell).toContain('className={`workspace-nav-link');
    expect(shell).toContain('href={`/control-room/${slug}`}');
    expect(theme).toContain(".service-command-shell .workspace-nav-link { background: transparent;");
    expect(theme).toContain(".service-command-shell .workspace-nav-link.active");
  });

  it("protects spreadsheet consumers from formula execution", () => {
    expect(csvCell("=HYPERLINK(\"https://example.test\")")).toBe("\"'=HYPERLINK(\"\"https://example.test\"\")\"");
    expect(csvCell(" +SUM(A1:A2)")).toBe("' +SUM(A1:A2)");
    expect(csvCell("@payload")).toBe("'@payload");
    expect(csvCell(-42)).toBe("-42");
  });

  it("enforces append-only audit records in PostgreSQL", async () => {
    const migration = await readFile(projectFile("drizzle-postgres/0002_audit_integrity_and_rollback.sql"), "utf8");

    expect(migration).toContain('CREATE TRIGGER "audit_log_no_update"');
    expect(migration).toContain('CREATE TRIGGER "audit_log_no_delete"');
    expect(migration).toContain("RAISE EXCEPTION 'audit_log is append-only'");
    expect(migration).toContain('"previous_technician_status"');
  });

  it("does not retain a personal identity fallback or unused direct zod dependency", async () => {
    const [shell, packageJson] = await Promise.all([
      readFile(projectFile("app/control-room/_components/control-room-shell.tsx"), "utf8"),
      readFile(projectFile("package.json"), "utf8"),
    ]);
    const manifest = JSON.parse(packageJson) as { dependencies: Record<string, string> };

    expect(shell).not.toContain("Michael Palmer");
    expect(manifest.dependencies.zod).toBeUndefined();
  });
});
