import { describe, expect, it } from "vitest";
import { assistantPrompts, resolveAssistantResponse, welcomeReply } from "@/lib/fieldops-assistant";

describe("FieldOps context assistant", () => {
  it("positions itself as a deterministic local knowledge assistant", () => {
    const welcomeText = welcomeReply.paragraphs.join(" ").toLowerCase();

    expect(welcomeReply.title).toBe("FieldOps Context Assistant");
    expect(welcomeText).toContain("deterministic in-app knowledge assistant");
    expect(welcomeText).toContain("do not send your question to claude, openai, or another external model");
  });

  it("provides exactly four starter questions including the creator prompt", () => {
    expect(assistantPrompts).toHaveLength(4);
    expect(assistantPrompts.some((prompt) => prompt.includes("Michael Palmer"))).toBe(true);
  });

  it("returns Michael Palmer's professional profile and public links", () => {
    const response = resolveAssistantResponse("Who is Michael Palmer, and what else has he built?");

    expect(response.intent).toBe("creator");
    expect(response.title).toBe("Michael Palmer");
    expect(response.paragraphs.join(" ")).toContain("AI Solutions Engineer");
    expect(response.links).toEqual([
      { label: "LinkedIn", href: "https://linkedin.com/in/mpalmer1234" },
      { label: "GitHub", href: "https://github.com/mpalmer79" },
      { label: "Portfolio", href: "https://mpalmer79.github.io/" },
    ]);
  });

  it("answers recovery questions from the local product knowledge set", () => {
    const response = resolveAssistantResponse("How does the recovery engine protect customer promises?");

    expect(response.intent).toBe("recovery");
    expect(response.bullets).toContain("Require manager approval before execution");
  });

  it("uses the current workspace as context when asked about the page", () => {
    const response = resolveAssistantResponse("What does this page do?", "/control-room/capacity-planning");

    expect(response.intent).toBe("workspace");
    expect(response.title).toBe("Capacity Planning");
  });

  it("keeps unknown questions inside the curated local assistant scope", () => {
    const response = resolveAssistantResponse("Tell me something unrelated to the project");

    expect(response.intent).toBe("fallback");
    expect(response.paragraphs.join(" ")).toContain("No prompt is sent to Claude, OpenAI, or another external model");
  });
});
