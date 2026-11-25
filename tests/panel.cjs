// Exercise the shipped control panel with a local in-memory service.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { Worker, isMainThread, parentPort } = require('node:worker_threads');
const { once } = require('node:events');
const dumpLocalPage = require('./headless-chrome.cjs');
function fixture() {
    const version = '0.2.3';
    const browserErrors = window.panelTestErrors = [];
    window.addEventListener('error', e => browserErrors.push(e.message || 'Failed resource: ' + e.target.src), true);
    window.addEventListener('unhandledrejection', e => browserErrors.push(String(e.reason)));
    window.addEventListener('securitypolicyviolation', e => browserErrors.push(e.violatedDirective + ' ' + e.blockedURI));
    const originalError = console.error;
    console.error = (...args) => { browserErrors.push(args.join(' ')); originalError.apply(console, args); };
    if (location.search === '?screenshot') {
        window.addEventListener('load', () => {
            const el = id => document.getElementById(id);
            const img = el('heroImage');
            const dark = matchMedia('(prefers-color-scheme: dark)').matches;
            const expected = dark ? '/hero-antigravity.jpg' : '/hero-workshop.jpg';
            const ready = img.complete && img.naturalWidth === 2048 && img.naturalHeight === 638 &&
                new URL(img.currentSrc).pathname === expected && !browserErrors.length &&
                el('version').textContent === 'v' + version &&
                el('target').value === '/Applications/Antigravity.app' && el('clientVersion').textContent === '2.35.0' &&
                el('chip-catalog').textContent.includes('3,186 条') && el('changes').textContent.includes('SHA-256');
            document.documentElement.dataset.screenshotReady = String(ready);
        }, {once: true});
    }
    sessionStorage.setItem('zh-gui-token', 'fixture');
    let current = {id:0,active:false,logs:[]};
    window.confirm = () => true;
    const settings = { target: '/Applications/Antigravity.app', defaultLang: 'zh', brand: 'keep', hotkey: true, backupApp: true };
    const dict = {};
    const fetchResource = window.fetch.bind(window);
    window.fetch = async (url, options) => {
        if (!url.startsWith('/api/')) return fetchResource(url, options);
        if (options.method !== 'POST' || options.headers['X-ZH-GUI-Token'] !== 'fixture')
            throw Error('Unrecognized request');
        const q = JSON.parse(options.body);
        let result;
        switch (url.slice(5)) {
            case 'bootstrap':
                result = { preferences: settings, dictionary: dict, version, platform: 'darwin' };
                break;
            case 'status':
                const running = q.target === '/running';
                const degraded = q.target === '/degraded';
                result = { target: q.target || '/Applications/Antigravity.app', version: '2.35.0', platform: 'darwin', running,
                    localized: true, degraded, backup: true, backupApp: true, signature: '本地临时签名有效',
                    warnings: degraded ? ['当前客户端（2.35.0）仅处于降级部分汉化状态：主界面汉化、菜单与快捷键热切换未注入。'] : [] };
                break;
            case 'preferences':
                Object.assign(settings, q);
                result = q;
                break;
            case 'dictionary':
                if (q.operation === 'remove')
                    delete dict[q.english];
                else
                    dict[q.english] = q.chinese;
                result = { ...dict };
                break;
            case 'start':
                if (q.action === 'verify') {
                    current = {id:1, action:'verify', active:false, logs:[{ms:0,text:'核对摘要'},{ms:37,text:'完整性校验结束'}],
                        result:{fileCount:1,changes:[{path:'dist/menu.js',beforeSize:21,afterSize:33,beforeSHA256:'oldhash',afterSHA256:'newhash'}]}};
                } else if (q.action === 'restore') {
                    current = {id:2, action:'restore', active:false, logs:[],
                        result:{committed:false,warnings:[{detail:'未确认宿主完整性策略'}]}};
                } else throw Error('Unexpected operation');
                result = {id:current.id};
                break;
            case 'job':
                result = current;
                break;
            case 'exit':
                result = { closed: true };
                break;
            default: throw Error('Unexpected control panel API');
        }
        return { ok: true, json: async () => result };
    };
}
async function verifyPage(width, dark) {
    const frame = document.querySelector('iframe');
    const win = frame.contentWindow;
    const doc = () => frame.contentDocument;
    const byId = id => doc().getElementById(id);
    const expect = (value, message) => { if (!value) throw Error(message); };
    const settle = () => new Promise(resolve => setTimeout(resolve, 10));
    const errors = [];
    function checkLayout(minimal) {
        expect(doc().documentElement.dataset.skin === (minimal ? 'minimal' : 'anime'), 'active skin');
        expect(win.innerWidth === width, 'expected viewport ' + width + ', got ' + win.innerWidth);
        expect(doc().documentElement.scrollWidth <= doc().documentElement.clientWidth, 'horizontal overflow');
        expect(win.matchMedia('(prefers-color-scheme: dark)').matches === dark, 'theme mismatch');
        const grid = win.getComputedStyle(doc().querySelector('.grid')).gridTemplateColumns.split(' ');
        expect(grid.length === (width < 620 ? 1 : 2), 'responsive card columns');
        for (const cls of ['.hero', '.status-strip']) {
            expect(Boolean(doc().querySelector(cls).getBoundingClientRect().height) !== minimal, cls + ' visibility');
        }
    }
    function checkErrors() {
        errors.push(...win.panelTestErrors);
        expect(!errors.length, 'browser errors: ' + errors.join(' / '));
    }
    async function reload() {
        checkErrors();
        const loaded = new Promise(resolve => frame.addEventListener('load', resolve, {once: true}));
        win.location.reload();
        await loaded;
        await settle();
    }
    try {
        const loaded = new Promise(resolve => frame.addEventListener('load', resolve, {once: true}));
        frame.src = '/';
        await loaded;
        await settle();
        expect(byId('clientVersion').textContent === '2.35.0' && !byId('apply').disabled, 'initial status');
        const defaultImage = dark ? 'hero-antigravity.jpg' : 'hero-workshop.jpg';
        const otherImage = dark ? 'hero-workshop.jpg' : 'hero-antigravity.jpg';
        async function checkImage(name) {
            const img = byId('heroImage');
            await img.decode();
            expect(new URL(img.currentSrc).pathname === '/' + name, 'hero selection ' + name);
            expect(img.complete && img.naturalWidth === 2048 && img.naturalHeight === 638, 'decoded hero ' + name);
            const response = await fetch(img.currentSrc);
            expect(response.status === 200 && response.headers.get('Content-Type') === 'image/jpeg', 'JPEG response ' + name);
        }
        checkLayout(false);
        await checkImage(defaultImage);
        byId('heroToggle').click();
        await checkImage(otherImage);
        byId('skinToggle').click();
        checkLayout(true);
        await reload();
        checkLayout(true);
        byId('skinToggle').click();
        checkLayout(false);
        await checkImage(otherImage);
        await reload();
        checkLayout(false);
        await checkImage(otherImage);
        const chipColor = id => win.getComputedStyle(byId(id)).backgroundColor;
        const runningColor = chipColor('chip-running'), localizedColor = chipColor('chip-localized');
        byId('target').value = '/running';
        byId('target').dispatchEvent(new win.Event('input'));
        expect(byId('apply').disabled, 'stale status allowed apply');
        byId('refresh').click();
        await settle();
        expect(byId('running').textContent === '运行中' && byId('restore').disabled, 'running client');
        expect(byId('chip-running').dataset.tone === 'warning' && chipColor('chip-running') !== runningColor, 'running tile warning color');
        byId('english').value = '<img src=x>';
        byId('chinese').value = '可见文本';
        byId('wordForm').requestSubmit();
        await settle();
        expect(byId('wordList').textContent.includes('<img src=x>') && !byId('wordList').querySelector('img'), 'dictionary should be plain text');
        byId('wordList').querySelector('button').click();
        await settle();
        expect(byId('wordList').children.length === 0, 'delete entry');
        byId('lang').value = 'en';
        byId('save').click();
        await settle();
        expect(byId('notice').textContent.includes('已保存'), 'preference save');
        byId('verify').click();
        await settle();
        expect(byId('logs').textContent.includes('0.04 s') && byId('changes').textContent.includes('newhash'), 'log and audit');
        expect(byId('logs').textContent.includes('耗时 37 ms'), 'per-step duration');
        byId('target').value = '/degraded';
        byId('target').dispatchEvent(new win.Event('input'));
        byId('refresh').click();
        await settle();
        expect(byId('localized').textContent.includes('降级') && byId('localized').className === 'bad', 'degraded status badge');
        expect(byId('health').classList.contains('bad') && byId('health').textContent.includes('降级部分汉化'), 'degraded status warning');
        expect(byId('chip-localized').dataset.tone === 'danger' && chipColor('chip-localized') !== localizedColor, 'degraded tile alert color');
        expect(chipColor('chip-running') === runningColor, 'running tile recovers');
        byId('target').value = '/stopped';
        byId('target').dispatchEvent(new win.Event('input'));
        byId('refresh').click();
        await settle();
        byId('restore').click();
        await settle();
        expect(byId('notice').textContent.includes('本次未写入客户端') && byId('notice').textContent.includes('未确认宿主完整性策略'), 'skipped restore');
        byId('quit').click();
        await settle();
        expect(byId('notice').textContent.includes('已退出') && byId('addWord').disabled, 'shutdown');
        checkErrors();
        document.body.dataset.testResult = 'pass';
    } catch (err) {
        document.body.dataset.testResult = encodeURIComponent(String(err.stack || err));
    } finally {
        await fetch('/finished', {method:'POST'});
    }
}

// Serve the unmodified production CSS/JS and the embedded image bytes. Only the test
// document gets an isolated API fixture; the surrounding frame drives real reloads.
function serveFixture() {
    const web = path.join(__dirname, '..', 'internal', 'server', 'web');
    const files = new Map([
        ['/panel.css', 'text/css'], ['/panel.js', 'text/javascript'],
        ['/hero-workshop.jpg', 'image/jpeg'], ['/hero-antigravity.jpg', 'image/jpeg']
    ]);
    const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8')
        .replace('<head>', '<head><script src="/fixture.js"></script>');
    let finishPage;
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        let content, type = 'text/html; charset=utf-8';
        if (files.has(url.pathname)) {
            type = files.get(url.pathname);
            content = fs.readFileSync(path.join(web, url.pathname.slice(1)));
        } else if (url.pathname === '/') {
            // The harness needs same-origin framing; script/style/image/connect
            // restrictions mirror the control panel served by Go.
            res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; form-action 'none'; frame-ancestors 'self'; base-uri 'none'");
            content = html;
        } else if (url.pathname === '/fixture.js') {
            type = 'text/javascript';
            content = '(' + fixture.toString() + ')();';
        } else if (url.pathname === '/test') {
            const dark = url.searchParams.get('theme') === 'dark', width = dark ? 390 : 1180;
            content = '<!doctype html><style>*{margin:0;border:0}iframe{display:block;height:900px}</style>' +
                '<body><iframe width="' + width + '"></iframe><script>(' + verifyPage.toString() + ')(' + width + ',' + dark + ')</script>';
            // Keep the top document loading until its asynchronous checks finish.
            // The child frame can then reload and decode images on real time,
            // independently of Chromium's virtual-time budget.
            res.writeHead(200, {'Content-Type':type});
            res.write(content);
            const deadline = setTimeout(() => res.end(), 30000);
            finishPage = () => { clearTimeout(deadline); res.end('</body>'); };
            return;
        } else if (url.pathname === '/finished' && req.method === 'POST') {
            if (finishPage) finishPage();
            res.writeHead(204).end();
            return;
        } else {
            res.writeHead(url.pathname === '/favicon.ico' ? 204 : 404);
            res.end();
            return;
        }
        res.writeHead(200, {'Content-Type': type, 'Cache-Control': 'no-store'});
        res.end(content);
    });
    server.listen(0, '127.0.0.1', () => parentPort.postMessage(server.address().port));
}

async function run() {
    // dumpLocalPage is synchronous; the loopback server must keep answering
    // requests while Chrome runs, including when the panel is reloaded.
    const worker = new Worker(__filename);
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-zh-panel-'));
    const shots = process.argv.includes('--screenshots');
    try {
        const [port] = await once(worker, 'message');
        const origin = 'http://127.0.0.1:' + port;
        const localOnly = '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1';
        for (const [width, scheme] of [[1180, 'light'], [390, 'dark']]) {
            const args = [localOnly, '--window-size=' + width + ',900'];
            if (scheme === 'dark') args.push('--force-dark-mode');
            const run = dumpLocalPage(temp, origin + '/test?theme=' + scheme, args);
            const result = run.stdout?.match(/data-test-result="([^"]+)"/)?.[1];
            if (run.error || run.status !== 0 || result !== 'pass') {
                if (run.error) throw run.error;
                throw Error(result ? decodeURIComponent(result) : 'Browser test did not finish: ' + run.stderr?.slice(-900));
            }
            console.log('PASS control panel at ' + width + 'px: ' + scheme + ', both skins, hero images, reload, alerts, actions and audit');
            if (shots) {
                const dest = path.join(__dirname, '..', 'docs', 'assets', 'panel-' + scheme + '.png');
                const screenshot = path.join(temp, scheme + '.png');
                const args = [localOnly, '--virtual-time-budget=1500', '--window-size=1180,1156', '--force-device-scale-factor=2',
                    '--hide-scrollbars', '--screenshot=' + screenshot];
                if (scheme === 'dark') args.push('--force-dark-mode');
                const shot = dumpLocalPage(temp, origin + '/?screenshot', args);
                if (shot.error || shot.status !== 0 || !shot.stdout?.includes('data-screenshot-ready="true"')) {
                    throw Error(shot.error || 'Screenshot fixture did not load: ' + shot.stderr.slice(-900));
                }
                fs.copyFileSync(screenshot, dest);
                console.log('Saved ' + dest);
            }
        }
    } finally {
        await worker.terminate();
        fs.rmSync(temp, {recursive: true, force: true, maxRetries: 8, retryDelay: 200});
    }
}
if (isMainThread) {
    run().catch(err => { console.error(err); process.exitCode = 1; });
} else {
    serveFixture();
}
