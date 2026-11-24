(function createNativePresentation(options, refresh) {
  "use strict";
  options ??= {};
  // Only identifiers from known presentation sites in the Hub are eligible.
  // Host code supplies the original English templates on each rebuild.
  const updateSteps = ["Check for Updates", "Checking for Updates...", "Downloading Update...", "Restart to Update"];
  const labels = {
    application: {
      "check-for-updates": updateSteps,
      "hub-reset-zoom": ["Actual Size"], "hub-zoom-in": ["Zoom In"],
      "hub-zoom-in-equal": ["Zoom In"], "hub-zoom-out": ["Zoom Out"]
    },
    context: {
      "copy-selection": ["Copy"], "copy-link": ["Copy Link"], copy: ["Copy"],
      cut: ["Cut"], paste: ["Paste"], "copy-message": ["Copy Message"],
      "copy-agent-message": ["Copy"], rename: ["Rename"],
      "copy-image": ["Copy Image"], "copy-image-address": ["Copy Image Address"],
      "copy-link-address": ["Copy Link Address"], "select-all": ["Select All"],
      "open-image-in-new-tab": ["Open Image in New Tab"],
      "open-in-builtin-browser": ["Open in Built-in Browser"],
      "open-in-external-browser": ["Open in External Browser"],
      "open-in-new-tab": ["Open in New Tab"], "open-in-preview": ["Open in Side Panel"],
      "open-in-tab": ["Open in Tab"], "open-link-in-new-tab": ["Open Link in New Tab"],
      "open-link-in-external-browser": ["Open Link in External Browser"],
      back: ["Back"], forward: ["Forward"], reload: ["Reload"], stop: ["Stop"],
      archive: ["Archive"], restore: ["Restore"], share: ["Share"], "group-new": ["New Group"],
      "group-remove": ["Remove from Group"], delete: ["Delete", "Delete Permanently"],
      "reply-agent-message": ["Reply"], "undo-to-here": ["Undo to Here"],
      quote: ["Quote"], comment: ["Comment"], add: ["Add Shortcut"], edit: ["Edit Shortcut"],
      remove: ["Remove Shortcut"], reset: ["Reset to Default"], "feedback-bad": ["Bad Response"],
      "feedback-good": ["Good Response"], "move-up": ["Move Up"], "move-down": ["Move Down"],
      hide: ["Hide"], "view-debug": ["View Debug"]
    },
    sidecar: {
      "sidecar-action-view-logs": ["View Logs"], "sidecar-action-delete": ["Delete"],
      "sidecar-action-restart": ["Restart"], "sidecar-action-run-now": ["Run Now"],
      "sidecar-action-manage-permissions": ["Manage Permissions"]
    }
  };
  // The corresponding original items have no IDs. Use these keys only at the
  // fixed construction sites (never infer a key from a position or a label).
  const sites = {
    dockNewWindow: ["dock", "New Window"], trayOpen: ["tray", "Open Antigravity"],
    trayQuit: ["tray", "Quit"], fileNewWindow: ["application", "New Window"],
    helpDocs: ["application", "Docs"], fileMenu: ["application", "File"],
    viewMenu: ["application", "View"], helpMenu: ["application", "Help"],
    connectWSL: ["application", "Connect to WSL"], reopenLocally: ["application", "Reopen Locally"],
    missingBinaryTitle: ["application", "Binary not found"], wslSetupTitle: ["application", "WSL setup failed"],
    startupTitle: ["application", "Startup failed"],
    cannotOpenFolder: ["application", "Cannot open folder"],
    windowsFolderMsg: ["application", "Folder is on the Windows filesystem"],
    openWorkspace: ["application", "Open workspace"],
    openWorkspaces: ["application", "Open workspaces"],
    selectDownloadFolder: ["application", "Select Download Folder"],
    chooseSshConfig: ["application", "Choose an SSH config file"],
    connectionInfoMenu: ["application", "Connection info…"]
  };
  let mode = options.defaultLang === "en" ? "en" : "zh";

  function getEntry(table, key) {
    if (!table || !Object.hasOwn(table, key)) return undefined;
    const value = table[key];
    return typeof value === "string" && value.length ? value : undefined;
  }
  function translated(surface, en) {
    const global = getEntry(options.custom, en) ?? getEntry(options.exact, en);
    if (global !== undefined) return global;
    for (const group of options.scoped ?? []) {
      if (group.scope !== surface) continue;
      const match = getEntry(group.entries, en);
      if (match !== undefined) return match;
    }
    return undefined;
  }
  function label(surface, id, en) {
    if (mode !== "zh" || typeof en !== "string") return en;
    if (surface === "tray" && id === "running-agents") {
      const count = /^(?:No agents|1 agent|([2-9]|[1-9][0-9]+) agents) running$/.exec(en);
      if (!count) return en;
      const exact = translated(surface, en);
      if (exact !== undefined) return exact;
      const entry = options.templates?.find(item => item.id === "agentsRunning");
      if (typeof entry?.format !== "string" || !entry.format.includes("{n}")) return en;
      const digits = count[1] ?? (en.startsWith("No") ? "0" : "1");
      return entry.format.replaceAll("{n}", digits);
    }
    if (!Object.hasOwn(labels, surface) || !Object.hasOwn(labels[surface], id)) return en;
    if (!labels[surface][id].includes(en)) return en;
    return translated(surface, en) ?? en;
  }
  function siteLabel(key, en) {
    if (mode !== "zh" || !Object.hasOwn(sites, key)) return en;
    const [surface, expected] = sites[key];
    return en === expected ? translated(surface, en) ?? en : en;
  }

  // The caller supplies the known dialog construction site. Dynamic errors
  // and distro names in a message are preserved, including the button order.
  const dialogFields = {
    update: {title: "Check for Updates", message: "No updates available", buttons: ["OK"]},
    quit: {title: "Confirm Quit", message: "Are you sure you want to quit?",
      detail: "There may be agents or background tasks running.", buttons: ["Cancel", "Quit"]},
    missingWSL: {title: "WSL distro not found", detail: "Antigravity opened on Windows instead."},
    chooseAnotherSshConfig: {title: "Choose another SSH config file", buttons: ["Choose Another File…", "Cancel"]},
    stopSshServer: {title: "Stop SSH server", buttons: ["Stop Server", "Cancel"]},
    sshMicAccess: {title: "Microphone access", buttons: ["Allow", "Don't Allow"]},
    sshSignIn: {title: "Sign in", buttons: ["Sign In", "Cancel"]},
    sshPrompt: {buttonSets: [["Yes", "No"], ["Cancel"]]},
    deviceChooser: {title: "Connect a device", details: ["Select a device:", "No compatible devices found."], lastButton: "Cancel"},
    passkeyChooser: {title: "Choose a Passkey", detail: "Select a passkey account to continue:", lastButton: "Cancel"},
    connectionInfo: {title: "Connection info", buttons: ["OK"]}
  };
  function dialog(site, options) {
    if (mode !== "zh" || !options) return options;
    if (site === "sshSheet") {
      if (options.title === "Microphone access") site = "sshMicAccess";
      else if (options.title === "Sign in") site = "sshSignIn";
      else return options;
    }
    if (!Object.hasOwn(dialogFields, site)) return options;
    const rule = dialogFields[site];
    if (Object.hasOwn(rule, "title") && options.title !== rule.title) return options;
    const result = {...options};
    for (const key of ["title", "message", "detail"]) {
      if (Object.hasOwn(rule, key) && options[key] === rule[key]) {
        result[key] = translated("application", options[key]) ?? options[key];
      }
    }
    if (rule.details && rule.details.includes(options.detail)) {
      result.detail = translated("application", options.detail) ?? options.detail;
    }
    if (rule.buttons && Array.isArray(options.buttons) && rule.buttons.length === options.buttons.length &&
        rule.buttons.every((text, index) => text === options.buttons[index])) {
      result.buttons = rule.buttons.map(text => translated("application", text) ?? text);
    } else if (rule.buttonSets && Array.isArray(options.buttons)) {
      const matched = rule.buttonSets.find(set => set.length === options.buttons.length &&
        set.every((text, index) => text === options.buttons[index]));
      if (matched) result.buttons = matched.map(text => translated("application", text) ?? text);
    } else if (rule.lastButton && Array.isArray(options.buttons) && options.buttons.length > 0 &&
        options.buttons[options.buttons.length - 1] === rule.lastButton) {
      const next = options.buttons.slice();
      next[next.length - 1] = translated("application", rule.lastButton) ?? rule.lastButton;
      result.buttons = next;
    }
    return result;
  }

  function present(surface, canonical) {
    if (!Array.isArray(canonical) || mode === "en") return canonical;
    let changed = false;
    const result = canonical.map(item => {
      if (!item || typeof item !== "object") return item;
      const shown = label(surface, item.id, item.label);
      // Unknown submenus can contain plugin-owned commands or resource names.
      // Only descend through Electron's own application-menu containers.
      const isAppGroup = surface === "application" &&
        ["appmenu", "filemenu", "editmenu", "viewmenu", "windowmenu", "help"]
          .includes(typeof item.role === "string" ? item.role.toLowerCase() : "");
      const children = isAppGroup && Array.isArray(item.submenu) ? present(surface, item.submenu) : item.submenu;
      if (shown === item.label && children === item.submenu) return item;
      changed = true;
      const next = {...item};
      if (children !== item.submenu) next.submenu = children;
      if (shown !== item.label) {
        next.label = shown;
        // Electron's update action dispatches on its menu item's English label.
        // Bind the canonical step during each rebuild, even when two translated
        // steps have identical labels. Leave all other click callbacks intact.
        if (surface === "application" && item.id === "check-for-updates" && typeof item.click === "function") {
          const step = item.label;
          next.click = function(menuItem, ...args) {
            const actionItem = Object.create(menuItem, {label: {value: step}});
            return item.click.call(this, actionItem, ...args);
          };
        }
      }
      return next;
    });
    return changed ? result : canonical;
  }
  function wrapShowContextMenu(bridge) {
    const show = bridge.showContextMenu;
    return function(items) {
      return show.call(bridge, present("context", items));
    };
  }
  function setMode(value) {
    if ((value !== "zh" && value !== "en") || value === mode) return;
    mode = value;
    if (typeof refresh === "function") refresh(mode);
  }
  return {getMode: () => mode, setMode, label, siteLabel, dialog, present, wrapShowContextMenu};
})
