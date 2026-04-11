import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt, isEncrypted, type EncryptedPayload } from "./crypto.ts";

const TEST_KEY = "a".repeat(64); // 64 hex chars

describe("crypto", () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
  });

  describe("encrypt / decrypt round-trip", () => {
    it("encrypts and decrypts a string", () => {
      const plaintext = JSON.stringify({ access_token: "abc123", refresh_token: "def456" });
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("produces different ciphertexts for the same input (random IV/salt)", () => {
      const plaintext = "hello";
      const a = encrypt(plaintext);
      const b = encrypt(plaintext);
      expect(a.data).not.toBe(b.data);
      expect(a.iv).not.toBe(b.iv);
    });

    it("fails decryption with wrong key", () => {
      const encrypted = encrypt("secret");
      process.env.TOKEN_ENCRYPTION_KEY = "b".repeat(64);
      expect(() => decrypt(encrypted)).toThrow();
    });

    it("fails decryption with tampered data", () => {
      const encrypted = encrypt("secret");
      encrypted.data = "00" + encrypted.data.slice(2);
      expect(() => decrypt(encrypted)).toThrow();
    });
  });

  describe("encrypt", () => {
    it("returns an EncryptedPayload with all fields", () => {
      const result = encrypt("test");
      expect(result.encrypted).toBe(true);
      expect(result.salt).toBeDefined();
      expect(result.iv).toBeDefined();
      expect(result.authTag).toBeDefined();
      expect(result.data).toBeDefined();
    });

    it("throws when TOKEN_ENCRYPTION_KEY is missing", () => {
      delete process.env.TOKEN_ENCRYPTION_KEY;
      expect(() => encrypt("test")).toThrow("TOKEN_ENCRYPTION_KEY");
    });
  });

  describe("isEncrypted", () => {
    it("returns true for encrypted payloads", () => {
      const payload = encrypt("test");
      expect(isEncrypted(payload)).toBe(true);
    });

    it("returns false for plain objects", () => {
      expect(isEncrypted({ access_token: "abc" })).toBe(false);
    });

    it("returns false for null", () => {
      expect(isEncrypted(null)).toBe(false);
    });

    it("returns false for strings", () => {
      expect(isEncrypted("hello")).toBe(false);
    });
  });
});
