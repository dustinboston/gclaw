import { describe, it, expect, vi } from "vitest";

const { mockSetCredentials, mockOn } = vi.hoisted(() => ({
  mockSetCredentials: vi.fn(),
  mockOn: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class OAuth2 {
        setCredentials = mockSetCredentials;
        on = mockOn;
      },
    },
    gmail: vi.fn().mockReturnValue({ users: { messages: {} } }),
  },
}));

const { mockExistsSync, mockReadFileSync, mockWriteFileSync } = vi.hoisted(
  () => ({
    mockExistsSync: vi.fn().mockReturnValue(false),
    mockReadFileSync: vi.fn(),
    mockWriteFileSync: vi.fn(),
  }),
);

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}));

import { gmailRequest, auth, gmail } from "./gmail.ts";

describe("auth setup", () => {
  it("registers a token refresh handler", () => {
    expect(mockOn).toHaveBeenCalledWith("tokens", expect.any(Function));
  });

  it("exports auth and gmail", () => {
    expect(auth).toBeDefined();
    expect(gmail).toBeDefined();
  });
});

describe("token refresh handler", () => {
  it("merges new tokens with existing", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ refresh_token: "old" }),
    );
    const handler = mockOn.mock.calls.find((c: any) => c[0] === "tokens")![1];
    handler({ access_token: "new" });
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify({ refresh_token: "old", access_token: "new" }),
    );
  });

  it("writes new tokens when no existing file", () => {
    mockExistsSync.mockReturnValue(false);
    const handler = mockOn.mock.calls.find((c: any) => c[0] === "tokens")![1];
    handler({ access_token: "fresh" });
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify({ access_token: "fresh" }),
    );
  });
});

describe("gmailRequest", () => {
  it("executes the function and returns result", async () => {
    const result = await gmailRequest(() => Promise.resolve("data"));
    expect(result).toBe("data");
  });

  it("propagates errors", async () => {
    await expect(
      gmailRequest(() => Promise.reject(new Error("fail"))),
    ).rejects.toThrow("fail");
  });

  it("limits concurrency to 2", async () => {
    const order: string[] = [];
    const resolvers: Array<() => void> = [];

    const blocked = (id: string) => () =>
      new Promise<string>((resolve) => {
        order.push(`start-${id}`);
        resolvers.push(() => {
          order.push(`end-${id}`);
          resolve(id);
        });
      });

    const p1 = gmailRequest(blocked("1"));
    const p2 = gmailRequest(blocked("2"));
    const p3 = gmailRequest(blocked("3"));

    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual(["start-1", "start-2"]);

    resolvers[0]();
    await p1;
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual(["start-1", "start-2", "end-1", "start-3"]);

    resolvers[1]();
    resolvers[2]();
    await Promise.all([p2, p3]);
  });
});
