// Invoked by Go with the actual embedded factories and their serialized data.
"use strict";
const {readFileSync} = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const {Bundle, Text} = JSON.parse(readFileSync(0, "utf8"));
const install = new vm.Script(Bundle.HubFactory).runInNewContext();
const createNative = new vm.Script(Bundle.NativeFactory).runInNewContext();
const native = createNative();
const origin = "https://127.0.0.1:12345";
const host = {isLocalHub: true, isMainFrame: true, origin, onModeChange: native.setMode};

// Exercise installation and event routing against an empty document. Real
// tree traversal and browser lifecycle are covered in the offline DOM suite.
const listeners = new Map();
const storage = new Map([["ag_zh_gui_mode", "en"]]);
const win = {
  document: {nodeType: 9}, location: {origin}, Element: class {},
  MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
  addEventListener(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  },
  removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
  localStorage: {getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v)},
  setTimeout() { return 1; }, clearTimeout() {}
};
win.top = win;
for (const bad of [{...host, isLocalHub: false}, {...host, isMainFrame: false}, {...host, origin: origin + "6"}]) {
  assert.equal(install(win, bad), null);
}
for (const foreign of ["https://example.invalid:12345", "http://127.0.0.1:12345", "https://127.0.0.1:70000"]) {
  win.location.origin = foreign;
  assert.equal(install(win, {...host, origin: foreign}), null);
}
win.location.origin = origin;
assert.equal(install({...win, top: win}, host), null);
assert.equal(listeners.size, 0);
assert.equal(native.label("context", "copy", "Copy"), Text);
const first = install(win, host);
assert.equal(native.getMode(), "en"); // persisted local preference wins at startup
const second = install(win, host);
assert.equal(listeners.get("keydown").size, 1);
assert.equal(listeners.get("storage").size, 1);
assert.equal(first.getMode(), "en");
const event = {key: "l", ctrlKey: true, shiftKey: true, preventDefault() {}, stopImmediatePropagation() {}};
for (const handler of listeners.get("keydown")) handler(event);
assert.equal(first.getMode(), "en");
assert.equal(second.getMode(), "zh");
assert.equal(native.getMode(), "zh");
assert.equal(native.label("context", "copy", "Copy"), Text);
assert.equal(native.label("context", "__proto__", "Copy"), "Copy");
second.dispose();
assert.equal(listeners.get("keydown").size, 0);
