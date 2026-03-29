import "dotenv/config";
import { createServer } from "node:http";
import { execSync } from "node:child_process";
import { auth } from "../src/providers/gmail.ts";

const url = auth.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://mail.google.com/"],
});

const server = createServer(async (req, res) => {
  const code = new URL(req.url!, "http://localhost:3000").searchParams.get(
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
    console.log("Tokens saved to .tokens.json");
  } catch (err) {
    res.writeHead(500).end("Token exchange failed.");
    console.error(err);
  } finally {
    server.close();
  }
});

server.listen(3000, () => {
  console.log("Opening browser for Google authorization...\n");
  execSync(`start "" "${url}"`);
});
