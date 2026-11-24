(function attachNativeLabels(factory, Menu, translateUpdateStep = true) {
    const original = new WeakMap();
    const surfaces = new Map();
    const fixed = {
        "agzh-file-new": "fileNewWindow", "agzh-help-docs": "helpDocs",
        "agzh-connect-wsl": "connectWSL", "agzh-reopen-local": "reopenLocally",
        "agzh-dock-new": "dockNewWindow", "agzh-tray-quit": "trayQuit"
    };
    const headings = {File: "fileMenu", View: "viewMenu", Help: "helpMenu"};
    const presenter = factory(() => {
        for (const repaint of surfaces.values()) repaint();
    });
    function english(item) { return original.get(item) ?? item.label; }
    function display(item, text) {
        if (!original.has(item)) original.set(item, item.label);
        if (item.label !== text) item.label = text;
    }
    function refreshItems(surface, menu) {
        for (const item of menu.items) {
            const en = english(item);
            if (typeof en !== "string") continue;
            if (Object.hasOwn(fixed, item.id)) {
                display(item, presenter.siteLabel(fixed[item.id], en));
            } else if (surface === "application" && item.submenu && Object.hasOwn(headings, en)) {
                display(item, presenter.siteLabel(headings[en], en));
            } else if ((translateUpdateStep && item.id === "check-for-updates") || item.id === "running-agents" ||
                       ["hub-reset-zoom", "hub-zoom-in", "hub-zoom-in-equal", "hub-zoom-out"].includes(item.id)) {
                display(item, presenter.label(surface, item.id, en));
            }
        }
    }
    function track(surface, menu, paint) {
        const refresh = () => {
            refreshItems(surface, menu);
            if (surface === "application") {
                for (const [index, root] of menu.items.entries()) {
                    if (root.submenu && (index === 0 || ["File", "View", "Help"].includes(english(root))))
                        refreshItems(surface, root.submenu);
                }
            }
            paint(menu);
        };
        surfaces.set(surface, refresh);
        refresh();
    }
    function current(item, en, surface) {
        original.set(item, en);
        display(item, presenter.label(surface, item.id, en));
    }
    return {
        track, english, current, presenter,
        application: menu => track("application", menu, m => Menu.setApplicationMenu(m))
    };
})
