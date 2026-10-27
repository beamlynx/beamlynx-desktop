// Reads an HTTP body as text, for both ends of the control plane: the
// server reading a request (control-plane-server.ts) and the --mcp relay
// reading a response (stdio-relay.ts). Kept free of Electron, so it can be
// tested on its own.
//
// The chunks are Buffers, joined before they are decoded. Decoding each one
// on its own (`data += chunk`) breaks a character whose bytes straddle two
// chunks: an "é" or a "→" in a result came out as two "�".
import type { Readable } from 'stream';

export class BodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Body larger than ${maxBytes} bytes`);
  }
}

/**
 * The whole body as UTF-8 text. Rejects with BodyTooLargeError, and stops
 * reading, once it passes `maxBytes`.
 */
export function readUtf8Body(stream: Readable, maxBytes = Infinity): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    stream.on('data', (chunk: Buffer | string) => {
      if (done) return;
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf-8') : chunk;
      size += buffer.length;
      if (size > maxBytes) {
        done = true;
        reject(new BodyTooLargeError(maxBytes));
        return;
      }
      chunks.push(buffer);
    });
    stream.on('end', () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });
    stream.on('error', err => {
      if (done) return;
      done = true;
      reject(err);
    });
  });
}
