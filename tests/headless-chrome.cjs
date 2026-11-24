'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

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

function dumpLocalPage(temp, url, options) {
  const chrome = chromePath();
  const flags = [
    '--headless', '--dump-dom', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update',
    '--disable-sync', '--disable-breakpad', '--disable-crash-reporter', '--disable-default-apps',
    '--host-resolver-rules=MAP * ~NOTFOUND', '--disable-gpu', ...options,
  ];
  const launch = timeout => {
    const profile = fs.mkdtempSync(path.join(temp, 'profile-'));
    return spawnSync(chrome, [...flags, '--user-data-dir=' + profile, url], {
      encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024,
    });
  };
  const first = launch(60000);
  if (process.platform !== 'win32' || first.error?.code !== 'ETIMEDOUT') return first;
  console.warn('Chrome timed out on Windows. Retrying once with a fresh profile.');
  return launch(120000);
}

module.exports = dumpLocalPage;
