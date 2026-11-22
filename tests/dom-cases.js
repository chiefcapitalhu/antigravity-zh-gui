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
  const unknown = button('Save', 'unknown-action');
  const bareButton = element('button', {}, 'Save');
  const file = button('C:\\Users\\User\\Save.txt');
  const url = button('https://example.invalid/Save');
  const customModel = button('Save', 'model-selector-custom-item');
  root.append(input, textArea, unknown, bareButton, file, url, customModel);
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
  for (const node of [unknown, bareButton, customModel, guestLabel]) equal(node.textContent, 'Save', 'unapproved control');
  equal(input.value, 'Save', 'input'); equal(textArea.value, 'Save', 'textarea');
  equal(file.textContent, 'C:\\Users\\User\\Save.txt', 'path');
  equal(url.textContent, 'https://example.invalid/Save', 'URL');
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
