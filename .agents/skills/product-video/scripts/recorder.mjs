import fs from 'node:fs/promises';
import path from 'node:path';

// CDP pixels + optional tab audio. Product selectors belong in the scenario.
export async function start(page, out, {
  audio = false, captureTitle = 'Product Video Capture', provenance = null,
  readState = async p => ({url: p.url()}), maxWidth = 1170, maxHeight = 2532,
  maxSeconds = 60
} = {}) {
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0) throw new Error('maxSeconds must be positive and finite');
  await fs.mkdir(out);
  await fs.mkdir(path.join(out, 'frames'));
  const cdp = await page.context().newCDPSession(page);
  const epoch = Date.now();
  const now = () => (Date.now() - epoch) / 1000;
  const frames = [], marks = [], writes = [];
  let index = 0, audioStart = null, stopped = false, writeError = null, stopPromise, stopTimer;
  const device = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
    ua: navigator.userAgent, scrollWidth: document.documentElement.scrollWidth
  }));
  const onFrame = event => {
    // ACK stale compositor frames as well; do not mix their sizes into a take.
    cdp.send('Page.screencastFrameAck', {sessionId: event.sessionId}).catch(() => {});
    if (stopped || event.metadata.deviceWidth !== device.width || event.metadata.deviceHeight !== device.height) return;
    const name = `frame-${String(index++).padStart(5, '0')}.jpg`;
    frames.push({name, time: now(), metadata: event.metadata});
    writes.push(fs.writeFile(path.join(out, 'frames', name), Buffer.from(event.data, 'base64'))
      .catch(error => { writeError ??= error; }));
  };
  cdp.on('Page.screencastFrame', onFrame);
  const finishFrames = async () => {
    await cdp.send('Page.stopScreencast');
    cdp.off('Page.screencastFrame', onFrame);
    await Promise.all(writes);
    await cdp.detach();
    if (writeError) throw writeError;
  };
  await cdp.send('Page.startScreencast', {
    format: 'jpeg', quality: 95, maxWidth, maxHeight, everyNthFrame: 1
  });
  if (audio) {
    try {
      await page.evaluate(title => {document.title = title;}, captureTitle);
      const started = await page.evaluate(async () => {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true, audio: {suppressLocalAudioPlayback: false},
          preferCurrentTab: true, selfBrowserSurface: 'include'
        });
        if (!stream.getAudioTracks().length) {
          stream.getTracks().forEach(t => t.stop());
          throw new Error('Selected tab has no audio track');
        }
        window.__pvCaptureStream = stream;
        window.__pvAudioChunks = [];
        const recorder = new MediaRecorder(new MediaStream(stream.getAudioTracks()));
        window.__pvAudioRecorder = recorder;
        recorder.ondataavailable = event => window.__pvAudioChunks.push(event.data);
        recorder.start(500);
        return Date.now();
      });
      audioStart = (started - epoch) / 1000;
    } catch (error) {
      stopped = true;
      await finishFrames();
      throw error;
    }
  }
  const recording = {
    device,
    get stopped() { return stopped; },
    async mark(id, selector) {
      if (stopped) throw new Error('Take already stopped');
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid mark id');
      const box = selector ? await page.locator(selector).boundingBox() : null;
      const row = {id, time: now(), box, state: await readState(page)};
      marks.push(row);
      await page.screenshot({path: path.join(out, `${id}.png`)});
      return row;
    },
    stop(reason = 'manual') {
      if (stopPromise) return stopPromise;
      clearTimeout(stopTimer);
      const end = now();
      stopped = true;
      stopPromise = (async () => {
        let audioError;
        try {
          if (audioStart !== null) {
            const data = await page.evaluate(async () => {
              const recorder = window.__pvAudioRecorder;
              if (!recorder || recorder.state !== 'recording') throw new Error('Tab audio was interrupted; navigation requires a separate take');
              await new Promise(resolve => {recorder.onstop = resolve; recorder.stop();});
              window.__pvCaptureStream.getTracks().forEach(t => t.stop());
              const bytes = new Uint8Array(await new Blob(window.__pvAudioChunks, {type: recorder.mimeType}).arrayBuffer());
              let binary = '';
              for (const byte of bytes) binary += String.fromCharCode(byte);
              return btoa(binary);
            });
            await fs.writeFile(path.join(out, 'tab-audio.webm'), Buffer.from(data, 'base64'));
          }
        } catch (error) {audioError = error;}
        await finishFrames();
        if (audioError) throw audioError;
        if (!frames.length) throw new Error('No frames match the measured viewport; inspect the probe before recording again');
        const first = frames[0].time;
        const normalizedFrames = frames.map(f => ({...f, time: f.time - first}));
        let concat = '';
        for (let i = 0; i < frames.length; i++) {
          concat += `file 'frames/${frames[i].name}'\nduration ${Math.max(.001, (frames[i + 1]?.time ?? end) - frames[i].time)}\n`;
        }
        concat += `file 'frames/${frames.at(-1).name}'\n`;
        const receipt = {
          clock: 'seconds from first accepted frame', provenance, device,
          stoppedBy: reason, maxSeconds,
          audioStart: audioStart === null ? null : audioStart - first,
          end: end - first,
          marks: marks.map(m => ({...m, time: m.time - first})),
          frames: normalizedFrames
        };
        await fs.writeFile(path.join(out, 'frames.txt'), concat);
        await fs.writeFile(path.join(out, 'capture.json'), JSON.stringify(receipt, null, 2));
        return {frames: frames.length, duration: receipt.end, audioStart: receipt.audioStart, device};
      })();
      return stopPromise;
    }
  };
  stopTimer = setTimeout(() => recording.stop('limit').catch(error => {
    console.error('CAPTURE STOP FAILED', error.message);
  }), Math.max(0, maxSeconds * 1000 - (Date.now() - epoch)));
  return recording;
}
