import "dotenv/config";
import { createServer } from "node:http";
import { execSync } from "node:child_process";
import { auth } from "../src/providers/gmail.ts";
import { logger } from "../src/logger.ts";
import { loadConfig } from "../src/config.ts";

const url = auth.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://mail.google.com/",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/tasks",
  ],
});

const config = loadConfig();

const server = createServer(async (req, res) => {
  const code = new URL(req.url!, config.oauthRedirectUrl).searchParams.get(
    "code",
  );
  if (!code) {
    res.writeHead(400).end("Missing code parameter.");
    return;
  }

  try {
    const { tokens } = await auth.getToken(code);
    auth.setCredentials(tokens);
    res
      .writeHead(200, { "Content-Type": "text/html" })
      .end("<h1>Authorized! You can close this tab.</h1>");
    logger.info("Tokens saved to .tokens.json (encrypted)");
  } catch (err) {
    res.writeHead(500).end("Token exchange failed.");
    logger.error({ err }, "Token exchange failed");
  } finally {
    server.close();
  }
});

server.listen(config.oauthPort, () => {
  logger.info("Opening browser for Google authorization");
  console.log("Opening browser for Google authorization...\n");
  execSync(`start "" "${url}"`);
});
