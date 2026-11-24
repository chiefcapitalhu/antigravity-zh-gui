(function attachLocalHub(install, createPresentation) {
    if (isRemoteWindow || process.isMainFrame !== true || window.top !== window) return;
    const start = async () => {
        if (window.location.protocol !== "https:" || window.location.hostname !== "127.0.0.1") return;
        const origin = await electron_1.ipcRenderer.invoke("agzh:local-ui");
        if (!origin || origin !== window.location.origin) return;
        const native = createPresentation();
        const windowUI = install(window, {
            isLocalHub: true, isMainFrame: true, origin,
            onModeChange(mode) {
                native.setMode(mode);
                void electron_1.ipcRenderer.invoke("agzh:local-ui", mode).catch(() => {});
            }
        });
        if (windowUI) agZhContext = native;
    };
    const activate = () => { void start().catch(() => {}); };
    if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", activate, {once: true});
    else activate();
})
