// Run from a project with Playwright installed. No live site or tab audio needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {start} from './recorder.mjs';

const pw = createRequire(path.join(process.cwd(), 'package.json'))('playwright');
const out = await fs.mkdtemp(path.join(os.tmpdir(), 'capture-test-'));
const browser = await pw.chromium.launch({headless: false});
try {
  const context = await browser.newContext({...pw.devices['iPhone 16']});
  const page = await context.newPage();
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><button onclick="this.textContent=\'Done\';document.body.style.background=\'blue\'">Start</button>');
  await page.screenshot(); // Let the mobile compositor settle before the bounded take.
  await assert.rejects(start(page, path.join(out, 'invalid'), {maxSeconds: 0}), /maxSeconds/);
  const take = await start(page, path.join(out, 'auto'), {maxSeconds: 1});
  await take.mark('before');
  await page.getByRole('button', {name: 'Start', exact: true}).click();
  assert.equal(await page.getByRole('button').textContent(), 'Done');
  await take.mark('after');
  await page.waitForTimeout(1200);
  assert.equal(take.stopped, true);
  const result = await take.stop();
  assert.deepEqual(await take.stop(), result);
  const receipt = JSON.parse(await fs.readFile(path.join(out, 'auto', 'capture.json'), 'utf8'));
  assert.equal(receipt.stoppedBy, 'limit');
  assert.equal(receipt.maxSeconds, 1);
  assert.equal(receipt.frames[0].time, 0);
  assert.ok(receipt.end > 0 && receipt.end < 1.2, JSON.stringify(receipt.end));
  assert.deepEqual(receipt.marks.map(m => m.id), ['before', 'after']);
  for (const frame of receipt.frames) assert.ok((await fs.stat(path.join(out, 'auto', 'frames', frame.name))).size > 0);
  await assert.rejects(start(page, path.join(out, 'auto')), /EEXIST/);
  const manual = await start(page, path.join(out, 'manual'));
  await page.getByRole('button', {name: 'Done', exact: true}).click();
  await page.waitForTimeout(200);
  await manual.stop();
  const manualReceipt = JSON.parse(await fs.readFile(path.join(out, 'manual', 'capture.json'), 'utf8'));
  assert.equal(manualReceipt.stoppedBy, 'manual');
  assert.equal(manual.stopped, true);
  console.log('PASS: real button state, CDP files, automatic/manual stop, idempotency, overwrite refusal');
} finally {
  await browser.close();
  await fs.rm(out, {recursive: true, force: true});
}
