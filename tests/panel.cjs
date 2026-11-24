// Exercise the shipped control panel with a local in-memory service.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const chromePath = require('./chrome-path.cjs');
function fixture() {
    sessionStorage.setItem('zh-gui-token', 'fixture');
    let current = {id:0,active:false,logs:[]};
    window.confirm = () => true;
    const settings = { target: '', defaultLang: 'zh', brand: 'keep', hotkey: true, backupApp: false };
    const dict = {};
    window.fetch = async (url, options) => {
        if (!url.startsWith('/api/') || options.method !== 'POST' || options.headers['X-ZH-GUI-Token'] !== 'fixture')
            throw Error('Unrecognized request');
        const q = JSON.parse(options.body);
        let result;
        switch (url.slice(5)) {
            case 'bootstrap':
                result = { preferences: settings, dictionary: dict, version: '0.1.0', platform: 'darwin' };
                break;
            case 'status':
                const running = q.target === '/running';
                result = { target: q.target || '/fixture', version: '2.34.0', platform: 'darwin', running,
                    localized: false, backup: true, backupApp: false, signature: '本地测试签名', warnings: [] };
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
async function verifyPage(narrow) {
    const byId = id => document.getElementById(id);
    const expect = (value, message) => { if (!value)
        throw Error(message); };
    const settle = () => new Promise(resolve => setTimeout(resolve, 5));
    try {
        await settle();
        expect(byId('clientVersion').textContent === '2.34.0' && !byId('apply').disabled, 'initial status');
        const grid = getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ');
        expect(grid.length === (narrow ? 1 : 2), 'responsive card columns');
        expect(document.documentElement.scrollWidth <= document.documentElement.clientWidth, 'horizontal overflow');
        byId('target').value = '/running';
        byId('target').dispatchEvent(new Event('input'));
        expect(byId('apply').disabled, 'stale status allowed apply');
        byId('refresh').click();
        await settle();
        expect(byId('running').textContent === '运行中' && byId('restore').disabled, 'running client');
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
        byId('target').value = '/stopped';
        byId('target').dispatchEvent(new Event('input'));
        byId('refresh').click();
        await settle();
        byId('restore').click();
        await settle();
        expect(byId('notice').textContent.includes('本次未写入客户端') && byId('notice').textContent.includes('未确认宿主完整性策略'), 'skipped restore');
        byId('quit').click();
        await settle();
        expect(byId('notice').textContent.includes('已退出') && byId('addWord').disabled, 'shutdown');
        document.body.dataset.testResult = 'pass';
    }
    catch (err) {
        document.body.dataset.testResult = encodeURIComponent(String(err.stack || err));
    }
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-zh-panel-'));
try {
    const project = path.join(__dirname, '..', 'internal', 'server', 'web');
    const original = fs.readFileSync(path.join(project, 'index.html'), 'utf8');
    const local = original.replace('href="/panel.css"', 'href="panel.css"').replace('src="/panel.js"', 'src="panel.js"')
        .replace('<script src="panel.js" defer></script>', '<script src="fixture.js" defer></script><script src="panel.js" defer></script><script src="cases.js" defer></script>');
    fs.writeFileSync(path.join(temp, 'index.html'), local);
    for (const name of ['panel.css', 'panel.js'])
        fs.copyFileSync(path.join(project, name), path.join(temp, name));
    fs.writeFileSync(path.join(temp, 'fixture.js'), '(' + fixture.toString() + ')();');
    const url = pathToFileURL(path.join(temp, 'index.html')).href;
    for (const [width, scheme] of [[1180, 'light'], [390, 'dark']]) {
        fs.writeFileSync(path.join(temp, 'cases.js'), '(' + verifyPage.toString() + ')('+(width < 620)+');');
        const args = ['--headless', '--dump-dom', '--no-first-run', '--disable-extensions', '--disable-background-networking',
            '--disable-component-update', '--disable-sync', '--disable-default-apps', '--disable-gpu', '--host-resolver-rules=MAP * ~NOTFOUND',
            '--virtual-time-budget=3000', '--user-data-dir=' + path.join(temp, 'profile' + width), '--window-size=' + width + ',900'];
        if (scheme === 'dark')
            args.push('--force-dark-mode');
        const r = spawnSync(chromePath(), [...args, url], { encoding: 'utf8', timeout: 60000, maxBuffer: 2 << 20, windowsHide: true });
        const result = r.stdout?.match(/data-test-result="([^"]+)"/)?.[1];
        if (r.error || r.status !== 0 || result !== 'pass')
            throw Error(r.error || decodeURIComponent(result || r.stderr?.slice(-900) || 'No test result'));
        console.log('PASS control panel at ' + width + 'px: ' + scheme + ', config, running guard, words, audit, shutdown');
    }
}
finally {
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
}
