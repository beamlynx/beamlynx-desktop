// Secrets this app makes fresh at each launch. Kept free of electron imports
// so the tests can require it in plain Node.
//
// Two servers run on this machine while the app is open: the bundled pine
// server (PINE_PORT) and the MCP control plane (CONTROL_PLANE_PORT). Both
// listen on loopback, which keeps the network out but not other programs on
// the machine, and not web pages in the person's browser. Each one requires
// its own token, so only this app and its own --mcp relay can use them.
//
// - The pine server's token goes to the server as PINE_TOKEN and to the UI
//   through the preload (--pine-server-token).
// - The control plane's token is written to control-plane.json in the data
//   directory, readable only by this user, where the --mcp relay (a
//   separate process started by an MCP client) reads it.
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export type ControlPlaneInfo = { port: number; token: string };

const FILE_NAME = 'control-plane.json';

export function controlPlaneInfoPath(dir: string): string {
  return path.join(dir, FILE_NAME);
}

export function writeControlPlaneInfo(dir: string, info: ControlPlaneInfo): void {
  fs.mkdirSync(dir, { recursive: true });
  const file = controlPlaneInfoPath(dir);
  // mode only applies when the file is created, so chmod an existing one too.
  fs.writeFileSync(file, JSON.stringify(info), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

export function readControlPlaneInfo(dir: string): ControlPlaneInfo | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(controlPlaneInfoPath(dir), 'utf8'));
    if (typeof parsed?.port === 'number' && typeof parsed?.token === 'string' && parsed.token) {
      return { port: parsed.port, token: parsed.token };
    }
    return null;
  } catch {
    return null;
  }
}

export function removeControlPlaneInfo(dir: string): void {
  fs.rmSync(controlPlaneInfoPath(dir), { force: true });
}

/**
 * Whether an `Authorization` header carries `token` as a bearer token.
 * Constant time, so the comparison doesn't leak how much of it matched.
 */
export function bearerMatches(header: string | string[] | undefined, token: string): boolean {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(token);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
