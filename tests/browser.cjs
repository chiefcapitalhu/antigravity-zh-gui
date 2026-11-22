// Run with node tests/browser.cjs. The browser loads only temporary local files.
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

function chromePath() {
  const candidates = [process.env.CHROME_BIN];
  if (process.platform === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]) {
      if (base) candidates.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    }
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  }
  const executable = candidates.find(name => name && fs.existsSync(name));
  if (!executable) throw Error('Google Chrome is required for the DOM tests. Set CHROME_BIN to its executable.');
  return executable;
}

function run() {
  const chrome = chromePath();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-zh-dom-'));
  try {
    const resources = path.join(__dirname, '..', 'runtime');
    const source = fs.readFileSync(path.join(resources, 'ui_translator.js'), 'utf8');
    const native = fs.readFileSync(path.join(resources, 'main_hooks.js'), 'utf8');
    fs.writeFileSync(path.join(temp, 'runtime.js'), 'const install = ' + source + ';\nconst createNative = ' + native + ';\n');
    fs.copyFileSync(path.join(__dirname, 'dom-cases.js'), path.join(temp, 'cases.js'));
    const html = path.join(temp, 'index.html');
    fs.writeFileSync(html, `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-offline-test'; style-src 'unsafe-inline'; connect-src 'none'; frame-src about:">
<title>Local DOM regression tests</title></head><body><main id="root"></main><pre id="result"></pre>
<script src="runtime.js" nonce="offline-test"></script><script src="cases.js" nonce="offline-test"></script></body></html>`);
    const browser = spawnSync(chrome, [
      '--headless', '--dump-dom', '--virtual-time-budget=20000',
      '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      '--disable-background-networking', '--disable-component-update', '--disable-sync',
      '--disable-breakpad', '--disable-crash-reporter', '--disable-default-apps',
      '--host-resolver-rules=MAP * ~NOTFOUND', '--disable-gpu',
      '--user-data-dir=' + path.join(temp, 'profile'), pathToFileURL(html).href,
    ], {encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024});
    if (browser.error) throw browser.error;
    const match = browser.stdout.match(/<pre id="result">([^<]+)<\/pre>/);
    if (browser.status !== 0 || !match) {
      throw Error('Browser did not report test completion (status ' + browser.status + ', signal ' + browser.signal + ').\n' +
        browser.stderr.slice(-3000) + '\n' + browser.stdout.slice(-1000));
    }
    const report = JSON.parse(decodeURIComponent(match[1]));
    for (const passed of report.passed) console.log('PASS ' + passed);
    if (report.failure) throw Error(report.failure);
    if (!report.passed.length) throw Error('No DOM tests executed');
    console.log(report.passed.length + ' browser test groups passed on ' + process.platform);
  } finally {
    fs.rmSync(temp, {recursive: true, force: true, maxRetries: 8, retryDelay: 200});
  }
}

run();
