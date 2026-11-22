(function installTranslator(win, options) {
    "use strict";
    options ??= {};

    const installations = installTranslator.installations ??= new WeakMap();
    installations.get(win)?.dispose();
    const doc = win.document;
    const storageKey = "ag_zh_gui_mode";
    const mac = options.platform === "darwin" ||
        (!options.platform && /Mac/.test(win.navigator.platform));
    const validMode = value => value === "zh" || value === "en";
    let mode = options.defaultLang === "en" ? "en" : "zh";
    try {
        const saved = win.localStorage.getItem(storageKey);
        if (validMode(saved)) mode = saved;
    } catch { /* Storage may be unavailable in an isolated document. */ }

    // Only these leaf controls may inherit a translation scope. Panels, model
    // names, custom menu items and plugin rows can contain user-authored labels.
    const scopeById = new Map();
    const controls = {
        toolbar: [
            "new-conversation-button", "app-icon-new-conversation-button", "settings-button",
            "app-update-button", "manual-update-button", "open-editor-empty", "open-editor-single",
            "open-editor-multi", "plugins-button", "plugins-nav-more-button",
            "overview-panel-customize-trigger", "media-modal-zoom-out", "media-modal-zoom-in",
            "media-modal-zoom-reset", "media-modal-download", "media-modal-close", "media-modal-previous",
            "media-modal-next", "webview-prompt-cancel", "webview-prompt-ok"
        ],
        onboarding: [
            "onboarding-back", "onboarding-cancel-sign-in", "onboarding-switch-to-auth-code",
            "onboarding-auth-code-submit", "onboarding-copy-sign-in-link", "onboarding-last-used-badge",
            "onboarding-other-options-toggle", "post-onboarding-welcome-step-agents",
            "post-onboarding-welcome-step-plans", "post-onboarding-welcome-step-safety"
        ],
        workspace: [
            "customize-sidebar-button", "filter-sort-button", "filter-environment-all",
            "filter-mark-all-read", "group-by-submenu-trigger", "sort-by-submenu-trigger",
            "filter-submenu-trigger", "display-submenu-trigger", "view-option-auto-pin",
            "view-option-archived", "filter-option-scheduled", "filter-option-plugins",
            "palette-filter-unread", "palette-filter-archived", "palette-filter-scheduled",
            "conversations-palette-filter-trigger", "palette-sort-last_user_prompt", "conversation-kebab",
            "conversation-archive-button", "conversation-pin-button", "rename-conversation-submit",
            "confirm-delete-conversation", "project-selector-connect-ssh-host",
            "project-selector-connect-github", "project-selector-create-project-trigger",
            "project-selector-github-loading", "project-folder-selection-next", "empty-file-open-button",
            "file-tree-filter-error", "file-tree-filter-empty", "file-tree-filter-clear",
            "voice-dock-send"
        ],
        settings: [
            "open-vscode-keybindings-btn", "settings-upload-debug-bundle-button",
            "browser-clear-data-cancel", "browser-clear-data-confirm", "browser-site-data-loading",
            "browser-site-data-empty", "browser-site-data-error", "browser-clear-data-error",
            "builtin-browser-download-dir-change", "builtin-browser-download-dir-reset",
            "browser-site-data-manage-button", "wsl-reopen-locally", "setup-script-save-button",
            "setup-script-validate-button", "setup-script-copy-button", "voice-settings-change",
            "voice-settings-delete-recordings", "voice-delete-recordings-cancel",
            "voice-delete-recordings-confirm"
        ],
        permissions: [
            "inline-permission-badge", "permissions-advanced-toggle", "computer-permissions-relaunch",
            "computer-permissions-continue", "declared-permissions-arg-folder",
            "declared-permissions-next", "declared-permissions-confirm", "permissions-use-global-settings",
            "inline-permission-add-note", "inline-permission-deny",
            "inline-permission-unsandboxed-warning", "inline-permission-in-chat"
        ],
        model: [
            "model-selector-header", "model-selector-refresh", "model-selector-loading",
            "model-selector-empty", "model-selector-effort-header", "model-selector-effort-info",
            "model-quota-refreshing"
        ],
        agents: [
            "webview-download-agent-badge", "mcp-server-fix-with-agent", "mcp-server-configure",
            "mcp-server-restart", "mcp-server-paste-code-instead", "add-mcp-button", "mcp-config-confirm",
            "cancel-delete-mcp", "confirm-delete-mcp", "mcp-app-open-in-side-pane", "cancel-delete-skill",
            "confirm-delete-skill", "delete-skill-reinstall-note", "delete-skill-permanent-warning",
            "subagent-stop", "subagent-expand", "subagent-approve", "subagent-deny",
            "subagent-node-children-toggle", "subagent-tab-loading", "subagent-tab-ended",
            "subagent-tab-open-full-view", "new-coordinator-button", "create-coordinator-submit",
            "coordinator-settings-save", "marketplace-filter-button", "review-plugin-source-caution",
            "cancel-plugin-source-caution", "confirm-plugin-source-caution", "skills-rules-filter"
        ],
        sidecar: [
            "automation-untrusted-warning", "sidecar-action-delete", "sidecar-action-run-now",
            "sidecar-action-restart", "sidecar-action-manage-permissions", "sidecar-action-view-logs",
            "new-sidecar-back", "new-sidecar-submit", "new-sidecar-trigger-scheduled",
            "new-sidecar-remove-trigger", "new-sidecar-add-trigger", "sidecar-new-button",
            "cancel-delete-sidecar", "confirm-delete-sidecar", "sidecar-detail-close",
            "sidecar-detail-run-now", "new-sidecar-no-project", "automation-settings-save",
            "automation-settings-cancel"
        ]
    };
    for (const [scope, ids] of Object.entries(controls)) {
        for (const id of ids) scopeById.set(id, scope);
    }
    // Mixed panels also contain paths, user names or comments. Match just the
    // verified label within each panel. Dynamic attributes of these leaves
    // (for example a project tooltip) still belong to the client.
    const leafById = new Map();
    function fixedLeaf(scope, id, ...children) {
        const prefix = '[data-testid="' + id + '"] ';
        leafById.set(id, {scope, selector: children.map(child => prefix + child).join(",")});
    }
    fixedLeaf("toolbar", "overview-panel-row-review", "> span.agy-hover-label");
    fixedLeaf("toolbar", "overview-panel-row-files", "> span.agy-hover-label");
    fixedLeaf("toolbar", "overview-panel-row-terminal", "> span.agy-hover-label");
    fixedLeaf("toolbar", "overview-panel-row-plugins", "> span.agy-hover-label");
    fixedLeaf("onboarding", "onboarding-auth-code-panel", "> p:first-child", "> div > label[for=\"onboarding-auth-code-input\"]");
    fixedLeaf("onboarding", "post-onboarding-welcome-modal", "> p:first-child", "> div:last-child > button[data-autofocus=\"true\"]");
    fixedLeaf("workspace", "filter-last-activity", "> span:first-child");
    fixedLeaf("workspace", "filter-sort-by", "> span:first-child");
    fixedLeaf("workspace", "filter-environment", "> span:first-child");
    fixedLeaf("workspace", "artifact-update-notice", "> span:first-child", "> button[aria-label]");
    fixedLeaf("workspace", "comments-modal-section-artifact", "> h3:first-child");
    fixedLeaf("workspace", "artifact-pdf-fallback", "> span:first-child");
    fixedLeaf("workspace", "artifact-no-preview", "> span:first-child");
    fixedLeaf("workspace", "binary-file-no-preview", "> span:first-child");
    fixedLeaf("workspace", "aux-pane-terminals-section", "> span.agy-hover-label");
    fixedLeaf("workspace", "aux-pane-background-tasks-section", "> span.agy-hover-label");
    fixedLeaf("workspace", "running-items-tasks", "> div:first-child > span.agy-hover-label");
    fixedLeaf("workspace", "pane-selection-add-to-chat", "> span:first-child");
    fixedLeaf("workspace", "project-selector-new-workspace", "span.truncate.min-w-0[title]");
    fixedLeaf("settings", "settings-sidebar", "> div:first-child > div:first-child > h1:only-child");
    fixedLeaf("permissions", "command-permissions-row", "> div:first-child > div:first-child > span:first-child", "> div:first-child > span.whitespace-pre-wrap");
    fixedLeaf("permissions", "tool-permissions-row", "> div:first-child > div:first-child > span:first-child");
    fixedLeaf("permissions", "computer-permissions-card", "> div:first-child > span:first-child");
    fixedLeaf("model", "model-selector-orchestrator", "> span:first-child");
    fixedLeaf("agents", "workflow-deprecation-banner", "> div > span", "> div > span > button");
    // Some buttons interpolate a service name into their accessible label.
    // Authorize only fixed values on the element that owns the attribute.
    const controlAttributes = new Map();
    function attributeLabels(id, names, ...labels) {
        controlAttributes.set(id, {names: names.split(" "), labels});
    }
    attributeLabels("add-mcp-button", "aria-label", "Add MCP Server");
    attributeLabels("app-icon-new-conversation-button", "aria-label", "New Conversation");
    attributeLabels("artifact-update-notice", "aria-label", "Dismiss artifact update notice");
    attributeLabels("automation-untrusted-warning", "aria-label", "Untrusted sidecar");
    attributeLabels("conversation-archive-button", "aria-label", "Archive conversation");
    attributeLabels("conversation-kebab", "aria-label", "More options");
    attributeLabels("conversation-pin-button", "aria-label", "Unpin conversation", "Pin conversation");
    attributeLabels("conversations-palette-filter-trigger", "aria-label", "Sort and filter conversations");
    attributeLabels("customize-sidebar-button", "aria-label", "Customize Sidebar");
    controlAttributes.set("file-tree-filter-clear", {byName: {"aria-label": ["Clear file filter"], "title": ["Searching...", "Clear filter"]}});
    attributeLabels("filter-sort-button", "aria-label", "Filter and Sort");
    attributeLabels("marketplace-filter-button", "aria-label", "Filter plugins");
    attributeLabels("mcp-app-open-in-side-pane", "aria-label", "Open in side pane");
    attributeLabels("media-modal-close", "aria-label title", "Close (Esc)");
    attributeLabels("media-modal-download", "aria-label title", "Download video", "Download image");
    attributeLabels("media-modal-next", "aria-label title", "Next (→)", "Next");
    attributeLabels("media-modal-previous", "aria-label title", "Previous (←)", "Previous");
    attributeLabels("media-modal-zoom-in", "aria-label title", "Zoom in (+)");
    attributeLabels("media-modal-zoom-out", "aria-label title", "Zoom out (-)");
    attributeLabels("media-modal-zoom-reset", "title", "Reset zoom (0)");
    attributeLabels("new-coordinator-button", "aria-label", "New coordinator");
    attributeLabels("new-sidecar-remove-trigger", "aria-label", "Remove trigger");
    attributeLabels("onboarding-back", "aria-label title", "Back");
    attributeLabels("overview-panel-customize-trigger", "aria-label", "Customize Sections");
    attributeLabels("plugins-nav-more-button", "aria-label", "Plugins Options");
    attributeLabels("settings-upload-debug-bundle-button", "aria-label", "Upload Debug Bundle");
    attributeLabels("setup-script-copy-button", "aria-label title", "Copied", "Copy output");
    attributeLabels("sidecar-detail-close", "aria-label", "Close");
    attributeLabels("subagent-expand", "aria-label", "Collapse subagents", "Expand subagents");
    attributeLabels("subagent-stop", "aria-label", "Stop subagent");
    attributeLabels("voice-dock-send", "aria-label", "Send");
    function permittedAttribute(id, name, source) {
        if (id === "new-conversation-button") return true;
        if (id === "model-selector-effort-info") return name === "aria-label" && scoped.get("model")?.has(source);
        const rule = controlAttributes.get(id);
        return rule?.byName ? rule.byName[name]?.includes(source) :
            rule?.names.includes(name) && rule.labels.includes(source);
    }

    const fixedAlternatives = {
        "declared-permissions-confirm": ["Saving...", "Confirm & Save"],
        "mcp-config-confirm": ["Saving...", "Installing...", "Enabling..."]
    };
    const fixedScreens = new Set([
        "General", "Projects", "Agents", "Environments", "App", "Appearance", "Shortcuts",
        "Notifications", "Models", "Customizations", "Browser", "Developer", "Running"
    ]);
    const settingsItem = '[data-testid="settings-sidebar"] > div:first-child > div:nth-child(2) > div > button > span:only-child';
    const linkCaption = 'a[data-testid="new-conversation-button"][href] > span.truncate';
    const protectedArea = [
        "script", "style", "noscript", "pre", "code", "svg", "math", "canvas",
        "textarea", "iframe", "webview", "kbd", 'a[href]:not([data-testid="new-conversation-button"])',
        "[data-lexical-editor]", "[data-file-uri]", "[data-sidecar-url]",
        "[data-bubble-side]", "[data-quotable]", "[data-diff-type]", "[role=log]",
        ".monaco-editor", ".monaco-diff-editor", ".cm-editor", ".cm-mergeView",
        ".terminal", ".xterm", ".diff-view", ".google-symbols",
        ...["user-message", "user-message-content", "agent-response", "browser-subagent-thinking",
            "side-question-followup-thinking", "bottom-terminal-panel", "sidecar-iframe",
            "sidecar-iframe-slot", "sidecar-logs-content", "model-selector-custom-item",
            "model-selector-item"].map(id => '[data-testid="' + id + '"]')
    ].join(",");
    const attrs = ["placeholder", "title", "aria-label"];
    const patterns = {
        minutesAgo: /^(\d+) minutes? ago$/,
        hoursAgo: /^(\d+) hours? ago$/,
        itemCount: /^(\d+) items?$/,
        quotaRemaining: /^(\d+) requests? remaining$/,
        permissionCount: /^(\d+) permissions? required$/
    };

    function dictionary(data) {
        return new Map(Object.entries(data ?? {}).filter(([, value]) =>
            typeof value === "string" && value.length > 0));
    }
    const custom = dictionary(options.custom);
    const exact = dictionary(options.exact);
    const scoped = new Map();
    for (const item of options.scoped ?? []) {
        if (!item || !Object.hasOwn(controls, item.scope)) continue;
        if (!scoped.has(item.scope)) scoped.set(item.scope, new Map());
        for (const [key, value] of dictionary(item.entries)) scoped.get(item.scope).set(key, value);
    }
    const templates = (options.templates ?? []).filter(item =>
        item && Object.hasOwn(patterns, item.id) && typeof item.format === "string" &&
        item.format.includes("{n}"));
    function translate(source, scope, knownText) {
        const key = source.trim();
        // A filename can consist entirely of English words and match a custom
        // entry. Exact matches alone do not establish that a string is UI.
        if (!key || key === "Antigravity" || (/[\\/]/.test(key) && !(key === knownText && grantTerms.has(key))) ||
            /^(?:[a-z][\w+.-]*:(?=\S)|~|\.{1,2}$|\.[\w-])/i.test(key) ||
            /(?:^|\s)[^\s]+\.[a-z\d]{1,16}(?:$|\s)/i.test(key)) return source;
        let translated = custom.get(key) ?? exact.get(key) ?? scoped.get(scope)?.get(key);
        if (translated === undefined) {
            for (const {id, format} of templates) {
                const match = patterns[id].exec(key);
                if (match) {
                    translated = format.replaceAll("{n}", match[1]);
                    break;
                }
            }
        }
        if (translated === undefined) return source;
        const start = source.length - source.trimStart().length;
        return source.slice(0, start) + translated + source.slice(start + key.length);
    }

    const originalText = new WeakMap();
    const writtenText = new WeakMap();
    const originalAttrs = new WeakMap();
    const writtenAttrs = new WeakMap();
    // Weak ancestry marks allow protected transcripts to be pruned on first
    // scan. If a previously translated subtree moves there, its paths alone
    // need to be visited to restore our presentation.
    const touched = new WeakSet();
    const blocked = Symbol("blocked subtree");
    // Keep previously observed closed roots reachable by host on reinstall.
    // The weak key allows a detached host and its root to be collected together.
    const shadows = installTranslator.shadows ??= new WeakMap();
    const observed = new WeakSet();
    const pending = new Set();    // drained once per microtask
    let active = true;
    let queued = false;
    let toast = null;
    let fadeTimer, removeTimer;

    function parent(node) {
        return node.assignedSlot || node.parentElement || node.parentNode?.host || node.host || null;
    }
    function closedLightChild(node) {
        // assignedSlot is hidden for a slot inside a closed root. Even with a
        // handle to that root, a new render can rearrange its projection. Treat
        // every light child at this physical boundary as protected.
        return node.parentElement && shadows.get(node.parentElement)?.mode === "closed";
    }
    function markAncestors(node) {
        touched.add(node);
        // A slotted control has both a physical owner and a display location.
        for (let p = node.parentNode || node.host; p; p = p.parentNode || p.host) touched.add(p);
        for (let p = parent(node); p; p = parent(p)) touched.add(p);
    }
    function fixedInput(el) {
        return el?.localName === "input" && el.getAttribute("data-testid") === "new-sidecar-name";
    }
    function inProtectedSurface(el, skipInput) {
        return el.matches(protectedArea) || (el.localName === "input" && !skipInput) ||
            el === toast || el.isContentEditable ||
            (el.hasAttribute("contenteditable") && el.getAttribute("contenteditable").toLowerCase() !== "false");
    }
    // Settings subpages reuse their layout for arbitrary project or model
    // names. Check the component's own sibling card and its fixed UI copy.
    const settingsPage = ".settings-modal-container .max-w-2xl.gap-4";
    const pageTitle = ":scope > .mb-2 > .justify-between > .flex-1 > h2";
    const sectionTitle = ":scope > .gap-1 > .justify-between > .gap-1\\.5 > h3";
    const grantRow = ".agy-card > .gap-1 > .justify-between:first-child > div:first-child";
    const grantDescription = grantRow + " > span.whitespace-pre-wrap";
    const grantLabel = grantRow + " > div:first-child > span:first-child";
    const quotaMessage = ":scope > div:last-child > .agy-card > div.text-secondary-foreground:only-child";
    const quotaEmpty = "No quota information available.";
    const grantTerms = new Map([
        ["Allow/deny agent read access to specific files or directories.", "File reads"],
        ["Allow/deny agent write access to specific files or directories.", "File writes"],
        ["Allow/deny agent read access to specific URLs or domains.", "Read URLs"]
    ]);
    function sourceText(el) {
        if (!el || el.childNodes.length !== 1 || el.firstChild.nodeType !== 3) return;
        const node = el.firstChild;
        return writtenText.get(node) === node.nodeValue ? originalText.get(node) : node.nodeValue;
    }
    function settingsLabel(el) {
        if (!el.matches("h2,h3,span.whitespace-pre-wrap,div.text-secondary-foreground,div > span:first-child") ||
            sourceText(el) === undefined) return;
        const page = el.closest(settingsPage);
        if (!page) return;
        const title = page.querySelector(pageTitle);
        const body = page.querySelector(":scope > .gap-8:last-child");
        if (el === title || el.matches(grantDescription + "," + grantLabel)) {
            if (!body || (el !== title && !body.contains(el))) return;
            if (el === title && body.querySelector('[data-testid="command-permissions-row"]')) return "Tool Permissions";
            const descriptions = Array.from(body.querySelectorAll(grantDescription));
            const labels = descriptions.map(node => grantTerms.get(sourceText(node)));
            let expected;
            if (labels.includes("File reads") && labels.includes("File writes")) expected = "File Permissions";
            else if (labels.includes("Read URLs")) expected = "Network Permissions";
            if (el === title) return expected;
            if (!expected || sourceText(title) !== expected) return;
            const own = el.matches(grantDescription) ? el : el.parentElement.parentElement.querySelector(":scope > span.whitespace-pre-wrap");
            if (!descriptions.includes(own)) return;
            const description = sourceText(own);
            if (grantTerms.has(description)) return el === own ? description : grantTerms.get(description);
        } else if (el.matches("h3,div.text-secondary-foreground")) {
            const section = el.closest(".space-y-2");
            const heading = section?.querySelector(sectionTitle);
            if (!heading) return;
            const card = section.querySelector(":scope > div:last-child > .agy-card");
            if (el === heading && card?.querySelector(':scope > [data-testid="command-permissions-row"]')) return "Local Permissions";
            const message = section.querySelector(quotaMessage);
            if (sourceText(message) === quotaEmpty) {
                if (el === heading) return "Model Quota";
                if (el === message && sourceText(heading) === "Model Quota") return quotaEmpty;
            }
        }
    }
    function protectedOwner(owner) {
        for (let p = owner; p; p = parent(p)) {
            if (p.nodeType === 1 && (closedLightChild(p) || inProtectedSurface(p, false))) return true;
        }
        return false;
    }
    function context(element) {
        if (!element || !element.isConnected || element.ownerDocument !== doc) return blocked;
        let selected = false, scope, row = false, textOnly = false, knownText, attrOwner, alternatives;
        const input = fixedInput(element);
        knownText = settingsLabel(element);
        if (knownText) {
            selected = true;
            scope = knownText === "Model Quota" || knownText === quotaEmpty ? "model" : "permissions";
            textOnly = true;
        }
        for (let p = element; p; p = parent(p)) {
            if (p.nodeType !== 1) continue;
            if (closedLightChild(p) || inProtectedSurface(p, input && p === element)) return blocked;
            const id = p.getAttribute("data-testid");
            if (id === "sidecar-row" && p.hasAttribute("data-sidecar-id")) row = true;
            const leaf = leafById.get(id);
            if (!scope && leaf && element.matches(leaf.selector)) {
                scope = leaf.scope;
                textOnly = !(id === "artifact-update-notice" && element.localName === "button");
                if (!textOnly) attrOwner = id;
                selected = true;
            }
            if (!selected && (id || p.matches("button,select,[role=button],[role=menuitem]"))) {
                if (p.matches("a[href]")) {
                    if (element.matches(linkCaption)) { scope = "toolbar"; textOnly = true; }
                } else if (id?.startsWith("settings-nav-item-")) {
                    if (fixedScreens.has(id.slice("settings-nav-item-".length)) && element.matches(settingsItem)) {
                        scope = "settings";
                        textOnly = true;
                    }
                } else {
                    scope = scopeById.get(id);
                    if (scope && Object.hasOwn(fixedAlternatives, id)) alternatives = fixedAlternatives[id];
                    if (p === element) attrOwner = id;
                }
                selected = true;
            }
        }
        const brand = element.localName === "span" && element.childNodes.length === 1 &&
            element.firstChild.nodeType === 3 &&
            element.previousElementSibling?.getAttribute("data-testid") === "sidebar-header-logo";
        const errorBadge = row && element.matches("span[data-tooltip-id]");
        // A shared popup lives outside its control. The host sets aria-describedby
        // on its current owner and reuses the popup for unrelated, dynamic data.
        if (!scope && element.matches('.compact-tooltip[role="tooltip"][id], .compact-tooltip[role="tooltip"][id] > div > span:first-child')) {
            const hint = element.closest('[role="tooltip"]');
            const owners = Array.from(doc.querySelectorAll('[aria-describedby]')).filter(node =>
                node.getAttribute("aria-describedby").split(/\s+/).includes(hint.id));
            const owner = owners.length === 1 ? owners[0] : null;
            if (owner?.matches('button[data-testid="model-selector-trigger"], button[data-testid="model-selector-add-custom-model"], button[data-testid="mcp-server-fix-with-agent"]') && !protectedOwner(owner)) {
                const id = owner.getAttribute("data-testid");
                if (id === "model-selector-trigger" && element !== hint) {
                    scope = "model"; knownText = "Select Model";
                } else if (id === "model-selector-add-custom-model" && element === hint) {
                    scope = "model"; knownText = "Add Model";
                } else if (id === "mcp-server-fix-with-agent" && element === hint) {
                    scope = "agents"; knownText = "Ask the agent to diagnose and fix this server";
                }
                textOnly = true;
            }
        }
        return scope || errorBadge || brand || input ? {scope, errorBadge, brand, input, textOnly, knownText, attrOwner, alternatives} : null;
    }
    function forgetAttr(element, name) {
        for (const map of [originalAttrs, writtenAttrs]) {
            const record = map.get(element);
            if (record) delete record[name];
        }
    }
    function putAttr(map, element, name, value) {
        let record = map.get(element);
        if (!record) map.set(element, record = Object.create(null));
        record[name] = value;
    }

    function enqueue(node) {
        if (!node) return;
        pending.add(node);
        if (!queued && active) {
            queued = true;
            win.queueMicrotask(flush);
        }
    }
    function ingest(records) {
        // The popup can be reused without its English text changing. Recheck
        // each current popup once per mutation batch without traversing the
        // inserted chat messages to look for potential owners.
        if (records.some(r => r.type !== "characterData")) {
            for (const hint of doc.getElementsByClassName("compact-tooltip")) enqueue(hint);
        }
        const pages = new Set(), sections = new Set();
        for (const r of records) {
            const target = r.target.nodeType === 1 ? r.target : r.target.parentElement;
            const page = target?.closest(settingsPage);
            if (page) {
                pages.add(page);
                const section = target.closest(".space-y-2");
                if (section) sections.add(section);
            }
            if (target?.matches('[data-testid="settings-sidebar"] > div:first-child')) enqueue(target);
            if (r.type === "characterData") {
                // Even a same-value assignment from the host establishes a new
                // source value. Our own mutation records are removed at write time.
                originalText.delete(r.target);
                writtenText.delete(r.target);
                enqueue(r.target);
            } else if (r.type === "attributes") {
                if (attrs.includes(r.attributeName)) forgetAttr(r.target, r.attributeName);
                enqueue(r.target);
                if (r.attributeName === "slot" || r.attributeName === "name") enqueue(doc);
                if (r.attributeName === "data-testid") enqueue(r.target.nextElementSibling);
            } else {
                const root = r.target.getRootNode();
                for (const group of [r.addedNodes, r.removedNodes]) {
                    for (const n of group) {
                        // A detached container can be rearranged before its
                        // removal notification is delivered.
                        if (touched.has(n)) markAncestors(n);
                        enqueue(n);
                        if (root.host && (n.localName === "slot" || n.querySelector?.("slot"))) enqueue(root.host);
                    }
                }
                // A shell re-render can change the sibling relationship of the brand.
                enqueue(r.nextSibling);
                if (r.target.localName === "span" &&
                    r.target.previousElementSibling?.getAttribute("data-testid") === "sidebar-header-logo") {
                    enqueue(r.target);
                }
            }
        }
        for (const page of pages) {
            enqueue(page.querySelector(pageTitle));
            for (const label of page.querySelectorAll(grantDescription + "," + grantLabel)) enqueue(label);
        }
        for (const section of sections) {
            enqueue(section.querySelector(sectionTitle));
            enqueue(section.querySelector(quotaMessage));
        }
    }
    const observer = new win.MutationObserver(records => ingest(records));
    const watch = {
        subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: [...attrs, "class", "contenteditable", "role", "href", "slot", "name",
            "data-testid", "aria-describedby", "id", "data-lexical-editor", "data-file-uri", "data-diff-type", "data-sidecar-url",
            "data-bubble-side", "data-quotable", "data-sidecar-id", "data-tooltip-id"]
    };
    function ownWrite(node, name, value) {
        ingest(observer.takeRecords());
        if (name) node.setAttribute(name, value);
        else node.nodeValue = value;
        // Custom elements can react synchronously to setAttribute. Preserve
        // their mutations and consume only the first record for our write.
        let found = false;
        const external = observer.takeRecords().filter(r => {
            if (!found && r.target === node &&
                (name ? r.type === "attributes" && r.attributeName === name : r.type === "characterData")) {
                found = true;
                return false;
            }
            return true;
        });
        ingest(external);
    }
    function textNode(node, ctx) {
        const owned = originalText.has(node);
        if (!owned && (!ctx || mode === "en" || !active)) return;
        const current = node.nodeValue;
        const source = owned && writtenText.get(node) === current ? originalText.get(node) : current;
        let next = source;
        if (ctx && active && mode === "zh") {
            if (ctx.brand && options.brand === "hide" && source.trim() === "Antigravity") next = "";
            else if (ctx.scope && (!ctx.knownText || source.trim() === ctx.knownText) &&
                (!ctx.alternatives || ctx.alternatives.includes(source.trim()))) next = translate(source, ctx.scope, ctx.knownText);
        }
        if (next !== source) {
            if (!owned) markAncestors(node);
            originalText.set(node, source);
            writtenText.set(node, next);
        } else {
            originalText.delete(node);
            writtenText.delete(node);
        }
        if (current !== next) ownWrite(node, null, next);
    }
    function attributes(element, ctx) {
        if (!originalAttrs.has(element) && (!ctx || mode === "en" || !active)) return;
        for (const name of attrs) {
            const current = element.getAttribute(name);
            if (current === null) {
                forgetAttr(element, name);
                continue;
            }
            const original = originalAttrs.get(element)?.[name];
            const source = original !== undefined && writtenAttrs.get(element)?.[name] === current
                ? original : current;
            let next = source;
            if (active && mode === "zh" && ctx) {
                if (ctx.input) {
                    if ((name === "placeholder" && source === "Untitled") ||
                        (name === "aria-label" && source === "Name")) next = translate(source, "sidecar");
                } else if (ctx.scope && !ctx.textOnly && permittedAttribute(ctx.attrOwner, name, source)) {
                    next = translate(source, ctx.scope);
                }
                else if (ctx.errorBadge && name === "aria-label" && source === "Sidecar error") {
                    next = translate(source, "sidecar");
                }
            }
            if (next !== source) {
                if (original === undefined) markAncestors(element);
                putAttr(originalAttrs, element, name, source);
                putAttr(writtenAttrs, element, name, next);
            } else forgetAttr(element, name);
            if (current !== next) ownWrite(element, name, next);
        }
    }

    function observe(root) {
        if (!active || observed.has(root)) return;
        observer.observe(root, watch);
        observed.add(root);
    }
    function walk(start) {
        const stack = [start];
        const visited = new WeakSet();
        while (stack.length) {
            const node = stack.pop();
            if (visited.has(node)) continue;
            visited.add(node);
            if (node.nodeType === 3) {
                const ctx = closedLightChild(node) ? blocked : context(parent(node));
                textNode(node, ctx === blocked || ctx?.input ? null : ctx);
                continue;
            }
            if (node.nodeType === 1) {
                const ctx = context(node);
                if (ctx === blocked && !touched.has(node)) continue;
                attributes(node, ctx === blocked ? null : ctx);
                const shadow = node.shadowRoot || shadows.get(node);
                if (shadow) {
                    observe(shadow);
                    stack.push(shadow);
                }
                if (node.localName === "slot" && typeof node.assignedNodes === "function") {
                    for (const assigned of node.assignedNodes()) stack.push(assigned);
                }
            }
            for (let child = node.lastChild; child; child = child.previousSibling) stack.push(child);
        }
    }
    function flush() {
        queued = false;
        if (!active) return;
        ingest(observer.takeRecords());
        const batch = new Set(pending);
        pending.clear();
        for (const node of batch) {
            // Only omit a subtree that walk() will visit through its physical
            // parent. Slotted nodes are not physical children of their slots.
            let p = node.parentNode || node.host;
            while (p && !batch.has(p)) p = p.parentNode || p.host;
            if (!p) walk(node);
        }
    }

    const prototype = win.Element.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "attachShadow");
    const originalAttach = descriptor?.value;
    function attachShadow(...args) {
        const root = Reflect.apply(originalAttach, this, args);
        if (active && this.ownerDocument === doc) {
            shadows.set(this, root);
            observe(root);
            enqueue(this);
        }
        return root;
    }
    if (descriptor?.configurable && typeof originalAttach === "function") {
        Object.defineProperty(prototype, "attachShadow", {...descriptor, value: attachShadow});
    }

    // An isolated preload cannot patch a different world's Element prototype.
    // Looking up shadowRoot is read-only and also sees an open root attached
    // by that world without a mutation to the host's light DOM. Keep only weak
    // cursors between short slices and never descend into a protected subtree.
    const discovery = [];
    let cursor = null, discoveryTimer;
    function discover() {
        if (!active) return;
        if (mode === "en") {
            discovery.length = 0;
            cursor = null;
            discoveryTimer = win.setTimeout(discover, 600);
            return;
        }
        if (discovery.length === 0) discovery.push(new WeakRef(doc));
        const deadline = win.performance.now() + 5;
        let budget = 256;
        do {
            const root = discovery[discovery.length - 1].deref();
            if (!root || (root !== doc && !root.host.isConnected)) {
                discovery.pop();
                cursor = null;
                continue;
            }
            const walker = doc.createTreeWalker(root, win.NodeFilter.SHOW_ELEMENT, {
                acceptNode: el => inProtectedSurface(el, false)
                    ? win.NodeFilter.FILTER_REJECT : win.NodeFilter.FILTER_ACCEPT
            });
            const resume = cursor?.deref();
            if (resume && resume.getRootNode() === root) walker.currentNode = resume;
            let el;
            while (budget > 0 && win.performance.now() < deadline && (el = walker.nextNode())) {
                budget--;
                cursor = new WeakRef(el);
                const shadow = el.shadowRoot || shadows.get(el);
                if (shadow) {
                    if (!observed.has(shadow)) {
                        observe(shadow);
                        enqueue(shadow);
                    }
                    discovery.unshift(new WeakRef(shadow));
                }
            }
            if (budget <= 0 || win.performance.now() >= deadline) break;
            discovery.pop();
            cursor = null;
        } while (discovery.length);
        discoveryTimer = win.setTimeout(discover, discovery.length ? 125 : 600);
    }

    function removeToast() {
        win.clearTimeout(fadeTimer);
        win.clearTimeout(removeTimer);
        toast?.remove();
        toast = null;
    }
    function showToast() {
        removeToast();
        if (!doc.body) return;
        toast = doc.createElement("div");
        toast.setAttribute("role", "status");
        toast.textContent = mode === "en" ? "Switched to Original English" :
            "已切换为中文界面 (" + (mac ? "Cmd" : "Ctrl") + "+Shift+L 切回英文)";
        Object.assign(toast.style, {
            position: "fixed", right: "18px", bottom: "18px", zIndex: "2147483647",
            pointerEvents: "none", background: "#20242b", color: "#fff", padding: "8px 12px",
            borderRadius: "6px", font: "14px system-ui, sans-serif", transition: "opacity 200ms"
        });
        doc.body.appendChild(toast);
        fadeTimer = win.setTimeout(() => { if (toast) toast.style.opacity = "0"; }, 1300);
        removeTimer = win.setTimeout(removeToast, 1500);
    }
    function change(next, persist, feedback) {
        if (!active || !validMode(next) || next === mode) return;
        ingest(observer.takeRecords());
        mode = next;
        flush();
        walk(doc);
        if (persist) {
            try { win.localStorage.setItem(storageKey, mode); } catch { /* Mode still applies here. */ }
        }
        if (feedback) showToast();
        options.onModeChange?.(mode);
    }
    function onKey(event) {
        if (options.hotkey === false || event.isComposing || event.keyCode === 229 ||
            event.altKey || !event.shiftKey || event.key.toLowerCase() !== "l" ||
            (mac ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) change(mode === "zh" ? "en" : "zh", true, true);
    }
    function onStorage(event) {
        if (!event.isTrusted || event.key !== storageKey || !validMode(event.newValue)) return;
        try {
            if (event.storageArea === win.localStorage) change(event.newValue, false, false);
        } catch { /* An unavailable backing store cannot announce a preference. */ }
    }
    function dispose() {
        if (!active) return;
        ingest(observer.takeRecords());
        active = false;
        observer.disconnect();
        win.clearTimeout(discoveryTimer);
        discovery.length = 0;
        cursor = null;
        win.removeEventListener("keydown", onKey, true);
        win.removeEventListener("storage", onStorage);
        if (prototype.attachShadow === attachShadow) Object.defineProperty(prototype, "attachShadow", descriptor);
        removeToast();
        for (const node of pending) walk(node);
        pending.clear();
        walk(doc);
        installations.delete(win);
    }

    const api = {getMode: () => mode, setMode: value => change(value, true, true), dispose};
    installations.set(win, api);
    observe(doc);
    win.addEventListener("keydown", onKey, true);
    win.addEventListener("storage", onStorage);
    walk(doc);
    discoveryTimer = win.setTimeout(discover, 600);
    options.onModeChange?.(mode);
    return api;
})
