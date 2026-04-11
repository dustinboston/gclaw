import { describe, it, expect } from "vitest";
import { runWithContext, getContext, getRequestId } from "./context.ts";

describe("context", () => {
  it("returns undefined outside of a context", () => {
    expect(getContext()).toBeUndefined();
    expect(getRequestId()).toBeUndefined();
  });

  it("provides a requestId inside runWithContext", () => {
    runWithContext(() => {
      const ctx = getContext();
      expect(ctx).toBeDefined();
      expect(ctx!.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(ctx!.startedAt).toBeGreaterThan(0);
    });
  });

  it("getRequestId returns the current requestId", () => {
    runWithContext(() => {
      const id = getRequestId();
      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
    });
  });

  it("generates unique IDs per context", () => {
    const ids: string[] = [];
    runWithContext(() => ids.push(getRequestId()!));
    runWithContext(() => ids.push(getRequestId()!));
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("works with async functions", async () => {
    await runWithContext(async () => {
      await new Promise((r) => setTimeout(r, 1));
      expect(getRequestId()).toBeDefined();
    });
  });
});
