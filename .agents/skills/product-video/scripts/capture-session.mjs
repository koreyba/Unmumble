import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {start} from './recorder.mjs';

const configPath = process.argv[2];
if (!configPath || configPath === '--help') {
  console.log('Usage: node capture-session.mjs /absolute/capture-config.json');
  process.exit(configPath ? 0 : 1);
}
const cfg = JSON.parse(await fs.readFile(configPath, 'utf8'));
for (const key of ['playwrightModule', 'url', 'output']) {
  if (!cfg[key]) throw new Error(`Missing config.${key}`);
}
const resolveFile = value => path.resolve(path.dirname(path.resolve(configPath)), value);
const {chromium, devices} = await import(pathToFileURL(resolveFile(cfg.playwrightModule)));
let contextOptions;
if (cfg.layout === 'mobile') {
  if (!devices[cfg.device]) throw new Error('Choose a valid Playwright device');
  if (cfg.viewport) throw new Error('Mobile: use the complete device profile without a second viewport');
  contextOptions = {...devices[cfg.device]};
} else if (cfg.layout === 'desktop') {
  contextOptions = {viewport: cfg.viewport || {width: 1440, height: 900}};
} else {
  throw new Error('config.layout must be mobile or desktop');
}
const out = resolveFile(cfg.output);
await fs.mkdir(path.dirname(out), {recursive: true});
await fs.mkdir(out); // Never overwrite another session.
const captureTitle = cfg.captureTitle || 'Product Video Capture';
const args = ['--autoplay-policy=no-user-gesture-required'];
if (cfg.audio) args.push(
  `--auto-select-tab-capture-source-by-title=${captureTitle}`,
  '--enable-usermedia-screen-capturing', '--allow-http-screen-capture'
);
const browser = await chromium.launch({
  headless: cfg.headless ?? false,
  ...(cfg.executablePath ? {executablePath: resolveFile(cfg.executablePath)} : {}),
  args
});
const recordings = [];
try {
  const context = await browser.newContext(contextOptions);
  if (cfg.initScript) await context.addInitScript({path: resolveFile(cfg.initScript)});
  const page = await context.newPage();
  page.on('pageerror', error => console.error('PAGEERROR', error.message));
  await page.goto(cfg.url, {waitUntil: 'domcontentloaded'});
  await page.screenshot({path: path.join(out, 'probe.png')});
  const device = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
    ua: navigator.userAgent, scrollWidth: document.documentElement.scrollWidth
  }));
  await fs.writeFile(path.join(out, 'session.json'), JSON.stringify({
    url: cfg.url, layout: cfg.layout, profile: cfg.device ?? null, device,
    audioRequested: !!cfg.audio, provenance: cfg.provenance ?? null
  }, null, 2));
  console.log('READY', JSON.stringify(device));
  const startRecording = async (name, options = {}) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Invalid take name');
    if (recordings.some(r => !r.stopped)) throw new Error('Stop the previous take first');
    const recording = await start(page, path.join(out, name), {
      ...options, audio: !!cfg.audio, captureTitle, provenance: cfg.provenance
    });
    recordings.push(recording);
    return recording;
  };
  if (cfg.scenario) {
    const {run} = await import(pathToFileURL(resolveFile(cfg.scenario)));
    if (typeof run !== 'function') throw new Error('Scenario must export async run({page, context, startRecording})');
    await run({page, context, startRecording, output: out});
  } else {
    const recording = await startRecording('probe');
    await recording.mark('start');
    await page.waitForTimeout((cfg.probeSeconds ?? 3) * 1000);
    await recording.mark('end');
    console.log('CAPTURE', JSON.stringify(await recording.stop()));
  }
} finally {
  const results = await Promise.allSettled(recordings.filter(r => !r.stopped).map(r => r.stop()));
  await browser.close();
  const failed = results.find(r => r.status === 'rejected');
  if (failed) throw failed.reason;
}
