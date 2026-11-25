'use strict';

// This runs as an external script on a local, network-isolated Chromium page.
const root = document.getElementById('root');
const results = [];
const controllers = [];
const tick = (delay = 0) => new Promise(resolve => setTimeout(resolve, delay));
const dictionary = {
  hotkey: true, platform: 'win32', defaultLang: 'zh', brand: 'keep',
  custom: {}, exact: {'Save': '保存', 'Close': '关闭', 'New Conversation': '新建对话'},
  scoped: [{scope: 'model', entries: {'Select': '选择模型'}}],
  templates: [{id: 'minutesAgo', format: '{n} 分钟前'}],
};
function equal(actual, expected, label) {
  if (!Object.is(actual, expected)) throw Error(label + ' expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
}
function element(tag, attrs = {}, content) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (content !== undefined) node.append(document.createTextNode(content));
  return node;
}
function button(text, testid = 'new-conversation-button') {
  return element('button', {'data-testid': testid}, text);
}
function mount(options = {}, host = window) {
  const api = install(host, {...dictionary, ...options});
  controllers.push(api);
  return api;
}
function key(target, options) {
  const event = new KeyboardEvent('keydown', {
    key: 'L', code: 'KeyL', shiftKey: true, bubbles: true, cancelable: true, composed: true, ...options,
  });
  target.dispatchEvent(event);
  return event;
}
const cases = [];
function test(name, run) { cases.push({name, run}); }

const seenReleaseTerms = new Set();
function withChildren(node, ...children) { node.append(...children); return node; }
function box(attrs, ...children) { return withChildren(element('div', attrs), ...children); }

// Each row names the official control and the rendered property that supplied
// its English. Expected Chinese comes from the shipped five-module dictionary.
test('release dictionary covers fixed control captions and accessible names', async () => {
  const controls = [
    ["toolbar", "new-conversation-button", "a", "caption", "New Conversation"],
    ["toolbar", "settings-button", "button", "caption", "Settings"],
    ["toolbar", "app-update-button", "div", "text", "Updating…"],
    ["toolbar", "manual-update-button", "div", "text", "Update Available"],
    ["toolbar", "open-editor-empty", "button", "text", "Open IDE"],
    ["toolbar", "plugins-button", "button", "caption", "Plugins"],
    ["toolbar", "plugins-nav-more-button", "button", "aria-label", "Plugins Options"],
    ["toolbar", "overview-panel-customize-trigger", "button", "aria-label", "Customize Sections"],
    ["toolbar", "media-modal-zoom-out", "button", "aria-label", "Zoom out (-)"],
    ["toolbar", "media-modal-zoom-in", "button", "aria-label", "Zoom in (+)"],
    ["toolbar", "media-modal-zoom-reset", "button", "title", "Reset zoom (0)"],
    ["toolbar", "media-modal-download", "button", "aria-label", "Download video", "Download image"],
    ["toolbar", "media-modal-close", "button", "aria-label", "Close (Esc)"],
    ["toolbar", "media-modal-previous", "button", "aria-label", "Previous (←)", "Previous"],
    ["toolbar", "media-modal-next", "button", "aria-label", "Next (→)", "Next"],
    ["toolbar", "webview-prompt-cancel", "button", "text", "Cancel"],
    ["toolbar", "webview-prompt-ok", "button", "text", "OK"],
    ["onboarding", "onboarding-back", "button", "aria-label", "Back"],
    ["onboarding", "onboarding-switch-to-auth-code", "button", "text", "Trouble signing in? Enter authorization code"],
    ["onboarding", "onboarding-auth-code-submit", "button", "text", "Submit code"],
    ["onboarding", "onboarding-copy-sign-in-link", "button", "text", "Copied!", "Copy sign-in link"],
    ["onboarding", "onboarding-last-used-badge", "span", "text", "Last Used"],
    ["onboarding", "onboarding-other-options-toggle", "button", "text", "Other sign-in options"],
    ["workspace", "customize-sidebar-button", "button", "aria-label", "Customize Sidebar"],
    ["workspace", "filter-environment-all", "button", "text", "All"],
    ["workspace", "filter-mark-all-read", "button", "text", "Mark All as Read"],
    ["workspace", "group-by-submenu-trigger", "span", "text", "Group By"],
    ["workspace", "sort-by-submenu-trigger", "span", "text", "Sort Conversations"],
    ["workspace", "filter-submenu-trigger", "span", "text", "Filter"],
    ["workspace", "display-submenu-trigger", "span", "text", "Display"],
    ["workspace", "view-option-auto-pin", "span", "text", "Auto Pin"],
    ["workspace", "view-option-archived", "span", "text", "Archived Only"],
    ["workspace", "filter-option-scheduled", "span", "text", "Automations"],
    ["workspace", "filter-option-plugins", "span", "text", "Plugins"],
    ["workspace", "palette-filter-unread", "span", "text", "Only Unread"],
    ["workspace", "palette-filter-archived", "span", "text", "Only Archived"],
    ["workspace", "palette-filter-scheduled", "span", "text", "Only Automations"],
    ["workspace", "conversations-palette-filter-trigger", "button", "aria-label", "Sort and filter conversations"],
    ["workspace", "palette-sort-last_user_prompt", "span", "text", "Last Prompt"],
    ["workspace", "conversation-kebab", "button", "aria-label", "More options"],
    ["workspace", "conversation-archive-button", "button", "aria-label", "Archive conversation"],
    ["workspace", "conversation-pin-button", "button", "aria-label", "Unpin conversation", "Pin conversation"],
    ["workspace", "rename-conversation-submit", "button", "text", "Rename"],
    ["workspace", "confirm-delete-conversation", "button", "text", "Delete"],
    ["workspace", "project-selector-connect-ssh-host", "button", "text", "Connect to SSH Host…"],
    ["workspace", "project-selector-connect-github", "button", "text", "Connect GitHub"],
    ["workspace", "project-selector-create-project-trigger", "button", "text", "Create Project"],
    ["workspace", "project-selector-github-loading", "button", "text", "Loading Repositories…"],
    ["workspace", "project-folder-selection-next", "button", "text", "Creating...", "Next"],
    ["workspace", "empty-file-open-button", "button", "text", "Open File"],
    ["workspace", "file-tree-filter-error", "div", "text", "Couldn't search files"],
    ["workspace", "file-tree-filter-empty", "div", "text", "No matching files"],
    ["workspace", "file-tree-filter-clear", "button", "aria-label", "Clear file filter"],
    ["workspace", "file-tree-filter-clear", "button", "title", "Searching...", "Clear filter"],
    ["workspace", "voice-dock-send", "button", "aria-label", "Send"],
    ["settings", "open-vscode-keybindings-btn", "button", "text", "Open Keyboard Shortcuts"],
    ["settings", "settings-upload-debug-bundle-button", "button", "aria-label", "Upload Debug Bundle"],
    ["settings", "browser-clear-data-cancel", "button", "text", "Cancel"],
    ["settings", "browser-clear-data-confirm", "button", "text", "Clear"],
    ["settings", "browser-site-data-loading", "div", "text", "Loading cookies…"],
    ["settings", "browser-site-data-empty", "p", "text", "No sites have cookies in the built-in browser."],
    ["settings", "browser-site-data-error", "p", "text", "Couldn't load cookies."],
    ["settings", "browser-clear-data-error", "p", "text", "Couldn't clear browsing data. Try again."],
    ["settings", "builtin-browser-download-dir-change", "button", "text", "Change…"],
    ["settings", "builtin-browser-download-dir-reset", "button", "text", "Reset"],
    ["settings", "browser-site-data-manage-button", "button", "text", "Manage"],
    ["settings", "wsl-reopen-locally", "button", "text", "Reopen Locally"],
    ["settings", "setup-script-save-button", "button", "text", "Save"],
    ["settings", "setup-script-validate-button", "button", "text", "Validate"],
    ["settings", "setup-script-copy-button", "button", "aria-label", "Copied", "Copy output"],
    ["settings", "voice-settings-change", "button", "text", "Change"],
    ["settings", "voice-settings-delete-recordings", "button", "text", "Delete all"],
    ["settings", "voice-delete-recordings-confirm", "button", "text", "Delete"],
    ["permissions", "permissions-advanced-toggle", "button", "text", "Advanced"],
    ["permissions", "computer-permissions-relaunch", "button", "text", "Relaunch ↻"],
    ["permissions", "computer-permissions-continue", "button", "text", "Continue Task →"],
    ["permissions", "declared-permissions-arg-folder", "button", "text", "Change", "Browse"],
    ["permissions", "declared-permissions-next", "button", "text", "Resolving...", "Next: Review Permissions"],
    ["permissions", "declared-permissions-confirm", "button", "text", "Saving..."],
    ["permissions", "permissions-use-global-settings", "button", "text", "Use Global Settings"],
    ["permissions", "inline-permission-deny", "button", "text", "Deny"],
    ["permissions", "inline-permission-unsandboxed-warning", "div", "text", "Confirm the command is safe to run outside of the sandbox with full network and disk access."],
    ["permissions", "inline-permission-in-chat", "button", "text", "In chat"],
    ["model", "model-selector-header", "div", "text", "Best of N Models", "Model"],
    ["model", "model-selector-refresh", "button", "text", "Refresh"],
    ["model", "model-selector-loading", "div", "text", "Loading models..."],
    ["model", "model-selector-empty", "div", "text", "No models available"],
    ["model", "model-selector-effort-header", "div", "text", "Thinking effort"],
    ["model", "model-selector-effort-info", "span", "aria-label", "Controls how much time and quota the model spends reasoning before responding. Higher effort improves accuracy on hard problems, at the cost of slower responses and higher quota use."],
    ["model", "model-quota-refreshing", "div", "text", "Refreshing..."],
    ["agents", "webview-download-agent-badge", "span", "text", "Agent"],
    ["agents", "mcp-server-fix-with-agent", "button", "text", "Fix with Agent"],
    ["agents", "mcp-server-configure", "button", "text", "Configure"],
    ["agents", "mcp-server-restart", "button", "text", "Restart"],
    ["agents", "mcp-server-paste-code-instead", "button", "text", "Paste a code instead"],
    ["agents", "add-mcp-button", "button", "text", "Add MCP"],
    ["agents", "add-mcp-button", "button", "aria-label", "Add MCP Server"],
    ["agents", "mcp-config-confirm", "button", "text", "Enabling...", "Installing...", "Saving..."],
    ["agents", "cancel-delete-mcp", "button", "text", "Cancel"],
    ["agents", "confirm-delete-mcp", "button", "text", "Deleting...", "Delete"],
    ["agents", "mcp-app-open-in-side-pane", "button", "aria-label", "Open in side pane"],
    ["agents", "delete-skill-reinstall-note", "div", "text", "This skill came from the marketplace, so you can add it again whenever you need it."],
    ["agents", "delete-skill-permanent-warning", "div", "text", "This cannot be undone."],
    ["agents", "subagent-stop", "button", "aria-label", "Stop subagent"],
    ["agents", "subagent-expand", "button", "aria-label", "Collapse subagents", "Expand subagents"],
    ["agents", "subagent-approve", "button", "text", "Approve"],
    ["agents", "subagent-deny", "button", "text", "Deny"],
    ["agents", "subagent-node-children-toggle", "button", "text", "Show less"],
    ["agents", "subagent-tab-loading", "div", "text", "Loading subagent..."],
    ["agents", "subagent-tab-ended", "div", "text", "Subagent ended"],
    ["agents", "subagent-tab-open-full-view", "button", "text", "Full View"],
    ["agents", "new-coordinator-button", "button", "aria-label", "New agent"],
    ["agents", "create-coordinator-submit", "button", "text", "Create Coordinator"],
    ["agents", "coordinator-settings-save", "button", "text", "Save"],
    ["agents", "marketplace-filter-button", "button", "aria-label", "Filter plugins"],
    ["agents", "review-plugin-source-caution", "button", "text", "Review contents"],
    ["agents", "confirm-plugin-source-caution", "button", "text", "Add anyway"],
    ["sidecar", "automation-untrusted-warning", "span", "aria-label", "Untrusted sidecar"],
    ["sidecar", "sidecar-action-delete", "button", "text", "Delete"],
    ["sidecar", "sidecar-action-run-now", "button", "text", "Run Now"],
    ["sidecar", "sidecar-action-restart", "button", "text", "Restart"],
    ["sidecar", "sidecar-action-manage-permissions", "button", "text", "Manage Permissions"],
    ["sidecar", "sidecar-action-view-logs", "button", "text", "View Logs"],
    ["sidecar", "new-sidecar-back", "button", "text", "Back"],
    ["sidecar", "new-sidecar-submit", "button", "text", "Creating…", "Create"],
    ["sidecar", "new-sidecar-trigger-scheduled", "button", "text", "Scheduled"],
    ["sidecar", "new-sidecar-remove-trigger", "button", "aria-label", "Remove trigger"],
    ["sidecar", "new-sidecar-add-trigger", "button", "text", "Add schedule", "Add trigger"],
    ["sidecar", "sidecar-new-button", "button", "text", "New"],
    ["sidecar", "cancel-delete-sidecar", "button", "text", "Cancel"],
    ["sidecar", "sidecar-detail-close", "button", "aria-label", "Close"],
    ["sidecar", "new-sidecar-no-project", "span", "text", "Create a project first."],
    ["sidecar", "automation-settings-save", "button", "text", "Save"],
  ];
  const probes = [];
  for (const [scope,id,tag,prop,...terms] of controls) {
    const entries = releaseLocale.scoped.find(group => group.scope === scope).entries;
    for (const en of terms) {
      if (!Object.hasOwn(entries,en)) throw Error('Missing release entry ' + scope + ' / ' + en);
      const owner = element(tag, {'data-testid':id});
      let label = owner;
      if (prop === 'caption') {
        if (tag === 'a') owner.setAttribute('href','/local/new');
        label = element('span',{class:'truncate'},en); owner.append(label);
      } else if (prop === 'text') {
        label.append(document.createTextNode(en));
      } else {
        owner.setAttribute(prop,en);
      }
      root.append(owner);
      probes.push({label,prop,en,zh:entries[en],id,scope});
    }
  }
  const api = mount(releaseLocale);
  for (const mode of ['zh','en']) {
    api.setMode(mode); await tick();
    for (const {label,prop,en,zh,id,scope} of probes) {
      equal(prop === 'text' || prop === 'caption' ? label.textContent : label.getAttribute(prop),
        mode === 'zh' ? zh : en, id + ' / ' + en);
      if (mode === 'zh') seenReleaseTerms.add(scope+'|'+en);
    }
  }
});

test('release dictionary translates mixed panels only at their fixed display leaves', async () => {
  const probes = [];
  const entries = scope => releaseLocale.scoped.find(group => group.scope === scope).entries;
  function leaf(scope, en, tag = 'span', attrs = {}, prop = 'text') {
    if (!Object.hasOwn(entries(scope),en)) throw Error('Missing shipped entry ' + en);
    const el = prop === 'text' ? element(tag,attrs,en) : element(tag,{...attrs,[prop]:en});
    probes.push({el,prop,scope,en});
    return el;
  }
  const owner = (id,...children) => box({'data-testid':id},...children);
  const span = (scope,en,attrs) => leaf(scope,en,'span',attrs);
  for (const [scope,id,en,attrs] of [
    ['toolbar','overview-panel-row-review','Review',{class:'agy-hover-label'}],
    ['toolbar','overview-panel-row-files','Files',{class:'agy-hover-label'}],
    ['toolbar','overview-panel-row-terminal','Terminal',{class:'agy-hover-label'}],
    ['workspace','aux-pane-terminals-section','Terminals',{class:'agy-hover-label'}],
    ['workspace','aux-pane-background-tasks-section','Background Tasks',{class:'agy-hover-label'}],
    ['workspace','pane-selection-add-to-chat','Add to Chat',{}],
    ['workspace','filter-environment','Environment',{}],
    ['workspace','filter-last-activity','Last Activity',{}],
    ['workspace','filter-sort-by','Sort By',{}],
    ['workspace','artifact-pdf-fallback','Inline PDF preview is not available in this environment.',{}],
    ['workspace','artifact-no-preview','Preview is not available for this file type.',{}],
    ['model','model-selector-orchestrator','Orchestrator',{}],
  ]) root.append(owner(id,span(scope,en,attrs)));
  root.append(owner('comments-modal-section-artifact',leaf('workspace','Artifact Comments','h3')));
  root.append(owner('artifact-update-notice',span('workspace','Artifact updated by agent'),
    leaf('workspace','Dismiss artifact update notice','button',{},'aria-label')));
  root.append(owner('project-selector-new-workspace',span('workspace','New Workspace',{class:'truncate min-w-0',title:'folder'})));
  const nav = box({});
  root.append(owner('settings-sidebar',box({},box({},leaf('settings','Settings','h1')),nav)));
  for (const screen of ['General','Projects','Agents','Environments','App','Appearance','Shortcuts',
    'Notifications','Models','Customizations','Browser','Developer','Running']) {
    nav.append(box({},withChildren(element('button',{'data-testid':'settings-nav-item-'+screen}),
      span('settings',screen === 'App' ? 'Application' : screen))));
  }
  root.append(owner('onboarding-auth-code-panel',
    leaf('onboarding','Sign in in your browser, then paste the authorization code shown on the callback page.','p'),
    box({},leaf('onboarding','Authorization code','label',{for:'onboarding-auth-code-input'}))));
  const steps = element('ol');
  root.append(owner('post-onboarding-welcome-modal',leaf('onboarding',"Here's how you and your agents work together",'p'),
    steps,box({},leaf('onboarding','Get started','button',{'data-autofocus':'true'}))));
  for (const [id,title,description] of [
    ['agents','Build with one agent or a team','Describe what you want. Your agent plans and builds it, and brings in other agents when needed.'],
    ['plans','Review plans and walkthroughs','Comment on the plan before your agent starts, and get a walkthrough when it finishes.'],
    ['safety','Set the rules, define the boundaries.','By default, agents work in folders you choose and ask before sensitive changes. Adjust this anytime in Settings.']
  ]) {
    steps.append(withChildren(element('li',{'data-testid':'post-onboarding-welcome-step-'+id}),element('span',{},'1'),
      withChildren(element('span'),span('onboarding',title),span('onboarding',description))));
  }
  for (const label of ['Enable macOS Permissions','macOS Permissions Ready']) {
    root.append(owner('computer-permissions-card',box({},span('permissions',label))));
  }
  for (const [id,label] of [['command-permissions-row','Terminal commands'],['tool-permissions-row','Tool permissions']]) {
    const left = box({},box({},span('permissions',label)));
    if (id === 'command-permissions-row') left.append(span('permissions','Configure allowed terminal commands.',{class:'whitespace-pre-wrap'}));
    root.append(owner(id,left));
  }
  root.append(leaf('permissions','Confirm & Save','button',{'data-testid':'declared-permissions-confirm'}));
  for (const en of ['All','Skills','Rules','Built In','Global']) {
    root.append(leaf('agents',en,'button',{'data-testid':'skills-rules-filter'}));
  }
  const banner = span('agents','Workflows are changing on October 19th—stay tuned for updates. You can use the agent to migrate your workflows.');
  // This same span contains both a text node and a nested call to action.
  banner.append(leaf('agents','Migrate with Agent','button'));
  root.append(owner('workflow-deprecation-banner',box({},banner)));
  const service = button('Fix with Agent','mcp-server-fix-with-agent');
  service.setAttribute('aria-describedby','mcp-advice');root.append(service);
  root.append(leaf('agents','Ask the agent to diagnose and fix this server','div',{id:'mcp-advice',role:'tooltip',class:'compact-tooltip'}));
  // These are the only two field metadata values eligible on this named input.
  for (const [attr,en] of [['placeholder','Untitled'],['aria-label','Name']]) {
    root.append(leaf('sidecar',en,'input',{'data-testid':'new-sidecar-name'},attr));
  }
  const api = mount(releaseLocale);
  for (const mode of ['zh','en']) {
    api.setMode(mode); await tick();
    for (const {el,prop,scope,en} of probes) {
      const shown = prop === 'text' ? el.firstChild.nodeValue : el.getAttribute(prop);
      equal(shown,mode === 'zh' ? entries(scope)[en] : en,scope+' / '+en);
      if (mode === 'zh') seenReleaseTerms.add(scope+'|'+en);
    }
  }
});

test('release dictionary translates audited Hub navigation, permissions, onboarding, models and MCP leaves', async () => {
  const nav = element('span', {class:'truncate'}, 'New Conversation');
  const link = withChildren(element('a', {href:'/local/route', 'data-testid':'new-conversation-button'}), nav);
  const iconButton = element('button', {'data-testid':'customize-sidebar-button','aria-label':'Customize Sidebar'});
  const icon = element('span', {class:'google-symbols'}, 'tune'); iconButton.append(icon);
  const checked = [
    [nav, null, 'New Conversation', '新建对话'],
    [iconButton, 'aria-label', 'Customize Sidebar', '自定义侧栏'],
  ];
  const primary = [
    ['declared-permissions-next', 'Next: Review Permissions', '下一步：核对权限'],
    ['onboarding-auth-code-submit','Submit code','提交授权码'],
    ['model-selector-header','Model','模型'],
    ['mcp-server-configure','Configure','配置'],
    ['skills-rules-filter','Skills','技能'],
    ['sidecar-action-run-now','Run Now','立即运行'],
    ['subagent-tab-ended','Subagent ended','子助手已结束'],
  ];
  root.append(link, iconButton);
  for (const [id,en,zh] of primary) {
    const control = button(en,id); root.append(control); checked.push([control,null,en,zh]);
  }
  const workspaceLabel = element('span', {class:'truncate min-w-0',title:'New Workspace'}, 'New Workspace');
  root.append(box({'data-testid':'project-selector-new-workspace'},box({},workspaceLabel)));
  checked.push([workspaceLabel,null,'New Workspace','新建工作目录']);
  const makeItem = () => withChildren(button('','settings-nav-item-Agents'), element('span',{},'Agents'));
  const fixed = makeItem(), project = makeItem();
  root.append(box({'data-testid':'settings-sidebar'}, box({},box({}),box({},box({},fixed)),box({}),box({},box({},project)))));
  checked.push([fixed.lastElementChild,null,'Agents','AI 助手']);
  const fileCaption = element('span',{},'Preview is not available for this file type.');
  const filename = element('span',{},'Add to Chat');
  root.append(box({'data-testid':'artifact-no-preview'},fileCaption, filename));
  checked.push([fileCaption,null,'Preview is not available for this file type.','这种文件暂时无法预览。']);
  const transcript = box({'data-testid':'agent-response'}, button('Configure','mcp-server-configure'));
  const customModel = box({'data-testid':'model-selector-custom-item'}, button('Model','model-selector-header'));
  root.append(transcript, customModel);
  const mcp = checked.find(row => row[2] === 'Configure')[0];
  mcp.setAttribute('aria-label','Configure Atlas');
  const api = mount({...releaseLocale, custom:{tune:'不应替换图标', 'Configure Atlas':'不应替换服务名'}});
  for (const mode of ['zh','en','zh','en']) {
    api.setMode(mode); await tick();
    for (const [el,attr,en,zh] of checked) equal(attr ? el.getAttribute(attr) : el.textContent,mode === 'zh' ? zh : en,en);
    equal(icon.textContent,'tune','icon-font ligature');
    equal(mcp.getAttribute('aria-label'),'Configure Atlas','dynamic MCP service name');
    equal(project.textContent,'Agents','same name in workspace list');
    equal(workspaceLabel.title,'New Workspace','user-controlled workspace hint');
    equal(transcript.textContent,'Configure','assistant response'); equal(customModel.textContent,'Model','model name');
    equal(filename.textContent,'Add to Chat','file name in mixed preview panel');
  }
});

test('main sidebar translates both app links with Hub route prefixes', async () => {
  // Keep Chromium offline while exercising the URL values of an embedded Hub.
  const parentBase = 'https://hub.google.com/u/0/remote';
  const location = new URL('https://frame.example/web/dev/?parentBaseUrl=' + encodeURIComponent(parentBase));
  location.ancestorOrigins = ['https://hub.google.com'];
  root.append(element('base',{href:location.href}));
  const host = new Proxy({}, {get(_, key) {
    if (key === 'location') return location;
    if (key === 'self' || key === 'window') return host;
    if (key === 'parent' || key === 'top') return window;
    const value = window[key];
    return typeof value === 'function' && /^[a-z]/.test(key) ? value.bind(window) : value;
  }});
  function navLink(label, symbol, id, href = '/customizations') {
    const icon = document.createElementNS('http://www.w3.org/2000/svg','svg');
    icon.setAttribute('aria-hidden','true');
    icon.setAttribute('data-symbol-name',symbol);
    const caption = element('span',{class:'truncate'},label);
    const link = withChildren(element('a',{href,class:'agy-button agy-button-custom'}),
      withChildren(element('span',{class:'shrink-0 flex items-center'}),icon),caption);
    if (id) link.dataset.testid = id;
    return {link,icon,caption,label,href,node:caption.firstChild};
  }
  const custom = navLink('Customizations','home_repair_service',null,parentBase+'/customizations');
  const plainSvg = navLink('Customizations','home_repair_service');
  plainSvg.icon.removeAttribute('data-symbol-name');
  const path = document.createElementNS(plainSvg.icon.namespaceURI,'path');
  path.setAttribute('d','M480-405.39ZM100-180V-558.46q0-30.31 21-51.31t51.31-21H290v-76.92');
  plainSvg.icon.append(path);
  const plugins = navLink('Plugins','dashboard_customize','plugins-button',parentBase+'/customizations');
  const web = navLink('Customizations','home_repair_service',null,'/web/dev/customizations?workspaceUri=file%3A%2F%2F%2Frepo');
  const dev = navLink('Customizations','home_repair_service',null,'https://frame.example/jetski-devs/web/dev/customizations');
  const nav = box({'data-testid':'sidebar-navigation-items'},custom.link,plainSvg.link,web.link,dev.link,
    box({class:'group/plugin-row relative flex w-full items-center'},plugins.link));
  const outside = navLink('Plugins','dashboard_customize','plugins-button');
  const arbitrary = navLink('Customizations','home_repair_service');
  arbitrary.link.setAttribute('href','/customizations?project=mine');
  const falseIcon = navLink('Customizations','folder');
  const userLabel = navLink('Settings','home_repair_service');
  const otherRoutes = [
    'https://hub.google.com/unrelated/customizations',
    'https://elsewhere.google.com/u/0/remote/customizations',
    '//external.example/web/dev/customizations',
    'https://user:secret@frame.example/web/dev/customizations',
    '/my-project/customizations',
  ].map(href => navLink('Customizations','home_repair_service',null,href));
  nav.append(arbitrary.link,falseIcon.link,userLabel.link,...otherRoutes.map(item => item.link));
  const protectedNav = box({'data-markdown-root':''},nav.cloneNode(true));
  root.append(nav,outside.link,protectedNav);
  const api = mount(releaseLocale,host);
  for (const mode of ['zh','en','zh']) {
    api.setMode(mode); await tick();
    for (const [item,zh] of [[custom,'自定义'],[plainSvg,'自定义'],[web,'自定义'],[dev,'自定义'],[plugins,'插件']]) {
      equal(item.caption.firstChild,item.node,'same sidebar text node');
      equal(item.node.nodeValue,mode === 'zh' ? zh : item.label,'caption '+item.label+' at '+item.href);
      equal(item.link.getAttribute('href'),item.href,'original navigation target');
    }
    for (const item of [outside,arbitrary,falseIcon,userLabel,...otherRoutes]) equal(item.caption.textContent,item.label,'protected link '+item.link.getAttribute('href'));
    equal(protectedNav.querySelector('.truncate').textContent,'Customizations','user content imitates sidebar');
  }
  custom.link.setAttribute('href','/other'); await tick();
  equal(custom.node.nodeValue,'Customizations','reused for a different route');
  plugins.link.parentElement.removeChild(plugins.link); root.append(plugins.link); await tick();
  equal(plugins.node.nodeValue,'Plugins','link moved out of navigation');
});

test('marketplace tabs and featured Details links translate only their fixed captions', async () => {
  function tab(id, label, href) {
    return element('a', {'data-testid':'plugins-tab-'+id, href, class:'agy-pill inline-flex'}, label);
  }
  function tabs(...links) {
    return withChildren(element('nav',{'data-testid':'plugins-tabs','aria-label':'Customizations views'}),...links);
  }
  const browse = tab('browse','Marketplace','/web/dev/customizations');
  const marketplace = tab('marketplace','Marketplace','/customizations');
  const installed = tab('installed','Installed','/customizations/installed');
  const wrongPath = tab('installed','Installed','/customizations');
  const wrongHost = tab('browse','Marketplace','https://external.example/customizations');
  const wrongText = tab('installed','Marketplace','/customizations/installed');
  const outside = tab('installed','Installed','/customizations/installed');
  const copied = tabs(browse.cloneNode(true));
  const subtitle = 'Connect to Google Workspace, including Docs, Sheets, Slides, Drive, Calendar, and Gmail.';
  function detail(href, caption = 'Details') {
    return element('a',{href,'aria-label':'Details for Installed',class:'agy-button agy-button-sm no-underline'},caption);
  }
  const details = [
    detail('/customizations/marketplaces/official/plugins/calendar?id=calendar&marketplace=official'),
    detail('/customizations/plugins/calendar?id=calendar'),
    detail('/customizations/marketplaces/official/skills/calendar?id=calendar'),
  ];
  const otherLinks = [detail('/customizations'), detail('https://external.example/customizations/plugins/calendar'),
    detail('/customizations/plugins/calendar','Installed')];
  function slide(link, shown) {
    const attrs = id => shown ? {'data-testid':'featured-carousel-'+id} : {};
    const title = element('h3',attrs('headline'),'Installed');
    const description = element('p',{...attrs('description'),title:subtitle},subtitle);
    const actions = box({...attrs('actions'),class:'mt-4 flex items-center gap-2'},
      element('span',attrs('primary-action')),link);
    return box({class:'col-start-1 row-start-1 min-w-0 flex flex-col','aria-hidden':String(!shown)},title,description,actions);
  }
  function carouselFor(link) {
    return withChildren(element('section',{'data-testid':'featured-carousel','aria-label':'Featured'}),
      box({class:'agy-spotlight-card'},box({role:'tabpanel',class:'agy-spotlight-panel'},
        box({class:'grid grid-cols-1 items-start min-w-0'},slide(link,true),
          slide(detail('/customizations/plugins/hidden'),false)))));
  }
  const carousel = box({'data-testid':'customizations-marketplace'},...details.concat(otherLinks).map(carouselFor));
  const freeLink = detail('/customizations/plugins/calendar');
  root.append(tabs(browse,installed,wrongPath,wrongHost,wrongText),tabs(marketplace),outside,freeLink,
    box({'data-markdown-root':''},copied),carousel);
  const positive = [[browse,'Marketplace','扩展市场'],[marketplace,'Marketplace','扩展市场'],[installed,'Installed','已安装'],
    ...details.map(link => [link,'Details','详情'])].map(([link,en,zh]) => ({link,en,zh,node:link.firstChild,href:link.getAttribute('href')}));
  const negative = [wrongPath,wrongHost,wrongText,outside,copied.firstChild,freeLink,...otherLinks].map(link => [link,link.textContent]);
  const api = mount(releaseLocale);
  for (const mode of ['zh','en','zh']) {
    api.setMode(mode); await tick();
    for (const {link,en,zh,node,href} of positive) {
      equal(link.firstChild,node,'original text node for '+en);
      equal(node.nodeValue,mode === 'zh' ? zh : en,'caption for '+href);
      equal(link.getAttribute('href'),href,'unchanged destination for '+en);
    }
    for (const [link,text] of negative) equal(link.textContent,text,'unrelated anchor '+text);
    for (const link of details) equal(link.getAttribute('aria-label'),'Details for Installed','plugin name in accessible label');
    for (const title of carousel.querySelectorAll('h3')) equal(title.textContent,'Installed','featured plugin name');
    for (const desc of carousel.querySelectorAll('p')) {
      equal(desc.textContent,subtitle,'featured plugin description');
      equal(desc.title,subtitle,'featured plugin tooltip');
    }
  }
  details[0].setAttribute('href','/customizations/installed'); await tick();
  equal(details[0].textContent,'Details','rerendered unrelated destination');
});

test('eight built-in marketplace shelves restore their original headings and subtitles', async () => {
  const rows = [
    ['google-workspace','Google Workspace','Connect to Google Workspace, including Docs, Sheets, Slides, Drive, Calendar, and Gmail.'],
    ['build-with-google','Build with Google',"Build on Google's developer platforms, including Android, Chrome, Gemini, and Google Cloud."],
    ['design-creative-media','Design, Creative & Media','Design, creative, and media tools.'],
    ['science','Science','Agent skills, databases, and interactive viewers for scientific research.'],
    ['productivity-project-management','Productivity & Project Management','Plan work, track issues, sign documents, and manage your notes and files.'],
    ['cloud-hosting-deployment','Cloud Hosting & Deployment','Deploy and host your apps, sites, and their backends.'],
    ['developer-tools','Developer Tools','APIs, services, and tools to build, test, secure, and run your apps.'],
    ['business','Business','Payments, CRM, accounting, data, identity, customer support, marketing, and workflow automation.'],
  ];
  function shelf(name, subtitle) {
    const title = element('h2',{class:'text-lg font-medium text-foreground'},name);
    const desc = element('p',{class:'text-sm text-muted-foreground'},subtitle);
    const grid = box({class:'grid gap-2 grid-cols-1 sm:grid-cols-2'});
    const section = withChildren(element('section',{'aria-label':name,class:'flex flex-col gap-3'}),
      box({class:'flex flex-col gap-1 px-3'},title,desc),grid);
    return {section,grid,title,desc,titleNode:title.firstChild,descNode:desc.firstChild,name,subtitle};
  }
  const shelves = rows.map(([id,name,subtitle]) => {
    const {entries} = releaseLocale.scoped.find(group => group.scope === 'marketplace-shelf/'+id);
    equal(typeof entries[name],'string',id+' verified heading');
    equal(typeof entries[subtitle],'string',id+' verified subtitle');
    return {...shelf(name,subtitle),entries};
  });
  const mismatch = shelf(rows[0][1],rows[1][2]);
  const unlisted = shelf('Installed','Details');
  const outside = shelf(rows[3][1],rows[3][2]);
  const inProse = shelf(rows[6][1],rows[6][2]);
  const page = box({'data-testid':'customizations-marketplace'},box({class:'flex flex-col gap-10'},
    ...[...shelves,mismatch,unlisted].map(item => item.section)));
  function pluginCard(tag, name, text) {
    const title = element(tag,tag === 'a' ? {href:'/customizations/plugins/calendar'} : {type:'button'},name);
    const description = element('div',{class:'text-sm text-muted-foreground truncate'},text);
    const card = box({'data-testid':'customization-card','data-card-name':name,class:'agy-card'},
      box({class:'flex-1 min-w-0 flex flex-col gap-0.5 pr-4'},
        box({class:'flex items-center gap-1.5 min-w-0'},box({class:'font-medium text-foreground truncate'},title)),
        description));
    shelves[0].grid.append(card);
    return {title,description,name,text};
  }
  const cards = [pluginCard('a',rows[3][1],rows[3][2]),pluginCard('button','Installed','Details')];
  root.append(page,outside.section,box({'data-markdown-root':''},box({'data-testid':'customizations-marketplace'},inProse.section)));
  const api = mount(releaseLocale);
  for (const mode of ['zh','en','zh']) {
    api.setMode(mode); await tick();
    for (const {section,title,desc,titleNode,descNode,name,subtitle,entries} of shelves) {
      equal(title.firstChild,titleNode,'original heading node '+name);
      equal(desc.firstChild,descNode,'original description node '+name);
      equal(titleNode.nodeValue,mode === 'zh' ? entries[name] : name,'shelf heading '+name);
      equal(section.getAttribute('aria-label'),mode === 'zh' ? entries[name] : name,'shelf accessible name '+name);
      equal(descNode.nodeValue,mode === 'zh' ? entries[subtitle] : subtitle,'shelf subtitle '+name);
    }
    for (const {section,title,desc,name,subtitle} of [mismatch,unlisted,outside,inProse]) {
      equal(title.textContent,name,'protected shelf heading '+name);
      equal(section.getAttribute('aria-label'),name,'protected shelf accessible name '+name);
      equal(desc.textContent,subtitle,'protected shelf description '+name);
    }
    for (const {title,description,name,text} of cards) {
      equal(title.textContent,name,'third-party plugin name '+name);
      equal(description.textContent,text,'third-party plugin description '+text);
    }
  }
  const science = shelves[3];
  science.descNode.nodeValue = 'A third-party catalog now owns this shelf.'; await tick();
  equal(science.title.textContent,science.name,'reused shelf title');
  equal(science.section.getAttribute('aria-label'),science.name,'reused shelf accessible name');
  equal(science.desc.textContent,'A third-party catalog now owns this shelf.','rerendered subtitle');
});

test('tool rows translate standalone action prefixes and preserve file labels and AI text', async () => {
  const span = (cls,...children) => withChildren(element('span',{class:cls}),...children);
  function stepFrame(content, list, id) {
    const title = span('truncate',span('shimmer-text-mask',span('shimmer-text-content',content)));
    const header = box({class:'group flex w-full min-w-0 items-center min-h-8 py-1 px-2 select-none transition-[background-color]'},
      box({class:'flex min-w-0 items-center gap-x-1'},title),box({class:'flex items-center shrink-0'}));
    const n4 = box({class:'flex flex-col'},header);
    if (id) n4.dataset.testid = id;
    const frame = box({'data-step-index':'7',class:'flex flex-row'},box({class:'min-w-0 grow'},n4));
    list.append(frame);
    return frame;
  }
  function step(verb, file, list, id, animated = false) {
    const prefix = span('text-muted-foreground');
    const node = document.createTextNode(verb);
    prefix.append(animated ? span('',node) : node);
    const filename = span('truncate',file);
    const pill = withChildren(element('button',{type:'button','data-uri':'file:///repo/'+file+'#L150-260','data-quotable-inline':'true'}),
      span('shrink-0'),filename,span('font-mono','#L150-260'));
    const q4 = box({class:'flex flex-row items-center gap-1 overflow-hidden whitespace-nowrap text-muted-foreground'},
      prefix,span('inline-flex text-muted-foreground',pill));
    return {verb,node,filename,file,pill,frame:stepFrame(q4,list,id)};
  }
  const steps = box({'data-step-list':'true'}), rows = box({'data-step-rows':'true'});
  const response = list => box({'data-testid':'agent-response','data-quotable':'true'},list);
  const probes = [[step('Analyzed','source.go',steps,'view-file-step'),'已分析'],
    [step('Analyzing','Settings',rows,'view-file-step',true),'正在分析'],
    [step('Analyzed','Settings',root,'view-file-step'),'已分析'],
    [step('Edited','Created',steps),'已编辑'],[step('Created','Edited',rows),'已创建']];
  const searchVerb = span('text-muted-foreground shrink-0','Searched');
  const query = span('overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground','Created');
  stepFrame(box({class:'flex items-center gap-1 overflow-hidden group'},searchVerb,query),rows);
  const prose = element('p',{},'Analyzed');
  const summaries = ['Running checks for this change','Ran checks for this change','Analyzed'].map(text => {
    const label = span('truncate',text);
    stepFrame(box({class:'flex flex-row items-center gap-1 overflow-hidden whitespace-nowrap text-muted-foreground'},label),
      steps,'run-command-step');
    return {label,text};
  });
  const fakeSteps = box({'data-markdown-root':''});
  const fake = step('Analyzed','source.go',fakeSteps,'view-file-step');
  steps.append(fakeSteps);
  root.append(response(steps),response(rows),prose);
  const api = mount(releaseLocale);
  for (const mode of ['zh','en','zh']) {
    api.setMode(mode); await tick();
    for (const [item,zh] of probes) {
      equal(item.node.nodeValue,mode === 'zh' ? zh : item.verb,'standalone '+item.verb);
      equal(item.filename.textContent,item.file,'file name in action row');
      equal(item.filename.nextElementSibling.textContent,'#L150-260','original line range');
    }
    equal(prose.textContent,'Analyzed','standalone verb in ordinary prose');
    equal(searchVerb.textContent,mode === 'zh' ? '已搜索' : 'Searched','search action');
    equal(query.textContent,'Created','user-supplied search query');
    equal(fake.node.nodeValue,'Analyzed','step-shaped Markdown remains untouched');
    for (const {label,text} of summaries) equal(label.textContent,text,'AI-generated step summary');
  }
  const item = probes[0][0], content = item.pill.parentElement;
  item.pill.remove(); await tick();
  equal(item.node.nodeValue,'Analyzed','prefix loses its file pill');
  content.append(item.pill); await tick();
  equal(item.node.nodeValue,'已分析','prefix regains its file pill');
  fakeSteps.append(item.frame); await tick();
  equal(item.node.nodeValue,'Analyzed','reused tool row moved into Markdown');
});

test('release dictionary resolves a shared tooltip only with one eligible owner', async () => {
  const hint = box({id:'shared-model-tip',role:'tooltip',class:'compact-tooltip'});
  const label = element('span',{},'Select Model'), shortcut = element('span',{},'Select Model');
  hint.append(box({},label,shortcut));
  const owner = button('My model','model-selector-trigger'); owner.setAttribute('aria-describedby',hint.id);
  root.append(owner,hint);
  const api = mount(releaseLocale); await tick();
  equal(label.textContent,'选择模型','trigger tooltip'); equal(shortcut.textContent,'Select Model','shortcut');
  const other = button('Select Model','model-selector-custom-item'); other.setAttribute('aria-describedby',hint.id);
  root.append(other); await tick(); equal(label.textContent,'Select Model','ambiguity revokes translation');
  other.remove(); await tick(); equal(label.textContent,'选择模型','one owner');
  const chat = box({'data-testid':'user-message'}); root.append(chat); chat.append(owner); await tick();
  equal(label.textContent,'Select Model','portal with owner moved into transcript');
  root.append(owner); await tick(); equal(label.textContent,'选择模型','owner returned');
  hint.textContent='Add Model'; owner.setAttribute('data-testid','model-selector-add-custom-model'); await tick();
  equal(hint.textContent,'添加模型','shared tooltip reassigned');
  api.setMode('en'); await tick(); equal(hint.textContent,'Add Model','restored actual latest source');
  for (const en of ['Add Model','Select Model']) seenReleaseTerms.add('model|'+en);
});

test('release dictionary limits permission and quota headings to identifiable settings cards', async () => {
  const heading = element('h2',{},'File Permissions');
  const title = box({class:'mb-2'},box({class:'justify-between'},box({class:'flex-1'}, heading)));
  const card = box({class:'agy-card'}), content = box({class:'gap-8'},card);
  const page = box({class:'max-w-2xl gap-4'},title,content);
  root.append(box({class:'settings-modal-container'},page));
  const row = (value, label) => box({class:'gap-1'},box({class:'justify-between'},box({},box({},element('span',{},label)),element('span',{class:'whitespace-pre-wrap'},value))));
  const rd = row('Allow/deny agent read access to specific files or directories.','File reads');
  const wr = row('Allow/deny agent write access to specific files or directories.','File writes');
  card.append(rd,wr);
  const api = mount(releaseLocale); await tick(); equal(heading.textContent,'文件权限','file grants');
  equal(rd.querySelector('span').textContent,'读取文件','grant label');
  equal(wr.querySelector('span').textContent,'写入文件','write grant label');
  equal(rd.querySelector('.whitespace-pre-wrap').textContent,'设置 AI 助手可以读取或禁止读取的文件和目录。','read grant explanation');
  equal(wr.querySelector('.whitespace-pre-wrap').textContent,'设置 AI 助手可以写入或禁止写入的文件和目录。','grant explanation');
  api.setMode('en'); await tick(); equal(rd.querySelector('span').textContent,'File reads','grant label restored');
  equal(wr.querySelector('.whitespace-pre-wrap').textContent,'Allow/deny agent write access to specific files or directories.','grant description restored');
  api.setMode('zh'); await tick(); wr.remove(); await tick(); equal(heading.textContent,'File Permissions','missing companion');
  card.replaceChildren(row('Allow/deny agent read access to specific URLs or domains.','Read URLs'));
  heading.textContent='Network Permissions'; await tick(); equal(heading.textContent,'网络权限','URL grants');
  equal(card.querySelector('span').textContent,'读取网址','URL grant label');
  equal(card.querySelector('.whitespace-pre-wrap').textContent,'设置 AI 助手可以访问或禁止访问的网址和域名。','URL grant explanation');
  const command = box({'data-testid':'command-permissions-row'}); card.replaceChildren(command);
  heading.textContent='Tool Permissions'; await tick(); equal(heading.textContent,'工具权限','terminal grants');
  const sub = element('h3',{},'Local Permissions');
  const subtitle = box({class:'gap-1'},box({class:'justify-between'},box({class:'gap-1.5'},sub)));
  const localCard = box({class:'agy-card'},command.cloneNode());
  const section = box({class:'space-y-2'},subtitle,box({},localCard)); content.append(section);
  await tick(); equal(sub.textContent,'本地权限','local section');
  const empty = box({class:'text-secondary-foreground'}); empty.textContent='No quota information available.';
  localCard.replaceChildren(empty); sub.textContent='Model Quota'; await tick(); equal(sub.textContent,'模型配额','known quota state');
  equal(empty.textContent,'暂无配额信息。','quota status');
  empty.textContent='project note'; await tick(); equal(sub.textContent,'Model Quota','unverified card');
  // A model group's displayName is a nested dynamic span inside the heading.
  empty.textContent='No quota information available.'; sub.replaceChildren(element('span',{},'Model Quota'));
  await tick(); equal(sub.textContent,'Model Quota','custom model group');
  api.setMode('en'); await tick(); equal(heading.textContent,'Tool Permissions','heading restoration');
  for (const en of ['File Permissions','Network Permissions','Tool Permissions','Local Permissions','File reads',
    'File writes','Read URLs','Allow/deny agent read access to specific files or directories.',
    'Allow/deny agent write access to specific files or directories.','Allow/deny agent read access to specific URLs or domains.']) {
    seenReleaseTerms.add('permissions|'+en);
  }
  for (const en of ['Model Quota','No quota information available.']) seenReleaseTerms.add('model|'+en);
});

test('the signed-out welcome screen translates its verified captions and fixed brand', async () => {
  const title = box({class:'entrance-title'}); title.textContent = 'Welcome to Antigravity!';
  const subtitle = box({'data-testid':'onboarding-welcome-subtitle'}); subtitle.textContent = 'Welcome to Antigravity!';
  const account = element('span',{},'Use Business Account');
  const signin = element('button',{class:'shadow-sm',title:'Continue with Google'});
  const icon = element('span',{class:'google-symbols'},'check_circle');
  signin.append(icon,document.createTextNode('Continue with Google'));
  const business = element('button',{class:'shadow-sm'},'Use Business Account');
  const customProvider = element('button',{class:'shadow-sm',title:'Alice'},'Continue with Google');
  const options = box({id:'other-sign-in-options'},signin,business,customProvider,account);
  const form = element('input',{value:'Having trouble signing in?',placeholder:'Use Business Account'});
  const otherAction = element('button',{class:'text-sm'},'Having trouble signing in?');
  const help = element('button',{class:'text-sm'},'Having trouble signing in?');
  const card = box({class:'bg-card'},options,box({id:'advanced-sso-panel'},form,otherAction));
  const auth = box({class:'entrance-auth-panel'},card,help);
  const page = box({class:'justify-start'},title,subtitle,auth);
  const shell = box({'data-testid':'onboarding-brand-shell'},box({class:'flex-shrink-0'},box({class:'transition-all'},page)));
  root.append(shell);
  const chatCopy = shell.cloneNode(true); root.append(box({'data-testid':'agent-response'},chatCopy));
  const api = mount({...releaseLocale,custom:{Alice:'不应翻译的账户名',check_circle:'不应翻译的图标'}});
  for (const mode of ['zh','en','zh']) {
    api.setMode(mode); await tick();
    equal(title.textContent,mode === 'zh' ? '欢迎使用 Antigravity！' : 'Welcome to Antigravity!','verified product title');
    equal(signin.lastChild.nodeValue,mode === 'zh' ? '使用 Google 登录' : 'Continue with Google','sign in');
    equal(signin.title,mode === 'zh' ? '使用 Google 登录' : 'Continue with Google','sign-in tooltip');
    equal(business.textContent,mode === 'zh' ? '使用企业账号' : 'Use Business Account','business');
    equal(help.textContent,mode === 'zh' ? '登录遇到问题？' : 'Having trouble signing in?','help');
    equal(customProvider.title,'Alice','provider identity');
    equal(customProvider.textContent,'Continue with Google','provider identity overrides matching caption');
    equal(account.textContent,'Use Business Account','nested account label');
    equal(icon.textContent,'check_circle','icon ligature');
    equal(form.value,'Having trouble signing in?','form value');
    equal(form.placeholder,'Use Business Account','form hint');
    equal(otherAction.textContent,'Having trouble signing in?','other action in configurable SSO panel');
    equal(subtitle.textContent,'Welcome to Antigravity!','dynamic subtitle');
    equal(chatCopy.querySelector('.entrance-title').textContent,'Welcome to Antigravity!','copy in protected content');
  }
  for (const en of ['Welcome to ${a}!','Continue with Google','Use Business Account','Having trouble signing in?']) {
    seenReleaseTerms.add('onboarding|'+en);
  }
  title.firstChild.nodeValue = 'Welcome to Alice!'; await tick();
  equal(title.textContent,'Welcome to Alice!','unknown product or personal name');
  signin.title = 'Alice'; await tick();
  equal(signin.lastChild.nodeValue,'Continue with Google','reused provider control');
  // The version without business-account options renders the primary button directly under the panel.
  signin.title = 'Continue with Google'; auth.prepend(signin); await tick();
  equal(signin.lastChild.nodeValue,'使用 Google 登录','simple personal sign-in');
  const custom = mount({...releaseLocale,custom:{'Welcome to Antigravity!':'自定义欢迎词'}});
  title.firstChild.nodeValue = 'Welcome to Antigravity!'; await tick();
  equal(title.textContent,'自定义欢迎词','custom title override');
  custom.setMode('en'); await tick(); equal(title.textContent,'Welcome to Antigravity!','custom title restoration');
});

test('slash menu translates only the reviewed description paired with its command', async () => {
  const scroll = box({});
  root.append(box({role:'listbox','data-mention-menu':'','aria-label':'Mentions'},scroll));
  function row(name, en, split = false) {
    const symbols = {goal:'timer',compact:'collapse_all',schedule:'schedule',plan:'ballot',
      browser:'language',computer:'computer','browser-vision':'visibility','grill-me':'forum',
      teamwork:'graph_2',learn:'lightbulb_2',boost:'bolt',deepagent:'science','review-agent':'find_in_page',
      automation:'schedule','mcp-app-development':'handyman'};
    const icon = element('span');
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    if (name === 'swarm') icon.append(element('img',{alt:'',class:'shrink-0 rounded object-contain inline-block'}));
    else {
      icon.append(svg);
      if (symbols[name]) svg.setAttribute('data-symbol-name',symbols[name]);
      else {
        const path = document.createElementNS(svg.namespaceURI,'path');
        path.setAttribute('d',name === 'btw' ? 'M130-184.23V-757.69q0-29.83 21.24-51.07' : 'M384-349.85l42.15-42.77L338.77-480');
        svg.append(path);
      }
    }
    const label = withChildren(element('span',{'data-testid':'menu-option-label'}),element('span',{},name));
    const runs = element('span');
    if (split) runs.append(element('span',{'data-testid':'fuzzy-match-highlight'},en.slice(0,3)), en.slice(3));
    else runs.append(en);
    const description = withChildren(element('span',{'data-testid':'menu-option-description',dir:'auto'}),runs);
    const content = box({},icon,label,description);
    scroll.append(box({role:'option',id:'typeahead-item-'+scroll.childElementCount},content));
    return {label,runs,content};
  }
  const probes = [];
  for (const {scope,entries} of releaseLocale.scoped.filter(s => s.scope.startsWith('slash-command/'))) {
    const name = scope.slice('slash-command/'.length);
    for (const [en,zh] of Object.entries(entries)) probes.push({...row(name,en),name,en,zh});
  }
  for (const name of ['goal','compact','schedule','browser','plan','grill-me','teamwork','learn',
    'boost','swarm','plugin','automation']) {
    equal(probes.some(p => p.name === name),true,'shipped /'+name);
  }
  const {name,en,zh} = probes.find(p => p.name === 'goal');
  const highlighted = row(name,en,true), first = highlighted.runs.firstChild, last = highlighted.runs.lastChild;
  const custom = row('my-goal',en), other = row(name,'Show All'), plugin = row(name,en);
  plugin.content.append(element('span',{'data-testid':'menu-option-trailing-label'},'Custom plugin'));
  const terminal = row(name,en);
  terminal.content.firstChild.firstChild.removeAttribute('data-symbol-name');
  const editor = element('div',{'data-lexical-editor':'true',contenteditable:'true'},en);
  root.append(editor);
  const api = mount({...releaseLocale,custom:{goal:'命令名不可改写','my-goal':'自定义名称不可改写'}});
  for (const mode of ['zh','en','zh']) {
    api.setMode(mode); await tick();
    for (const p of probes) {
      equal(p.label.textContent,p.name,'command token');
      equal(p.runs.textContent, mode === 'zh' ? p.zh : p.en, '/'+p.name);
    }
    equal(highlighted.runs.textContent,mode === 'zh' ? zh : en,'fuzzy result');
    equal(highlighted.runs.firstChild,first,'highlight preserved');
    equal(highlighted.runs.lastChild,last,'description text node preserved');
    if (mode === 'en') equal(first.textContent,en.slice(0,3),'exact highlight range');
    equal(custom.runs.textContent,en,'user command with same description');
    equal(other.runs.textContent,'Show All','custom description');
    equal(plugin.runs.textContent,en,'plugin source');
    equal(terminal.runs.textContent,en,'@terminal name and command collide with built-in');
    equal(editor.textContent,en,'typed command description');
  }
  highlighted.label.firstChild.firstChild.nodeValue = 'my-goal'; await tick();
  equal(highlighted.runs.textContent,en,'row reassigned to custom command');
  terminal.content.firstChild.firstChild.setAttribute('data-symbol-name','timer'); await tick();
  equal(terminal.runs.textContent,zh,'row reassigned to /goal');
});

test('settings sidebar distinguishes fixed sections from project and account names', async () => {
  const heading = en => box({class:'px-4 mt-2'},element('h2',{},en));
  const row = (id, label) => box({},withChildren(element('button',{'data-testid':'settings-nav-item-'+id}),
    element('span',{},label)));
  const projects = heading('Projects'), outside = heading('Not in Project');
  const names = ['Claude','antigravity-zh-gui','Conversations','Give Feedback','Projects','Show All'];
  const projectRows = names.map(en => row(en,en));
  const show = element('button',{type:'button'},'Show All');
  const conversation = row('Conversations','Conversations'), feedback = row('Provide Feedback','Give Feedback');
  const email = 'frank@example.org', account = box({},row('Account','Projects'),element('span',{},email));
  root.append(box({'data-testid':'settings-sidebar'},
    box({},box({}),box({}),projects,box({class:'flex-col'},...projectRows,show),outside,
      box({class:'flex-col'},conversation),box({class:'flex-1'}),feedback),account));
  const api = mount({...releaseLocale,custom:{Claude:'不应替换品牌','antigravity-zh-gui':'不应替换项目',[email]:'不应替换邮箱'}});
  for (const mode of ['zh','en','zh']) {
    api.setMode(mode); await tick();
    for (const [el,en,zh] of [[projects,'Projects','项目'],[outside,'Not in Project','未归属项目'],
      [show,'Show All','显示全部'],[conversation,'Conversations','对话'],[feedback,'Give Feedback','提供反馈']]) {
      equal(el.textContent, mode === 'zh' ? zh : en, en);
    }
    projectRows.forEach((el,i) => equal(el.textContent,names[i],'user project'));
    equal(account.textContent,'Projects'+email,'sidebar account');
  }
  seenReleaseTerms.add('settings|Give Feedback');
  show.firstChild.nodeValue = 'Show Less'; await tick();
  equal(show.textContent,'收起','expanded project list');
  outside.firstChild.firstChild.nodeValue = 'Projects'; await tick();
  equal(conversation.textContent,'Conversations','reused row is now a project');
  outside.replaceChildren(element('h2',{},'Not in Project')); await tick();
  equal(conversation.textContent,'对话','replaced heading restores fixed row');
  outside.className = ''; await tick();
  equal(conversation.textContent,'Conversations','unrecognized group retains project name');
});

test('permission-only question leaves and the chat placeholder survive bilingual switches', async () => {
  const id = value => ({'data-testid': value});
  const option = (...children) => box(id('ask-question-option-text'), ...children);
  const label = node => withChildren(element('label', id('ask-question-option')), node);
  const title = element('span', id('permission-title'), 'Allow git  push “main”?');
  const plugin = element('span', id('permission-app-header'), 'Settings');
  const header = box(id('ask-question-header-text'), box({}, plugin, title));
  const fixed = [
    ['Yes, allow this time', '是，仅本次允许'],
    ['Yes, allow for this task', '是，允许本次任务使用'],
    ['Yes, allow in this conversation', '是，在当前对话中允许'],
    ['Yes, always allow in this project', '是，在当前项目中始终允许'],
    ['Yes, always allow', '是，始终允许']
  ].map(([en, zh]) => ({en, zh, el: option(en)}));
  const inlineCases = [
    ['strong', 'git push origin main', "' in this conversation", '是，在当前对话中始终允许“'],
    ['code', 'Settings', "'", '是，始终允许“'],
    ['strong', "echo  ‘a’\n  b", "'", '是，始终允许“']
  ].map(([tag, command, suffix, zhPrefix]) => {
    const arg = element(tag, {}, command);
    return {arg, command, suffix, zhPrefix, el: option("Yes, and always allow '", arg, suffix)};
  });
  const no = element('span', {}, 'No');
  const hint = '(tell the agent what to do instead)';
  const textarea = element('textarea', {...id('ask-question-writein'), placeholder: hint, title: 'Settings'}, 'Settings');
  textarea.value = 'Yes, allow this time';
  const formAttrs = {class: 'outline-none flex flex-col no-focus-agent-input', tabindex: '-1'};
  const trigger = box({...id('permission-trigger-command'), title:'Settings'},'Command: ',element('span',{class:'font-mono'},'Settings'));
  const reasoning = element('p',{class:'leading-relaxed'},'Projects');
  const resource = element('dd',{},'Conversations');
  const card = box(formAttrs,box({},header,box({class:'flex-col'},reasoning,trigger,
    withChildren(element('dl',id('permission-download-details')),resource))),...fixed.map(x => label(x.el)),
    ...inlineCases.map(x => label(x.el)),box({},no,textarea));
  const ordinary = box(formAttrs, box(id('ask-question-header-text'), 'Allow git  push “main”?'),
    label(option('Yes, allow this time')), label(option("Yes, and always allow '", element('strong', {}, 'Settings'), "'")));
  const ordinaryText = ordinary.textContent;
  const protectedCard = card.cloneNode(true);
  const protectedText = protectedCard.textContent;
  const base = 'Ask anything, @ to mention', actions = ', / for actions';
  const overlayAttrs = {class: 'pointer-events-none absolute select-none'};
  const editor = element('div', {'data-lexical-editor': 'true', contenteditable: 'true'}, base + actions);
  const overlay = element('p', overlayAttrs, base + actions);
  const customHint = element('p', overlayAttrs, 'Settings');
  root.append(card, ordinary, box(id('user-message'), protectedCard), box({}, editor, overlay),
    box({}, editor.cloneNode(true), customHint));
  const api = mount(releaseLocale);
  for (const mode of ['zh', 'en', 'zh']) {
    api.setMode(mode); await tick();
    const zh = mode === 'zh';
    equal(title.textContent, zh ? '允许 git  push “main”？' : 'Allow git  push “main”?', 'verbatim title argument');
    equal(plugin.textContent, 'Settings', 'plugin name');
    equal(trigger.textContent,'Command: Settings','original trigger command');
    equal(trigger.title,'Settings','original command tooltip');
    equal(reasoning.textContent,'Projects','approval reason');
    equal(resource.textContent,'Conversations','download resource');
    for (const row of fixed) equal(row.el.textContent, zh ? row.zh : row.en, row.en);
    for (const row of inlineCases) {
      equal(row.el.childNodes[1], row.arg, 'original command element');
      equal(row.arg.textContent, row.command, 'verbatim command');
      equal(row.el.textContent, zh ? row.zhPrefix + row.command + '”' :
        "Yes, and always allow '" + row.command + row.suffix, 'split approval');
    }
    equal(no.textContent, zh ? '否' : 'No', 'write-in label');
    equal(textarea.placeholder, zh ? '（告诉助手接下来该怎么做）' : hint, 'write-in placeholder');
    equal(textarea.title, 'Settings', 'unapproved attribute');
    equal(textarea.value, 'Yes, allow this time', 'typed answer');
    equal(textarea.defaultValue, 'Settings', 'initial answer');
    equal(ordinary.textContent, ordinaryText, 'ordinary AI question with identical wording');
    equal(protectedCard.textContent, protectedText, 'protected ancestor');
    equal(overlay.textContent, zh ? '想问什么都可以，输入 @ 提及内容，输入 / 查看操作' : base + actions, 'composer overlay');
    equal(editor.textContent, base + actions, 'typed chat text');
    equal(customHint.textContent, 'Settings', 'custom agent placeholder');
  }
  for (const en of ['No', hint, ...fixed.slice(1).map(row => row.en)]) seenReleaseTerms.add('permissions|' + en);
  for (const en of [base, actions]) seenReleaseTerms.add('workspace|' + en);
  const split = inlineCases[0].el;
  split.lastChild.nodeValue = "' (my own note)"; await tick();
  equal(split.textContent, "Yes, and always allow 'git push origin main' (my own note)", 'unrecognized edited suffix');
  split.lastChild.nodeValue = inlineCases[0].suffix; await tick();
  equal(split.textContent, '是，在当前对话中始终允许“git push origin main”', 'matched after renderer update');
  title.removeAttribute('data-testid'); await tick();
  equal(inlineCases[0].el.firstChild.nodeValue, "Yes, and always allow '", 'form reused by an ordinary questionnaire');
  equal(textarea.placeholder, hint, 'write-in ownership invalidated');
});

test('settings quota buckets, compound durations and RPC group names survive language switches', async () => {
  const checked = [];
  const leaf = (tag, cls, en, zh) => {
    const el = element(tag, {class:cls}, en);
    checked.push([el, el.firstChild, en, zh]);
    return el;
  };
  function bucket(label, zhLabel, en, zh, percent = '53%') {
    return box({class:'justify-between'},
      box({class:'flex-1'},box({},withChildren(element('span'),leaf('span','',label,zhLabel))),
        leaf('span','whitespace-pre-wrap',en,zh)),
      box({class:'shrink-0'},element('span',{},percent)));
  }
  function group(name, zh, ...rows) {
    return box({class:'space-y-2'},box({class:'gap-1'},box({class:'justify-between'},
      box({},withChildren(element('h3'),box({},leaf('span','',name,zh)))))),
      box({},box({class:'agy-card'},...rows)));
  }
  const weekly = 'You have used some of your weekly limit, it will fully refresh in ';
  const hourly = 'You have used some of your 5-hour limit, it will fully refresh in ';
  const paid = ' If on a supported paid plan, you can use AI credits in the interim or upgrade to a higher tier.';
  const paidZh = '如果你的付费方案支持 AI 积分，可在此期间使用积分，也可以升级到更高等级的方案。';
  const weeklyHit = 'You have hit your weekly limit, ';
  const hourlyHit = 'You have hit your 5-hour limit, ';
  const weeklyPaid = weeklyHit+'it refreshes in 6 days, 10 hours.'+paid;
  const weeklyOnly = weeklyHit+'the 5-hour limit does not currently apply. Your weekly limit will fully refresh in 1 day.';
  const hourlyOnly = hourlyHit+'the weekly limit does not currently apply. Your 5-hour limit will fully refresh in 3 hours, 19 minutes.';
  const malformed = weeklyHit+'it refreshes in 6 days,, 10 hours.'+paid;
  const mismatch = weeklyHit+'the 5-hour limit does not currently apply. Your 5-hour limit will fully refresh in 1 day.';
  const week = (en,zh) => bucket('Weekly Limit Remaining','每周剩余额度',en,zh,'0%');
  const hour = (en,zh) => bucket('Five Hour Limit Remaining','5 小时剩余额度',en,zh,'0%');
  const body = box({class:'gap-4'},
    group('Gemini Models','Gemini 模型',bucket('Weekly Limit Remaining','每周剩余额度',
      weekly+'6 days, 10 hours.','每周额度已使用一部分，将在 6 天 10 小时后全部恢复。'),
      week(weeklyPaid,'每周额度已用尽，将在 6 天 10 小时后恢复。'+paidZh),
      week(weeklyOnly,'每周额度已用尽，5 小时额度限制暂不适用。每周额度将在 1 天后全部恢复。')),
    group('Claude and GPT models','Claude 与 GPT 模型',bucket('Five Hour Limit Remaining','5 小时剩余额度',
      hourly+'3 hours, 19 minutes.','5 小时额度已使用一部分，将在 3 小时 19 分钟后全部恢复。'),
      hour(hourlyHit+'it refreshes in 1 minute.'+paid,'5 小时额度已用尽，将在 1 分钟后恢复。'+paidZh),
      hour(hourlyOnly,'5 小时额度已用尽，每周额度限制暂不适用。5 小时额度将在 3 小时 19 分钟后全部恢复。'),
      week(malformed,malformed),week(mismatch,mismatch)),
    group('Settings','Settings',bucket('Settings','Settings',hourly+'3 hours,, 19 minutes.',hourly+'3 hours,, 19 minutes.')));
  const pageName = element('span',{},'Models & Usage');
  const title = box({class:'mb-2'},box({class:'justify-between'},box({class:'flex-1'},withChildren(element('h2'),box({},pageName)))));
  const page = box({class:'max-w-2xl gap-4'},title,box({class:'gap-8'},body));
  root.append(box({class:'settings-modal-container'},page));
  const custom = element('button',{'data-testid':'model-selector-custom-item'},'Gemini Models');
  const copy = page.cloneNode(true);
  const prose = element('span',{},weeklyPaid);
  root.append(custom,box({'data-testid':'user-message'},copy),prose);
  const api = mount(releaseLocale);
  for (const mode of ['zh','en','zh']) {
    api.setMode(mode); await tick();
    for (const [el,node,en,zh] of checked) {
      equal(el.firstChild,node,en); equal(node.nodeValue,mode === 'zh' ? zh : en,en);
    }
    equal(custom.textContent,'Gemini Models','custom model name');
    equal(prose.textContent,weeklyPaid,'exhausted quota sentence outside quota card');
    equal(copy.querySelector('h3').textContent,'Gemini Models','same quota card inside user message');
    equal(copy.querySelectorAll('.whitespace-pre-wrap')[1].textContent,weeklyPaid,'same quota description inside user message');
  }
  pageName.textContent = 'General'; await tick();
  equal(page.querySelector('h3').textContent,'Gemini Models','same group name outside the quota page');
  equal(page.querySelectorAll('.whitespace-pre-wrap')[1].textContent,weeklyPaid,'same exhausted quota card on General page');
});

test('permission settings rows translate their own description and Open action', async () => {
  const tool = 'Modify permissions for file and terminal tools.';
  const mcp = 'Modify permissions for file, terminal, and MCP tools.';
  const command = 'Configure allowed terminal commands.';
  const leaves = [];
  function leaf(tag, attrs, en, zh = en) {
    const el = element(tag,attrs,en);
    leaves.push([el,el.firstChild,en,zh]);
    return el;
  }
  function row(id,title,description,translation,caption = 'Open',buttonZh = '打开') {
    const toolRow = id === 'tool-permissions-row';
    const name = leaf('span',{},title,toolRow ? '工具权限' : '终端命令');
    const badge = leaf('span',{'data-testid':'settings-row-badge'},'2');
    const desc = leaf('span',{class:'text-sm text-muted-foreground whitespace-pre-wrap'},description,translation);
    const action = leaf('button',{type:'button',class:'agy-button agy-button-'+(toolRow ? 'md' : 'sm')},caption,buttonZh);
    return box({'data-testid':id,class:'py-2 px-3 w-full bg-transparent flex justify-between gap-4 items-center'},
      box({class:'flex-1 flex flex-col gap-0.5'},box({class:'flex items-center gap-1.5'},name,badge),desc),
      box({class:'shrink-0'},action));
  }
  const toolRow = row('tool-permissions-row','Tool permissions',tool,'修改文件和终端工具的权限。');
  const mcpRow = row('tool-permissions-row','Tool permissions',mcp,'修改文件、终端和 MCP 工具的权限。');
  const cmdRow = row('command-permissions-row','Terminal commands',command,'设置允许执行的终端命令。');
  const misplaced = row('command-permissions-row','Terminal commands',mcp,mcp,'Settings','Settings');
  misplaced.firstElementChild.append(box({class:'w-full'},
    leaf('button',{class:'agy-button agy-button-sm'},'Open'),
    leaf('span',{class:'whitespace-pre-wrap'},command)));
  const copy = cmdRow.cloneNode(true);
  root.append(toolRow,mcpRow,cmdRow,misplaced,box({'data-testid':'user-message'},copy));
  const api = mount(releaseLocale);
  for (const mode of ['zh','en','zh']) {
    api.setMode(mode); await tick();
    for (const [el,node,en,zh] of leaves) {
      equal(el.firstChild,node,en); equal(node.nodeValue,mode === 'zh' ? zh : en,en);
    }
    equal(copy.querySelector('.whitespace-pre-wrap').textContent,command,'permission description in user message');
    equal(copy.querySelector('button').textContent,'Open','permission button in user message');
  }
});

test('General and Application settings translate only their audited layout, link and toggle leaves', async () => {
  const checked = [];
  function check(el, en, zh, attr) {
    checked.push([el,en,zh,attr]);
    return el;
  }
  const detailTerms = [];
  function option(id,title,titleZh,description,descriptionZh) {
    detailTerms.push(title,description);
    const label = check(element('span',{class:'font-medium'},title),title,titleZh);
    const desc = check(element('div',{id:'description-'+id,class:'leading-snug'},description),description,descriptionZh);
    return check(withChildren(element('button',{'data-testid':'mode-option-'+id,'aria-label':title}),
      box({}),box({class:'mt-2'},label),desc),title,titleZh,'aria-label');
  }
  const modes = box({id:'project4kMode'},
    option('non-technical','Knowledge Work','知识工作','Simplified interface for research, writing, and everyday tasks.','精简界面，适合研究、写作和日常任务。'),
    option('developer','Software Engineering','软件工程','Full interface for coding, developer tools, and managing agents.','完整界面，支持编程、使用开发工具和管理 AI 助手。'));
  const queue = check(element('button',{'data-tooltip-id':'queue-tip','aria-label':'Queue until after the current turn.'},'Queue'),'Queue','排队');
  const queueDecoy = element('button',{'data-tooltip-id':'else','aria-label':'another toggle'},'Queue');
  const app = check(element('div',{class:'text-muted-foreground'},'Manage Antigravity app settings.'),
    'Manage Antigravity app settings.','管理 Antigravity 的应用设置。');
  const appHeading = box({class:'mb-2'},box({class:'justify-between'},box({class:'flex-1'},element('h2',{},'Application'),app)));
  const linkAttrs = {href:'https://antigravity.google/docs/permissions',class:'text-link font-medium',target:'_blank',rel:'noopener noreferrer'};
  const link = check(element('a',linkAttrs,'Learn more'),'Learn more','了解更多');
  const bad = element('a',{...linkAttrs, href:'https://example.invalid/docs/permissions'},'Learn more');
  const punctuation = document.createTextNode('.');
  const subtitle = withChildren(element('span'),document.createTextNode('Configure what the agent can do in local and remote conversations. '),
    link,punctuation,bad);
  const grants = box({id:'agent-permissions'},box({class:'space-y-2'},box({class:'gap-1'},box({class:'leading-relaxed'},subtitle))));
  const page = box({class:'max-w-2xl gap-4'},appHeading,modes,grants,box({'data-slot':'toggle-group'},queue,queueDecoy));
  const clone = page.cloneNode(true);
  const prose = element('span',{},'Queue');
  const elsewhere = element('a', linkAttrs, 'Learn more');
  root.append(box({class:'settings-modal-container'},page),box({'data-testid':'agent-response'},clone),prose,elsewhere);
  const api = mount(releaseLocale);
  for (const mode of ['zh','en','zh']) {
    api.setMode(mode); await tick();
    for (const [el,en,zh,attr] of checked) equal(attr ? el.getAttribute(attr) : el.textContent, mode === 'zh' ? zh : en,en);
    equal(punctuation.nodeValue,mode === 'zh' ? '。' : '.','link period');
    equal(link.getAttribute('href'),linkAttrs.href,'official destination');
    equal(bad.textContent,'Learn more','custom destination'); equal(elsewhere.textContent,'Learn more','user link to same docs');
    equal(clone.querySelector('.font-medium').textContent,'Knowledge Work','AI text');
    equal(queueDecoy.textContent,'Queue','another toggle'); equal(prose.textContent,'Queue','ordinary text');
  }
  link.href = 'https://example.invalid'; await tick();
  equal(link.textContent,'Learn more','changed destination'); equal(punctuation.nodeValue,'.','changed destination punctuation');
  for (const en of [...detailTerms, 'Queue']) seenReleaseTerms.add('settings-detail|'+en);
});

function settingsPageFixture(title, subtitle, ...sections) {
  const heading = element('h2',{class:'m-0 font-medium truncate flex-1 text-foreground'},title);
  const headingBox = box({class:'flex-1 flex flex-col gap-1 min-w-0'},heading);
  if (subtitle) headingBox.append(element('div',{class:'text-muted-foreground bg-transparent'},subtitle));
  const body = box({class:'flex flex-col gap-8 w-full'},...sections);
  const page = box({class:'flex flex-col gap-4 w-full max-w-2xl mx-auto'},
    box({class:'flex flex-col gap-2 w-full mb-2'},box({class:'flex justify-between items-start gap-4'},headingBox)),body);
  return {container:box({class:'settings-modal-container'},box({class:'w-full'},page)),heading,body};
}

test('release dictionary translates search and opt-out hints without changing input or selection', async () => {
  const shortcut = element('input',{type:'text','aria-label':'Search shortcuts'});
  const language = element('input',{type:'text',role:'combobox','data-testid':'dictation-languages-search-input'});
  const reason = element('textarea',{rows:'3','aria-label':'Reason for opting out'});
  const hints = [
    [shortcut,'Search shortcuts...','搜索快捷键…'],
    [language,'Search languages to add (e.g. English, Spanish, 中文, yue)...','搜索要添加的语言（如 English、Spanish、中文、yue）…'],
    [reason,'(Optional) Tell us more or type your reason...','（可选）请补充说明或填写原因…']
  ];
  root.append(shortcut,language,reason);
  for (const [id,en,zh] of [
    ['project-selector-ssh-host-search','Search Hosts…','搜索主机…'],
    ['project-selector-github-repos-search','Search Repositories…','搜索代码仓库…'],
    ['identity-search','Search by name or username','按姓名或用户名搜索'],
    ['menu-search','Search filters…','搜索筛选条件…'],
    ['menu-search','Search triggers…','搜索触发器…']
  ]) {
    const input = element('input',{type:'text','aria-label':id === 'identity-search' ? 'Search identities' : en});
    root.append(box({'data-testid':id},input));
    hints.push([input,en,zh]);
  }
  for (const [field,en] of hints) {
    field.placeholder = en;
    field.value = en;
  }
  const protectedField = shortcut.cloneNode();
  root.append(box({'data-testid':'user-message'},protectedField));
  const api = mount(releaseLocale);
  shortcut.focus(); shortcut.setSelectionRange(2,9,'backward');
  for (const mode of ['zh','en','zh']) {
    api.setMode(mode); await tick();
    for (const [field,en,zh] of hints) {
      equal(field.placeholder,mode === 'zh' ? zh : en,en);
      equal(field.value,en,'typed content for '+en);
    }
    equal(shortcut.getAttribute('aria-label'),mode === 'zh' ? '搜索快捷键' : 'Search shortcuts','shortcut search accessible name');
    equal(document.activeElement,shortcut,'search focus');
    equal(shortcut.selectionStart,2,'selection start'); equal(shortcut.selectionEnd,9,'selection end');
    equal(shortcut.selectionDirection,'backward','selection direction');
    equal(protectedField.placeholder,'Search shortcuts...','placeholder in user content');
    equal(protectedField.getAttribute('aria-label'),'Search shortcuts','accessible name in user content');
  }
});

test('feedback form switches language without changing radio values, typed feedback or attachments', async () => {
  const types = [
    ['bug-report','Bug Report','Describe the bug you encountered...',
      'Please describe the issue in detail. The more actionable your feedback, the quicker our team can address your request. Some helpful information includes:',
      'Steps to reproduce the issue'],
    ['feature-request','Feature Request','Describe the feature you would like to see...',
      "Please describe the feature you'd like to see. The more detailed the requirements, the easier it will be for our team to incorporate your ideas. Some helpful information includes:",
      'What is missing in your workflow'],
    ['auth-and-billing','Auth and Billing','Describe your auth or billing issue...',
      'Please describe your auth or billing issue. More details will help our support team resolve your issue quicker. Some helpful information includes:',
      'What quota or feature is being incorrectly limited'],
    ['remote-control-issue','Remote Control Issue','Describe your Remote Control issue...',
      'Use this form if you cannot connect to Remote Control. If your instance is already connected and you are experiencing issues in the browser, report directly from the Remote Control web page so that relevant logs are included. Some helpful information includes:',
      'Whether it never connects or is intermittent/flaky'],
    ['general-feedback','General Feedback','Enter your feedback here...',
      'For any feedback that does not fit into the above categories.'],
  ];
  const copy = releaseLocale.scoped.find(group => group.scope === 'feedback').entries;
  function translation(en) {
    if (Object.hasOwn(copy,en)) {
      seenReleaseTerms.add('feedback|'+en);
      return copy[en];
    }
    return releaseLocale.exact[en];
  }
  const radios = types.map(([value,caption]) => {
    const input = element('input',{type:'radio',name:'feedbackType',value});
    const label = element('span',{class:'opacity-80'},caption);
    return {input,label,text:label.firstChild,control:withChildren(element('label',{class:'flex items-center gap-2 cursor-pointer'}),input,label)};
  });
  const field = element('textarea',{class:'w-full h-48 p-3','aria-invalid':'false'});
  field.value = 'Bug Report: please keep this text.';
  field.setSelectionRange(2,8);
  const hint = box({class:'opacity-70 mb-2'});
  const filename = element('span',{class:'truncate flex-1 opacity-90'},'Settings');
  const {container,heading} = settingsPageFixture('Give Feedback',null,
    box({class:'space-y-3'},element('label',{class:'block font-medium opacity-70'},'Feedback Type'),
      box({class:'flex flex-col gap-2'},...radios.map(r => r.control))),
    box({class:'space-y-2'},element('label',{class:'block font-medium opacity-70'},'Description'),hint,box({class:'relative'},field)),
    box({class:'space-y-2'},element('input',{type:'file',accept:'image/*',class:'hidden'}),
      box({class:'flex items-center gap-2 p-2 rounded-md bg-muted border'},filename)));
  const titleNode = heading.firstChild;
  const prose = box({'data-testid':'user-message'},container.cloneNode(true));
  const decoy = element('a',{href:'https://example.invalid/feedback'},'Give Feedback');
  root.append(container,decoy,prose);
  const api = mount({...releaseLocale,custom:{Settings:'不应改写附件名'}});
  for (const [index,[value,,placeholder,intro,bullet]] of types.entries()) {
    radios[index].input.checked = true;
    radios[index].input.dispatchEvent(new Event('change',{bubbles:true}));
    const introNode = document.createTextNode(intro);
    hint.replaceChildren(introNode);
    const item = bullet && element('li',{},bullet);
    if (item) hint.append(withChildren(element('ul',{class:'list-disc pl-5 mt-1 space-y-0.5'}),item));
    field.placeholder = placeholder;
    for (const mode of ['zh','en','zh']) {
      api.setMode(mode); await tick();
      equal(heading.firstChild,titleNode,'same feedback heading node');
      equal(titleNode.nodeValue,mode === 'zh' ? '提供反馈' : 'Give Feedback','feedback page title');
      for (const [i,{input,label,text}] of radios.entries()) {
        equal(label.firstChild,text,'same feedback type node');
        equal(text.nodeValue,mode === 'zh' ? translation(types[i][1]) : types[i][1],'radio caption '+types[i][0]);
        equal(input.value,types[i][0],'submitted category key');
        equal(input.checked,i === index,'checked radio');
      }
      equal(hint.firstChild,introNode,'same feedback guidance node');
      equal(introNode.nodeValue,mode === 'zh' ? translation(intro) : intro,'guidance for '+value);
      if (item) equal(item.textContent,mode === 'zh' ? translation(bullet) : bullet,'guidance bullet');
      equal(field.placeholder,mode === 'zh' ? translation(placeholder) : placeholder,'placeholder for '+value);
      equal(field.value,'Bug Report: please keep this text.','typed feedback');
      equal(field.selectionStart,2,'textarea selection start'); equal(field.selectionEnd,8,'textarea selection end');
      equal(filename.textContent,'Settings','user attachment name');
      equal(decoy.textContent,'Give Feedback','user feedback link');
      equal(prose.querySelector('h2').textContent,'Give Feedback','feedback form copied into a conversation');
    }
  }
  radios[0].input.value = 'custom-value'; await tick();
  equal(radios[0].label.textContent,'Bug Report','category reused for a different submission value');
});

function settingsRow(label, description, right, attrs = {}) {
  const labelBox = withChildren(element('span'),label);
  return box({class:'py-2 px-3 w-full bg-transparent flex justify-between gap-4 items-center',...attrs},
    box({class:'flex-1 flex flex-col gap-0.5'},box({class:'flex items-center gap-1.5'},labelBox),description),
    box({class:'shrink-0'},right));
}
function settingsSection(name,...rows) {
  return box({class:'space-y-2'},box({class:'flex flex-col gap-1'},
    box({class:'flex items-center justify-between'},box({class:'flex items-center gap-1.5'},element('h3',{class:'m-0 font-medium'},name)))),
    box({},box({class:'agy-card bg-transparent rounded-xl'},...rows)));
}

test('Account settings translate product and subscription copy while preserving plan names and link destinations', async () => {
  const telemetry = 'When toggled on, Antigravity collects usage data to help Google enhance performance and features.';
  const emails = 'Receive product updates, tips, and promotions from Google Antigravity via email.';
  const plan = 'Your plan: Google AI Pro';
  const offer = 'You can upgrade to a Google AI Ultra plan to receive higher rate limits.';
  const upgradeHref = 'https://one.google.com/ai?utm_campaign=ARGON_SETTINGS_PAGE';
  const termsHref = 'https://antigravity.google/terms';
  function toggle(label, en, id, testid) {
    const desc = element('span',{id:id+'-hint',class:'text-sm text-muted-foreground whitespace-pre-wrap'},en);
    const right = element('button',{type:'button',role:'switch','aria-checked':'false','aria-labelledby':id,'aria-describedby':desc.id});
    const container = settingsRow(document.createTextNode(label),desc,right,testid ? {'data-testid':testid} : {});
    container.querySelector('.flex-1 > div > span').id = id;
    return {container,desc};
  }
  function anchor(href,label,cls,rel) {
    return element('a',{href,class:cls,target:'_blank',rel},label);
  }
  const first = toggle('Enable telemetry',telemetry,'test-telemetry','telemetry-setting-row');
  const second = toggle('Marketing emails',emails,'test-email');
  first.container.querySelector('button').dataset.testid = 'telemetry-switch';
  const title = element('div',{class:'font-medium'},plan);
  const offerEl = element('span',{class:'text-sm text-muted-foreground whitespace-pre-wrap'},offer);
  const upgrade = anchor(upgradeHref,'Upgrade','select-none rounded px-3 py-1 font-medium transition-colors cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90','noopener noreferrer');
  const membership = settingsRow(title,offerEl,upgrade);
  const email = element('span',{class:'text-sm text-muted-foreground whitespace-pre-wrap'},'person@example.invalid');
  const account = settingsSection('Account',membership,settingsRow(document.createTextNode('Email'),email,element('button',{},'Sign Out')));
  const terms = anchor(termsHref,'Terms of Service','text-link hover:underline','noreferrer');
  const footer = box({class:'text-sm text-muted-foreground mt-auto pt-4'},'By using this app, you agree to its',' ',terms);
  const {container} = settingsPageFixture('Account','Manage your plan, credentials, and general preferences.',
    settingsSection('General',first.container,second.container),account,footer);
  const fakeTerms = terms.cloneNode(true), fakeUpgrade = upgrade.cloneNode(true);
  const copy = box({'data-testid':'user-message'},container.cloneNode(true));
  const ordinary = element('p',{},offer);
  const elsewhere = box({},fakeTerms,fakeUpgrade,ordinary);
  root.append(container,copy,elsewhere);
  const checks = [
    [first.desc,telemetry,'开启后，Antigravity 会收集使用数据，帮助 Google 改进性能和功能。'],
    [second.desc,emails,'通过电子邮件接收 Google Antigravity 的产品更新、使用技巧和促销信息。'],
    [title,plan,'当前方案：Google AI Pro'],
    [offerEl,offer,'升级到 Google AI Ultra 方案可获得更高的用量上限。'],
    [upgrade,'Upgrade','升级'],[terms,'Terms of Service','服务条款'],
  ].map(([el,en,zh]) => ({el,en,zh,node:el.firstChild}));
  const api = mount(releaseLocale);
  for (const mode of ['zh','en','zh']) {
    api.setMode(mode); await tick();
    for (const {el,en,zh,node} of checks) {
      equal(el.firstChild,node,'same Account text node');
      equal(node.nodeValue,mode === 'zh' ? zh : en,en);
    }
    equal(upgrade.getAttribute('href'),upgradeHref,'upgrade destination');
    equal(terms.getAttribute('href'),termsHref,'terms destination');
    equal(email.textContent,'person@example.invalid','user email');
    equal(copy.querySelector('[data-testid="telemetry-setting-row"] .whitespace-pre-wrap').textContent,telemetry,'Account copy in user content');
    equal(ordinary.textContent,offer,'upgrade sentence in ordinary prose');
    equal(fakeUpgrade.textContent,'Upgrade','Google One link outside Account');
    equal(fakeTerms.textContent,'Terms of Service','terms link outside Account');
  }
  seenReleaseTerms.add('settings-detail|'+telemetry.replace('Antigravity','${f.product.nameShort}'));
  seenReleaseTerms.add('settings-detail|'+emails.replace('Antigravity','${f.product.nameShort}'));
  seenReleaseTerms.add('settings-detail|Your plan: ${I}');
  const unusual = 'Settings $& / Pro';
  title.firstChild.nodeValue = 'Your plan: '+unusual;
  const adc = document.createTextNode(' (ADC)');
  title.append(adc);
  offerEl.firstChild.nodeValue = 'You can upgrade to a '+unusual+' plan to receive higher rate limits.';
  upgrade.href = 'https://one.google.com.example.invalid/ai?utm_campaign=ARGON_SETTINGS_PAGE';
  terms.href = 'https://antigravity.google.example.invalid/terms';
  await tick();
  equal(title.textContent,'当前方案：'+unusual+' (ADC)','literal interpolated plan and separate ADC suffix');
  equal(title.lastChild,adc,'original ADC node');
  equal(offerEl.textContent,'升级到 '+unusual+' 方案可获得更高的用量上限。','punctuation in upgrade plan');
  equal(upgrade.textContent,'Upgrade','look-alike subscription origin');
  equal(terms.textContent,'Terms of Service','look-alike terms origin');
  offerEl.textContent = 'Settings'; await tick();
  equal(offerEl.textContent,'Settings','arbitrary server-provided plan description');
});

test('marketplace disclaimer keeps the privacy URL and restores its original text node', async () => {
  const privacy = 'https://policies.google.com/privacy';
  const en = 'Google does not control the availability or functionality of third party developer tools. Your data from third party developer tools connected to your Antigravity instance may be shared with Google. Google will protect any such data in accordance with the Google Privacy Policy, found here: ';
  const key = en+'{privacyPolicyLink}';
  const entries = releaseLocale.scoped.find(group => group.scope === 'marketplace-notice').entries;
  const zh = entries[key].replace('{privacyPolicyLink}','');
  function footer(href, text = en, wrap = true) {
    const prefix = document.createTextNode(text);
    const link = element('a',{href,target:'_blank',rel:'noopener noreferrer',class:'text-link hover:underline'},privacy);
    const p = withChildren(element('p',{'data-testid':'third-party-tools-disclaimer',class:'m-0 text-sm text-muted-foreground leading-relaxed'}),
      prefix,wrap ? withChildren(element('span'),link) : link);
    const host = withChildren(element('footer',{'data-testid':'marketplace-footer','aria-label':'Marketplace notice'}),p);
    return {host,p,prefix,link};
  }
  const actual = footer(privacy), direct = footer(privacy,en,false);
  const foreign = footer('https://policies.google.com.example.invalid/privacy');
  const modified = footer(privacy+'?redirect=custom');
  const other = footer(privacy,'Third-party developer summary. ');
  const outside = footer(privacy), inMessage = footer(privacy);
  root.append(box({'data-testid':'customizations-marketplace'},actual.host,direct.host,foreign.host,modified.host,other.host),
    outside.host,box({'data-markdown-root':''},box({'data-testid':'customizations-marketplace'},inMessage.host)));
  const api = mount(releaseLocale);
  for (const mode of ['zh','en','zh']) {
    api.setMode(mode); await tick();
    for (const {p,prefix,link} of [actual,direct]) {
      equal(p.firstChild,prefix,'same disclaimer node');
      equal(prefix.nodeValue,mode === 'zh' ? zh : en,'marketplace disclaimer');
      equal(link.textContent,privacy,'original privacy URL label');
      equal(link.getAttribute('href'),privacy,'original privacy URL target');
    }
    for (const row of [foreign,modified,outside,inMessage]) equal(row.prefix.nodeValue,en,'out-of-scope or unofficial URL');
    equal(other.prefix.nodeValue,'Third-party developer summary. ','custom marketplace text');
  }
  seenReleaseTerms.add('marketplace-notice|'+key);
  actual.link.href = 'https://example.invalid/privacy'; await tick();
  equal(actual.prefix.nodeValue,en,'disclaimer restored after link target changes');
  actual.link.href = privacy; await tick();
  equal(actual.prefix.nodeValue,zh,'original URL makes the disclaimer eligible again');
});

test('Models & Usage localizes the split plan and the credit switch at their own display sites', async () => {
  const prefix = document.createTextNode('Your plan: ');
  const name = document.createTextNode('Settings');
  const planLabel = withChildren(element('div',{class:'font-medium'}),prefix,name);
  const descClass = {class:'text-sm text-muted-foreground whitespace-pre-wrap'};
  const offer = 'You can upgrade to a Google AI Ultra plan to receive higher rate limits.';
  const offerEl = element('span',descClass,offer);
  const url = 'https://one.google.com/ai?utm_campaign=ARGON_MODELS_PAGE';
  const upgrade = element('a',{href:url,target:'_blank',rel:'noopener noreferrer',
    class:'select-none rounded px-3 py-1 font-medium bg-primary text-primary-foreground'},'Upgrade');
  const section = settingsSection('Plan',settingsRow(planLabel,offerEl,upgrade));
  const template = "When toggled on, ${g} will use your AI credits to fulfill model requests once you're out of model quota. ${g} will always use your model quota first before using AI credits.";
  const text = template.replaceAll('${g}','Antigravity');
  const overages = element('span',descClass,text);
  const id = 'provider-switch-label-42';
  const toggle = element('button',{role:'switch','aria-checked':'false','aria-labelledby':id});
  const credits = settingsRow('Enable AI credit overages',overages,toggle);
  credits.querySelector('.flex-1 > div > span').id = id;
  const {container,heading} = settingsPageFixture('', 'Manage your model quota and credits.',
    section,settingsSection('Model Credits',credits));
  heading.replaceChildren(box({class:'flex items-center gap-1.5'},element('span',{},'Models & Usage'),
    element('button',{title:'Refresh quota and credits data','aria-label':'Refresh quota and credits data'})));
  const copy = box({'data-markdown-root':''},container.cloneNode(true));
  const outside = element('p',{},text);
  root.append(container,copy,outside);
  const api = mount(releaseLocale);
  for (const mode of ['zh','en','zh']) {
    api.setMode(mode); await tick();
    const zh = mode === 'zh';
    equal(section.querySelector('h3').textContent,zh ? '订阅方案' : 'Plan','model plan section heading');
    equal(planLabel.firstChild,prefix,'original plan prefix node');
    equal(planLabel.lastChild,name,'original tier name node');
    equal(prefix.nodeValue,zh ? '当前方案：' : 'Your plan: ','split plan prefix');
    equal(name.nodeValue,'Settings','tier name that collides with the dictionary');
    equal(offerEl.textContent,zh ? '升级到 Google AI Ultra 方案可获得更高的用量上限。' : offer,'model page upgrade offer');
    equal(upgrade.textContent,zh ? '升级' : 'Upgrade','model page upgrade link');
    equal(upgrade.getAttribute('href'),url,'model page upgrade URL');
    equal(overages.textContent,zh ? '开启后，Antigravity 会优先使用模型配额。模型配额用尽后，才会使用你的 AI 积分处理模型请求。' : text,'credit policy and brand');
    equal(toggle.getAttribute('aria-checked'),'false','model credit switch state');
    equal(copy.querySelector('.whitespace-pre-wrap').textContent,offer,'offer in protected content');
    equal(outside.textContent,text,'overages sentence in ordinary prose');
  }
  for (const key of ['Plan',template]) seenReleaseTerms.add('settings-detail|'+key);
  name.nodeValue = 'Google AI Pro $&';
  upgrade.href = url.replace('ARGON_MODELS_PAGE','ARGON_SETTINGS_PAGE');
  overages.firstChild.nodeValue = text.replace('Antigravity will always','Another product will always');
  await tick();
  equal(planLabel.textContent,'当前方案：Google AI Pro $&','reused tier name');
  equal(upgrade.textContent,'Upgrade','account campaign in a model page');
  equal(overages.textContent,text.replace('Antigravity will always','Another product will always'),'mismatched brands in reused description');
  upgrade.href = url.replace('one.google.com','one.google.com.example.invalid'); await tick();
  equal(upgrade.textContent,'Upgrade','unofficial model subscription destination');
  upgrade.href = url; await tick();
  equal(upgrade.textContent,'升级','official model subscription destination restored');
});

test('project subtitles and token breakdown controls preserve the editable project name', async () => {
  const initial = 'Manage project folders and settings.';
  const buttonClass = 'agy-button agy-button-sm text-link hover:text-foreground duration-150';
  function tokenRow(en,zh,caption) {
    const toggle = element('button',{type:'button',class:buttonClass},caption);
    const name = element('span',{class:'text-secondary-foreground'},en);
    const legend = box({class:'flex items-center gap-2'},
      box({class:'w-2 h-2 rounded-full shrink-0'}),name,
      withChildren(element('span',{class:'tabular-nums text-muted-foreground'}),'(','108',' tokens)',' 2.0%'));
    const row = box({class:'flex flex-col'},box({class:'flex items-center justify-between text-sm'},legend,toggle));
    return {en,zh,name,node:name.firstChild,toggle,row};
  }
  const single = tokenRow('Rules','规则','Show 1 breakdown');
  const plural = tokenRow('Skills','技能','Show 12 breakdowns');
  const categories = [single,plural,tokenRow('MCP','MCP','Show 1 breakdown'),
    tokenRow('MCP Tools','MCP 工具','Show 1 breakdown'),tokenRow('Settings','Settings','Show 1 breakdown')];
  const groups = box({class:'flex flex-col gap-3'},box({class:'flex flex-col gap-1'},...categories.map(c => c.row)));
  const info = box({},box({class:'flex flex-col gap-2'}),box({class:'mt-4'},groups));
  const unrelated = element('button',{class:buttonClass},'Show 2 breakdowns');
  const content = box({'data-testid':'project-customizations-content',class:'flex flex-col gap-1 w-full'},
    box({class:'space-y-6'},box({class:'agy-card'},box({class:'py-2 px-3 w-full'},info))),unrelated);
  const {container,heading} = settingsPageFixture('',initial,settingsSection('Customizations',content));
  const title = element('span',{class:'truncate inline-block text-xl font-medium'},'Settings');
  const edit = element('button',{'aria-label':'Edit project name',class:'text-muted-foreground cursor-pointer'});
  const header = box({class:'flex items-center gap-2 h-7'},title,edit);
  heading.replaceChildren(header);
  const sub = heading.nextElementSibling, subNode = sub.firstChild, titleNode = title.firstChild;
  const toggleNode = single.toggle.firstChild;
  const prose = box({'data-testid':'user-message'},container.cloneNode(true));
  root.append(container,prose);
  const api = mount(releaseLocale);
  function checkCategories(mode) {
    for (const {en,zh,name,node} of categories) {
      equal(name.firstChild,node,'same category node for '+en);
      equal(node.nodeValue,mode === 'zh' ? zh : en,'token category '+en);
    }
  }
  for (const mode of ['zh','en','zh']) {
    api.setMode(mode); await tick();
    const zh = mode === 'zh';
    checkCategories(mode);
    equal(sub.firstChild,subNode,'original project subtitle node');
    equal(subNode.nodeValue,zh ? '管理项目文件夹和设置。' : initial,'project settings subtitle');
    equal(title.firstChild,titleNode,'original project name node');
    equal(titleNode.nodeValue,'Settings','user project name colliding with a dictionary term');
    equal(single.toggle.firstChild,toggleNode,'same breakdown button text node');
    equal(toggleNode.nodeValue,zh ? '展开 1 项明细' : 'Show 1 breakdown','singular breakdown count');
    equal(plural.toggle.textContent,zh ? '展开 12 项明细' : 'Show 12 breakdowns','plural breakdown count');
    equal(unrelated.textContent,'Show 2 breakdowns','unrelated project button');
    equal(prose.querySelector('h2 + div').textContent,initial,'project page copied into user content');
    equal(prose.querySelector('button.agy-button').textContent,'Show 1 breakdown','breakdown in user content');
    equal(prose.querySelector('.gap-1 > .flex-col .text-secondary-foreground').textContent,'Rules','category in user content');
  }
  // zYb mounts child rows beside the category header. F.name and ca.name may
  // contain a path or exactly match an official category.
  const filenames = ['/Users/example/project/AGENTS.md','Rules','Skills','MCP','MCP Tools'];
  const fileRows = filenames.map(filename => {
    const name = element('span',{class:'text-secondary-foreground truncate'},filename);
    const nested = element('span',{class:'text-muted-foreground truncate'},'Skills');
    const detail = box({class:'flex flex-col'},
      box({class:'flex items-center justify-between text-sm'},
        box({class:'flex items-center gap-2 min-w-0'},
          box({class:'w-1.5 h-1.5 rounded-full shrink-0 opacity-60'}),name),
        box({class:'flex items-center gap-2 shrink-0'},element('button',{class:buttonClass},'Hide tools'),
          element('span',{class:'tabular-nums text-muted-foreground'},'108'))),
      box({class:'flex flex-col gap-0.5 ml-4 mt-0.5 mb-0.5'},
        box({class:'flex items-center justify-between text-sm'},box({class:'flex items-center gap-2 min-w-0'},
          box({class:'w-1 h-1 rounded-full shrink-0 bg-muted'}),nested))));
    return {detail,name,nested,nameNode:name.firstChild,nestedNode:nested.firstChild,filename};
  });
  const children = box({class:'flex flex-col gap-0.5 ml-4 mt-1 mb-1'},...fileRows.map(f => f.detail));
  toggleNode.nodeValue = 'Show 5 breakdowns'; await tick();
  equal(toggleNode.nodeValue,'展开 5 项明细','updated token breakdown count');
  single.row.append(children);
  toggleNode.nodeValue = 'Hide breakdown';
  unrelated.firstChild.nodeValue = 'Hide breakdown';
  await tick();
  equal(toggleNode.nodeValue,'隐藏明细','newly expanded button in the active language');
  checkCategories('zh');
  // The project content test ID also identifies the panel without the settings shell.
  root.append(content); await tick();
  for (const mode of ['zh','en','zh']) {
    api.setMode(mode); await tick();
    checkCategories(mode);
    equal(toggleNode.nodeValue,mode === 'zh' ? '隐藏明细' : 'Hide breakdown','expanded token details');
    equal(unrelated.textContent,'Hide breakdown','unrelated collapse button');
    for (const {name,nameNode,nested,nestedNode,filename} of fileRows) {
      equal(name.firstChild,nameNode,'original F.name node'); equal(name.textContent,filename,'child path or name');
      equal(nested.firstChild,nestedNode,'original ca.name node'); equal(nested.textContent,'Skills','nested tool name');
    }
  }
  children.remove(); toggleNode.nodeValue = 'Show 5 breakdowns'; await tick();
  equal(toggleNode.nodeValue,'展开 5 项明细','collapsed again after a language switch');
  checkCategories('zh');
  toggleNode.nodeValue = 'Show 3 breakdown'; await tick();
  equal(toggleNode.nodeValue,'Show 3 breakdown','unrecognized breakdown grammar');
  const input = element('input',{'data-testid':'inline-edit-input','aria-label':'Edit title',maxlength:'70'});
  input.value = 'Plan'; input.setSelectionRange(1,3);
  header.replaceChildren(input); await tick();
  equal(input.value,'Plan','typed project name'); equal(input.selectionStart,1,'rename selection');
  equal(sub.textContent,'管理项目文件夹和设置。','project subtitle during rename');
  header.replaceChildren(title,edit);
  edit.setAttribute('aria-label','Edit workspace name');
  subNode.nodeValue = 'Manage workspace resources and settings.'; await tick();
  equal(sub.textContent,'管理工作区资源和设置。','workspace resource subtitle');
  equal(titleNode.nodeValue,'Settings','workspace title preserved after rename');
  edit.setAttribute('aria-label','Edit project name'); await tick();
  equal(sub.textContent,'Manage workspace resources and settings.','mismatched workspace title');
  seenReleaseTerms.add('settings-detail|Manage ${A.lowercase} ${Ea?"resources":"folders"} and settings.');
  seenReleaseTerms.add('settings-detail|Show ${A.length} breakdown${A.length===1?"":"s"}');
  seenReleaseTerms.add('settings-detail|Hide breakdown');
});

test('feedback keeps the sender address and translates the complete official legal-help sentence', async () => {
  const email = 'Test.Team+QA@example.invalid';
  const source = 'Send feedback as '+email;
  function checkbox(text) {
    const input = element('input',{type:'checkbox',class:'sr-only'});
    const caption = document.createTextNode(text);
    const label = withChildren(element('label',{class:'leading-relaxed text-foreground flex gap-2 font-normal items-center'}),
      box({class:'relative flex items-center'},input,box({class:'flex h-4 w-4 rounded'})),caption);
    return {label,input,caption};
  }
  const logs = checkbox('Attach Antigravity server logs'), sender = checkbox(source);
  sender.input.checked = true;
  const url = 'https://support.google.com/legal/troubleshooter/1114905?hl=en#ts=1115658';
  const tail = 'to ask for content changes for legal reasons.';
  const english = 'Visit Legal Help '+tail;
  function legal(href,split) {
    const link = element('a',{href,target:'_blank',rel:'noopener noreferrer',class:'text-link hover:underline'},'Legal Help');
    const p = element('p',{class:'opacity-70'});
    if (split) p.append('Visit',' ',link,' ',tail);
    else p.append('Visit ',link,' '+tail);
    return {p,link,nodes:Array.from(p.childNodes),label:link.firstChild};
  }
  const split = legal(url,true), joined = legal(url,false);
  const lookalike = legal(url.replace('support.google.com','support.google.com.example.invalid'),true);
  const fragment = legal(url.replace('#ts=1115658','#ts=7'),true);
  const other = checkbox(source);
  const {container} = settingsPageFixture('Give Feedback',null,
    box({class:'space-y-2'},logs.label,box({'data-tooltip-id':'feedback-log-notice'},sender.label)),
    ...[split,joined,lookalike,fragment].map(({p}) => box({class:'space-y-3'},element('button',{class:'agy-button'},'Submit'),p)),
    box({class:'space-y-2'},other.label));
  const prose = box({'data-markdown-root':''},container.cloneNode(true));
  root.append(container,prose);
  const api = mount({...releaseLocale,custom:{[email]:'此处必须保留邮箱'}});
  for (const mode of ['zh','en','zh']) {
    api.setMode(mode); await tick();
    equal(sender.label.lastChild,sender.caption,'original sender caption');
    equal(sender.caption.nodeValue,mode === 'zh' ? '以 '+email+' 身份发送反馈' : source,'verbatim sender email');
    equal(sender.input.checked,true,'original checkbox state');
    equal(other.caption.nodeValue,source,'unrelated checkbox with identical text');
    for (const {p,link,nodes,label} of [split,joined]) {
      equal(p.textContent,mode === 'zh' ? '访问法律帮助，提交因法律原因更改内容的申请。' : english,'whole feedback legal sentence');
      nodes.forEach((node,i) => equal(p.childNodes[i],node,'original legal sentence child'));
      equal(link.firstChild,label,'original Legal Help text node');
      equal(link.getAttribute('href'),url,'original legal URL');
    }
    for (const {p} of [lookalike,fragment]) equal(p.textContent,english,'unofficial legal URL leaves all sentence fragments alone');
    equal(prose.querySelector('a').parentElement.textContent,english,'legal notice inside Markdown');
    equal(prose.querySelector('[data-tooltip-id] label').lastChild.nodeValue,source,'feedback checkbox inside Markdown');
  }
  seenReleaseTerms.add('feedback|Send feedback as ');
  seenReleaseTerms.add('feedback|'+tail);
  sender.caption.nodeValue = 'Send feedback as Changed+02@example.invalid';
  split.link.href = url.replace('?hl=en','?hl=en&next=outside'); await tick();
  equal(sender.caption.nodeValue,'以 Changed+02@example.invalid 身份发送反馈','updated email');
  equal(split.p.textContent,english,'old legal translations restored after destination changes');
  split.link.href = url; await tick();
  equal(split.link.textContent,'法律帮助','restored official legal link');
});

test('all shipped Hub translations have an exercised display path', () => {
  const scopes = new Set(['toolbar','workspace','settings','permissions','onboarding','model','agents','sidecar','settings-detail','feedback','marketplace-notice']);
  const missing = releaseLocale.scoped.filter(group => scopes.has(group.scope))
    .flatMap(({scope,entries}) => Object.keys(entries).filter(en => !seenReleaseTerms.has(scope+'|'+en))
      .map(en => scope+' / '+en));
  equal(missing.join(', '),'','unexercised release translation');
});

test('original nodes, whitespace and all three display attributes survive repeated switches', async () => {
  const el = button('  Save\n');
  for (const attr of ['placeholder', 'title', 'aria-label']) el.setAttribute(attr, 'Close');
  root.append(el);
  const text = el.firstChild;
  const api = mount();
  for (let n = 0; n < 4; n++) {
    api.setMode('zh');
    await tick();
    equal(el.firstChild, text, 'same text node');
    equal(text.nodeValue, '  保存\n', 'translated text preserves outer whitespace');
    for (const attr of ['placeholder', 'title', 'aria-label']) equal(el.getAttribute(attr), '关闭', attr);
    api.setMode('en');
    await tick();
    equal(text.nodeValue, '  Save\n', 'original text');
    for (const attr of ['placeholder', 'title', 'aria-label']) equal(el.getAttribute(attr), 'Close', 'restored ' + attr);
  }
});

test('data-only dictionaries, scoped matching, precedence and constrained templates', async () => {
  const model = 'model-selector-header';
  const nodes = [button('Save', model), button('Select', model), button('Select'), button('2 minutes ago', model),
    button('1 minute ago'), button('3 minutes ago', model), button('Markup'), button('4 minutes ago', model)];
  const literal = '<img src=x onerror=alert(1)>';
  root.append(...nodes);
  mount({
    custom: {Save: '我的保存', Markup: literal}, exact: {Save: '保存', '3 minutes ago': '刚刚'},
    scoped: [{scope: 'model', entries: {Save: '模型保存', Select: '选择模型', '3 minutes ago': '三分钟前', '4 minutes ago':'四分钟前'}}],
  });
  await tick();
  const expected = ['我的保存', '选择模型', 'Select', '2 分钟前', '1 分钟前', '刚刚', literal, '四分钟前'];
  nodes.forEach((el, i) => equal(el.textContent, expected[i], 'dictionary entry ' + i));
  equal(nodes[6].childElementCount, 0, 'translation stayed a Text node');
});

test('protected content overrides even a known UI control inside the subtree', async () => {
  const protectedRoots = [
    ...['pre','code','noscript','canvas','textarea'].map(tag => element(tag)),
    ...['SCRIPT','STYLE','SVG','MATH'].map(tag => tag === 'SVG' || tag === 'MATH'
      ? document.createElementNS(tag === 'SVG' ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1998/Math/MathML', tag.toLowerCase())
      : element(tag.toLowerCase(), tag === 'SCRIPT' ? {type:'text/plain'} : {})),
    element('div', {contenteditable:'true'}), element('div', {'data-lexical-editor':'true'}),
    ...['monaco-editor','cm-editor','xterm','terminal'].map(value => element('div', {class:value})),
    ...['user-message','user-message-content','agent-response','browser-subagent-thinking','side-question-followup-thinking',
      'bottom-terminal-panel','sidecar-iframe-slot'].map(id => element('div', {'data-testid':id})),
    element('div', {'data-bubble-side':'agent'}), element('div', {'data-diff-type':'added','data-file-uri':'local.txt'}),
  ];
  const leaves = protectedRoots.map(container => {
    const b = button('Save'); b.title = 'Close'; container.append(b); root.append(container); return b;
  });
  const input = element('input', {'data-testid':'new-conversation-button', value:'Save'});
  const textArea = element('textarea', {'data-testid':'new-conversation-button'}, 'Save');
  const bareProse = element('div', {}, 'Save');
  const bareSpan = element('span', {}, 'Close');
  const file = button('C:\\Users\\User\\Save.txt');
  const url = button('https://example.invalid/Save');
  const customModel = button('Save', 'model-selector-custom-item');
  const convoRow = box({}, element('span', {'data-testid':'conversation-row-chat-icon'}), element('div', {}, 'New Conversation'));
  root.append(input, textArea, bareProse, bareSpan, file, url, customModel, convoRow);
  const guest = element('iframe');
  root.append(guest);
  const guestLabel = guest.contentDocument.createElement('button');
  guestLabel.setAttribute('data-testid', 'new-conversation-button');
  guestLabel.textContent = 'Save'; guest.contentDocument.body.append(guestLabel);
  mount({custom:{[file.textContent]:'不可写', [url.textContent]:'不可写'}});
  await tick();
  for (const [i,b] of leaves.entries()) {
    equal(b.textContent, 'Save', protectedRoots[i].outerText || protectedRoots[i].nodeName);
    equal(b.title, 'Close', 'protected title ' + i);
  }
  for (const node of [bareProse, customModel, guestLabel]) equal(node.textContent, 'Save', 'protected or ambiguous prose');
  equal(bareSpan.textContent, 'Close', 'ambiguous short word in bare span');
  equal(convoRow.lastElementChild.textContent, 'New Conversation', 'conversation list title');
  equal(input.value, 'Save', 'input'); equal(textArea.value, 'Save', 'textarea');
  equal(file.textContent, 'C:\\Users\\User\\Save.txt', 'path');
  equal(url.textContent, 'https://example.invalid/Save', 'URL');
});

test('v0.2 four-layer engine: unregistered UI, dynamic templates, thinking boundary and zh-en-zh toggle', async () => {
  // Layer 2: Unregistered UI sentences, normalization (curly quotes / ellipsis / whitespace), attributes & shortcut suffix
  const heading = element('h2', {}, 'Choose how agents handle commands.');
  const titleCaseCompat = element('span', {}, 'Choose How Agents Handle Commands.');
  const curly = element('p', {}, 'It\u2019s ready to run...');
  const shortcutBtn = element('button', {}, 'Copy (Cmd+C)');
  const searchInput = element('input', {type: 'text', placeholder: 'Search settings...', value: 'Choose how agents handle commands.'});
  const tipBtn = element('button', {'aria-label': 'Close (Esc)', title: 'Copy (Cmd+C)'}, 'Save');

  // Layer 3: Ambiguous short words only translate in control context, never in bare prose
  const proseShort = element('p', {}, 'Save');
  const menuShort = element('div', {role: 'menuitem'}, 'Delete');

  // Layer 4: Thinking collapsible header vs expanded body, working/steps/permissions/quota/counts/split nodes
  const thinkingTrigger = element('button', {'data-testid': 'thinking-collapsible-trigger', 'aria-expanded': 'true'}, 'Thought for 12s');
  const thinkingBody = box({class: 'overflow-y-auto'}, box({}, element('p', {}, 'Choose how agents handle commands.'), element('span', {}, 'Thought for 12s')));
  const thinkingWrap = box({class: 'relative'}, thinkingTrigger, thinkingBody);

  const dynNodes = [
    ['Thinking...', '思考中…'],
    ['Thinking for 5s', '已思考 5 秒'],
    ['Worked for 1m 20s · 3 updates', '已处理 1 分钟 20 秒 · 3 条更新'],
    ['Planning...', '规划中…'],
    ['Explored 3 files, ran 2 commands, edited 1 file', '已探索 3 个文件，已运行 2 条命令，已编辑 1 个文件'],
    ['Explored 3 files, 2 searches', '已探索 3 个文件，2 次搜索'],
    ['Explored 3 files, 2 searches, edited 1 file', '已探索 3 个文件，2 次搜索，已编辑 1 个文件'],
    ['Reading config.go', '正在读取 config.go'],
    ['Exploring 2 folders', '正在探索 2 个文件夹'],
    ['Step 2 of 5', '第 2 / 5 步'],
    ['Turn 1 of 3', '第 1 / 3 轮'],
    ['Question 2 of 4', '第 2 / 4 个问题'],
    ['Messaging Codebase Researcher', '正在通知 Codebase Researcher'],
    ['Messaged Database Debugger', '已通知 Database Debugger'],
    ['Yes, allow', '是，允许'],
    ['Yes, always allow github.com', '是，始终允许 github.com'],
    ["Yes, save rule for 'git status' in this conversation", '是，在当前对话保存“git status”的规则'],
    ['Allow npm test?', '允许 npm test？'],
    ['Save rule to always allow ls?', '保存规则以始终允许 ls？'],
    ['Conflicts with "Copy" (press Enter to replace)', '与“Copy”冲突（按 Enter 替换）'],
    ['Requires manual confirmation: destructive', '需要手动确认：destructive'],
    ['Resets in 2h 30m', '2 小时 30 分钟后重置'],
    ['Resets in <1m', '不到 1 分钟后重置'],
    ['Refreshes in 15m', '15 分钟后刷新'],
    ['5-hour limit', '5 小时限额'],
    ['80% left', '剩余 80%'],
    ['Available AI Credits: 250', '可用 AI 额度：250'],
    ['5m ago', '5 分钟前'],
    ['3d ago', '3 天前'],
    ['2mo ago', '2 个月前'],
    ['Show 5 more...', '再显示 5 项…'],
    ['See all (12)', '查看全部 (12)'],
    ['8 tools enabled', '已启用 8 个工具'],
    ['2 tools excluded', '已排除 2 个工具'],
    ['4 plugins', '4 个插件'],
    ['3 drafts', '3 份草稿'],
    ['6 references', '6 处引用'],
    ['2 hidden hosts', '2 台隐藏主机'],
    ['No plugins found for "foo"', '未找到与“foo”匹配的插件']
  ].map(([en, zh]) => ({en, zh, el: element('div', {}, en)}));

  // Split text nodes
  const splitShowMore = element('button');
  splitShowMore.append(document.createTextNode('Show '), document.createTextNode('7'), document.createTextNode(' more...'));
  const splitStep = element('span');
  splitStep.append(document.createTextNode('Step '), document.createTextNode('2'), document.createTextNode(' of '), document.createTextNode('5'));

  // Additional Layer 1 protected nodes (AI markdown, code, terminal, contenteditable, 2.34.0 user containers)
  const aiMarkdown = box({'data-testid': 'agent-response'}, box({'data-markdown-root': ''}, element('p', {}, 'Choose how agents handle commands.')));
  const codeBlock = element('pre', {}, 'Thought for 12s');
  const termBlock = box({class: 'xterm'}, element('span', {}, 'Choose how agents handle commands.'));
  const editableBlock = box({contenteditable: 'true'}, element('p', {}, 'Choose how agents handle commands.'));

  const userContainers234 = [
    'planner-response-text', 'progress-update-response-text',
    'side-question-followup-user', 'voice-user-message', 'voice-agent-message',
    'live-user-turn', 'live-agent-turn', 'pending-user-messages',
    'transcript-line-text', 'voice-transcript-summary-lead', 'voice-transcript-summary-point',
    'ask-question-header-text', 'ask-question-option-text',
    'comment-card-text', 'pdf-text-layer', 'csv-file-viewer', 'html-file-preview',
    'file-title-name', 'project-selector-item', 'project-header', 'project-selector-github-repo-item',
    'branch-option', 'branch-pill-label', 'webview-prompt-message', 'webview-download-filename',
    'ssh-host-label', 'setup-script-output',
    'terminal-surface', 'standalone-terminal-view', 'terminal-tab-surface'
  ].map(id => ({id, el: box({'data-testid': id}, element('span', {}, 'Choose how agents handle commands.'))}));

  const sidebarIconTitles234 = [
    'conversation-pinned-icon', 'conversation-scheduled-icon',
    'conversation-cloud-icon', 'conversation-battle-icon'
  ].map(id => {
    const titleDiv = element('div', {}, 'Choose how agents handle commands.');
    const row = box({}, element('span', {'data-testid': id}), titleDiv);
    return {id, row, titleDiv};
  });

  // Adversarial non-step / non-subagent ordinary phrases that must NOT be half-translated
  const untouchedOrdinary = [
    'Running Club', 'Reading List', 'Editing Mode',
    'Messaging platform for teams', 'Messaging App'
  ].map(text => ({text, el: element('div', {}, text)}));

  root.append(
    heading, titleCaseCompat, curly, shortcutBtn, searchInput, tipBtn, proseShort, menuShort,
    thinkingWrap, ...dynNodes.map(x => x.el), splitShowMore, splitStep,
    aiMarkdown, codeBlock, termBlock, editableBlock,
    ...userContainers234.map(x => x.el),
    ...sidebarIconTitles234.map(x => x.row),
    ...untouchedOrdinary.map(x => x.el)
  );

  const api = mount({
    exact: {
      'Choose how agents handle commands.': '选择 AI 助手处理命令的方式。',
      "It's ready to run…": '已准备就绪…',
      'Search settings...': '搜索设置…'
    },
    scoped: [{scope: 'controls', entries: {Save: '保存', Close: '关闭', Copy: '复制', Delete: '删除'}}],
    templates: []
  });

  for (const mode of ['zh', 'en', 'zh']) {
    api.setMode(mode);
    await tick();
    const zh = mode === 'zh';
    equal(heading.textContent, zh ? '选择 AI 助手处理命令的方式。' : 'Choose how agents handle commands.', 'unregistered heading');
    equal(titleCaseCompat.textContent, zh ? '选择 AI 助手处理命令的方式。' : 'Choose How Agents Handle Commands.', 'multi-word case-insensitive 2.34/2.35 compat');
    equal(curly.textContent, zh ? '已准备就绪…' : 'It\u2019s ready to run...', 'normalized curly quote + ellipsis');
    equal(shortcutBtn.textContent, zh ? '复制 (Cmd+C)' : 'Copy (Cmd+C)', 'shortcut suffix split');
    equal(searchInput.placeholder, zh ? '搜索设置…' : 'Search settings...', 'input placeholder');
    equal(searchInput.value, 'Choose how agents handle commands.', 'input value untouched');
    equal(tipBtn.textContent, zh ? '保存' : 'Save', 'button short word');
    equal(tipBtn.getAttribute('aria-label'), zh ? '关闭 (Esc)' : 'Close (Esc)', 'aria-label shortcut split');
    equal(tipBtn.getAttribute('title'), zh ? '复制 (Cmd+C)' : 'Copy (Cmd+C)', 'title shortcut split');
    equal(proseShort.textContent, 'Save', 'short word untouched in bare prose');
    equal(menuShort.textContent, zh ? '删除' : 'Delete', 'short word in menuitem');
    equal(thinkingTrigger.textContent, zh ? '思考了 12 秒' : 'Thought for 12s', 'thinking trigger button');
    equal(thinkingBody.querySelector('p').textContent, 'Choose how agents handle commands.', 'expanded thinking body prose untouched');
    equal(thinkingBody.querySelector('span').textContent, 'Thought for 12s', 'expanded thinking body template untouched');
    for (const item of dynNodes) {
      equal(item.el.textContent, zh ? item.zh : item.en, 'dynamic template ' + item.en);
    }
    equal(splitShowMore.textContent, zh ? '再显示 7 项…' : 'Show 7 more...', 'split show more');
    equal(splitStep.textContent, zh ? '第 2 / 5 步' : 'Step 2 of 5', 'split step of');
    equal(aiMarkdown.textContent, 'Choose how agents handle commands.', 'AI response markdown untouched');
    equal(codeBlock.textContent, 'Thought for 12s', 'code block untouched');
    equal(termBlock.textContent, 'Choose how agents handle commands.', 'terminal untouched');
    equal(editableBlock.textContent, 'Choose how agents handle commands.', 'contenteditable untouched');
    for (const item of userContainers234) {
      equal(item.el.textContent, 'Choose how agents handle commands.', 'protected 2.34.0 container ' + item.id);
    }
    for (const item of sidebarIconTitles234) {
      equal(item.titleDiv.textContent, 'Choose how agents handle commands.', 'protected sidebar icon title ' + item.id);
    }
    for (const item of untouchedOrdinary) {
      equal(item.el.textContent, item.text, 'ordinary phrase must not be half-translated: ' + item.text);
    }
  }
});

test('a framework can replace or remove text and attributes during translation', async () => {
  const el = button('Save'); el.title = 'Save'; root.append(el);
  const api = mount(); await tick();
  el.firstChild.nodeValue = 'Close'; el.title = 'Close'; await tick();
  equal(el.textContent, '关闭', 'updated text'); equal(el.title, '关闭', 'updated title');
  api.setMode('en'); await tick();
  equal(el.textContent, 'Close', 'newest source'); equal(el.title, 'Close', 'newest attribute');
  api.setMode('zh'); await tick();
  el.firstChild.nodeValue = '宿主新内容'; el.removeAttribute('title');
  api.setMode('en'); await tick();
  equal(el.textContent, '宿主新内容', 'pending mutation before toggle');
  equal(el.hasAttribute('title'), false, 'removed attribute stays removed');
  el.firstChild.nodeValue = 'Save'; el.title = 'Save'; api.setMode('zh'); await tick();
  el.firstChild.nodeValue = '保存'; el.setAttribute('title', '保存'); await tick();
  api.setMode('en'); await tick();
  equal(el.textContent, '保存', 'same-byte host write is its own source');
  equal(el.title, '保存', 'same-byte host attribute');
});

test('Sidecar name field translates only fixed metadata and preserves typing and selection', async () => {
  const attrs = {'type':'text','data-testid':'new-sidecar-name','placeholder':'Untitled','aria-label':'Name',
    'title':'Close','value':'Save'};
  const input = element('input', attrs); const shadowCopy = element('input', attrs);
  const chat = element('div', {'data-testid':'user-message'}); chat.append(shadowCopy); root.append(input, chat);
  input.value = 'Save 输入内容'; input.focus(); input.setSelectionRange(1, 4, 'backward');
  const api = mount({exact: {Untitled:'未命名', Name:'名称', Save:'保存', Close:'关闭'}});
  for (const [mode, hint, name] of [['zh','未命名','名称'],['en','Untitled','Name'],['zh','未命名','名称']]) {
    api.setMode(mode); await tick();
    equal(input.placeholder,hint,'Sidecar hint'); equal(input.getAttribute('aria-label'),name,'Sidecar label');
    equal(input.title,'Close','unapproved attribute'); equal(input.value,'Save 输入内容','typed text');
    equal(input.defaultValue,'Save','default text'); equal(document.activeElement,input,'focus');
    equal(input.selectionStart,1,'selection start'); equal(input.selectionEnd,4,'selection end');
    equal(input.selectionDirection,'backward','selection direction');
    equal(shadowCopy.placeholder,'Untitled','chat hint'); equal(shadowCopy.getAttribute('aria-label'),'Name','chat label');
  }
  input.placeholder = 'Save'; input.setAttribute('aria-label','Close'); await tick();
  equal(input.placeholder,'Save','unknown placeholder on known input');
  equal(input.getAttribute('aria-label'),'Close','unknown accessible name on known input');
});

test('moving a label into protected content and detaching across mode switches', async () => {
  const b = button('Save'); b.title = 'Close';
  const chat = element('section', {'data-testid':'agent-response'});
  root.append(b, chat); const api = mount(); await tick();
  chat.append(b); await tick();
  equal(b.textContent,'Save','moved into assistant response'); equal(b.title,'Close','moved title');
  root.append(b); await tick(); equal(b.textContent, '保存', 'moved back into UI');
  const newChat = element('div', {'data-testid':'user-message'});
  b.remove(); newChat.append(b); root.append(newChat); await tick();
  equal(b.textContent,'Save','moved inside a newly connected protected wrapper');
  root.append(b); await tick();
  const wrapper = element('div'); wrapper.append(b); root.append(wrapper); await tick();
  equal(b.textContent, '保存', 'known label inside a newly connected wrapper');
  wrapper.className = 'xterm'; await tick(); equal(b.textContent, 'Save', 'changed ancestor');
  wrapper.className = ''; await tick(); equal(b.textContent, '保存', 'reclassified subtree');
  b.remove(); await tick(); api.setMode('en'); await tick(); root.append(b); await tick();
  equal(b.textContent, 'Save', 'reconnected label in English');
});

test('slot assignments and changes to shadow ancestors respect content isolation', async () => {
  const host = element('div');
  const shell = host.attachShadow({mode:'open'});
  const wrapper = element('div'); const slot = element('slot'); wrapper.append(slot); shell.append(wrapper);
  const b = button('Save'); b.title = 'Close'; host.append(b); root.append(host);
  mount(); await tick(); equal(b.textContent,'保存','slotted known button');
  wrapper.className = 'terminal'; await tick();
  equal(b.textContent,'Save','slotted child moved into protected surface'); equal(b.title,'Close','slotted attribute');
  wrapper.className = ''; await tick(); equal(b.textContent,'保存','slotted control becomes eligible again');
  const protectedSlot = element('slot', {name:'chat'});
  const chat = element('div', {'data-testid':'user-message'}); chat.append(protectedSlot); shell.append(chat);
  b.slot = 'chat'; await tick(); equal(b.textContent,'Save','slotted into chat');
});

test('existing, late and nested Shadow DOM honor the composed content boundary', async () => {
  const originalAttach = Element.prototype.attachShadow;
  const host = element('div'); root.append(host);
  const separateHost = element('span', {'data-testid':'model-selector-header'}); root.append(separateHost);
  const before = host.attachShadow({mode:'open'});
  const first = button('Save'); before.append(first);
  const api = mount(); await tick(); equal(first.textContent,'保存','existing root');
  // A caller in another isolated JS world can bypass the wrapper installed
  // in this world. There is no light-DOM mutation to notify its observer.
  const separateRoot = originalAttach.call(separateHost, {mode:'open'});
  const separateLabel = button('Close'); separateRoot.append(separateLabel);
  for (let i = 0; i < 50 && separateLabel.textContent !== '关闭'; i++) await tick(100);
  equal(separateLabel.textContent,'关闭','late open root created outside patched prototype');
  const nextHost = element('div'); before.append(nextHost); await tick();
  const after = nextHost.attachShadow({mode:'open'}); const late = button('Close'); after.append(late);
  await tick(); equal(late.textContent,'关闭','late nested root');
  const secret = element('div', {'data-testid':'user-message'});
  root.append(secret); const blocked = button('Save'); secret.attachShadow({mode:'open'}).append(blocked);
  await tick(); equal(blocked.textContent,'Save','protected host');
  api.setMode('en'); await tick();
  equal(first.textContent,'Save','root restored'); equal(late.textContent,'Close','nested restored');
  equal(separateLabel.textContent,'Close','separately created root restored');
});

test('closed root terminal slot protects a translated light-DOM label when assignedSlot is hidden', async () => {
  const host = element('div'); const light = button('Save'); light.title = 'Close';
  host.append(light); root.append(host); const api = mount(); await tick();
  equal(light.textContent, '保存', 'known light-DOM control before projection');
  const closed = host.attachShadow({mode:'closed'});
  const terminal = element('div', {class:'terminal'}); const slot = element('slot');
  terminal.append(slot); closed.append(terminal); await tick();
  equal(host.shadowRoot, null, 'closed host'); equal(light.assignedSlot, null, 'closed slot is hidden');
  equal(slot.assignedElements()[0], light, 'label actually projected into terminal');
  for (const mode of ['zh', 'en', 'zh']) {
    api.setMode(mode); await tick();
    equal(light.textContent,'Save','closed terminal protects projected text');
    equal(light.title,'Close','closed terminal protects projected title');
  }
});

test('reinstall rediscovers roots captured by this installer before their host became opaque', async () => {
  const host = element('div'); root.append(host); const previous = mount();
  const closed = host.attachShadow({mode:'closed'}); const b = button('Save'); b.title = 'Close';
  closed.append(b); await tick();
  equal(b.textContent,'保存','first install captures same-world closed root');
  const current = mount(); await tick();
  equal(host.shadowRoot, null, 'closed root stays opaque');
  equal(b.textContent,'保存','second install keeps authorized translation'); equal(b.title,'关闭','title after reinstallation');
  previous.dispose();
  current.setMode('en'); await tick(); equal(b.textContent,'Save','English recovered'); equal(b.title,'Close','title recovered');
  current.setMode('zh'); await tick(); equal(b.textContent,'保存','Chinese recovered');
  current.dispose(); equal(b.textContent,'Save','closed text after disposal');
});

test('Windows and macOS shortcuts have precise modifiers, suppress one action and persist mode', async () => {
  const b = button('Save'); root.append(b);
  for (const platform of ['darwin','win32']) {
    localStorage.removeItem('ag_zh_gui_mode');
    const changes = [];
    const api = mount({platform, onModeChange: mode => changes.push(mode)});
    const mod = platform === 'darwin' ? {metaKey:true} : {ctrlKey:true};
    const wrong = platform === 'darwin' ? {ctrlKey:true} : {metaKey:true};
    let hostRuns = 0; const hostKey = () => { hostRuns++; };
    b.addEventListener('keydown', hostKey);
    try {
      await tick();
      const base = changes.length;
      equal(key(b, mod).defaultPrevented, true, platform + ' default canceled');
      equal(hostRuns, 0, 'host shortcut suppressed');
      equal(api.getMode(), 'en', 'mode toggled');
      equal(localStorage.getItem('ag_zh_gui_mode'), 'en', 'persisted user choice');
      equal(changes.length, base + 1, 'one change notification');
      equal(key(b, {...mod, repeat:true}).defaultPrevented, true, 'held shortcut is consumed');
      equal(hostRuns, 0, 'held shortcut cannot trigger new conversation');
      for (const other of [wrong, {...mod, shiftKey:false}, {...mod, altKey:true}, {...mod, isComposing:true}]) {
        key(b, other); equal(api.getMode(), 'en', 'other key did not toggle');
      }
      key(b, mod); equal(api.getMode(), 'zh', 'second toggle');
      await tick();
      equal(document.body.innerText.includes('已切换为中文界面'), true, 'Chinese toast');
      await tick(1800);
      equal(document.body.innerText.includes('已切换为中文界面'), false, 'toast expired');
      key(b, mod); await tick(); equal(document.body.innerText.includes('Switched to Original English'), true, 'English toast');
      api.dispose();
      const off = mount({platform, hotkey:false, defaultLang:'zh'});
      equal(off.getMode(), 'en', 'saved choice overrides default');
      const calls = hostRuns;
      equal(key(b, mod).defaultPrevented, false, 'disabled shortcut'); equal(hostRuns, calls + 1, 'host receives key');
      equal(off.getMode(),'en','disabled language shortcut');
      off.dispose();
    } finally { b.removeEventListener('keydown', hostKey); }
  }
});

test('mode notifications synchronize DOM with menu rendering and right-click selection', async () => {
  const control = button('Close'); root.append(control);
  const native = createNative({defaultLang:'en', exact: {Copy:'复制'}});
  const received = [];
  const bridge = {showContextMenu(items) { received.push(items); return items[0].id; }};
  const showMenu = native.wrapShowContextMenu(bridge);
  const source = [{id:'copy-selection',label:'Copy'}, {id:'user-file',label:'Copy'}];
  mount({onModeChange: native.setMode}); await tick();
  equal(control.textContent, '关闭', 'Chinese UI');
  equal(showMenu(source), 'copy-selection', 'original selected ID');
  equal(received[0][0].label, '复制', 'localized known entry');
  equal(received[0][1].label, 'Copy', 'dynamic menu label');
  equal(source[0].label, 'Copy', 'canonical input retained');
  key(control,{ctrlKey:true}); await tick();
  equal(control.textContent, 'Close', 'English UI'); showMenu(source);
  equal(received[1][0].label, 'Copy', 'English menu in same mode');
});

test('brand visibility is localized to verified adjacent brand text; dispose restores original nodes', async () => {
  const logo = element('span', {'data-testid':'sidebar-header-logo'});
  const name = element('span', {}, 'Antigravity'); const other = element('span',{},'Antigravity');
  const section = element('section'); section.append(logo,name,other); root.append(section);
  const blocked = element('div', {'data-testid':'agent-response'});
  const duplicate = name.cloneNode(true); blocked.append(logo.cloneNode(true),duplicate); root.append(blocked);
  const b = button('Save'); b.title = 'Close'; root.append(b);
  const brandText = name.firstChild;
  const api = mount({brand:'hide'}); await tick();
  equal(name.textContent,'','only official brand text hidden');
  equal(other.textContent,'Antigravity','other brand preserved'); equal(duplicate.textContent,'Antigravity','chat brand');
  api.dispose(); await tick();
  equal(name.firstChild, brandText, 'restored brand identity'); equal(name.textContent,'Antigravity','restored brand');
  equal(b.textContent,'Save','dispose restores text'); equal(b.title,'Close','dispose restores title');
  const later = button('Save'); root.append(later); await tick(); equal(later.textContent,'Save','disposed observer');
});

test('reinstall leaves a single active shortcut and watcher', async () => {
  const b = button('Save'); root.append(b);
  mount(); const latest = mount(); await tick();
  key(b,{ctrlKey:true}); await tick(); equal(latest.getMode(),'en','single active installation');
  equal(b.textContent,'Save','one restore');
  latest.dispose(); equal(key(b,{ctrlKey:true}).defaultPrevented,false,'no leaked listener after disposal');
});

test('storage notifications keep an open Hub in sync without reviving a disposed listener', async () => {
  const peer = element('iframe');
  const b = button('Save'); root.append(b, peer);
  const api = mount(); await tick();
  window.dispatchEvent(new StorageEvent('storage', {key:'ag_zh_gui_mode', newValue:'en', storageArea:localStorage}));
  equal(api.getMode(),'zh','ignore page-synthesized event');
  const update = async value => {
    const notice = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { window.removeEventListener('storage', changed); reject(Error('no native storage event')); }, 1000);
      function changed(event) {
        if (event.isTrusted && event.key === 'ag_zh_gui_mode' && event.newValue === value) {
          clearTimeout(timer); window.removeEventListener('storage', changed); resolve();
        }
      }
      window.addEventListener('storage', changed);
    });
    peer.contentWindow.localStorage.setItem('ag_zh_gui_mode', value);
    await notice;
  };
  await update('en'); equal(api.getMode(),'en','English storage event'); equal(b.textContent,'Save','English label');
  await update('invalid'); equal(api.getMode(),'en','ignore invalid mode');
  await update('zh'); equal(b.textContent,'保存','Chinese label'); api.dispose();
  await update('en'); await update('zh'); equal(b.textContent,'Save','disposed listener ignored event');
});

(async () => {
  const failures = [];
  for (const {name, run} of cases) {
    try {
      localStorage.removeItem('ag_zh_gui_mode');
      await run();
      results.push(name);
    } catch (error) {
      failures.push(name + '\n' + (error.stack || error));
    } finally {
      while (controllers.length) controllers.pop().dispose();
      root.replaceChildren();
    }
  }
  document.getElementById('result').textContent = encodeURIComponent(JSON.stringify({passed:results, failure:failures.join('\n\n')}));
})().catch(error => {
  document.getElementById('result').textContent = encodeURIComponent(JSON.stringify({passed:results, failure:String(error.stack || error)}));
});
