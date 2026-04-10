import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { loadAgentsFile, readAgentsFile } from "./agents-file.ts";

beforeEach(() => {
  vi.mocked(existsSync).mockReset();
  vi.mocked(readFile).mockReset();
});

describe("readAgentsFile", () => {
  it("returns file content when file exists", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue("# Agent instructions");
    const result = await readAgentsFile("AGENTS.md");
    expect(result).toBe("# Agent instructions");
  });

  it("returns empty string when file does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = await readAgentsFile("AGENTS.md");
    expect(result).toBe("");
    expect(readFile).not.toHaveBeenCalled();
  });

  it("returns empty string when readFile throws", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockRejectedValue(new Error("read error"));
    const result = await readAgentsFile("AGENTS.md");
    expect(result).toBe("");
  });
});

describe("loadAgentsFile", () => {
  it("returns content of the first file found", async () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      String(p).endsWith("AGENTS.md"),
    );
    vi.mocked(readFile).mockResolvedValue("agents content");
    const result = await loadAgentsFile();
    expect(result).toBe("agents content");
  });

  it("falls back to the second file if first does not exist", async () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      String(p).endsWith("AGENT.md"),
    );
    vi.mocked(readFile).mockResolvedValue("agent content");
    const result = await loadAgentsFile();
    expect(result).toBe("agent content");
  });

  it("returns empty string when no files exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = await loadAgentsFile();
    expect(result).toBe("");
  });

  it("uses a custom agent list", async () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      String(p).endsWith("CUSTOM.md"),
    );
    vi.mocked(readFile).mockResolvedValue("custom");
    const result = await loadAgentsFile(["CUSTOM.md"]);
    expect(result).toBe("custom");
  });
});
