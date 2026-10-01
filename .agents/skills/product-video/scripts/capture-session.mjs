import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
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
// Use the package CommonJS entry; index.mjs configs from the previous helper remain usable.
const modulePath = resolveFile(cfg.playwrightModule);
const require = createRequire(import.meta.url);
const pw = require(modulePath.endsWith('/index.mjs') ? path.join(path.dirname(modulePath), 'index.js') : modulePath);
const mode = cfg.recording ?? 'native';
if (!['native', 'cdp'].includes(mode)) throw new Error('config.recording must be native or cdp');
if (mode === 'native' && cfg.audio) throw new Error('Native recordVideo has no tab audio. Choose recording=cdp, browserType=chromium for requested tab audio.');
let contextOptions;
if (cfg.layout === 'mobile') {
  if (!pw.devices[cfg.device]) throw new Error('Choose a valid Playwright device');
  if (cfg.viewport) throw new Error('Mobile: use the complete device profile without a second viewport');
  contextOptions = {...pw.devices[cfg.device]};
} else if (cfg.layout === 'desktop') {
  contextOptions = {viewport: cfg.viewport || {width: 1440, height: 900}};
} else {
  throw new Error('config.layout must be mobile or desktop');
}
const engine = cfg.browserType ?? (mode === 'cdp' ? 'chromium' : contextOptions.defaultBrowserType ?? 'chromium');
if (!['chromium', 'webkit', 'firefox'].includes(engine)) throw new Error('Invalid config.browserType');
if (mode === 'cdp' && engine !== 'chromium') throw new Error('CDP capture requires Chromium');
const videoSize = cfg.videoSize ?? {...contextOptions.viewport};
if (mode === 'native') {
  for (const key of ['width', 'height']) {
    if (!Number.isInteger(videoSize[key]) || videoSize[key] <= 0) throw new Error('videoSize must contain positive integer width/height');
  }
}
const out = resolveFile(cfg.output);
await fs.mkdir(path.dirname(out), {recursive: true});
await fs.mkdir(out); // Never overwrite another session.
const captureTitle = cfg.captureTitle || 'Product Video Capture';
const recordings = [], marks = [];
let browser, context, page, video, failure, videoPath, measured, responseStatus, finalUrl;
const startedAt = new Date().toISOString();
const mark = async (id, state = {}) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid mark id');
  if (marks.some(m => m.id === id)) throw new Error('Duplicate mark id');
  const row = {id, at: new Date().toISOString(), url: page.url(), state};
  await page.screenshot({path: path.join(out, `${id}.png`), scale: 'css'});
  marks.push(row);
  return row;
};
try {
  const args = mode === 'cdp' ? ['--autoplay-policy=no-user-gesture-required'] : [];
  if (cfg.audio) args.push(`--auto-select-tab-capture-source-by-title=${captureTitle}`, '--enable-usermedia-screen-capturing', '--allow-http-screen-capture');
  browser = await pw[engine].launch({
    headless: cfg.headless ?? false,
    ...(cfg.executablePath ? {executablePath: resolveFile(cfg.executablePath)} : {}),
    ...(args.length ? {args} : {})
  });
  context = await browser.newContext({
    ...contextOptions,
    ...(mode === 'native' ? {recordVideo: {dir: path.join(out, 'videos'), size: videoSize}} : {})
  });
  context.setDefaultTimeout(5000);
  context.setDefaultNavigationTimeout(20000);
  if (cfg.initScript) await context.addInitScript({path: resolveFile(cfg.initScript)});
  page = await context.newPage();
  if (mode === 'native') video = page.video();
  page.on('pageerror', error => console.error('PAGEERROR', error.message));
  const response = await page.goto(cfg.url, {waitUntil: 'domcontentloaded'});
  responseStatus = response?.status() ?? null;
  if (responseStatus >= 400) throw new Error(`Navigation returned HTTP ${responseStatus}`);
  if (!(cfg.headless ?? false)) await page.bringToFront();
  await page.screenshot({path: path.join(out, 'probe.png'), scale: 'css'});
  measured = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
    ua: navigator.userAgent, scrollWidth: document.documentElement.scrollWidth
  }));
  await fs.writeFile(path.join(out, 'session.json'), JSON.stringify({
    url: page.url(), layout: cfg.layout, profile: cfg.layout === 'mobile' ? cfg.device : null,
    engine, recording: mode, requestedVideoSize: mode === 'native' ? videoSize : null,
    device: measured, audioRequested: !!cfg.audio, provenance: cfg.provenance ?? null
  }, null, 2));
  console.log('READY', JSON.stringify({engine, mode, ...measured}));
  const startRecording = async (name, options = {}) => {
    if (mode !== 'cdp') throw new Error('Native recording starts with newPage; use mark(), not startRecording().');
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Invalid take name');
    if (recordings.some(r => !r.stopped)) throw new Error('Stop the previous take first');
    const recording = await start(page, path.join(out, name), {...options, audio: !!cfg.audio, captureTitle, provenance: cfg.provenance});
    recordings.push(recording);
    return recording;
  };
  if (cfg.scenario) {
    const {run} = await import(pathToFileURL(resolveFile(cfg.scenario)));
    if (typeof run !== 'function') throw new Error('Scenario must export async run()');
    await run({page, context, mark, startRecording, output: out});
  } else if (mode === 'native') {
    await mark('start');
    await page.waitForTimeout((cfg.probeSeconds ?? 3) * 1000);
    await mark('end');
  } else {
    const recording = await startRecording('probe');
    await recording.mark('start');
    await page.waitForTimeout((cfg.probeSeconds ?? 3) * 1000);
    await recording.mark('end');
    console.log('CAPTURE', JSON.stringify(await recording.stop()));
  }
} catch (error) {
  failure = error;
} finally {
  finalUrl = page?.url() ?? cfg.url;
  const results = await Promise.allSettled(recordings.filter(r => !r.stopped).map(r => r.stop()));
  failure ??= results.find(r => r.status === 'rejected')?.reason;
  try {
    await context?.close();
    if (video) {
      videoPath = path.join(out, 'raw.webm');
      await video.saveAs(videoPath);
      if (!(await fs.stat(videoPath)).size) throw new Error('Video is empty');
    }
  } catch (error) { failure ??= error; }
  try { await browser?.close(); } catch (error) { failure ??= error; }
  if (mode === 'native') {
    await fs.writeFile(path.join(out, 'capture.json'), JSON.stringify({
      status: failure ? 'failed' : 'completed', error: failure?.message ?? null,
      clock: 'ISO timestamps of process events; not exact WebM frame timecodes',
      startedAt, finishedAt: new Date().toISOString(), url: cfg.url,
      finalUrl, responseStatus, engine,
      profile: cfg.layout === 'mobile' ? cfg.device : null,
      device: measured ?? null, requestedVideoSize: videoSize,
      video: videoPath, audioRequested: false, provenance: cfg.provenance ?? null, marks
    }, null, 2));
    if (videoPath) console.log('VIDEO', videoPath);
  }
}
if (failure) throw failure;
