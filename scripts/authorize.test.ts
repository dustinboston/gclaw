import { describe, it, expect, vi, afterEach } from "vitest";

const { mockGetToken, mockSetCredentials, mockGenerateAuthUrl, mockOn } =
  vi.hoisted(() => ({
    mockGetToken: vi.fn(),
    mockSetCredentials: vi.fn(),
    mockGenerateAuthUrl: vi.fn().mockReturnValue("https://auth.example.com"),
    mockOn: vi.fn(),
  }));

const { mockServer } = vi.hoisted(() => ({
  mockServer: { listen: vi.fn(), close: vi.fn(), _callback: undefined as any },
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

vi.mock("../src/crypto.ts", () => ({
  encrypt: vi.fn((plaintext: string) => ({ encrypted: true, data: plaintext })),
  decrypt: vi.fn((payload: any) => payload.data),
  isEncrypted: vi.fn(() => false),
}));

vi.mock("../src/retry.ts", () => ({
  withRetry: vi.fn((fn: () => any) => fn()),
}));

vi.mock("../src/logger.ts", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../src/config.ts", () => ({
  loadConfig: () => ({
    googleClientId: "test-id",
    googleClientSecret: "test-secret",
    oauthRedirectUrl: "http://localhost:3000",
    oauthPort: 3000,
    gmailMaxConcurrent: 2,
  }),
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

function serverCallback(): (req: any, res: any) => void {
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

    serverCallback()({ url: "/?code=test_code" }, res);
    await vi.waitFor(() => {
      expect(mockSetCredentials).toHaveBeenCalledWith(tokens);
    });

    expect(mockGetToken).toHaveBeenCalledWith("test_code");
    expect(res.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "text/html",
    });
  });

  it("handles missing code parameter", () => {
    const res = {
      writeHead: vi.fn().mockReturnThis(),
      end: vi.fn(),
    };

    serverCallback()({ url: "/" }, res);
    expect(res.writeHead).toHaveBeenCalledWith(400);
    expect(res.end).toHaveBeenCalledWith("Missing code parameter.");
  });

  it("handles token exchange failure", async () => {
    mockGetToken.mockRejectedValue(new Error("exchange failed"));

    const res = {
      writeHead: vi.fn().mockReturnThis(),
      end: vi.fn(),
    };

    serverCallback()({ url: "/?code=bad" }, res);
    await vi.waitFor(() => {
      expect(res.writeHead).toHaveBeenCalledWith(500);
    });
    expect(res.end).toHaveBeenCalledWith("Token exchange failed.");
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
