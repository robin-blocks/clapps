import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";

const CREDENTIALS_PATH = resolve(
  homedir(),
  ".openclaw",
  "clapps-credentials.json",
);

interface CredentialEntry {
  token: string;
  createdAt: string;
}

type CredentialsFile = Record<string, CredentialEntry>;

function credentialKey(relay: string, agentId: string): string {
  return `${relay}:${agentId}`;
}

function readCredentials(): CredentialsFile {
  try {
    const raw = readFileSync(CREDENTIALS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function loadToken(relay: string, agentId: string): string | null {
  const creds = readCredentials();
  const entry = creds[credentialKey(relay, agentId)];
  return entry?.token ?? null;
}

export function saveToken(relay: string, agentId: string, token: string): void {
  const creds = readCredentials();
  creds[credentialKey(relay, agentId)] = {
    token,
    createdAt: new Date().toISOString(),
  };
  mkdirSync(dirname(CREDENTIALS_PATH), { recursive: true });
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2) + "\n");
}

export { CREDENTIALS_PATH };
