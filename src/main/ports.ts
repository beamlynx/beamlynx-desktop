import { app } from 'electron';
import * as http from 'http';
import * as net from 'net';

// A dev build (`npm start`) uses its own ports, so it can run next to the
// installed app. The --mcp relay reads the same values, so a dev relay
// always talks to the dev app and an installed relay to the installed app.
export const PINE_PORT = app.isPackaged ? 33333 : 43333;
export const CONTROL_PLANE_PORT = app.isPackaged ? 33334 : 43334;

export function isPortInUse(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

function isPineServer(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/v1/connections', timeout: 1000 }, res => {
      let body = '';
      res.on('data', chunk => (body += chunk));
      res.on('end', () => {
        try {
          resolve(Boolean(JSON.parse(body)?.result?.version));
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

// What to tell the user when one of the ports is already taken. The usual
// cause is another copy of beamlynx, so say that rather than just "EADDRINUSE".
export async function describePortInUse(port: number): Promise<string> {
  if (port === CONTROL_PLANE_PORT) {
    return (
      'Another copy of beamlynx seems to be running already. Close it and open beamlynx again.\n\n' +
      `(beamlynx needs port ${port}, and something else is using it.)`
    );
  }
  if (await isPineServer(port)) {
    return (
      `A Pine server is already running on port ${port}. It is probably another copy of beamlynx, ` +
      'or a server you started yourself, for example with Docker. Close it and open beamlynx again.'
    );
  }
  return `Another program is using port ${port}, which beamlynx needs for its server. Close that program and open beamlynx again.`;
}
