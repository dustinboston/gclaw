import { describe, it, expect, vi, afterEach } from "vitest";

const { mockGetToken, mockSetCredentials, mockGenerateAuthUrl, mockOn } =
  vi.hoisted(() => ({
    mockGetToken: vi.fn(),
    mockSetCredentials: vi.fn(),
    mockGenerateAuthUrl: vi.fn().mockReturnValue("https://auth.example.com"),
    mockOn: vi.fn(),
  }));

const { mockServer } = vi.hoisted(() => ({
  mockServer: { listen: vi.fn(), close: vi.fn() },
}));

vi.mock("dotenv/config", () => ({}));
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class OAuth2 {
        generateAuthUrl = mockGenerateAuthUrl;
        getToken = mockGetToken;
        setCredentials = mockSetCredentials;
        on = mockOn;
      },
    },
    gmail: vi.fn().mockReturnValue({}),
  },
}));
vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));
const { mockExecSync } = vi.hoisted(() => ({ mockExecSync: vi.fn() }));
vi.mock("node:child_process", () => ({
  execSync: mockExecSync,
}));
vi.mock("node:http", () => ({
  createServer: vi.fn((fn: any) => {
    mockServer._callback = fn;
    return mockServer;
  }),
}));

await import("./authorize.ts");

function serverCallback(): (req: any, res: any) => Promise<void> {
  return (mockServer as any)._callback;
}

describe("authorize script", () => {
  it("starts listening on port 3000", () => {
    expect(mockServer.listen).toHaveBeenCalledWith(3000, expect.any(Function));
  });

  it("generates auth URL with correct scopes", () => {
    expect(mockGenerateAuthUrl).toHaveBeenCalledWith({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://mail.google.com/",
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/tasks",
      ],
    });
  });

  it("handles successful token exchange", async () => {
    const tokens = { access_token: "test" };
    mockGetToken.mockResolvedValue({ tokens });

    const res = {
      writeHead: vi.fn().mockReturnThis(),
      end: vi.fn(),
    };

    await serverCallback()({ url: "/?code=test_code" }, res);

    expect(mockGetToken).toHaveBeenCalledWith("test_code");
    expect(mockSetCredentials).toHaveBeenCalledWith(tokens);
    expect(res.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "text/html",
    });
  });

  it("handles missing code parameter", async () => {
    const res = {
      writeHead: vi.fn().mockReturnThis(),
      end: vi.fn(),
    };

    await serverCallback()({ url: "/" }, res);
    expect(res.writeHead).toHaveBeenCalledWith(400);
    expect(res.end).toHaveBeenCalledWith("Missing code parameter.");
  });

  it("handles token exchange failure", async () => {
    mockGetToken.mockRejectedValue(new Error("exchange failed"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = {
      writeHead: vi.fn().mockReturnThis(),
      end: vi.fn(),
    };

    await serverCallback()({ url: "/?code=bad" }, res);
    expect(res.writeHead).toHaveBeenCalledWith(500);
    expect(res.end).toHaveBeenCalledWith("Token exchange failed.");
    consoleSpy.mockRestore();
  });

  it("opens browser when server starts listening", () => {
    const listenCb = mockServer.listen.mock.calls[0][1];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    listenCb();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Opening browser"),
    );
    expect(mockExecSync).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
