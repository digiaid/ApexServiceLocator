const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');

function chromePath() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const candidate of ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/local/bin/google-chrome']) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Google Chrome was not found. Set CHROME_PATH.');
}

async function debuggingPortOpen(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`);
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function ensureChrome(port) {
  if (await debuggingPortOpen(port)) return;
  const profile = path.join(ROOT, '.chrome-profile');
  fs.mkdirSync(profile, { recursive: true });
  const child = spawn(chromePath(), [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--window-size=1400,1000',
    'about:blank',
  ], { detached: true, stdio: 'ignore' });
  child.unref();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await debuggingPortOpen(port)) return;
  }
  throw new Error(`Chrome did not open a debugging port on ${port}`);
}

async function connect(port) {
  await ensureChrome(port);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const page = await context.newPage();
  await page.setViewportSize({ width: 1400, height: 1400 });
  page.setDefaultTimeout(30000);
  const webdriver = await page.evaluate(() => navigator.webdriver);
  if (webdriver) {
    throw new Error('This Chrome session reports navigator.webdriver. The gift site rejects that session with "Captcha verification failed". Start Chrome yourself without automation flags and set TSYS_CDP_PORT.');
  }
  return { browser, page, webdriver };
}

module.exports = { connect };
