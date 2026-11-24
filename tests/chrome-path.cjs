'use strict';
const fs = require('node:fs');
const path = require('node:path');

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

module.exports = chromePath;
