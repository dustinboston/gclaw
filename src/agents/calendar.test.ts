import { describe, it, expect, vi } from "vitest";

const { mockCreateAgent } = vi.hoisted(() => ({
  mockCreateAgent: vi.fn().mockReturnValue({ stream: vi.fn() }),
}));

vi.mock("langchain", () => ({ createAgent: mockCreateAgent }));
vi.mock("../model.ts", () => ({ model: {} }));
vi.mock("../tools/event.ts", () => ({
  listEvents: { name: "list_events" },
  createEvent: { name: "create_event" },
}));

import { calendarAgent } from "./calendar.ts";

describe("calendarAgent", () => {
  it("is created via createAgent", () => {
    expect(mockCreateAgent).toHaveBeenCalledTimes(1);
    expect(calendarAgent).toBeDefined();
  });

  it("has the correct tools", () => {
    const call = mockCreateAgent.mock.calls[0][0];
    const names = call.tools.map((t: any) => t.name);
    expect(names).toEqual(["list_events", "create_event"]);
  });

  it("has a system prompt with calendar instructions", () => {
    const call = mockCreateAgent.mock.calls[0][0];
    expect(call.systemPrompt).toContain("calendar assistant");
    expect(call.systemPrompt).toContain("list_events");
  });
});
