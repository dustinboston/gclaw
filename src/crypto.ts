/**
 * AES-256-GCM encryption and decryption for persisting OAuth tokens to disk.
 * Keys are derived from `TOKEN_ENCRYPTION_KEY` via scrypt.
 *
 * @module
 */

import {Buffer} from 'node:buffer';
import {
	createCipheriv, createDecipheriv, randomBytes, scryptSync,
} from 'node:crypto';
import process from 'node:process';

const algorithm = 'aes-256-gcm';
const keyLength = 32;
const ivLength = 16;

function deriveKey(password: string, salt: Uint8Array): Uint8Array {
	return scryptSync(password, salt, keyLength);
}

function getPassword(): string {
	const password = process.env.TOKEN_ENCRYPTION_KEY;
	if (!password) {
		throw new Error('TOKEN_ENCRYPTION_KEY environment variable is required for token encryption. '
			+ 'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
	}

	return password;
}

/** JSON-serializable envelope containing the ciphertext and all values needed to decrypt. */
export type EncryptedPayload = {
	encrypted: true;
	salt: string;
	iv: string;
	authTag: string;
	data: string;
};

/** Encrypts a UTF-8 string and returns an {@link EncryptedPayload}. */
export function encrypt(plaintext: string): EncryptedPayload {
	const password = getPassword();
	const salt = randomBytes(16);
	const key = deriveKey(password, salt);
	const iv = randomBytes(ivLength);

	const cipher = createCipheriv(algorithm, key, iv);
	const encrypted = Buffer.concat([
		cipher.update(plaintext, 'utf8'),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();

	return {
		encrypted: true,
		salt: salt.toString('hex'),
		iv: iv.toString('hex'),
		authTag: authTag.toString('hex'),
		data: encrypted.toString('hex'),
	};
}

/** Decrypts an {@link EncryptedPayload} back to the original UTF-8 string. */
export function decrypt(payload: EncryptedPayload): string {
	const password = getPassword();
	const salt = Buffer.from(payload.salt, 'hex');
	const key = deriveKey(password, salt);
	const iv = Buffer.from(payload.iv, 'hex');
	const authTag = Buffer.from(payload.authTag, 'hex');
	const data = Buffer.from(payload.data, 'hex');

	const decipher = createDecipheriv(algorithm, key, iv);
	decipher.setAuthTag(authTag);
	const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
	return decrypted.toString('utf8');
}

/** Type guard that checks whether {@link data} is an {@link EncryptedPayload}. */
export function isEncrypted(data: unknown): data is EncryptedPayload {
	if (typeof data !== 'object' || data === null || !('encrypted' in data)) {
		return false;
	}

	return (data as EncryptedPayload).encrypted; // eslint-disable-line @typescript-eslint/no-unsafe-type-assertion
}
