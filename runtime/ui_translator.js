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

    // Layer 3: Ambiguous short words that must never translate in arbitrary prose;
    // they only apply inside an explicit scope or an interactive/status UI control.
    const ambiguousShort = new Set([
        "on", "in", "to", "by", "for", "run", "open", "file", "type", "use",
        "plan", "code", "new", "edit", "all", "add", "view", "back", "next",
        "done", "stop", "send", "copy", "save", "close", "delete", "reset",
        "search", "active"
    ]);

    // Known scoped controls from audited 2.34.0 Hub surfaces.
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
        ],
        "settings-detail": [],
        feedback: [],
        "marketplace-notice": [],
        controls: []
    };
    for (const [scope, ids] of Object.entries(controls)) {
        for (const id of ids) scopeById.set(id, scope);
    }

    // Mixed panels also contain user paths, file names or comments. Restrict
    // translation inside these containers to their verified display leaves.
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
    fixedLeaf("permissions", "computer-permissions-card", "> div:first-child > span:first-child");
    fixedLeaf("model", "model-selector-orchestrator", "> span:first-child");
    fixedLeaf("agents", "workflow-deprecation-banner", "> div > span", "> div > span > button");

    // Controls that can interpolate dynamic service/user names into attributes.
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
    attributeLabels("new-coordinator-button", "aria-label", "New coordinator", "New agent");
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
    const sidebarBody = '[data-testid="settings-sidebar"] > div:first-child';
    const sidebarHeading = sidebarBody + ' > div.px-4.mt-2 > h2:only-child';
    function sidebarLabel(el) {
        const text = sourceText(el);
        if (!text) return;
        if (el.matches(sidebarHeading) && ["Projects", "Not in Project"].includes(text)) return text;
        if (el.matches(sidebarBody + ' > div.flex-col > button[type="button"]:last-child') &&
            ["Show All", "Show Less"].includes(text) && groupTitle(el.parentElement) === "Projects") return text;
        if (el.matches(sidebarBody + ' > div.flex-col > div:only-child > button[data-testid="settings-nav-item-Conversations"] > span:only-child') &&
            text === "Conversations" && groupTitle(el.parentElement.parentElement.parentElement) === "Not in Project") return text;
        if (el.matches(sidebarBody + ' > div.flex-1 + div > button[data-testid="settings-nav-item-Provide Feedback"] > span:only-child') &&
            text === "Give Feedback") return text;
    }
    function groupTitle(group) {
        const title = group.previousElementSibling?.firstElementChild;
        if (title?.matches(sidebarHeading)) return sourceText(title);
    }
    const linkCaption = 'a[data-testid="new-conversation-button"][href] > span.truncate';
    const sidebarNav = '[data-testid="sidebar-navigation-items"]';
    function navigationLabel(link) {
        const caption = link.querySelector(":scope > span.truncate");
        const label = sourceText(caption);
        if (label === "Plugins" && link.matches('a[data-testid="plugins-button"]') && link.closest(sidebarNav)) return caption;
        if (label !== "Customizations" || !link.matches(sidebarNav + ' > a:not([data-testid])')) return;
        const icon = caption.previousElementSibling;
        // Hub can render the same HomeRepairServiceIcon as a plain SVG.
        if (icon?.matches('[data-symbol-name="home_repair_service"]') ||
            icon?.querySelector('[data-symbol-name="home_repair_service"], svg:not([data-symbol-name]) > path[d^="M480-405.39ZM100-180V-558.46"]')) return caption;
    }
    // FCb/lna remove the Hub's /web/<instance> base when they prepend the
    // embedding application's parentBaseUrl. Bind that base to the real frame.
    function embeddedRouteBase() {
        if (win.self === win.top) return;
        try {
            const raw = new URLSearchParams(win.location.search).get("parentBaseUrl");
            if (!raw) return;
            const base = new URL(raw);
            if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) return;
            if (base.origin === win.location.origin) return base;
            const parentOrigin = win.location.ancestorOrigins?.[0] || (doc.referrer && new URL(doc.referrer).origin);
            if (base.origin === parentOrigin) return base;
        } catch { /* No usable embedding base. */ }
    }
    const embeddingBase = embeddedRouteBase();
    const hubSearchKeys = new Set(["workspaceUri", "citcUsername", "citcAlias", "citcId"]);
    const detailRoute = /^\/customizations\/(?:plugins\/[^/]+|marketplaces\/[^/]+\/(?:plugins|skills)\/[^/]+)$/;
    function matchesHubRoute(link, expected) {
        const href = link.getAttribute("href");
        if (!href || !/^(?:\/(?!\/)|https?:\/\/)/i.test(href) || href.includes("\\")) return false;
        let url;
        try { url = new URL(link.href); } catch { return false; }
        if (url.username || url.password || url.hash) return false;
        for (const key of url.searchParams.keys()) {
            if (!hubSearchKeys.has(key) && !(expected === detailRoute && (key === "id" || key === "marketplace"))) return false;
        }
        const matches = path => typeof expected === "string" ? path === expected : expected.test(path);
        if (embeddingBase && url.origin === embeddingBase.origin) {
            const basePath = embeddingBase.pathname.replace(/\/+$/, "");
            if (url.pathname.startsWith(basePath + "/") && matches(url.pathname.slice(basePath.length))) return true;
        }
        if (url.origin !== win.location.origin) return false;
        let path = url.pathname;
        // Chromium can serialize a local file origin as "file://" instead of "null".
        if (url.origin === "null" || url.origin === "file://") {
            if (url.protocol !== "file:" || url.host || !href.startsWith("/")) return false;
            path = path.replace(/^\/[A-Za-z]:(?=\/)/, "");
        }
        return matches(path.replace(/^\/(?:jetski-devs\/)?web\/[^/]+(?=\/)/, ""));
    }
    const pluginTabs = 'nav[data-testid="plugins-tabs"]';
    const featuredActions = '[data-testid="featured-carousel"] [data-testid="featured-carousel-actions"]';
    function fixedRouteCaption(link) {
        if (link.localName !== "a" || !link.hasAttribute("href")) return null;
        if (link.closest(sidebarNav)) {
            const caption = navigationLabel(link);
            return caption && matchesHubRoute(link, "/customizations") ? caption : null;
        }
        if (link.parentElement?.matches(pluginTabs)) {
            const label = sourceText(link);
            const id = link.getAttribute("data-testid");
            if (label === "Marketplace" && (id === "plugins-tab-browse" || id === "plugins-tab-marketplace") &&
                matchesHubRoute(link, "/customizations")) return link;
            if (label === "Installed" && id === "plugins-tab-installed" &&
                matchesHubRoute(link, "/customizations/installed")) return link;
        }
        if (link.matches('a.agy-button[aria-label^="Details for "]') && link.parentElement?.matches(featuredActions) &&
            sourceText(link) === "Details" && matchesHubRoute(link, detailRoute)) return link;
        if (accountLink(link) || feedbackLegalLink(link.parentElement) === link) return link;
        return null;
    }
    const welcomePage = '[data-testid="onboarding-brand-shell"] > div.flex-shrink-0 > div.transition-all > div.justify-start';
    const authPanel = welcomePage + ' > div.entrance-auth-panel';
    const personalOptions = authPanel + ' > div.bg-card > #other-sign-in-options';
    const googleSignIn = "Continue with Google";
    const welcomeText = "Welcome to Antigravity!";
    const welcomeTemplate = 'Welcome to ${a}!';
    function welcomeLabel(el) {
        if (el.localName === "div" && el.matches(welcomePage + ' > div.entrance-title:first-child') &&
            el.childNodes.length === 1 && el.firstChild.nodeType === 3) return welcomeText;
        if (el.localName !== "button" || el.hasAttribute("data-testid")) return;
        if (el.matches(personalOptions + ' > button.shadow-sm:not([title])')) return "Use Business Account";
        if (el.matches(authPanel + ' > button.text-sm:not([title])')) return "Having trouble signing in?";
        if (el.matches([authPanel, authPanel + ' > div.bg-card', personalOptions]
            .map(parent => parent + ' > button.shadow-sm[title]').join(','))) {
            const title = el.getAttribute("title");
            const original = writtenAttrs.get(el)?.title === title ? originalAttrs.get(el)?.title : title;
            if (original === googleSignIn) return googleSignIn;
        }
    }

    const settingsPage = ".settings-modal-container .max-w-2xl.gap-4";
    const pageHeading = settingsPage + " > .mb-2 > .justify-between > .flex-1 > h2";
    const projectHeading = pageHeading + " > div.flex.items-center.gap-2.h-7";
    // CYb's token card is shared by Project, Workspace and Customizations settings.
    const tokenPanel = ':is([data-testid="project-customizations-content"],' + settingsPage + ') .py-2.px-3.w-full > div:only-child';
    const tokenGroups = tokenPanel + " > .mt-4 > .flex-col.gap-3 > .flex-col.gap-1:last-child";
    const tokenGroupRow = tokenGroups + " > .flex-col > .items-center.justify-between.text-sm";
    const tokenCategory = tokenGroupRow + " > .items-center.gap-2:first-child > span.text-secondary-foreground";
    const tokenCategoryNames = new Set(["Rules", "Skills", "MCP", "MCP Tools"]);
    const feedbackSection = settingsPage + " > .gap-8 > .space-y-2";
    const feedbackSender = feedbackSection + ' > label.leading-relaxed + div > label.leading-relaxed';
    const feedbackLegal = settingsPage + ' > .gap-8 > .space-y-3 > p.opacity-70:not(.italic)';
    // Layer 1: Strict red-line protected surfaces (highest priority — never translate).
    // Note: Expanded thinking content is protected via `[data-testid="thinking-collapsible-trigger"] ~ div`
    // and `[data-markdown-root]`, while the outer collapsible trigger button itself stays translatable.
    const responseShell = 'div[data-testid="agent-response"][data-quotable="true"]';
    const responseSteps = responseShell + ' > :is([data-step-list],[data-step-rows])';
    const stepTitle = 'div.group.select-none > div.gap-x-1 > .truncate > .shimmer-text-mask > .shimmer-text-content > div';
    const protectedArea = [
        "script", "style", "noscript", "pre", "code", "svg", "math", "canvas",
        "iframe", "webview", "kbd",
        "[data-lexical-editor]", "[data-file-uri]", "[data-sidecar-url]",
        "[data-bubble-side]", "[data-diff-type]", "[data-markdown-root]",
        "[role=log]", ".monaco-editor", ".monaco-diff-editor", ".cm-editor", ".cm-mergeView",
        ".terminal", ".xterm", ".diff-view", ".google-symbols", ".material-symbols-outlined", ".material-icons",
        '[data-testid="thinking-collapsible-trigger"] ~ div',
        '[data-testid="permission-download-details"] dd',
        projectHeading + ' > span.truncate.inline-block',
        projectHeading + ' > input[data-testid="inline-edit-input"]',
        tokenGroups + ' .min-w-0 > span.truncate',
        // Uploaded screenshot names are user data.
        feedbackSection + ' > input[type="file"] + div > span.truncate',
        // T4 renders the catalog's name (sometimes as a button) and highlighted description.
        '[data-testid="customization-card"] .font-medium.truncate',
        '[data-testid="customization-card"] .text-sm.text-muted-foreground.truncate',
        // Inactive dkd slides have no headline/description test IDs.
        '[data-testid="featured-carousel"] div[aria-hidden] > :is(h3,p)',
        stepTitle + ' > span.text-muted-foreground:first-child + span:is(.inline-flex,.text-ellipsis)',
        '.no-focus-agent-input[tabindex="-1"] > div:first-child > div.flex-col > p.leading-relaxed',
        '[data-testid="conversation-row-chat-icon"] ~ div',
        '[data-testid="conversation-pinned-icon"] ~ div',
        '[data-testid="conversation-scheduled-icon"] ~ div',
        '[data-testid="conversation-cloud-icon"] ~ div',
        '[data-testid="conversation-battle-icon"] ~ div',
        ...["user-message", "user-message-content",
            "planner-response-text", "progress-update-response-text",
            "side-question-followup-user", "voice-user-message", "voice-agent-message",
            "live-user-turn", "live-agent-turn", "pending-user-messages",
            "transcript-line-text", "voice-transcript-summary-lead", "voice-transcript-summary-point",
            "ask-question-option-hover-card",
            "permission-trigger-command", "permission-app-header", "subagent-permission-source",
            "browser-subagent-thinking", "side-question-followup-thinking",
            "thinking-content", "thought-content", "thinking-body",
            "automation-instructions-markdown", "automation-instructions-text", "automation-name",
            "comment-card-text", "pill-comment-anchor-text",
            "pdf-text-layer", "csv-file-viewer", "html-file-preview", "notebook-viewer", "lsp-hover-body",
            "file-title-name", "project-selector-item", "project-header", "project-selector-github-repo-item",
            "branch-option", "branch-pill-label", "branch-repo-label",
            "webview-download-filename", "webview-prompt-message", "webview-prompt-origin",
            "external-link-confirm-uri", "url-security-host", "browser-url-display",
            "ssh-host-label", "ssh-host-project-item", "ssh-config-file-name", "ssh-connect-host-option",
            "setup-script-output", "terminal-surface", "standalone-terminal-view", "terminal-tab-surface",
            "bottom-terminal-panel", "bottom-terminal-panel-active-shell",
            "sidecar-iframe", "sidecar-iframe-slot", "sidecar-logs-content",
            "model-selector-custom-item", "model-selector-item", "model-selector-orchestrator-model",
            "sidecar-model-option", "automation-model-value",
            "plugin-detail-footer-author", "plugin-detail-footer-version", "media-modal-title",
            "featured-carousel-headline", "featured-carousel-description", "featured-carousel-member-tile",
            "builtin-browser-download-dir-value",
            "conversation-row-draft", "conversation-title",
            "coordinator-card-title", "coordinator-chat-header"
        ].map(id => '[data-testid="' + id + '"]')
    ].join(",");

    const interactiveControlSelector = [
        "button", "summary", "legend", "label", "th", "option",
        '[role="button"]', '[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]',
        '[role="tab"]', '[role="option"]', '[role="switch"]', '[role="checkbox"]', '[role="radio"]',
        '[role="status"]', '[role="alert"]', '[role="tooltip"]'
    ].join(",");

    const attrs = ["placeholder", "title", "aria-label"];

    // Catalog-supplied template patterns (overridable via options.templates).
    const patterns = {
        minutesAgo: /^(\d+) minutes? ago$/,
        hoursAgo: /^(\d+) hours? ago$/,
        itemCount: /^(\d+) items?$/,
        quotaRemaining: /^(\d+) requests? remaining$/,
        permissionCount: /^(\d+) permissions? required$/,
        thoughtFor: /^Thought for ([^·]+)$/,
        thinkingFor: /^Thinking for ([^·]+)$/,
        workedFor: /^Worked for ([^·]+)$/,
        updatesCount: /^(\d+) updates?$/,
        showMore: /^Show (\d+) [Mm]ore(?:\.{3}|…)?$/,
        seeAll: /^See all \((\d+)\)$/,
        toolsEnabled: /^(\d+) tools? enabled$/,
        toolsExcluded: /^(\d+) tools? excluded$/,
        pluginsCount: /^(\d+) plugins?$/,
        draftsCount: /^(\d+) drafts?$/,
        referencesCount: /^(\d+) references?$/,
        hiddenHosts: /^(\d+) hidden hosts?$/,
        availableCredits: /^Available AI Credits:\s*([\d,]+)$/,
        resetsIn: /^Resets in (.+)$/,
        refreshesIn: /^Refreshes in (.+)$/,
        percentLeft: /^(\d+(?:\.\d+)?)% (?:left|remaining)$/,
        hourLimit: /^(\d+)-hour limit$/
    };

    function normalizeKey(text) {
        return text
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/\s+/g, " ")
            .trim();
    }
    function ellipsisAlt(text) {
        if (text.endsWith("...")) return text.slice(0, -3) + "…";
        if (text.endsWith("…")) return text.slice(0, -1) + "...";
        return null;
    }
    function buildMap(data) {
        const map = new Map();
        for (const [k, v] of Object.entries(data ?? {})) {
            if (typeof v !== "string" || !v.length) continue;
            map.set(k, v);
            const norm = normalizeKey(k);
            if (norm && !map.has(norm)) map.set(norm, v);
            const alt = ellipsisAlt(norm);
            if (alt && !map.has(alt)) map.set(alt, v);
        }
        return map;
    }
    const custom = buildMap(options.custom);
    const exact = buildMap(options.exact);
    // Secondary case-insensitive map strictly for multi-word exact phrases, so
    // Title Case (2.34.0) and Sentence case (2.35.0) UI captions both match cleanly.
    const exactCI = new Map();
    for (const [k, v] of exact) {
        if (!k.includes(" ")) continue;
        const low = k.toLowerCase();
        if (!exactCI.has(low)) exactCI.set(low, v);
    }
    const scoped = new Map();
    const commandDescriptions = new Map();
    const marketplaceShelves = new Map();
    for (const item of options.scoped ?? []) {
        if (item?.scope?.startsWith("marketplace-shelf/")) {
            marketplaceShelves.set(item.scope.slice("marketplace-shelf/".length), new Map(Object.entries(item.entries)));
            continue;
        }
        if (item?.scope?.startsWith("slash-command/")) {
            commandDescriptions.set(item.scope.slice("slash-command/".length), new Map(Object.entries(item.entries)));
            continue;
        }
        if (!item || !Object.hasOwn(controls, item.scope)) continue;
        if (!scoped.has(item.scope)) scoped.set(item.scope, new Map());
        const target = scoped.get(item.scope);
        for (const [k, v] of buildMap(item.entries)) {
            if (!target.has(k)) target.set(k, v);
        }
    }
    const templates = (options.templates ?? []).filter(item =>
        item && Object.hasOwn(patterns, item.id) && typeof item.format === "string" &&
        item.format.includes("{n}"));

    // Layer 4 dynamic template helpers
    function formatDuration(raw) {
        const s = raw.trim();
        if (s === "<1m" || s === "< 1m") return "不到 1 分钟";
        if (s === "<1s" || s === "< 1s") return "不到 1 秒";
        if (/^(\d+(?:\.\d+)?)\s*ms$/.test(s)) return s.replace(/^(\d+(?:\.\d+)?)\s*ms$/, "$1 毫秒");
        const parts = [];
        const tokenRe = /(\d+)\s*(days?|d|hours?|hrs?|hr|h|minutes?|mins?|min|m|seconds?|secs?|sec|s)\b/gi;
        let end = 0;
        let match;
        while ((match = tokenRe.exec(s)) !== null) {
            const separator = s.slice(end, match.index);
            if (parts.length ? !/^\s*(?:,\s*)?$/.test(separator) : separator !== "") return null;
            end = tokenRe.lastIndex;
            const n = match[1];
            const u = match[2].toLowerCase();
            if (u.startsWith("d")) parts.push(n + " 天");
            else if (u.startsWith("h")) parts.push(n + " 小时");
            else if (u.startsWith("m")) parts.push(n + " 分钟");
            else if (u.startsWith("s")) parts.push(n + " 秒");
        }
        if (parts.length && end === s.length) {
            return parts.join(" ");
        }
        return null;
    }

    const stepVerbMap = {
        exploring: "正在探索", explored: "已探索",
        editing: "正在编辑", edited: "已编辑",
        running: "正在运行", ran: "已运行",
        reading: "正在读取", read: "已读取",
        listing: "正在列出", listed: "已列出",
        searching: "正在搜索", searched: "已搜索",
        creating: "正在创建", created: "已创建",
        deleting: "正在删除", deleted: "已删除",
        updating: "正在更新", updated: "已更新",
        checking: "正在检查", checked: "已检查",
        executing: "正在执行", executed: "已执行",
        analyzing: "正在分析", analyzed: "已分析",
        reviewing: "正在审查", reviewed: "已审查",
        writing: "正在写入", wrote: "已写入",
        viewing: "正在查看", viewed: "已查看",
        fetching: "正在获取", fetched: "已获取",
        browsing: "正在浏览", browsed: "已浏览",
        planning: "正在规划", planned: "已规划",
        verifying: "正在验证", verified: "已验证",
        building: "正在构建", built: "已构建",
        testing: "正在测试", tested: "已测试"
    };
    const stepNounMap = {
        file: ["文件", "个文件"], files: ["文件", "个文件"],
        folder: ["文件夹", "个文件夹"], folders: ["文件夹", "个文件夹"],
        directory: ["目录", "个目录"], directories: ["目录", "个目录"],
        search: ["搜索", "次搜索"], searches: ["搜索", "次搜索"],
        command: ["命令", "条命令"], commands: ["命令", "条命令"],
        task: ["任务", "个任务"], tasks: ["任务", "个任务"],
        page: ["页面", "个页面"], pages: ["页面", "个页面"],
        browser: ["浏览器", "个浏览器"], browsers: ["浏览器", "个浏览器"],
        image: ["图片", "张图片"], images: ["图片", "张图片"],
        action: ["操作", "项操作"], actions: ["操作", "项操作"],
        artifact: ["生成文档", "份生成文档"], artifacts: ["生成文档", "份生成文档"],
        notebook: ["笔记本", "个笔记本"], notebooks: ["笔记本", "个笔记本"],
        tool: ["工具", "个工具"], tools: ["工具", "个工具"],
        step: ["步骤", "个步骤"], steps: ["步骤", "个步骤"],
        item: ["项", "项"], items: ["项", "项"],
        result: ["结果", "条结果"], results: ["结果", "条结果"],
        match: ["匹配", "处匹配"], matches: ["匹配", "处匹配"],
        plugin: ["插件", "个插件"], plugins: ["插件", "个插件"],
        draft: ["草稿", "份草稿"], drafts: ["草稿", "份草稿"],
        reference: ["引用", "处引用"], references: ["引用", "处引用"],
        skill: ["技能", "项技能"], skills: ["技能", "项技能"],
        rule: ["规则", "条规则"], rules: ["规则", "条规则"],
        conversation: ["对话", "段对话"], conversations: ["对话", "段对话"],
        agent: ["AI 助手", "个 AI 助手"], agents: ["AI 助手", "个 AI 助手"],
        subagent: ["子助手", "个子助手"], subagents: ["子助手", "个子助手"],
        host: ["主机", "台主机"], hosts: ["主机", "台主机"],
        change: ["更改", "处更改"], changes: ["更改", "处更改"],
        comment: ["评论", "条评论"], comments: ["评论", "条评论"],
        error: ["错误", "个错误"], errors: ["错误", "个错误"],
        warning: ["警告", "条警告"], warnings: ["警告", "条警告"],
        update: ["更新", "条更新"], updates: ["更新", "条更新"],
        model: ["模型", "个模型"], models: ["模型", "个模型"],
        workspace: ["工作目录", "个工作目录"], workspaces: ["工作目录", "个工作目录"],
        project: ["项目", "个项目"], projects: ["项目", "个项目"],
        server: ["服务", "个服务"], servers: ["服务", "个服务"],
        cookie: ["Cookie", "条 Cookie"], cookies: ["Cookie", "条 Cookie"],
        site: ["站点", "个站点"], sites: ["站点", "个站点"],
        trigger: ["触发器", "个触发器"], triggers: ["触发器", "个触发器"]
    };

    function isStepTarget(arg) {
        if (/^(["'`]).+\1$/.test(arg)) return true;
        if (!/\s/.test(arg) && /[./\\_-]/.test(arg) && arg.length <= 120) return true;
        return false;
    }

    const nonRoleMessagingTargets = new Set([
        "App", "Apps", "Platform", "Service", "Services", "System", "Settings", "Options",
        "Center", "Hub", "Channel", "Channels", "API", "SDK", "Client", "Tool", "Tools",
        "Support", "History", "Queue", "Feature", "Features", "Mode", "Guide", "Docs"
    ]);
    function isSubagentRoleTarget(arg) {
        if (!arg || arg.length > 48 || /[.!?,:;]$/.test(arg)) return false;
        if (!/^[A-Z][A-Za-z0-9_-]*(?:\s+[A-Z0-9][A-Za-z0-9_-]*){0,3}$/.test(arg)) return false;
        const words = arg.split(/\s+/);
        if (words.length === 1 && nonRoleMessagingTargets.has(words[0])) return false;
        if (words.some(w => nonRoleMessagingTargets.has(w))) return false;
        return true;
    }

    function translateStepClause(clause, index = 0) {
        const trimmed = clause.trim();
        let m = /^Failed to execute (.+)$/.exec(trimmed);
        if (m) {
            const noun = stepNounMap[m[1].toLowerCase()];
            return "执行" + (noun ? noun[0] : " " + m[1]) + "失败";
        }
        m = /^Ran command:\s*(.+)$/.exec(trimmed);
        if (m) return "已运行命令：" + m[1];
        if (index > 0) {
            m = /^(\d+)\s+([A-Za-z]+)$/.exec(trimmed);
            if (m) {
                const noun = stepNounMap[m[2].toLowerCase()];
                if (noun) return m[1] + " " + noun[1];
            }
        }
        m = /^([A-Za-z]+)(?:\s+(\d+))?\s+([A-Za-z]+)$/.exec(trimmed);
        if (m) {
            const verb = stepVerbMap[m[1].toLowerCase()];
            const noun = stepNounMap[m[3].toLowerCase()];
            if (verb && noun) {
                return m[2] ? verb + " " + m[2] + " " + noun[1] : verb + noun[0];
            }
        }
        m = /^(Editing|Reading|Listing|Searching|Running|Executing)\s+(.+)$/.exec(trimmed);
        if (m && isStepTarget(m[2])) {
            const verb = stepVerbMap[m[1].toLowerCase()];
            if (verb) return verb + " " + m[2];
        }
        const solo = stepVerbMap[trimmed.toLowerCase()];
        if (solo && /^[A-Z]/.test(trimmed)) return solo;
        return null;
    }

    const failedVerbMap = {
        load: "加载", save: "保存", delete: "删除", remove: "移除", create: "创建",
        update: "更新", open: "打开", close: "关闭", connect: "连接", fetch: "获取",
        start: "启动", stop: "停止", restart: "重启", install: "安装", uninstall: "卸载",
        enable: "启用", disable: "禁用", run: "运行", execute: "执行", copy: "复制",
        send: "发送", upload: "上传", download: "下载", sync: "同步", refresh: "刷新",
        rename: "重命名", clear: "清除", reset: "重置", parse: "解析", render: "渲染",
        search: "搜索", find: "查找", read: "读取", write: "写入", apply: "应用",
        commit: "提交", push: "推送", pull: "拉取", amend: "修改提交", clone: "克隆",
        authenticate: "身份验证", authorize: "授权", sign: "签名", validate: "校验",
        import: "导入", export: "导出", archive: "归档", restore: "还原", pin: "置顶",
        unpin: "取消置顶", switch: "切换", generate: "生成", migrate: "迁移"
    };

    function matchDynamicTemplate(key, ctx) {
        // 0. Explicit catalog templates first (for custom/configurable formats)
        for (const {id, format} of templates) {
            const match = patterns[id].exec(key);
            if (match) {
                let val = match[1];
                if (id === "thoughtFor" || id === "thinkingFor" || id === "workedFor" ||
                    id === "resetsIn" || id === "refreshesIn") {
                    const dur = formatDuration(val);
                    if (!dur) continue;
                    val = dur;
                }
                return format.replaceAll("{n}", val);
            }
        }

        // 1. Thinking & Working status bars
        if (key === "Thinking..." || key === "Thinking…") return "思考中…";
        if (key === "Thinking") return "思考中";
        if (key === "Thought Process") return "思考过程";
        if (key === "Working..." || key === "Working…") return "处理中…";
        if (key === "Working") return "处理中";
        if (key === "Worked") return "已完成处理";
        if (key === "Planning..." || key === "Planning…") return "规划中…";
        if (key === "Planning") return "规划中";

        let m = /^Worked for ([^·]+?)\s*·\s*(\d+) updates?$/.exec(key);
        if (m) {
            const dur = formatDuration(m[1]);
            if (dur) return "已处理 " + dur + " · " + m[2] + " 条更新";
        }
        m = /^(Thought|Thinking|Worked) for (.+)$/.exec(key);
        if (m) {
            const dur = formatDuration(m[2]);
            if (dur) {
                if (m[1] === "Thought") return "思考了 " + dur;
                if (m[1] === "Thinking") return "已思考 " + dur;
                return "已处理 " + dur;
            }
        }
        m = /^·\s*(\d+) updates?$/.exec(key);
        if (m) return "· " + m[1] + " 条更新";
        m = /^(\d+) updates?$/.exec(key);
        if (m) return m[1] + " 条更新";

        // 2. Steps & tool execution summaries
        m = /^Step (\d+) of (\d+)$/.exec(key);
        if (m) return "第 " + m[1] + " / " + m[2] + " 步";
        m = /^Turn (\d+) of (\d+)$/.exec(key);
        if (m) return "第 " + m[1] + " / " + m[2] + " 轮";
        m = /^Question (\d+) of (\d+)$/.exec(key);
        if (m) return "第 " + m[1] + " / " + m[2] + " 个问题";
        m = /^(Messaging|Messaged) (.+)$/.exec(key);
        if (m && isSubagentRoleTarget(m[2])) return (m[1] === "Messaging" ? "正在通知 " : "已通知 ") + m[2];

        if (/^(?:Exploring|Explored|Editing|Edited|Running|Ran|Reading|Listing|Searching|Executing|Executed|Failed to execute)\b/.test(key)) {
            if (key.includes(", ")) {
                const clauses = key.split(", ");
                const translated = clauses.map((clause, index) => translateStepClause(clause, index));
                if (translated.every(Boolean)) return translated.join("，");
            } else {
                const single = translateStepClause(key, 0);
                if (single) return single;
            }
        }

        // 3. In-chat permission approval options
        if (key === "Yes, allow") return "是，允许";
        if (key === "Yes, allow this time") return "是，本次允许";
        if (key === "Yes, allow this download") return "是，允许此次下载";
        if (key === "Yes, save rule in this conversation") return "是，在当前对话保存规则";
        if (key === "Yes, save rule globally") return "是，全局保存规则";
        if (key === "Requires manual confirmation.") return "需要手动确认。";

        m = /^Yes, always allow downloads from (.+)$/.exec(key);
        if (m) return "是，始终允许从 " + m[1] + " 下载";
        m = /^Yes, allow downloads from (.+)$/.exec(key);
        if (m) return "是，允许从 " + m[1] + " 下载";
        m = /^Yes, always allow (.+)$/.exec(key);
        if (m) return "是，始终允许 " + m[1];
        m = /^Yes, and always allow '(.+)'$/.exec(key);
        if (m) return "是，且始终允许“" + m[1] + "”";
        m = /^Yes, and always allow (.+)$/.exec(key);
        if (m) return "是，且始终允许 " + m[1];
        m = /^Yes, save rule for '(.+)' in this conversation$/.exec(key);
        if (m) return "是，在当前对话保存“" + m[1] + "”的规则";
        m = /^Yes, save rule for '(.+)' globally$/.exec(key);
        if (m) return "是，全局保存“" + m[1] + "”的规则";
        m = /^Yes, save rule for (.+)$/.exec(key);
        if (m) return "是，保存 " + m[1] + " 的规则";
        m = /^Yes, allow (.+)$/.exec(key);
        if (m) return "是，允许 " + m[1];
        m = /^Save rule to always allow (.+)\?$/.exec(key);
        if (m) return "保存规则以始终允许 " + m[1] + "？";
        m = /^Allow (.+)\?$/.exec(key);
        if (m) return "允许 " + m[1] + "？";
        m = /^Conflicts with "(.+)" \(press Enter to replace\)$/.exec(key);
        if (m) return "与“" + m[1] + "”冲突（按 Enter 替换）";
        m = /^Conflicts with "(.+)"$/.exec(key);
        if (m) return "与“" + m[1] + "”冲突";
        m = /^Conflicts with (.+)$/.exec(key);
        if (m) return "与 " + m[1] + " 冲突";
        m = /^Requires manual confirmation:\s*(.+)$/.exec(key);
        if (m) return "需要手动确认：" + m[1];

        // Group and bucket display names and descriptions arrive via retrieveUserQuotaSummary.
        // The Hub only exposes their rendering positions, so match the observed RPC text there.
        if (ctx?.scope === "settings-detail" && ctx.knownText === key) {
            if (quotaCopy.has(key)) return quotaCopy.get(key);
            m = /^You have used some of your (weekly|5-hour) limit, it will fully refresh in (.+)\.$/.exec(key);
            if (m) {
                const duration = formatDuration(m[2]);
                if (duration) return quotaPeriods[m[1]] + "额度已使用一部分，将在 " + duration + "后全部恢复。";
            }
            m = /^You have hit your (weekly|5-hour) limit, it refreshes in (.+)\. If on a supported paid plan, you can use AI credits in the interim or upgrade to a higher tier\.$/.exec(key);
            if (m) {
                const duration = formatDuration(m[2]);
                if (duration) return quotaPeriods[m[1]] + "额度已用尽，将在 " + duration +
                    "后恢复。如果你的付费方案支持 AI 积分，可在此期间使用积分，也可以升级到更高等级的方案。";
            }
            m = /^You have hit your (weekly|5-hour) limit, the (weekly|5-hour) limit does not currently apply\. Your \1 limit will fully refresh in (.+)\.$/.exec(key);
            if (m && m[1] !== m[2]) {
                const duration = formatDuration(m[3]);
                const period = quotaPeriods[m[1]];
                if (duration) return period + "额度已用尽，" + quotaPeriods[m[2]] + "额度限制暂不适用。" +
                    period + "额度将在 " + duration + "后全部恢复。";
            }
            if (key === "Manage Antigravity app settings.") return "管理 Antigravity 的应用设置。";
            if (key === "Learn more.") return "了解更多。";
        }
        // 4. Model quota, availability & relative time
        m = /^(Resets|Refreshes) in (.+)$/.exec(key);
        if (m) {
            const dur = formatDuration(m[2]);
            if (dur) return dur + (m[1] === "Resets" ? "后重置" : "后刷新");
        }
        m = /^(\d+)-hour limit$/.exec(key);
        if (m) return m[1] + " 小时限额";
        m = /^(\d+(?:\.\d+)?)% (?:left|remaining)$/.exec(key);
        if (m) return "剩余 " + m[1] + "%";
        m = /^Available AI Credits:\s*([\d,]+)$/.exec(key);
        if (m) return "可用 AI 额度：" + m[1];

        if (key === "just now" || key === "Just now") return "刚刚";
        m = /^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mos|month|months|y|yr|yrs|year|years) ago$/i.exec(key);
        if (m) {
            const u = m[2].toLowerCase();
            if (u === "mo" || u.startsWith("mon")) return m[1] + " 个月前";
            if (u.startsWith("s")) return m[1] + " 秒前";
            if (u.startsWith("m")) return m[1] + " 分钟前";
            if (u.startsWith("h")) return m[1] + " 小时前";
            if (u.startsWith("d")) return m[1] + " 天前";
            if (u.startsWith("w")) return m[1] + " 周前";
            if (u.startsWith("y")) return m[1] + " 年前";
        }
        m = /^(.+?) is (currently|now) available to (.+?)\.?$/.exec(key);
        if (m) return m[1] + (m[2] === "now" ? " 现已面向 " : " 当前面向 ") + m[3] + " 开放" + (key.endsWith(".") ? "。" : "");
        m = /^(.+?) will no longer be available (.+?) starting on (.+?)\.?$/.exec(key);
        if (m) return m[1] + " 将于 " + m[3] + " 起停止提供（" + m[2] + "）" + (key.endsWith(".") ? "。" : "");
        m = /^(.+?) will no longer be available starting on (.+?)\.?$/.exec(key);
        if (m) return m[1] + " 将于 " + m[2] + " 起停止提供" + (key.endsWith(".") ? "。" : "");

        // 5. Lists, plugins, hosts, counts & error prefixes
        m = /^Show (\d+) [Mm]ore(\.{3}|…)?$/.exec(key);
        if (m) return "再显示 " + m[1] + " 项" + (m[2] ? "…" : "");
        m = /^See all \((\d+)\)$/.exec(key);
        if (m) return "查看全部 (" + m[1] + ")";
        m = /^(\d+) tools? enabled$/.exec(key);
        if (m) return "已启用 " + m[1] + " 个工具";
        m = /^(\d+) tools? excluded$/.exec(key);
        if (m) return "已排除 " + m[1] + " 个工具";
        m = /^(\d+) hidden hosts?$/.exec(key);
        if (m) return m[1] + " 台隐藏主机";
        m = /^(\d+) requests? remaining$/.exec(key);
        if (m) return "剩余 " + m[1] + " 次请求";
        m = /^(\d+) permissions? required$/.exec(key);
        if (m) return "需要 " + m[1] + " 项权限";
        m = /^(\d+) (plugins?|drafts?|references?|items?|files?|folders?|matches|match|results?|errors?|warnings?|conversations?|changes?|comments?|rules?|skills?|agents?|subagents?|models?|workspaces?|projects?|servers?|sites?|triggers?)$/.exec(key);
        if (m) {
            const noun = stepNounMap[m[2].toLowerCase()];
            if (noun) return m[1] + " " + noun[1];
        }
        m = /^No ([a-z][a-z -]{1,24}) found for "(.+)"\.?$/.exec(key);
        if (m) {
            const kind = stepNounMap[m[1].trim().toLowerCase()]?.[0] ?? m[1].trim();
            return "未找到与“" + m[2] + "”匹配的" + kind + (key.endsWith(".") ? "。" : "");
        }
        m = /^(Failed to|Couldn't|Could not) ([a-z]+)(.*)$/.exec(key);
        if (m && failedVerbMap[m[2]]) {
            const verb = failedVerbMap[m[2]];
            const rest = m[3].trim();
            if (!rest) return (m[1] === "Failed to" ? verb + "失败" : "无法" + verb);
            const restExact = exact.get(rest);
            if (restExact) return (m[1] === "Failed to" ? verb + restExact + "失败" : "无法" + verb + restExact);
            return (m[1] === "Failed to" ? verb + "失败：" : "无法" + verb + "：") + rest;
        }
        return undefined;
    }

    const shortcutSuffixRe = /^(.+?)\s*\(((?:(?:Cmd|Ctrl|Alt|Opt|Option|Shift|Meta|Win|Super|⌘|⌃|⌥|⇧)\s*\+\s*)*(?:[A-Za-z0-9,./;'\[\]\\`\-=+]|Esc|Enter|Tab|Space|Backspace|Delete|Up|Down|Left|Right|←|→|↑|↓|Home|End|PageUp|PageDown|F\d{1,2}))\)$/;

    function looksLikeStandalonePathOrUrl(key) {
        if (/^(?:[a-z][\w+.-]*:(?=\S)|~|\.{1,2}$|\.[\w-])/i.test(key)) return true;
        if (/^[A-Za-z]:\\/.test(key) || /^\/[^\s]/.test(key)) return true;
        if (/^[^\s]+\.[a-z\d]{1,16}$/i.test(key)) return true;
        return false;
    }

    function looksLikePathOrUrl(key) {
        if (looksLikeStandalonePathOrUrl(key)) return true;
        if (/(?:^|\s)[^\s]+\.[a-z\d]{1,16}(?:$|\s)/i.test(key)) return true;
        return false;
    }

    function lookupDirect(key, scope, knownText, allowShort) {
        const norm = normalizeKey(key);
        const alt = ellipsisAlt(norm);
        const catalogKey = scope === "onboarding" && norm === welcomeText && knownText === welcomeText
            ? welcomeTemplate : norm;

        // 1. User custom dictionary (highest priority)
        let hit = custom.get(key) ?? custom.get(norm) ?? (alt ? custom.get(alt) : undefined);
        if (hit !== undefined) return hit;

        // 2. Exact dictionary (with Layer 3 ambiguous short-word guard)
        let exactHit = exact.get(key) ?? exact.get(norm) ?? (alt ? exact.get(alt) : undefined);
        if (exactHit === undefined && norm.includes(" ")) {
            const low = norm.toLowerCase();
            const altLow = alt ? alt.toLowerCase() : null;
            exactHit = exactCI.get(low) ?? (altLow ? exactCI.get(altLow) : undefined);
        }
        if (exactHit !== undefined) {
            if (!ambiguousShort.has(norm.toLowerCase()) || allowShort) return exactHit;
        }

        // 3. Explicit scope dictionary
        if (scope) {
            const sMap = scoped.get(scope);
            if (sMap) {
                hit = sMap.get(catalogKey) ?? sMap.get(key) ?? sMap.get(norm) ?? (alt ? sMap.get(alt) : undefined);
                if (hit !== undefined) return hit;
            }
        }

        // 4. Interactive/status controls scope (for ambiguous short words in buttons/menus/tabs/status)
        if (allowShort) {
            const cMap = scoped.get("controls");
            if (cMap) {
                hit = cMap.get(key) ?? cMap.get(norm) ?? (alt ? cMap.get(alt) : undefined);
                if (hit !== undefined) return hit;
            }
        }
        return undefined;
    }

    function translate(source, ctx) {
        const key = source.trim();
        if (!key || key === "Antigravity") return source;
        if (looksLikeStandalonePathOrUrl(key)) return source;
        const norm = normalizeKey(key);
        const scope = ctx?.scope;
        const knownText = ctx?.knownText;
        const allowShort = Boolean(scope || ctx?.control);

        // Protect URLs and file paths. Allow UI phrases containing "/" (like "Allow/deny ...")
        // only when they don't look like paths/URLs and have a direct catalog match.
        const hasPathToken = looksLikePathOrUrl(key);
        const hasSlash = /[\\/]/.test(key);

        let translated = lookupDirect(key, scope, knownText, allowShort);
        if (hasSlash && translated === undefined && !/^(?:Yes, |Allow |Save rule |Exploring |Explored |Editing |Edited |Running |Ran |Reading |Listing |Searching |Conflicts with |Requires manual confirmation:)/.test(norm)) {
            return source;
        }

        // Shortcut suffix splitting: e.g. "Copy (Cmd+C)" -> "复制 (Cmd+C)"
        if (translated === undefined && !hasSlash && !hasPathToken) {
            const sm = shortcutSuffixRe.exec(norm);
            if (sm) {
                const base = sm[1].trim();
                const baseHit = lookupDirect(base, scope, undefined, allowShort);
                if (baseHit !== undefined) translated = baseHit + " (" + sm[2] + ")";
            }
        }

        // Layer 4 dynamic templates (structured prefixes like "Yes, always allow github.com"
        // or "Reading config.go" safely preserve domain/filename arguments).
        if (translated === undefined) {
            translated = matchDynamicTemplate(norm, ctx);
        }

        if (translated === undefined) return source;
        const start = source.length - source.trimStart().length;
        return source.slice(0, start) + translated + source.slice(start + key.length);
    }

    const originalText = new WeakMap();
    const writtenText = new WeakMap();
    const originalAttrs = new WeakMap();
    const writtenAttrs = new WeakMap();
    const touched = new WeakSet();
    const blocked = Symbol("blocked subtree");
    const shadows = installTranslator.shadows ??= new WeakMap();
    const observed = new WeakSet();
    const pending = new Set();
    let active = true;
    let queued = false;
    let toast = null;
    let fadeTimer, removeTimer;

    function parent(node) {
        return node.assignedSlot || node.parentElement || node.parentNode?.host || node.host || null;
    }
    function closedLightChild(node) {
        return node.parentElement && shadows.get(node.parentElement)?.mode === "closed";
    }
    function markAncestors(node) {
        touched.add(node);
        for (let p = node.parentNode || node.host; p; p = p.parentNode || p.host) touched.add(p);
        for (let p = parent(node); p; p = parent(p)) touched.add(p);
    }
    function fixedInput(el) {
        return el?.localName === "input" && el.getAttribute("data-testid") === "new-sidecar-name";
    }
    function isInputOrTextarea(el) {
        return el?.localName === "input" || el?.localName === "textarea";
    }
    function inProtectedSurface(el, allowInputAttrs, stepOwner, caption = fixedRouteCaption(el)) {
        return el.matches(protectedArea) ||
            (el.localName === "span" && el.matches(tokenCategory) &&
                !(tokenCategoryNames.has(sourceText(el)) && el.nextElementSibling?.matches("span.tabular-nums"))) ||
            (el !== stepOwner && el.matches('[data-quotable],[data-testid="agent-response"]')) ||
            (el.matches('a[href]:not([data-testid="new-conversation-button"])') &&
                !caption && !permissionDocsLink(el)) ||
            (isInputOrTextarea(el) && !allowInputAttrs) ||
            el === toast || el.isContentEditable ||
            (el.hasAttribute("contenteditable") && el.getAttribute("contenteditable").toLowerCase() !== "false");
    }

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
    const permissionRows = new Map([
        ["tool-permissions-row", {title: "Tool permissions", descriptions: [
            "Modify permissions for file and terminal tools.", "Modify permissions for file, terminal, and MCP tools."
        ]}],
        ["command-permissions-row", {title: "Terminal commands", descriptions: ["Configure allowed terminal commands."]}]
    ]);
    function permissionRowContext(row, el) {
        const source = sourceText(el);
        if (!source) return null;
        const fields = permissionRows.get(row.getAttribute("data-testid"));
        let leaf;
        if (source === fields.title) leaf = ":scope > div:first-child > div:first-child > span:first-child";
        else if (fields.descriptions.includes(source)) leaf = ":scope > div:first-child > span.whitespace-pre-wrap";
        else if (source === "Open") leaf = ":scope > div.shrink-0 > button.agy-button";
        return leaf && el === row.querySelector(leaf) ? {scope: "permissions", knownText: source, textOnly: true} : null;
    }
    function sourceText(el) {
        if (!el || el.childNodes.length !== 1 || el.firstChild.nodeType !== 3) return;
        const node = el.firstChild;
        return writtenText.get(node) === node.nodeValue ? originalText.get(node) : node.nodeValue;
    }
    function rawTextValue(node) {
        return originalText.has(node) && writtenText.get(node) === node.nodeValue
            ? originalText.get(node) : node.nodeValue;
    }

    const feedbackRadio = '.gap-8 > .space-y-3 > .flex-col.gap-2 > label > input[type="radio"][name="feedbackType"]';
    const feedbackTypes = new Map([
        ["bug-report", "Bug Report"], ["feature-request", "Feature Request"],
        ["auth-and-billing", "Auth and Billing"], ["remote-control-issue", "Remote Control Issue"],
        ["general-feedback", "General Feedback"]
    ]);
    const generalFeedbackHint = "For any feedback that does not fit into the above categories.";
    const senderPrefix = "Send feedback as ";
    const legalSuffix = "to ask for content changes for legal reasons.";
    function feedbackLegalLink(paragraph) {
        if (!paragraph?.matches(feedbackLegal) || paragraph.childElementCount !== 1 ||
            sourceText(paragraph.closest(settingsPage).querySelector(pageTitle)) !== "Give Feedback") return;
        const link = paragraph.firstElementChild;
        if (!link.matches('a.text-link[target="_blank"][rel~="noopener"][rel~="noreferrer"]') ||
            link.protocol !== "https:" || link.host !== "support.google.com" ||
            link.href !== link.origin + "/legal/troubleshooter/1114905?hl=en#ts=1115658" ||
            link.getAttribute("href") !== link.href || sourceText(link) !== "Legal Help") return;
        // React renders the spaces as separate text nodes; a renderer may coalesce them.
        let before = "", after = "", seenLink = false;
        for (const child of paragraph.childNodes) {
            if (child === link) seenLink = true;
            else if (child.nodeType !== 3) return;
            else if (seenLink) after += rawTextValue(child);
            else before += rawTextValue(child);
        }
        if (before === "Visit " && after === " " + legalSuffix &&
            exact.has("Visit") && exact.has("Legal Help") && scoped.get("feedback")?.has(legalSuffix)) return link;
    }
    attributeLabels("feedback-description", "placeholder",
        "Describe the bug you encountered...", "Describe the feature you would like to see...",
        "Describe your auth or billing issue...", "Describe your Remote Control issue...", "Enter your feedback here...");
    function feedbackContext(el) {
        const page = el.closest(settingsPage);
        if (!page) return;
        const heading = page.querySelector(pageTitle);
        const sender = el.closest(feedbackSender);
        if (sender) {
            const logs = sender.parentElement.previousElementSibling.lastChild;
            const caption = sender.lastChild;
            if (sender !== el || sourceText(heading) !== "Give Feedback" ||
                logs?.nodeType !== 3 || rawTextValue(logs) !== "Attach Antigravity server logs" ||
                sender.childNodes.length !== 2 || caption.nodeType !== 3 ||
                !sender.querySelector(':scope > div.relative > input[type="checkbox"]')) return blocked;
            const source = rawTextValue(caption);
            const email = source.slice(senderPrefix.length);
            if (!source.startsWith(senderPrefix) || !/^[^@\s]+@[^@\s]+$/.test(email)) return blocked;
            const format = scoped.get("feedback")?.get(senderPrefix);
            return format ? {displayText: format.replace("{email}", () => email), textOnly: true} : blocked;
        }
        if (sourceText(heading) !== "Give Feedback") return;
        const legal = el.closest(feedbackLegal);
        if (legal) {
            const link = feedbackLegalLink(legal);
            if (!link) return blocked;
            if (el === legal) return {legalNotice: true, textOnly: true};
            if (el === link) return {scope: "feedback", knownText: "Legal Help", textOnly: true};
            return blocked;
        }
        if (el === heading && page.querySelector(":scope > " + feedbackRadio)) {
            return {scope: "settings", knownText: "Give Feedback", textOnly: true};
        }
        if (el.matches(feedbackRadio + " + span")) {
            const label = feedbackTypes.get(el.previousElementSibling.value);
            return label && sourceText(el) === label ? {scope: "feedback", knownText: label, textOnly: true} : null;
        }
        if (el.matches(feedbackSection + " > div.opacity-70.mb-2") && sourceText(el) === generalFeedbackHint) {
            return {scope: "feedback", knownText: generalFeedbackHint, textOnly: true};
        }
        if (el.matches(feedbackSection + " > .opacity-70.mb-2 + .relative > textarea")) {
            return {scope: "feedback", attrOwner: "feedback-description", isInput: true};
        }
    }

    const subscriptionSection = settingsPage + " > .gap-8 > .space-y-2";
    const subscriptionRow = " > div:last-child > .agy-card > div.justify-between.gap-4";
    const accountRow = subscriptionSection + subscriptionRow;
    const rowLabel = ":scope > .flex-1 > div:first-child > span:first-child";
    const rowDescription = ":scope > .flex-1 > span.whitespace-pre-wrap";
    const planLabel = rowLabel + " > div.font-medium:only-child";
    const telemetryCopy = 'When toggled on, ${f.product.nameShort} collects usage data to help Google enhance performance and features.';
    const emailCopy = 'Receive product updates, tips, and promotions from Google ${f.product.nameShort} via email.';
    const creditOveragesCopy = "When toggled on, ${g} will use your AI credits to fulfill model requests once you're out of model quota. ${g} will always use your model quota first before using AI credits.";
    const planCopy = 'Your plan: ${I}';
    // The upgrade sentence is supplied in userTier.upgradeSubscriptionText.
    const upgradeCopy = "You can upgrade to a {value} plan to receive higher rate limits.";
    function subscriptionPageName(el) {
        const heading = el.closest(settingsPage)?.querySelector(pageTitle);
        if (sourceText(heading) === "Account") return "Account";
        if (sourceText(heading?.querySelector(":scope > div > span:first-child")) === "Models & Usage") return "Models & Usage";
    }
    function currentPlanLabel(row, models) {
        const label = row?.querySelector(planLabel);
        // React appends a separate " (ADC)" text node for environment credentials.
        if (label?.firstChild?.nodeType !== 3) return;
        const original = rawTextValue(label.firstChild);
        if (models) {
            if (original === "Your plan: " && label.childNodes.length === 2 && label.lastChild.nodeType === 3) return label;
            return;
        }
        if (original === "Your plan" || original.startsWith("Your plan: ")) return label;
    }
    function accountLink(link) {
        if (link.protocol !== "https:" || link.username || link.password || link.hash || link.target !== "_blank" ||
            !link.relList.contains("noreferrer")) return false;
        const label = sourceText(link);
        if (label === "Terms of Service") {
            return link.host === "antigravity.google" && link.href === link.origin + "/terms" &&
                link.matches(settingsPage + " > .gap-8 > div.mt-auto.pt-4 > a.text-link") && subscriptionPageName(link) === "Account";
        }
        if (label !== "Upgrade" || !link.relList.contains("noopener") ||
            !link.matches(".shrink-0 > a.select-none.bg-primary")) return false;
        // DK adds this campaign to the subscription URI provided by the service.
        const row = link.parentElement.parentElement;
        if (!row?.matches(accountRow) || !["one.google.com", "antigravity.google"].includes(link.host)) return false;
        const page = subscriptionPageName(row);
        const models = page === "Models & Usage";
        const campaign = new URLSearchParams(link.search).getAll("utm_campaign");
        return (models || page === "Account") && sourceText(row.closest(".space-y-2").querySelector(sectionTitle)) === (models ? "Plan" : "Account") &&
            campaign.length === 1 && campaign[0] === (models ? "ARGON_MODELS_PAGE" : "ARGON_SETTINGS_PAGE") &&
            Boolean(currentPlanLabel(row, models));
    }
    function accountContext(el) {
        const desc = el.closest("span.whitespace-pre-wrap");
        const group = el.closest("div.font-medium");
        if (!desc && !group) return;
        const row = el.closest(accountRow);
        if (!row || (desc && desc !== row.querySelector(rowDescription))) return;
        const page = subscriptionPageName(row);
        const models = page === "Models & Usage";
        if (!models && page !== "Account") return;
        const section = sourceText(row.closest(".space-y-2").querySelector(sectionTitle));
        const label = sourceText(row.querySelector(rowLabel));
        if (models && section === "Model Credits" && el === desc && label === "Enable AI credit overages" &&
            row.querySelector(':scope > .shrink-0 > button[role="switch"]')) return {accountField: creditOveragesCopy, textOnly: true};
        if (!models && section === "General" && el === desc) {
            if (label === "Enable telemetry" && row.dataset.testid === "telemetry-setting-row") return {accountField: telemetryCopy, textOnly: true};
            if (label === "Marketing emails") return {accountField: emailCopy, textOnly: true};
        }
        if (section !== (models ? "Plan" : "Account")) return;
        if (desc && label === "Email" && sourceText(desc) !== "Managed by Enterprise Gateway") return blocked;
        const plan = currentPlanLabel(row, models);
        if (models && group && group === row.querySelector(planLabel) && el !== plan) return blocked;
        if (!plan) return;
        if (el === plan) return {accountField: planCopy, textOnly: true};
        if (desc && el !== desc) return blocked; // The nested span contains the literal project ID.
        if (el === desc && sourceText(desc) !== "Authenticated via Enterprise Gateway") return {accountField: upgradeCopy, textOnly: true};
    }
    function accountText(node, source, field) {
        if (field === planCopy) {
            if (node !== node.parentNode.firstChild) return source;
            if (source === "Your plan") return custom.get(source) ?? exact.get(source) ?? source;
            // Models renders the plan name as a separate Text sibling. Only write the prefix.
            if (source === "Your plan: " && node.nextSibling?.nodeType === 3) {
                return scoped.get("settings-detail")?.get(planCopy)?.replace("{value}", "") ?? source;
            }
        }
        const parts = field.split(/\$\{[\w.]+\}|\{value\}/);
        // dPb may append a second paragraph when telemetry is disabled by policy.
        const end = field === telemetryCopy ? source.indexOf("\n\nTelemetry is turned off for your account.") : -1;
        const line = end < 0 ? source : source.slice(0, end);
        // All slots refer to the same product in the overage copy. Reconstruct
        // the entire source before accepting it, including the second occurrence.
        const width = (line.length - parts.join("").length) / (parts.length - 1);
        const value = line.slice(parts[0].length, parts[0].length + width);
        if (!value || parts.join(value) !== line) return source;
        const format = field === upgradeCopy ? "升级到 {value} 方案可获得更高的用量上限。" : scoped.get("settings-detail")?.get(field);
        if (!format || !format.includes("{value}")) return source;
        const override = custom.get(line);
        const translated = override?.includes(value) ? override : format.replace("{value}", () => value);
        return translated + source.slice(line.length);
    }

    const questionForm = '.no-focus-agent-input[tabindex="-1"]';
    const permissionTitle = '[data-testid="ask-question-header-text"] > div > span[data-testid="permission-title"]';
    const permissionOption = 'label[data-testid="ask-question-option"] > div[data-testid="ask-question-option-text"]';
    const writeIn = 'textarea[data-testid="ask-question-writein"]';
    const writeInHint = "(tell the agent what to do instead)";
    const composerHint = "Ask anything, @ to mention";
    const actionsHint = ", / for actions";
    const composerOverlay = '[data-lexical-editor] + p.pointer-events-none.absolute.select-none';
    attributeLabels("ask-question-writein", "placeholder", writeInHint);

    // Ordinary questionnaires use the same header and option IDs. Only the
    // permission renderer supplies a permission-title inside its own header.
    function permissionForm(el) {
        const form = el.closest(questionForm);
        return form && form.querySelector(permissionTitle)?.closest(questionForm) === form;
    }
    const fixedPermissionOptions = new Set([
        "Yes, allow", "Yes, allow this time", "Yes, allow this download",
        "Yes, allow for this task", "Yes, allow for this conversation", "Yes, allow in this conversation",
        "Yes, always allow in this project", "Yes, always allow",
        "Yes, and always allow", "Yes, and always allow in this conversation",
        "Yes, save rule in this conversation", "Yes, save rule globally"
    ]);
    // Fzc renders the command/domain as an emphasized element surrounded by
    // literal Text siblings. Write only those literals, preserving all bytes
    // and DOM identity of the argument, even for commands named "Settings".
    const permissionFrames = [
        ["Yes, and always allow '", "' in this conversation", "是，在当前对话中始终允许“", "”"],
        ["Yes, and always allow '", "'", "是，始终允许“", "”"],
        ["Yes, save rule for '", "' in this conversation", "是，在当前对话中保存“", "”的规则"],
        ["Yes, save rule for '", "' globally", "是，在全局保存“", "”的规则"],
        ["Yes, allow downloads from ", " for this run", "是，本次允许从 ", " 下载"],
        ["Yes, allow downloads from ", " in this conversation", "是，在当前对话中允许从 ", " 下载"],
        ["Yes, allow ", " in this conversation", "是，在当前对话中允许 ", ""],
        ["Yes, always allow downloads from ", "", "是，始终允许以下来源的下载：", ""],
        ["Yes, always allow ", "", "是，始终允许 ", ""]
    ];
    function permissionText(node, source, kind) {
        const children = node.parentElement.childNodes;
        if (children.length === 1) {
            if (kind === "title") {
                const match = /^(Allow |Save rule to always allow )([\s\S]+)\?$/.exec(source);
                if (match) return (match[1] === "Allow " ? "允许 " : "保存规则以始终允许 ") + match[2] + "？";
            } else if (fixedPermissionOptions.has(source)) {
                return translate(source, {scope: "permissions"});
            } else {
                for (const [prefix, suffix, zhPrefix, zhSuffix] of permissionFrames) {
                    if (source.startsWith(prefix) && source.endsWith(suffix) && source.length > prefix.length + suffix.length) {
                        return zhPrefix + source.slice(prefix.length, source.length - suffix.length) + zhSuffix;
                    }
                }
            }
        } else if (kind === "option" && children[0].nodeType === 3 &&
            children[1]?.matches?.("strong,code") && (children.length === 2 ||
                (children.length === 3 && children[2].nodeType === 3))) {
            const start = rawTextValue(children[0]);
            const end = children.length === 3 ? rawTextValue(children[2]) : "";
            for (const [prefix, suffix, zhPrefix, zhSuffix] of permissionFrames) {
                if (start === prefix && end === suffix) return node === children[0] ? zhPrefix : zhSuffix;
            }
        }
        return source;
    }
    const quotaPeriods = {weekly: "每周", "5-hour": "5 小时"};
    const quotaCopy = new Map([
        ["Gemini Models", "Gemini 模型"], ["Claude and GPT models", "Claude 与 GPT 模型"],
        ["Weekly Limit Remaining", "每周剩余额度"], ["Five Hour Limit Remaining", "5 小时剩余额度"]
    ]);
    const quotaSection = settingsPage + " > .gap-8 > .gap-4 > .space-y-2";
    const quotaGroup = quotaSection + " > .gap-1 > .justify-between > div > h3 > div > span:first-child";
    const quotaRow = quotaSection + " > div:last-child > .agy-card > .justify-between";
    const quotaBucket = quotaRow + " > .flex-1 > div > span:first-child > span:only-child";
    const quotaDescription = quotaRow + " > .flex-1 > span.whitespace-pre-wrap";
    const layoutOption = '#project4kMode > :is([data-testid="mode-option-non-technical"],[data-testid="mode-option-developer"])';
    const layoutTitle = layoutOption + " > .mt-2 > span.font-medium";
    const layoutDescription = layoutOption + " > div[id].leading-snug";
    const layoutCopy = {
        "mode-option-non-technical": ["Knowledge Work", "Simplified interface for research, writing, and everyday tasks."],
        "mode-option-developer": ["Software Engineering", "Full interface for coding, developer tools, and managing agents."]
    };
    const queueButton = '[data-slot="toggle-group"] > button[data-tooltip-id]';

    function sourceAttribute(el, name) {
        const value = el.getAttribute(name);
        return writtenAttrs.get(el)?.[name] === value ? originalAttrs.get(el)?.[name] : value;
    }

    const noticeParagraph = 'p[data-testid="third-party-tools-disclaimer"]';
    const privacyToken = "{privacyPolicyLink}";
    function marketplaceNotice(el) {
        // V_c splits the server's marketplace string around a real link. aL
        // can return the anchor directly or wrap its context menu trigger in a span.
        if (!el.matches('footer[data-testid="marketplace-footer"] > ' + noticeParagraph)) return blocked;
        const text = el.firstChild;
        const wrapper = text?.nextSibling;
        if (text?.nodeType !== 3 || wrapper?.nodeType !== 1 || wrapper.nextSibling) return blocked;
        const link = wrapper.localName === "span" && wrapper.childNodes.length === 1 ? wrapper.firstChild : wrapper;
        if (!link.matches?.('a.text-link[target="_blank"][rel~="noopener"][rel~="noreferrer"]') ||
            link.protocol !== "https:" || link.host !== "policies.google.com" || link.href !== link.origin + "/privacy" ||
            link.getAttribute("href") !== link.href || sourceText(link) !== link.href) return blocked;
        const format = scoped.get("marketplace-notice")?.get(rawTextValue(text) + privacyToken);
        return format?.endsWith(privacyToken) ? {displayText: format.slice(0, -privacyToken.length), textOnly: true} : blocked;
    }

    const shelfHeader = 'section:not([data-testid]) > div.flex-col.gap-1.px-3:first-child';
    function shelfContext(el) {
        const section = el.matches('section:not([data-testid])') ? el : el.closest(shelfHeader)?.parentElement;
        if (!section) return;
        const header = section.firstElementChild;
        const name = sourceAttribute(section, "aria-label");
        // The reviewed server IDs use slugified English display names. React keeps
        // the ID as its key, so require both original fields from that exact ID.
        const entries = name && marketplaceShelves.get(name.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
        if (!header?.matches(shelfHeader)) return entries ? null : undefined;
        const heading = header.firstElementChild;
        const caption = heading?.nextElementSibling;
        if (!heading?.matches("h2") || !name || name !== sourceText(heading)) return null;
        if (el !== section && el !== heading && el !== caption) return null;
        const description = sourceText(caption);
        // hkd also renders three front-end-owned result headings with this layout.
        if (!caption && (name === "Plugins" || name === "Skills")) return;
        if (!caption?.matches("p:last-child")) return null;
        if (name === "More Plugins" && description === "Explore other marketplace customizations") return;
        if (name === description || !entries?.has(name) || !entries.has(description)) return null;
        return {shelfEntries: entries, shelfName: el === section ? name : undefined, textOnly: true};
    }

    function permissionDocsLink(el) {
        if (!el?.matches?.('#agent-permissions .space-y-2 > .gap-1 > .leading-relaxed > span > a.text-link.font-medium[target="_blank"][rel~="noopener"][rel~="noreferrer"]') ||
            !el.closest(settingsPage)) return false;
        const label = sourceText(el);
        return (label === "Learn more" || label === "Learn more.") &&
            el.protocol === "https:" && el.host === "antigravity.google" && el.pathname === "/docs/permissions" &&
            !el.username && !el.password && !el.search && !el.hash;
    }
    const projectSummary = 'Manage ${A.lowercase} ${Ea?"resources":"folders"} and settings.';
    const showBreakdown = 'Show ${A.length} breakdown${A.length===1?"":"s"}';
    function projectText(el) {
        const entries = scoped.get("settings-detail");
        if (el.localName === "div" && el.matches(pageHeading + " + div.text-muted-foreground")) {
            const title = el.previousElementSibling.firstElementChild;
            if (!title?.matches(projectHeading)) return;
            const source = sourceText(el);
            const match = /^Manage (project|workspace) (folders|resources) and settings\.$/.exec(source ?? "");
            if (!match) return;
            const editor = title.firstElementChild;
            const edit = editor?.nextElementSibling;
            if (!editor?.matches('input[data-testid="inline-edit-input"]') &&
                !(editor?.matches("span.truncate.inline-block") && edit?.localName === "button" &&
                    sourceAttribute(edit, "aria-label") === "Edit " + match[1] + " name")) return;
            return entries?.get(projectSummary)?.replace("{kind}", match[1] === "project" ? "项目" : "工作区")
                .replace("{resource}", match[2] === "folders" ? "文件夹" : "资源");
        }
        // zYb keeps the toggle beside the legend; expanded child rows follow their header.
        if (el.localName !== "button" || !el.matches(tokenGroupRow + " > button.agy-button-sm.text-link:last-child") ||
            !el.previousElementSibling?.matches(".items-center.gap-2:first-child") ||
            !el.previousElementSibling.querySelector(":scope > span.tabular-nums")) return;
        const source = sourceText(el);
        if (source === "Hide breakdown") return custom.get(source) ?? entries?.get(source);
        const count = /^Show (0|[1-9][0-9]*) breakdown(s?)$/.exec(source ?? "");
        if (count && (count[1] === "1") === (count[2] === "")) {
            return entries?.get(showBreakdown)?.replace("{n}", count[1]);
        }
    }

    function settingsDetail(el) {
        const page = el.closest(settingsPage);
        if (!page) return;
        const source = sourceText(el);
        if (source === "Plan" && el.localName === "h3") {
            const section = el.closest(subscriptionSection);
            if (el === section?.querySelector(sectionTitle) && subscriptionPageName(el) === "Models & Usage" &&
                currentPlanLabel(section.querySelector(":scope" + subscriptionRow), true)) return source;
        }
        const name = el.closest(quotaGroup + "," + quotaBucket);
        if (name || el.matches(quotaDescription)) {
            const title = page.querySelector(pageTitle + " > div > span:first-child");
            if (sourceText(title) !== "Models & Usage") return blocked;
            if (name) {
                if (el !== name) return blocked;
                if (el.matches(quotaGroup)) return source === "Gemini Models" || source === "Claude and GPT models" ? source : blocked;
                return source === "Weekly Limit Remaining" || source === "Five Hour Limit Remaining" ? source : blocked;
            }
            if (source?.startsWith("You have used some of your ") || source?.startsWith("You have hit your ")) return source;
        }
        const option = el.closest(layoutOption);
        if (option) {
            const [title, description] = layoutCopy[option.getAttribute("data-testid")];
            if (el === option) return title;
            if (el.matches(layoutTitle) && source === title || el.matches(layoutDescription) && source === description) return source;
        }
        if (source === "Queue" && el.matches(queueButton) &&
            sourceAttribute(el, "aria-label") === "Queue until after the current turn.") return source;
        if (source === "Manage Antigravity app settings." && el.matches(".mb-2 > .justify-between > .flex-1 > h2 + div.text-muted-foreground") &&
            sourceText(el.previousElementSibling) === "Application") return source;
        if (permissionDocsLink(el)) return source;
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
            if (p.nodeType === 1 && (closedLightChild(p) || inProtectedSurface(p, false) ||
                p.matches('[data-testid="ask-question-header-text"],[data-testid="ask-question-option-text"]'))) return true;
        }
        return false;
    }

    // Hub uses the same option component for /commands, @mentions, plugins and files.
    const mentionOption = '[data-mention-menu][role="listbox"] > div > div[role="option"]';
    // System commands use the icon from the server registry. The unlabelled
    // SVGs are the Hub's CodeBlocksIcon (built-in skills) and ChatAddOnIcon (/btw).
    const systemIcons = {
        goal: "timer", compact: "collapse_all", schedule: "schedule", plan: "ballot",
        browser: "language", computer: "computer", "browser-vision": "visibility",
        "grill-me": "forum", teamwork: "graph_2", learn: "lightbulb_2", boost: "bolt",
        deepagent: "science", "review-agent": "find_in_page", automation: "schedule",
        "mcp-app-development": "handyman", swarm: "hub"
    };
    function hasCommandIcon(name, label) {
        const icon = label.previousElementSibling?.firstElementChild;
        if (!icon) return false;
        if (name === "swarm" && icon.matches('img.rounded.object-contain[alt=""]')) return true;
        if (Object.hasOwn(systemIcons, name)) return icon.getAttribute("data-symbol-name") === systemIcons[name];
        const path = icon.querySelector(":scope > path")?.getAttribute("d");
        return icon.localName === "svg" && Boolean(path?.startsWith(name === "btw" ?
            "M130-184.23V-757.69q0-29.83" : "M384-349.85l42.15-42.77"));
    }
    function commandText(node, option) {
        const description = node.parentElement.closest('span[data-testid="menu-option-description"]');
        if (!description || description.parentElement.parentElement !== option) return;
        if (description.dir === "rtl" && description.firstElementChild?.dir !== "ltr") return;
        const label = description.previousElementSibling;
        if (!label?.matches('span[data-testid="menu-option-label"]') ||
            description.nextElementSibling || description.parentElement.hasAttribute("data-hover-option-key")) return;
        const entries = commandDescriptions.get(label.textContent);
        if (!entries || !hasCommandIcon(label.textContent, label)) return;

        // The fuzzy matcher wraps its text in a span, with optional nested match spans.
        // Offsets refer to English. Use a single run for Chinese and retain the
        // original nodes for React updates and switching back.
        let runs = description.firstElementChild;
        if (description.childNodes.length !== 1 || runs?.localName !== "span") return;
        if (runs.dir === "ltr" && runs.childNodes.length === 1) runs = runs.firstElementChild;
        if (runs?.localName !== "span") return;
        const nodes = [];
        for (const part of runs.childNodes) {
            if (part.nodeType === 3) nodes.push(part);
            else if (part.nodeType === 1 && part.matches('span[data-testid="fuzzy-match-highlight"]') &&
                part.childNodes.length === 1 && part.firstChild.nodeType === 3) nodes.push(part.firstChild);
            else return;
        }
        if (!nodes.includes(node)) return;
        const source = nodes.map(rawTextValue).join("");
        if (!entries.has(source)) return;
        const display = nodes.find(n => n.parentElement === runs) || nodes[0];
        return node === display ? custom.get(source) ?? entries.get(source) : "";
    }

    // The Hub's step header wraps the fixed prefix separately from its file pill or search query.
    const stepPrefix = stepTitle + ' > span.text-muted-foreground:first-child';
    const fileVerbs = new Set(["Analyzed", "Analyzing", "Edited", "Editing", "Created", "Creating", "Deleted", "Deleting"]);
    const searchVerbs = new Set(["Searched", "Searching"]);
    function toolVerbs(element) {
        const prefix = element.closest("span.text-muted-foreground");
        if (!prefix?.matches(stepPrefix)) return;
        const content = prefix.nextElementSibling;
        if (prefix.parentElement.matches(".flex-row.whitespace-nowrap") && content?.matches("span.inline-flex") &&
            content.querySelector('[data-uri][data-quotable-inline="true"]')) return fileVerbs;
        if (prefix.parentElement.matches(".group.overflow-hidden") && prefix.matches(".shrink-0") &&
            content?.matches("span.text-ellipsis.whitespace-nowrap")) return searchVerbs;
    }

    function context(element, forTextNode = false) {
        if (!element || !element.isConnected || element.ownerDocument !== doc) return blocked;
        const isInput = isInputOrTextarea(element);
        if (forTextNode && isInput) return blocked;

        let selected = false, scope, row = false, textOnly = false, knownText, attrOwner, alternatives;
        let strictContainer = false, question, permissionRow, marketplace = false;
        let control = false;
        let option;
        const sidecarInput = fixedInput(element);
        const allowInputAttrs = isInput && !forTextNode;
        const verbs = toolVerbs(element);
        const stepOwner = verbs && element.closest(responseSteps)?.parentElement;
        let navCaption;

        const detail = settingsDetail(element);
        if (detail === blocked) return blocked;
        knownText = detail || settingsLabel(element);
        if (knownText) {
            selected = true;
            scope = detail ? "settings-detail" : knownText === "Model Quota" || knownText === quotaEmpty ? "model" : "permissions";
            textOnly = true;
        }

        for (let p = element; p; p = parent(p)) {
            if (p.nodeType !== 1) continue;
            const caption = fixedRouteCaption(p);
            if (closedLightChild(p) || inProtectedSurface(p, allowInputAttrs && p === element, stepOwner, caption)) return blocked;
            if (caption) navCaption = caption;
            if (!control && p.matches(interactiveControlSelector)) control = true;
            if (p.getAttribute("role") === "option" && p.matches(mentionOption) &&
                !p.querySelector(':scope > [data-testid="menu-category-row"]')) option = p;

            const id = p.getAttribute("data-testid");
            if (permissionRows.has(id)) permissionRow = p;
            if (id === "customizations-marketplace") marketplace = true;
            if (id === "ask-question-header-text" || id === "ask-question-option-text") question = p;
            if (id === "sidecar-row" && p.hasAttribute("data-sidecar-id")) row = true;
            if (id === "onboarding-brand-shell") {
                strictContainer = true;
                if (!scope) {
                    const label = welcomeLabel(element);
                    if (label) {
                        scope = "onboarding";
                        knownText = label;
                        textOnly = label !== googleSignIn;
                        selected = true;
                    }
                }
            }
            const leaf = leafById.get(id);
            if (leaf) {
                if (id !== "post-onboarding-welcome-modal" && id !== "onboarding-auth-code-panel" && id !== "settings-sidebar") {
                    strictContainer = true;
                }
                if (id === "settings-sidebar") {
                    strictContainer = true;
                    const label = sidebarLabel(element);
                    if (label) {
                        scope = "settings";
                        knownText = label;
                        selected = textOnly = true;
                    }
                }
                if (!scope && element.matches(leaf.selector)) {
                    scope = leaf.scope;
                    textOnly = !(id === "artifact-update-notice" && element.localName === "button");
                    if (!textOnly) attrOwner = id;
                    selected = true;
                }
            }
            if (!selected && (id || p.matches("button,select,[role=button],[role=menuitem]"))) {
                if (p.matches("a[href]")) {
                    if (element.matches(linkCaption)) { scope = "toolbar"; textOnly = true; selected = true; }
                } else if (id?.startsWith("settings-nav-item-")) {
                    if (fixedScreens.has(id.slice("settings-nav-item-".length)) && element.matches(settingsItem)) {
                        scope = "settings";
                        textOnly = true;
                        selected = true;
                    } else {
                        strictContainer = true;
                        selected = true;
                    }
                } else if (id && scopeById.has(id)) {
                    scope = scopeById.get(id);
                    if (Object.hasOwn(fixedAlternatives, id)) alternatives = fixedAlternatives[id];
                    if (p === element) attrOwner = id;
                    selected = true;
                }
            }
        }

        if (permissionRow) return permissionRowContext(permissionRow, element);
        const project = projectText(element);
        if (project !== undefined) return {displayText: project, textOnly: true};
        const account = accountContext(element);
        if (account !== undefined) return account;
        if (marketplace) {
            if (element.closest(noticeParagraph)) return marketplaceNotice(element);
            const shelf = shelfContext(element);
            if (shelf !== undefined) return shelf;
        }
        if (question) {
            if (!permissionForm(element)) return blocked;
            if (element.matches(permissionTitle)) return {permissionKind: "title", textOnly: true};
            if (element === question && element.matches(permissionOption)) return {permissionKind: "option", textOnly: true};
            // Descend through the header wrappers to the title only.
            return question.contains(element) && element.querySelector(permissionTitle) ? null : blocked;
        }
        const feedback = feedbackContext(element);
        if (feedback !== undefined) return feedback;
        if (option) return {option, textOnly: true};
        if (navCaption) return element === navCaption ? {scope: "toolbar", knownText: sourceText(navCaption), textOnly: true} : null;
        if (verbs && (stepOwner || element.closest('[data-testid="view-file-step"], div.flex-row[data-step-index]'))) {
            return {verbs, textOnly: true};
        }
        if (element.matches(writeIn)) {
            return permissionForm(element) ? {scope: "permissions", attrOwner: "ask-question-writein", isInput: true} : null;
        }
        if (element.localName === "span" && element.nextElementSibling?.matches(writeIn)) {
            return permissionForm(element) ? {scope: "permissions", knownText: "No", textOnly: true} : null;
        }
        if (element.matches(composerOverlay)) return {composerHint: true, textOnly: true};
        const brand = element.localName === "span" && element.childNodes.length === 1 &&
            element.firstChild.nodeType === 3 &&
            element.previousElementSibling?.getAttribute("data-testid") === "sidebar-header-logo";
        const errorBadge = row && element.matches("span[data-tooltip-id]");

        // Shared compact tooltips are dynamically owned via aria-describedby.
        const compactTip = element.closest('.compact-tooltip[role="tooltip"][id]');
        if (compactTip) {
            strictContainer = true;
            if (!scope && element.matches('.compact-tooltip[role="tooltip"][id], .compact-tooltip[role="tooltip"][id] > div > span:first-child')) {
                const owners = Array.from(doc.querySelectorAll('[aria-describedby]')).filter(node =>
                    node.getAttribute("aria-describedby").split(/\s+/).includes(compactTip.id));
                const owner = owners.length === 1 ? owners[0] : null;
                if (owner?.matches('button[data-testid="model-selector-trigger"], button[data-testid="model-selector-add-custom-model"], button[data-testid="mcp-server-fix-with-agent"]') && !protectedOwner(owner)) {
                    const id = owner.getAttribute("data-testid");
                    if (id === "model-selector-trigger" && element !== compactTip) {
                        scope = "model"; knownText = "Select Model";
                    } else if (id === "model-selector-add-custom-model" && element === compactTip) {
                        scope = "model"; knownText = "Add Model";
                    } else if (id === "mcp-server-fix-with-agent" && element === compactTip) {
                        scope = "agents"; knownText = "Ask the agent to diagnose and fix this server";
                    }
                    textOnly = true;
                }
            }
        }

        if (scope || errorBadge || brand || sidecarInput) {
            return {scope, errorBadge, brand, input: sidecarInput, isInput, textOnly, knownText, attrOwner, alternatives, control, general: false};
        }
        if (strictContainer) return null;
        // Layer 2: Any non-protected UI element outside strict mixed containers is eligible
        // for full-UI exact lookup, Layer 3 control-scoped short words, and Layer 4 templates.
        return {scope: undefined, errorBadge: false, brand: false, input: false, isInput, textOnly: false, knownText: undefined, attrOwner: undefined, alternatives: undefined, control, general: true};
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
        if (records.some(r => r.type !== "characterData")) {
            for (const hint of doc.getElementsByClassName("compact-tooltip")) enqueue(hint);
        }
        const pages = new Set(), sections = new Set();
        for (const r of records) {
            const target = r.target.nodeType === 1 ? r.target : r.target.parentElement;
            const tokenRow = target?.closest(tokenGroupRow);
            if (tokenRow) enqueue(tokenRow);
            // A changed link invalidates the previously translated sibling text.
            const notice = target?.closest(noticeParagraph);
            if (notice) enqueue(notice);
            // React can update the heading and caption separately when reusing a shelf.
            const shelf = target?.matches('section:not([data-testid])') ? target : target?.closest(shelfHeader)?.parentElement;
            if (shelf?.closest('[data-testid="customizations-marketplace"]')) enqueue(shelf);
            const navigation = target?.closest("a[href]");
            if (navigation?.closest(sidebarNav + "," + pluginTabs + "," + featuredActions)) enqueue(navigation);
            const title = target?.closest(stepTitle);
            if (title) enqueue(title);
            const option = target?.closest(mentionOption);
            if (option) enqueue(option);
            // Sibling option eligibility follows the header when React reuses
            // the form, including when just the permission marker changes.
            const form = target?.closest(questionForm);
            if (form) enqueue(form);
            if (target?.localName === "a") enqueue(target.nextSibling);
            if (target?.localName === "input" && target.parentElement?.localName === "label") enqueue(target.nextElementSibling);
            const page = target?.closest(settingsPage);
            if (page) {
                pages.add(page);
                const legal = target.closest(feedbackLegal);
                if (legal) enqueue(legal);
                const checks = target.closest(feedbackSection);
                if (checks?.firstElementChild?.matches("label.leading-relaxed")) enqueue(checks);
                if (target === page || target.closest(".mb-2")) enqueue(page);
                const section = target.closest(".space-y-2");
                if (section) sections.add(section);
                const row = target.closest(accountRow);
                if (row) enqueue(row);
                if (section && (section === target || section.firstElementChild?.contains(target))) enqueue(section);
            }
            // The group heading and spacer determine which adjacent rows are UI.
            const sidebar = target?.closest(sidebarBody);
            if (sidebar && (target === sidebar || target.parentElement === sidebar ||
                target.parentElement?.parentElement === sidebar)) enqueue(sidebar);
            if (r.type === "characterData") {
                originalText.delete(r.target);
                writtenText.delete(r.target);
                enqueue(r.target);
                if (r.target.parentElement) enqueue(r.target.parentElement);
            } else if (r.type === "attributes") {
                if (attrs.includes(r.attributeName)) forgetAttr(r.target, r.attributeName);
                enqueue(r.target);
                if (r.attributeName === "slot" || r.attributeName === "name") enqueue(doc);
                if (r.attributeName === "data-testid") enqueue(r.target.nextElementSibling);
            } else {
                const root = r.target.getRootNode();
                for (const group of [r.addedNodes, r.removedNodes]) {
                    for (const n of group) {
                        if (touched.has(n)) markAncestors(n);
                        enqueue(n);
                        if (root.host && (n.localName === "slot" || n.querySelector?.("slot"))) enqueue(root.host);
                    }
                }
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
        attributeFilter: [...attrs, "class", "contenteditable", "role", "href", "slot", "name", "type", "value",
            "data-mention-menu", "data-hover-option-key", "data-symbol-name", "d", "dir",
            "data-step-list", "data-step-rows", "data-step-index", "data-quotable-inline", "data-uri",
            "target", "rel", "data-slot", "data-testid", "aria-describedby", "id", "data-lexical-editor", "data-file-uri", "data-diff-type", "data-sidecar-url",
            "data-bubble-side", "data-quotable", "data-sidecar-id", "data-tooltip-id", "data-markdown-root"]
    };
    function ownWrite(node, name, value) {
        ingest(observer.takeRecords());
        if (name) node.setAttribute(name, value);
        else node.nodeValue = value;
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

    function applyText(node, source, next) {
        const current = node.nodeValue;
        const owned = originalText.has(node);
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

    function textNode(node, ctx) {
        const owned = originalText.has(node);
        if (!owned && (!ctx || mode === "en" || !active)) return;
        const current = node.nodeValue;
        const source = owned && writtenText.get(node) === current ? originalText.get(node) : current;
        let next = source;
        if (ctx && active && mode === "zh") {
            const verb = source.trim();
            if (ctx.displayText !== undefined) next = ctx.displayText;
            else if (ctx.legalNotice) {
                if (node === node.parentNode.firstChild) next = custom.get("Visit") ?? exact.get("Visit");
                else if (node === node.parentNode.lastChild) next = scoped.get("feedback").get(legalSuffix);
                else next = "";
            } else if (ctx.accountField) next = accountText(node, source, ctx.accountField);
            else if (ctx.shelfEntries) {
                if (!ctx.shelfName) next = custom.get(source) ?? ctx.shelfEntries.get(source) ?? source;
            } else if (ctx.verbs) {
                if (ctx.verbs.has(verb)) next = source.replace(verb, () => custom.get(verb) ?? exact.get(verb) ?? stepVerbMap[verb.toLowerCase()]);
            } else if (ctx.option) next = commandText(node, ctx.option) ?? source;
            else if (ctx.permissionKind) next = permissionText(node, source, ctx.permissionKind);
            else if (ctx.composerHint) {
                if (source === composerHint || source === composerHint + actionsHint) {
                    const entries = scoped.get("workspace");
                    const base = entries?.get(composerHint);
                    const suffix = source === composerHint ? "" : entries?.get(actionsHint);
                    if (base && suffix !== undefined) next = base + suffix;
                }
            } else if (source === "." && permissionDocsLink(node.previousSibling)) next = "。";
            else if (ctx.brand && options.brand === "hide" && source.trim() === "Antigravity") next = "";
            else if (ctx.scope) {
                if ((!ctx.knownText || source.trim() === ctx.knownText) &&
                    (!ctx.alternatives || ctx.alternatives.includes(source.trim()))) {
                    next = translate(source, ctx);
                }
            } else if (ctx.general && !fileVerbs.has(verb) && !searchVerbs.has(verb)) {
                // The exact dictionary also contains standalone tool verbs. Only
                // their audited text leaves may use those translations in prose.
                next = translate(source, ctx);
            }
        }
        applyText(node, source, next);
    }

    // Layer 4.6: High-frequency split text nodes (React splits numbers/elements into adjacent text nodes).
    // Only rewrites pure Text nodeValue and records every node in originalText/writtenText for lossless toggle.
    function translateSplitChildren(el, ctx) {
        if (!ctx || !active || mode !== "zh" || ctx.isInput || ctx.brand || ctx.permissionKind || ctx.composerHint || ctx.option || ctx.verbs || ctx.shelfEntries || ctx.accountField || ctx.legalNotice || ctx.displayText !== undefined) return false;
        const kids = el.childNodes;
        if (kids.length < 2 || kids.length > 10) return false;

        // Collect direct text nodes & simple structure
        const texts = [];
        for (let i = 0; i < kids.length; i++) {
            if (kids[i].nodeType === 3) texts.push({idx: i, node: kids[i], raw: rawTextValue(kids[i])});
        }
        if (texts.length === 0) return false;

        // Case A: Pure adjacent text nodes (e.g. ["Show ", "5", " more..."], ["Step ", "2", " of ", "5"])
        if (texts.length === kids.length) {
            if (texts.length === 3 && /^Show\s+$/.test(texts[0].raw) && /^\d+$/.test(texts[1].raw.trim()) && /^\s+[Mm]ore(\.{3}|…)?$/.test(texts[2].raw)) {
                const dots = /(\.{3}|…)$/.test(texts[2].raw.trim()) ? "…" : "";
                applyText(texts[0].node, texts[0].raw, "再显示 ");
                applyText(texts[2].node, texts[2].raw, " 项" + dots);
                return true;
            }
            if (texts.length === 3 && /^See all\s*\($/.test(texts[0].raw.trim()) && /^\d+$/.test(texts[1].raw.trim()) && texts[2].raw.trim() === ")") {
                applyText(texts[0].node, texts[0].raw, texts[0].raw.replace(/See all\s*\(/, "查看全部 ("));
                return true;
            }
            if (texts.length === 4 && /^(Step|Turn|Question)\s+$/.test(texts[0].raw) && /^\d+$/.test(texts[1].raw.trim()) && /^\s+of\s+$/.test(texts[2].raw) && /^\d+$/.test(texts[3].raw.trim())) {
                const unit = texts[0].raw.startsWith("Step") ? " 步" : texts[0].raw.startsWith("Turn") ? " 轮" : " 个问题";
                applyText(texts[0].node, texts[0].raw, "第 ");
                applyText(texts[2].node, texts[2].raw, " / ");
                applyText(texts[3].node, texts[3].raw, texts[3].raw + unit);
                return true;
            }
            if (texts.length === 2 && /^(Thought|Thinking|Worked) for\s+$/.test(texts[0].raw)) {
                const dur = formatDuration(texts[1].raw);
                if (dur) {
                    const prefix = texts[0].raw.startsWith("Thought") ? "思考了 " : texts[0].raw.startsWith("Thinking") ? "已思考 " : "已处理 ";
                    applyText(texts[0].node, texts[0].raw, prefix);
                    applyText(texts[1].node, texts[1].raw, dur);
                    return true;
                }
            }
            return false;
        }

        // Case B: Text nodes mixed with inline elements like <kbd>, <span>, <button>
        // e.g. "Press " + <kbd>Esc</kbd> + " to cancel"
        if (texts.length >= 2 && /^Press\s+$/.test(texts[0].raw) && kids[texts[0].idx + 1]?.nodeType === 1) {
            const tail = texts[texts.length - 1];
            const tailTrim = tail.raw.trim();
            if (/^to /.test(tailTrim)) {
                const action = tailTrim.slice(3).replace(/\.$/, "");
                const period = tailTrim.endsWith(".") ? "。" : "";
                const actionZh = lookupDirect(action, undefined, undefined, true) ?? failedVerbMap[action.toLowerCase()];
                if (actionZh) {
                    applyText(texts[0].node, texts[0].raw, "按 ");
                    applyText(tail.node, tail.raw, " " + actionZh + period);
                    return true;
                }
            }
        }
        // e.g. "Runs" + " " + <button>schedule</button> + " " + "in" + " " + <button>project</button>
        if (texts[0].idx === 0 && texts[0].raw === "Runs" && kids.length >= 3) {
            applyText(texts[0].node, texts[0].raw, "运行频率：");
            for (const t of texts) {
                if (t.raw === "in") applyText(t.node, t.raw, "位于");
            }
            return true;
        }
        // e.g. "Show " + <span>5</span> + " more..."
        if (kids.length === 3 && kids[0].nodeType === 3 && kids[1].nodeType === 1 && kids[2].nodeType === 3) {
            const firstRaw = rawTextValue(kids[0]);
            const lastRaw = rawTextValue(kids[2]);
            if (/^Show\s+$/.test(firstRaw) && /^\s+[Mm]ore(\.{3}|…)?$/.test(lastRaw)) {
                const dots = /(\.{3}|…)$/.test(lastRaw.trim()) ? "…" : "";
                applyText(kids[0], firstRaw, "再显示 ");
                applyText(kids[2], lastRaw, " 项" + dots);
                return true;
            }
        }
        return false;
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
                if (ctx.shelfEntries) {
                    if (name === "aria-label" && source === ctx.shelfName) {
                        next = custom.get(source) ?? ctx.shelfEntries.get(source);
                    }
                } else if (ctx.input) {
                    // Audited fixed sidecar input preserves strict metadata allowlist.
                    if ((name === "placeholder" && source === "Untitled") ||
                        (name === "aria-label" && source === "Name")) {
                        next = translate(source, {scope: "sidecar", control: true});
                    }
                } else if (ctx.scope === "settings-detail" && name === "aria-label" &&
                    element.matches(layoutOption) && source === ctx.knownText) {
                    next = translate(source, ctx);
                } else if (ctx.scope === "onboarding" && ctx.knownText === googleSignIn &&
                    name === "title" && source === googleSignIn) {
                    next = translate(source, ctx);
                } else if (ctx.scope && !ctx.textOnly && permittedAttribute(ctx.attrOwner, name, source)) {
                    next = translate(source, ctx);
                } else if (ctx.errorBadge && name === "aria-label" && source === "Sidecar error") {
                    next = translate(source, {scope: "sidecar", control: true});
                } else if (ctx.general) {
                    // Layer 2 attribute lookup outside protected surfaces & strict controls.
                    // Never translate title on inputs (only placeholder / aria-label).
                    if (!ctx.isInput || name === "placeholder" || name === "aria-label") {
                        const attrCtx = ctx.isInput ? {...ctx, control: false} : ctx;
                        next = translate(source, attrCtx);
                    }
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
        const splitHandled = new WeakSet();
        while (stack.length) {
            const node = stack.pop();
            if (visited.has(node)) continue;
            visited.add(node);
            if (node.nodeType === 3) {
                if (node.parentElement && splitHandled.has(node.parentElement)) continue;
                const ctx = closedLightChild(node) ? blocked : context(parent(node), true);
                textNode(node, ctx === blocked || ctx?.input ? null : ctx);
                continue;
            }
            if (node.nodeType === 1) {
                const ctx = context(node, false);
                if (ctx === blocked && !touched.has(node)) {
                    // Skip the response body. Visit only candidate header leaves;
                    // context() still checks every ancestor, including Markdown and thinking.
                    if (active && mode === "zh" && (node.matches(responseShell) || node.closest(responseSteps))) {
                        for (const prefix of node.querySelectorAll(stepPrefix)) stack.push(prefix);
                    }
                    continue;
                }
                attributes(node, ctx === blocked ? null : ctx);
                if (ctx && ctx !== blocked && mode === "zh" && active && translateSplitChildren(node, ctx)) {
                    splitHandled.add(node);
                }
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
