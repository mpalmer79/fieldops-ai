import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { headersMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import { getChatGPTUser } from "@/app/chatgpt-auth";

describe("ChatGPT identity boundary", () => {
  const originalDemoMode = process.env.PUBLIC_DEMO_MODE;

  beforeEach(() => {
    headersMock.mockReset();
  });

  afterEach(() => {
    if (originalDemoMode === undefined) delete process.env.PUBLIC_DEMO_MODE;
    else process.env.PUBLIC_DEMO_MODE = originalDemoMode;
  });

  it("ignores spoofable OpenAI identity headers in public Railway demo mode", async () => {
    process.env.PUBLIC_DEMO_MODE = "true";
    headersMock.mockResolvedValue(new Headers({
      "oai-authenticated-user-id": "attacker-controlled-user",
      "oai-authenticated-user-email": "attacker@example.com",
    }));

    await expect(getChatGPTUser()).resolves.toEqual({
      userId: "fieldops-public-demo",
      displayName: "Portfolio Operator",
      email: "demo@fieldops-ai.local",
      fullName: "Portfolio Operator",
    });
    expect(headersMock).not.toHaveBeenCalled();
  });

  it("reads edge identity headers only when public demo mode is disabled", async () => {
    process.env.PUBLIC_DEMO_MODE = "false";
    headersMock.mockResolvedValue(new Headers({
      "oai-authenticated-user-id": "trusted-edge-user",
      "oai-authenticated-user-email": "reviewer@example.com",
      "oai-authenticated-user-full-name": "Technical%20Reviewer",
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
    }));

    await expect(getChatGPTUser()).resolves.toEqual({
      userId: "trusted-edge-user",
      displayName: "Technical Reviewer",
      email: "reviewer@example.com",
      fullName: "Technical Reviewer",
    });
    expect(headersMock).toHaveBeenCalledTimes(1);
  });
});
