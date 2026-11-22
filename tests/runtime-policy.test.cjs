const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Regression checks for the fixed, reviewed JS resources packed by Go.
const restricted = [
  ['code execution', /\b(?:eval|Function|executeJavaScript|importScripts)\s*\(/],
  ['HTML injection', /\b(?:innerHTML|outerHTML|insertAdjacentHTML|createContextualFragment|setHTMLUnsafe|srcdoc)\b/],
  ['document stream writes', /\bdocument\s*\.\s*write(?:ln)?\b/],
  ['network API', /\b(?:fetch|XMLHttpRequest|WebSocket|WebTransport|EventSource|sendBeacon|RTCPeerConnection|importScripts)\s*\(/],
  ['module or host I/O', /\b(?:import|require)\s*\(/],
  ['network URL literal', /['"\x60]https?:\/\//i],
  ['string timer', /\bset(?:Timeout|Interval)\s*\(\s*['"\x60]/],
];

for (const name of ['ui_translator.js','main_hooks.js']) {
  test(name + ' follows the offline DOM and execution policy', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'runtime', name), 'utf8');
    for (const [rule, pattern] of restricted) assert.doesNotMatch(source, pattern, rule);
  });
}
