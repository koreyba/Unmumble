"""Media regression: dense timestamps, action timing, pauses and overwrite refusal."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('renderer', Path(__file__).with_name('render-capture.py'))
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


class CaptureTimingTest(unittest.TestCase):
    def test_real_time_actions_and_trim(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'frames').mkdir()
            for color in ('red', 'blue'):
                subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
                                f'color=c={color}:s=64x96', '-frames:v', '1',
                                str(root / 'frames' / f'{color}.jpg')], check=True)
            frames = [{'name': 'red.jpg' if i < 60 else 'blue.jpg', 'time': i / 100}
                      for i in range(100)]
            manifest = root / 'capture.json'
            manifest.write_text(json.dumps({'frames': frames, 'end': 1.8}))
            output = root / 'video.mp4'
            renderer.render(manifest, output)
            self.assert_duration(output, 1.8)
            self.assert_color(output, 0.3, 'red')
            self.assert_color(output, 0.9, 'blue')
            self.assert_color(output, 1.7, 'blue')
            before = output.read_bytes()
            with self.assertRaises(FileExistsError):
                renderer.render(manifest, output)
            self.assertEqual(before, output.read_bytes())
            trimmed = root / 'trim.mp4'
            renderer.render(manifest, trimmed, start=0.45, duration=0.6)
            self.assert_duration(trimmed, 0.6)
            self.assert_color(trimmed, 0.05, 'red')
            self.assert_color(trimmed, 0.3, 'blue')

    def assert_duration(self, output, expected):
        actual = float(subprocess.check_output([
            'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
            '-of', 'default=nw=1:nk=1', str(output)], text=True))
        self.assertAlmostEqual(actual, expected, delta=1 / 30)

    def assert_color(self, output, time, expected):
        pixels = subprocess.check_output([
            'ffmpeg', '-v', 'error', '-ss', str(time), '-i', str(output),
            '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'])
        red, green, blue = pixels[:3]
        self.assertGreater(red if expected == 'red' else blue, 180)
        self.assertLess(blue if expected == 'red' else red, 50)


if __name__ == '__main__':
    unittest.main()
