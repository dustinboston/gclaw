import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH);
}

function getPassword(): string {
  const password = process.env.TOKEN_ENCRYPTION_KEY;
  if (!password) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY environment variable is required for token encryption. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return password;
}

export interface EncryptedPayload {
  encrypted: true;
  salt: string;
  iv: string;
  authTag: string;
  data: string;
}

export function encrypt(plaintext: string): EncryptedPayload {
  const password = getPassword();
  const salt = randomBytes(16);
  const key = deriveKey(password, salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted: true,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    data: encrypted.toString("hex"),
  };
}

export function decrypt(payload: EncryptedPayload): string {
  const password = getPassword();
  const salt = Buffer.from(payload.salt, "hex");
  const key = deriveKey(password, salt);
  const iv = Buffer.from(payload.iv, "hex");
  const authTag = Buffer.from(payload.authTag, "hex");
  const data = Buffer.from(payload.data, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf-8");
}

export function isEncrypted(data: unknown): data is EncryptedPayload {
  return (
    typeof data === "object" &&
    data !== null &&
    "encrypted" in data &&
    (data as EncryptedPayload).encrypted === true
  );
}
