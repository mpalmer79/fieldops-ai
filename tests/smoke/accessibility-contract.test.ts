import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const shellSource = fs.readFileSync(
  path.resolve(import.meta.dirname, "../../app/control-room/_components/control-room-shell.tsx"),
  "utf8",
);

describe("control-room accessibility contract", () => {
  it("removes the collapsed mobile navigation from the accessibility and tab trees", () => {
    const sidebarOpeningTag = shellSource.match(/<aside\b[^>]*className=\{`sidebar[^>]*>/)?.[0] ?? "";

    expect(sidebarOpeningTag).toContain("aria-hidden=");
    expect(sidebarOpeningTag).toContain("inert=");
  });

  it("announces asynchronous errors and confirmations", () => {
    expect(shellSource).toMatch(/role=["{]alert/);
    expect(shellSource).toMatch(/aria-live=/);
  });
});
