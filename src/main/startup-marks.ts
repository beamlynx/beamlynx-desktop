// How long a launch takes, step by step. A dev build prints one line once the
// real UI has loaded, for example:
//
//   [startup] main.js 31ms, spawn 120ms, ready 190ms, server-ready (line) 1190ms, ui-load 1191ms, ui-loaded 1620ms
//
// Every time is in milliseconds since the process started (exec). Imported
// first in index.ts, so loading this file marks when the main script began.
// Kept free of electron imports so the tests can require it in plain Node.
import { performance } from 'perf_hooks';

const marks: [string, number][] = [];
let logged = false;

export function mark(name: string): void {
  marks.push([name, performance.now()]);
}

mark('main.js');

// Formats the marks recorded so far, in the order they happened.
export function describeMarks(): string {
  return [...marks]
    .sort((a, b) => a[1] - b[1])
    .map(([name, at]) => `${name} ${Math.round(at)}ms`)
    .join(', ');
}

// Prints the marks once per launch. `performance.timeOrigin` is the moment the
// process started, as wall-clock milliseconds, so an outside script can line
// the marks up with when it launched the app.
export function logStartupMarks(): void {
  if (logged) return;
  logged = true;
  console.log(`[startup] ${describeMarks()} (exec at ${Math.round(performance.timeOrigin)})`);
}
