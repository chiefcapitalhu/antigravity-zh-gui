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
function mount(options = {}) {
  const api = install(window, {...dictionary, ...options});
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

test('all shipped Hub translations have an exercised display path', () => {
  const scopes = new Set(['toolbar','workspace','settings','permissions','onboarding','model','agents','sidecar']);
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
