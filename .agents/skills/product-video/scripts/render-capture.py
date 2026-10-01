#!/usr/bin/env python3
"""Render silent CDP frames at their recorded times, without concat quantization."""
import argparse
import json
import math
from pathlib import Path
import subprocess


def render(manifest, output, *, fps=30, crf=16, start=0.0, duration=None):
    manifest, output = Path(manifest), Path(output)
    capture = json.loads(manifest.read_text())
    frames = capture['frames']
    end = capture['end']
    if not frames or not math.isfinite(end) or end <= 0:
        raise ValueError('Capture must contain frames and a positive finite end time')
    previous = -math.inf
    for frame in frames:
        timestamp = frame['time']
        if not math.isfinite(timestamp) or timestamp < 0 or timestamp < previous or timestamp > end:
            raise ValueError('Frame times must be finite, ordered and within the capture')
        if Path(frame['name']).name != frame['name']:
            raise ValueError('Frame names must be plain filenames')
        previous = timestamp
    if frames[0]['time'] != 0:
        raise ValueError('Capture clock must start at the first accepted frame')
    if not math.isfinite(fps) or fps <= 0 or not 0 <= crf <= 51:
        raise ValueError('Choose a positive finite fps and CRF between 0 and 51')
    if not math.isfinite(start) or not 0 <= start < end:
        raise ValueError('Start must fall inside the capture')
    duration = end - start if duration is None else duration
    if not math.isfinite(duration) or duration <= 0 or start + duration > end + 1e-9:
        raise ValueError('Duration must be positive and fit inside the capture')
    if output.exists():
        raise FileExistsError(output)
    count = math.ceil(duration * fps - 1e-9)
    command = [
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-n',
        '-f', 'image2pipe', '-framerate', str(fps), '-vcodec', 'mjpeg', '-i', 'pipe:0',
        '-an', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', str(crf),
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(output),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    index, loaded_index, pixels = 0, None, None
    try:
        for number in range(count):
            timestamp = start + number / fps
            while index + 1 < len(frames) and frames[index + 1]['time'] <= timestamp:
                index += 1
            if index != loaded_index:
                pixels = (manifest.parent / 'frames' / frames[index]['name']).read_bytes()
                loaded_index = index
            process.stdin.write(pixels)
        process.stdin.close()
        if process.wait() != 0:
            raise RuntimeError('FFmpeg failed to render the capture')
    except BaseException:
        try:
            process.stdin.close()
        except OSError:
            pass
        if process.poll() is None:
            process.terminate()
        process.wait()
        raise
    return {'file': str(output), 'frames': count, 'fps': fps, 'duration': count / fps}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path, help='CDP capture.json')
    parser.add_argument('output', type=Path, help='New MP4, silent picture only')
    parser.add_argument('--fps', type=float, default=30)
    parser.add_argument('--crf', type=int, default=16)
    parser.add_argument('--start', type=float, default=0)
    parser.add_argument('--duration', type=float)
    args = parser.parse_args()
    print(json.dumps(render(args.manifest, args.output, fps=args.fps, crf=args.crf,
                            start=args.start, duration=args.duration)))
