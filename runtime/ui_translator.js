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
    for (const [scope, ids] of Object.entries({
        toolbar: ["new-conversation-button", "app-icon-new-conversation-button",
            "settings-button", "computer-permissions-continue",
            "declared-permissions-confirm", "declared-permissions-next"],
        model: ["model-selector-header", "model-selector-refresh", "model-selector-empty",
            "model-selector-loading", "model-selector-effort-header"],
        sidecar: ["sidecar-new-button", "new-sidecar-submit", "sidecar-action-delete",
            "sidecar-action-restart", "sidecar-action-view-logs"]
    })) {
        for (const id of ids) scopeById.set(id, scope);
    }
    const protectedArea = [
        "script", "style", "noscript", "pre", "code", "svg", "math", "canvas",
        "textarea", "iframe", "webview", "kbd", "a[href]",
        "[data-lexical-editor]", "[data-file-uri]", "[data-sidecar-url]",
        "[data-bubble-side]", "[data-quotable]", "[data-diff-type]", "[role=log]",
        ".monaco-editor", ".monaco-diff-editor", ".cm-editor", ".cm-mergeView",
        ".terminal", ".xterm", ".diff-view",
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
        if (!item || !["toolbar", "model", "sidecar"].includes(item.scope)) continue;
        if (!scoped.has(item.scope)) scoped.set(item.scope, new Map());
        for (const [key, value] of dictionary(item.entries)) scoped.get(item.scope).set(key, value);
    }
    const templates = (options.templates ?? []).filter(item =>
        item && Object.hasOwn(patterns, item.id) && typeof item.format === "string" &&
        item.format.includes("{n}"));
    function translate(source, scope) {
        const key = source.trim();
        // A filename can consist entirely of English words and match a custom
        // entry. Exact matches alone do not establish that a string is UI.
        if (!key || key === "Antigravity" || /[\\/]/.test(key) ||
            /^(?:[a-z][\w+.-]*:|~|\.{1,2}$|\.[\w-])/i.test(key) ||
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
    function context(element) {
        if (!element || !element.isConnected || element.ownerDocument !== doc) return blocked;
        let selected = false, scope, row = false;
        const input = fixedInput(element);
        for (let p = element; p; p = parent(p)) {
            if (p.nodeType !== 1) continue;
            if (closedLightChild(p) || inProtectedSurface(p, input && p === element)) return blocked;
            const id = p.getAttribute("data-testid");
            if (id === "sidecar-row" && p.hasAttribute("data-sidecar-id")) row = true;
            if (!selected && (id || p.matches("button,select,[role=button],[role=menuitem]"))) {
                scope = scopeById.get(id);
                selected = true;
            }
        }
        const brand = element.localName === "span" && element.childNodes.length === 1 &&
            element.firstChild.nodeType === 3 &&
            element.previousElementSibling?.getAttribute("data-testid") === "sidebar-header-logo";
        const errorBadge = row && element.matches("span[data-tooltip-id]");
        return scope || errorBadge || brand || input ? {scope, errorBadge, brand, input} : null;
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
        for (const r of records) {
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
    }
    const observer = new win.MutationObserver(records => ingest(records));
    const watch = {
        subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: [...attrs, "class", "contenteditable", "role", "href", "slot", "name",
            "data-testid", "data-lexical-editor", "data-file-uri", "data-diff-type", "data-sidecar-url",
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
            else if (ctx.scope) next = translate(source, ctx.scope);
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
                } else if (ctx.scope) next = translate(source, ctx.scope);
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
