import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { homedir, hostname, platform, userInfo } from 'node:os';
import { join } from 'node:path';

const TOKEN_DIR = join(homedir(), '.dops');
const TOKEN_PATH = join(TOKEN_DIR, 'token');
const ALGORITHM = 'aes-256-gcm';
const MIN_PAYLOAD_BYTES = 33;

export interface StoredCredentials {
  sessionid: string;
  csrftoken: string;
}

function deriveKey(): Buffer {
  const salt = `dops-cli:${hostname()}:${userInfo().username}`;
  return scryptSync(salt, 'devops-cli-token-store', 32);
}

function encryptString(plaintext: string): string {
  if (!existsSync(TOKEN_DIR)) mkdirSync(TOKEN_DIR, { recursive: true });
  const key = deriveKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]);
  return payload.toString('base64');
}

function decryptString(base64: string): string | null {
  try {
    const raw = Buffer.from(base64, 'base64');
    if (raw.length < MIN_PAYLOAD_BYTES) return null;
    const iv = raw.subarray(0, 16);
    const authTag = raw.subarray(16, 32);
    const encrypted = raw.subarray(32);
    const key = deriveKey();
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export async function saveCredentials(creds: StoredCredentials): Promise<void> {
  const payload = encryptString(JSON.stringify(creds));
  writeFileSync(TOKEN_PATH, payload, 'utf-8');
  if (platform() !== 'win32') chmodSync(TOKEN_PATH, 0o600);
}

export async function getCredentials(): Promise<StoredCredentials | null> {
  if (!existsSync(TOKEN_PATH)) return null;
  const raw = readFileSync(TOKEN_PATH, 'utf-8');
  const plaintext = decryptString(raw);
  if (!plaintext) return null;
  try {
    const parsed = JSON.parse(plaintext);
    if (parsed.sessionid) return parsed as StoredCredentials;
    // Backward compat: plain token string stored before this change
    return { sessionid: plaintext, csrftoken: '' };
  } catch {
    return { sessionid: plaintext, csrftoken: '' };
  }
}

export async function deleteCredentials(): Promise<void> {
  if (existsSync(TOKEN_PATH)) unlinkSync(TOKEN_PATH);
}

// Legacy aliases used by other code
export const saveToken = (token: string) => saveCredentials({ sessionid: token, csrftoken: '' });
export const getToken = async () => (await getCredentials())?.sessionid ?? null;
export const deleteToken = deleteCredentials;
