// One shared line reader for all questions. Answers typed or pasted ahead of
// a question are queued, not lost.
const readline = require('readline');

let rl, queue = [], waiting = [], closed = false;

function open() {
  if (rl) return;
  rl = readline.createInterface({ input: process.stdin });
  rl.on('line', l => waiting.length ? waiting.shift()(l) : queue.push(l));
  rl.on('close', () => { closed = true; while (waiting.length) waiting.shift()(null); });
}

function q(prompt) {
  open();
  process.stdout.write(prompt);
  const echo = l => {
    if (l === null) throw new Error('Input ended before all questions were answered.');
    if (!process.stdin.isTTY) process.stdout.write(l + '\n');
    return l.trim();
  };
  if (queue.length) return Promise.resolve(echo(queue.shift()));
  if (closed) return Promise.reject(new Error('Input ended before all questions were answered.'));
  return new Promise((res, rej) => waiting.push(l => { try { res(echo(l)); } catch (e) { rej(e); } }));
}

function close() { if (rl) { rl.close(); rl = null; } }

module.exports = { q, close };
