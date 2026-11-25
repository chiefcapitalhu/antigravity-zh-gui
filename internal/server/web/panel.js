'use strict';
const $ = id => document.getElementById(id);
const darkTheme = matchMedia('(prefers-color-scheme: dark)');
const banners = {
    workshop: ['/hero-workshop.jpg', '温暖工坊里的四位 AI 伙伴'],
    antigravity: ['/hero-antigravity.jpg', '反重力少女在深蓝色穹顶下失重飞翔']
};
function readAppearance(key) {
    try { return localStorage.getItem('zh-gui-' + key); } catch { return null; }
}
function saveAppearance(key, value) {
    try { localStorage.setItem('zh-gui-' + key, value); } catch { /* Keep the choice in this tab. */ }
}
let skin = readAppearance('skin') === 'minimal' ? 'minimal' : 'anime';
let banner = readAppearance('banner');
function currentBanner() {
    return Object.hasOwn(banners, banner) ? banner : darkTheme.matches ? 'antigravity' : 'workshop';
}
function paintAppearance() {
    const anime = skin === 'anime';
    document.documentElement.dataset.skin = skin;
    $('skinToggle').textContent = anime ? '✦ 二次元风' : '○ 极简模式';
    $('skinToggle').setAttribute('aria-pressed', String(anime));
    $('skinToggle').title = anime ? '切换到极简模式' : '切换到二次元风';
    const [src, alt] = banners[currentBanner()];
    if ($('heroImage').getAttribute('src') !== src) $('heroImage').src = src;
    $('heroImage').alt = alt;
}
$('skinToggle').addEventListener('click', () => {
    skin = skin === 'anime' ? 'minimal' : 'anime';
    saveAppearance('skin', skin);
    paintAppearance();
});
$('heroToggle').addEventListener('click', () => {
    banner = currentBanner() === 'workshop' ? 'antigravity' : 'workshop';
    saveAppearance('banner', banner);
    paintAppearance();
});
darkTheme.addEventListener('change', paintAppearance);
paintAppearance();
const url = new URL(location.href);
let token = url.searchParams.get('token') || '';
if (token)
    history.replaceState(null, '', location.pathname);
try {
    if (token)
        sessionStorage.setItem('zh-gui-token', token);
    else
        token = sessionStorage.getItem('zh-gui-token') || '';
}
catch { /* The current tab can keep its token in memory. */ }
let health, initialized = false, sending = false, active = false, closed = false;
let dictionary = Object.create(null), statusRevision = 0, observed = '', jobID = 0, logCount = 0;
const actions = { apply: '汉化 / 更新', restore: '还原英文', verify: '完整性验证', 'restore-app': '还原整包' };
function notice(message, bad = false) {
    $('notice').textContent = message;
    $('notice').classList.toggle('bad', bad);
    $('notice').hidden = !message;
}
async function api(name, data = {}) {
    const res = await fetch('/api/' + name, { method: 'POST', cache: 'no-store', credentials: 'omit', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-ZH-GUI-Token': token }, body: JSON.stringify(data) });
    const value = await res.json();
    if (!res.ok)
        throw Error(value.error || '本地请求失败');
    return value;
}
function lockUI() {
    const locked = !initialized || sending || active || closed;
    for (const id of ['target', 'refresh', 'save', 'lang', 'brand', 'hotkey', 'makeBackup', 'english', 'chinese', 'addWord'])
        $(id).disabled = locked;
    for (const b of $('wordList').querySelectorAll('button'))
        b.disabled = locked;
    $('quit').disabled = !token || sending || active || closed;
    $('verify').disabled = locked || !health;
    for (const id of ['apply', 'restore', 'restoreApp'])
        $(id).disabled = locked || !health || health.running !== false;
    $('makeBackup').disabled ||= $('backupRow').hidden;
}
function prefs() {
    return { target: $('target').value.trim(), defaultLang: $('lang').value, brand: $('brand').value,
        hotkey: $('hotkey').checked, backupApp: !$('backupRow').hidden && $('makeBackup').checked };
}
function showFact(id, text, tone = '') {
    $(id).textContent = text;
    $(id).className = tone;
    const chip = $('chip-' + id);
    if (chip) chip.querySelector('dd').textContent = text;
}
function showStatus(value, warning) {
    health = value;
    $('health').textContent = warning || (value?.warnings || []).join('\n');
    if (value?.running === true)
        $('health').textContent += '\n请手动完全退出 Antigravity 后再修改客户端。';
    $('health').classList.toggle('bad', !value || value.running !== false || Boolean(value.degraded) || Boolean(value.warnings?.length));
    $('detected').textContent = value?.target && value.target !== prefs().target ? '检测到 ' + value.target : '';
    $('restoreApp').hidden = !(value?.platform === 'darwin' && value.backupApp);
    const flag = (v, yes, no) => typeof v === 'boolean' ? (v ? yes : no) : '待确认';
    showFact('clientVersion', value?.version || '待确认');
    showFact('running', flag(value?.running, '运行中', '已退出'), value?.running === false ? 'ok' : 'bad');
    showFact('localized', value?.degraded ? '部分汉化（已降级）' : flag(value?.localized, '已汉化', '英文原版'), value?.degraded ? 'bad' : value?.localized ? 'ok' : '');
    $('chip-running').dataset.tone = value?.running === true ? 'warning' : '';
    $('chip-localized').dataset.tone = value?.degraded ? 'danger' : '';
    showFact('backup', flag(value?.backup, '已备份', '无备份'), value?.backup ? 'ok' : '');
    showFact('signature', value?.signature || '待确认');
    lockUI();
}
async function inspect() {
    const seq = ++statusRevision, target = prefs().target;
    showStatus(null, '正在检测安装与签名…');
    try {
        const s = await api('status', { target });
        if (seq === statusRevision && target === prefs().target)
            showStatus(s);
    }
    catch (e) {
        if (seq === statusRevision)
            showStatus(null, e.message);
    }
}
async function once(fn) {
    if (sending || active || closed)
        return;
    sending = true;
    lockUI();
    try {
        await fn();
    }
    catch (e) {
        notice(e.message, true);
    }
    finally {
        sending = false;
        lockUI();
    }
}
async function savePrefs() { await api('preferences', prefs()); notice('设置已保存。'); }
function paintWords() {
    const list = $('wordList');
    list.replaceChildren();
    const pairs = Object.entries(dictionary || {}).sort(([a], [b]) => a.localeCompare(b));
    $('wordCount').textContent = pairs.length + ' 条';
    for (const [en, zh] of pairs) {
        const row = document.createElement('li');
        for (const text of [en, zh]) {
            const span = document.createElement('span');
            span.textContent = text;
            row.append(span);
        }
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'subtle';
        del.textContent = '删除';
        del.setAttribute('aria-label', '删除词条 ' + en);
        del.addEventListener('click', () => once(async () => {
            dictionary = await api('dictionary', { operation: 'remove', english: en });
            paintWords();
            notice('词条已删除。');
        }));
        row.append(del);
        list.append(row);
    }
}
function paintAudit(result) {
    const changes = result?.changes || [];
    $('auditCount').textContent = result ? (changes.length + ' 个改动文件') : '';
    const box = $('changes');
    box.replaceChildren();
    if (!changes.length) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = result ? '本次报告没有列出改动文件。' : '执行汉化或验证后可查看归档成员及 SHA-256。';
        box.append(p);
    }
    for (const ch of changes) {
        const item = document.createElement('article'), title = document.createElement('b');
        title.textContent = ch.path;
        item.append(title);
        for (const [label, size, hash] of [['修改前', ch.beforeSize, ch.beforeSHA256], ['修改后', ch.afterSize, ch.afterSHA256]]) {
            const line = document.createElement('p'), digest = document.createElement('code');
            line.className = 'digest';
            line.append(label + ' · ' + size + ' B · SHA-256 ');
            digest.textContent = hash;
            line.append(digest);
            item.append(line);
        }
        box.append(item);
    }
}
function showJob(job) {
    active = job.active;
    if (!job.id) {
        lockUI();
        return;
    }
    if (jobID !== job.id) {
        jobID = job.id;
        logCount = 0;
        $('logs').replaceChildren();
        paintAudit(null);
    }
    const lines = job.logs || [];
    for (let i = logCount; i < lines.length; i++) {
        const entry = lines[i];
        if (i > 0) {
            const duration = document.createElement('small');
            duration.textContent = '耗时 ' + (entry.ms - lines[i - 1].ms) + ' ms';
            $('logs').lastElementChild.append(duration);
        }
        const row = document.createElement('p'), time = document.createElement('time'), msg = document.createElement('span');
        time.textContent = (entry.ms / 1000).toFixed(2) + ' s';
        msg.textContent = entry.text;
        row.append(time, msg);
        $('logs').append(row);
    }
    if (lines.length > logCount)
        $('logs').scrollTop = $('logs').scrollHeight;
    logCount = lines.length;
    $('jobState').textContent = actions[job.action] + (active ? ' · 进行中' : job.error ? ' · 失败' : ' · 已结束');
    if (!active && observed !== String(job.id)) {
        observed = String(job.id);
        paintAudit(job.result);
        const warnings = (job.result?.warnings || []).map(w => [w.member, w.detail].filter(Boolean).join(' · '));
        let summary = actions[job.action] + '已完成。';
        if (job.action !== 'verify' && !job.result?.committed) {
            summary = job.action === 'restore' && !warnings.length
                ? '无需还原，本次未写入客户端。' : '操作已跳过，本次未写入客户端。';
        }
        if (job.error) summary = job.error;
        notice([summary, ...warnings].join('\n'), Boolean(job.error || warnings.length));
        if (warnings.length || job.error) {
            const row = document.createElement('p');
            row.textContent = [job.error, ...warnings].filter(Boolean).join('\n');
            $('logs').append(row);
        }
        void inspect();
    }
    lockUI();
}
let pollTimer, pollRevision = 0;
async function poll() {
    clearTimeout(pollTimer);
    if (closed)
        return;
    const revision = ++pollRevision;
    try {
        const state = await api('job');
        if (revision === pollRevision && !closed)
            showJob(state);
    }
    catch (e) {
        if (revision === pollRevision && !closed)
            notice('读取操作状态失败：' + e.message, true);
    }
    if (revision === pollRevision && !closed)
        pollTimer = setTimeout(poll, active ? 300 : 2200);
}
async function start(action) {
    if (!health || (action !== 'verify' && health.running !== false))
        return;
    if (action === 'restore-app' && !window.confirm('使用整包备份替换此客户端并恢复官方签名？'))
        return;
    if (action === 'restore' && !window.confirm('还原当前选中客户端的英文文件？'))
        return;
    await once(async () => {
        const p = prefs();
        await api('start', { action, preferences: p });
        active = true;
        notice('');
        await poll();
    });
}
$('target').addEventListener('input', () => { statusRevision++; showStatus(null, '路径已更改，请重新检测。'); });
$('target').addEventListener('keydown', e => { if (e.key === 'Enter') {
    e.preventDefault();
    void once(inspect);
} });
$('refresh').addEventListener('click', () => once(inspect));
$('save').addEventListener('click', () => once(savePrefs));
for (const key of ['apply', 'restore', 'verify'])
    $(key).addEventListener('click', () => start(key));
$('restoreApp').addEventListener('click', () => start('restore-app'));
$('wordForm').addEventListener('submit', e => {
    e.preventDefault();
    void once(async () => {
        const en = $('english').value.trim(), zh = $('chinese').value.trim();
        dictionary = await api('dictionary', { operation: 'set', english: en, chinese: zh });
        paintWords();
        $('english').value = '';
        $('chinese').value = '';
        notice('词条已保存，重新汉化后生效。');
    });
});
$('quit').addEventListener('click', () => once(async () => {
    await api('exit');
    closed = true;
    clearTimeout(pollTimer);
    try {
        sessionStorage.removeItem('zh-gui-token');
    }
    catch { }
    token = '';
    notice('工具已退出，可以关闭此标签页。');
}));
async function init() {
    lockUI();
    if (!token) {
        notice('请从本机工具打开带有会话令牌的控制台地址。', true);
        return;
    }
    try {
        const data = await api('bootstrap'), p = data.preferences;
        $('version').textContent = 'v' + data.version;
        $('target').value = p.target;
        $('lang').value = p.defaultLang;
        $('brand').value = p.brand;
        $('hotkey').checked = p.hotkey;
        $('backupRow').hidden = data.platform !== 'darwin';
        $('makeBackup').checked = p.backupApp;
        $('shortcut').textContent = (data.platform === 'darwin' ? 'Cmd' : 'Ctrl') + ' + Shift + L';
        dictionary = data.dictionary;
        paintWords();
        initialized = true;
        await poll();
        if (!jobID || active)
            await inspect();
    }
    catch (e) {
        notice(e.message, true);
    }
    lockUI();
}
void init();
