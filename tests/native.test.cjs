"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {test} = require("node:test");
const vm = require("node:vm");
const factory = new vm.Script(fs.readFileSync(path.join(__dirname, "../runtime/main_hooks.js"), "utf8"))
  .runInNewContext();

test("context menu wrapper preserves receiver, returned promise, selection ID and input", async () => {
  const selected = Promise.resolve("copy-message");
  const changes = [];
  const menu = factory({
    exact: {Copy: "复制"}, custom: {Copy: "拷贝"},
    scoped: [{scope: "context", entries: {"Copy Message": "复制消息"}}]
  }, mode => changes.push(mode));
  const untrusted = {id: "cmi-0", label: "Copy", submenu: [{id: "copy", label: "Copy"}]};
  const popup = Object.freeze([
    Object.freeze({id: "copy", label: "Copy", disabled: true, accelerator: "CmdOrCtrl+C"}),
    {id: "copy-message", label: "Copy Message"}, untrusted, {id: "copy", label: "/path/Copy"}
  ]);
  let received;
  const bridge = {
    showContextMenu(items) {
      assert.equal(this, bridge);
      received = items;
      return selected;
    }
  };
  const show = menu.wrapShowContextMenu(bridge);
  assert.equal(show(popup), selected);
  assert.equal((await selected), popup[1].id);
  assert.equal(received[0].label, "拷贝");
  assert.equal(received[0].id, "copy");
  assert.equal(received[0].disabled, true);
  assert.equal(received[0].accelerator, "CmdOrCtrl+C");
  assert.equal(received[1].label, "复制消息");
  assert.equal(received[2], untrusted);
  assert.equal(received[3], popup[3]);
  assert.equal(popup[0].label, "Copy");
  menu.setMode("not-a-language"); menu.setMode("en"); menu.setMode("en");
  assert.deepEqual(changes, ["en"]);
  assert.equal(show(popup), selected);
  assert.equal(received, popup);
  menu.setMode("zh");
  assert.deepEqual(changes, ["en", "zh"]);
  assert.equal(show(popup), selected);
  assert.equal(received[0].label, "拷贝");
});

test("native action uses the current canonical update step rather than a translated caption", () => {
  const menu = factory({scoped: [{scope: "application", entries: {
    "Check for Updates": "更新", "Restart to Update": "更新", "Zoom Out": "缩小"
  }}]});
  const win = {};
  const event = {};
  const owner = {action: "original receiver"};
  const zoom = () => {};
  for (const step of ["Check for Updates", "Restart to Update"]) {
    const update = {
      id: "check-for-updates", label: step, enabled: true,
      click(item, window, e) {
        assert.equal(this, owner);
        assert.equal(item.id, update.id);
        assert.equal(window, win);
        assert.equal(e, event);
        return item.label;
      }
    };
    const original = [{role: "appMenu", submenu: [update, {id: "hub-zoom-out", label: "Zoom Out", click: zoom}]}];
    const shown = menu.present("application", original)[0].submenu;
    assert.equal(shown[0].label, "更新");
    assert.equal(shown[0].click.call(owner, shown[0], win, event), step);
    assert.equal(shown[1].label, "缩小");
    assert.equal(shown[1].click, zoom);
    assert.equal(original[0].submenu[0].label, step);
    menu.setMode("en");
    assert.equal(menu.present("application", original), original);
    menu.setMode("zh");
  }
});

test("tray count, Dock and Sidecar translate only verified display fields", () => {
  const menu = factory({
    exact: {"New Window": "新建窗口", "Open Antigravity": "打开 Antigravity", Delete: "删除"},
    scoped: [{scope: "sidecar", entries: {"View Logs": "查看日志"}}],
    templates: [{id: "agentsRunning", format: "{n} 个助手运行中"}]
  });
  assert.equal(menu.label("tray", "running-agents", "No agents running"), "0 个助手运行中");
  assert.equal(menu.label("tray", "running-agents", "1 agent running"), "1 个助手运行中");
  assert.equal(menu.label("tray", "running-agents", "12 agents running"), "12 个助手运行中");
  assert.equal(menu.label("tray", "running-agents", "1 agents running"), "1 agents running");
  assert.equal(menu.siteLabel("dockNewWindow", "New Window"), "新建窗口");
  assert.equal(menu.siteLabel("trayOpen", "Open Antigravity"), "打开 Antigravity");
  assert.equal(menu.siteLabel("trayOpen", "Open a user file"), "Open a user file");
  assert.equal(menu.label("sidecar", "sidecar-action-view-logs", "View Logs"), "查看日志");
  assert.equal(menu.label("sidecar", "plugin-name", "Delete"), "Delete");
  assert.equal(menu.label("context", "__proto__", "Delete"), "Delete");
  menu.setMode("en");
  assert.equal(menu.siteLabel("dockNewWindow", "New Window"), "New Window");
  assert.equal(menu.label("tray", "running-agents", "4 agents running"), "4 agents running");
});

test("every shipped native entry has a fixed presentation site", () => {
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, "../locales/zh-CN/menus_dialogs.json"), "utf8"));
  const scopes = new Map();
  for (const e of source.scoped) {
    if (!scopes.has(e.scope)) scopes.set(e.scope, {});
    scopes.get(e.scope)[e.en] = e.zh;
  }
  const menu = factory({
    scoped: [...scopes].map(([scope, entries]) => ({scope, entries})),
    templates: source.templates.map(e => ({id: e.id, format: e.zh}))
  });
  // Feed real native IDs, including the two separate meanings of delete.
  const ids = ("copy-selection copy-link copy cut paste copy-message copy-agent-message rename " +
    "copy-image copy-image-address copy-link-address select-all open-image-in-new-tab open-in-builtin-browser " +
    "open-in-external-browser open-in-new-tab open-in-preview open-in-tab open-link-in-new-tab " +
    "open-link-in-external-browser back forward reload stop archive restore share group-new group-remove delete " +
    "reply-agent-message undo-to-here quote comment add edit remove reset feedback-bad feedback-good " +
    "move-up move-down hide view-debug").split(" ");
  const siteKeys = {
    application: ("fileNewWindow helpDocs fileMenu viewMenu helpMenu connectWSL reopenLocally " +
      "missingBinaryTitle wslSetupTitle startupTitle cannotOpenFolder windowsFolderMsg " +
      "openWorkspace openWorkspaces selectDownloadFolder chooseSshConfig connectionInfoMenu").split(" "),
    tray: ["trayOpen", "trayQuit"], dock: ["dockNewWindow"]
  };
  const appIDs = ["check-for-updates", "hub-reset-zoom", "hub-zoom-in", "hub-zoom-out"];
  const dialogs = [
    ["update", {title:"Check for Updates", message:"No updates available", buttons:["OK"]}],
    ["quit", {title:"Confirm Quit", message:"Are you sure you want to quit?",
      detail:"There may be agents or background tasks running.", buttons:["Cancel", "Quit"]}],
    ["missingWSL", {title:"WSL distro not found", detail:"Antigravity opened on Windows instead."}],
    ["chooseAnotherSshConfig", {title:"Choose another SSH config file", buttons:["Choose Another File…", "Cancel"]}],
    ["stopSshServer", {title:"Stop SSH server", buttons:["Stop Server", "Cancel"]}],
    ["sshSheet", {title:"Microphone access", buttons:["Allow", "Don't Allow"]}],
    ["sshSheet", {title:"Sign in", buttons:["Sign In", "Cancel"]}],
    ["sshPrompt", {buttons:["Yes", "No"]}],
    ["sshPrompt", {buttons:["Cancel"]}],
    ["deviceChooser", {title:"Connect a device", detail:"Select a device:", buttons:["USB Device", "Cancel"]}],
    ["deviceChooser", {title:"Connect a device", detail:"No compatible devices found.", buttons:["Cancel"]}],
    ["passkeyChooser", {title:"Choose a Passkey", detail:"Select a passkey account to continue:", buttons:["alice@example", "Cancel"]}],
    ["connectionInfo", {title:"Connection info", buttons:["OK"]}]
  ];
  for (const {scope, en, zh} of source.scoped) {
    const observed = [];
    if (scope === "context") {
      for (const id of ids) observed.push(menu.label(scope, id, en));
    } else {
      for (const key of siteKeys[scope]) observed.push(menu.siteLabel(key, en));
      if (scope === "application") {
        for (const id of appIDs) observed.push(menu.label(scope, id, en));
        for (const [site, fields] of dialogs) {
          const out = menu.dialog(site, fields);
          for (const field of ["title", "message", "detail"]) {
            if (fields[field] === en) observed.push(out[field]);
          }
          fields.buttons?.forEach((s, i) => { if (s === en) observed.push(out.buttons[i]); });
        }
      }
    }
    assert.ok(observed.includes(zh), "unreachable native entry: " + scope + "/" + en);
  }
  for (const entry of source.templates) {
    assert.equal(menu.label("tray", "running-agents", entry.en), entry.zh.replace("{n}", "0"));
  }
});
