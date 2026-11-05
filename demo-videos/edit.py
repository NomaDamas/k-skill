#!/usr/bin/env python3
"""Cut raw vhs recordings into <=20s demos: typing + answer at 1x, thinking sped up."""
import subprocess, sys, numpy as np, pathlib, json

ROOT = pathlib.Path(__file__).parent
FPS = 5
INTRO_PAD = 0.5     # trim idle lead-in
ANSWER_STREAM = 4.0 # seconds of the final answer streaming kept at 1x
HOLD = 9.0          # max seconds to hold the finished answer
MAX_TOTAL = 19.5
MIN_SPEED = 3.0
FAST_TARGET = 5.0   # fast-forward section length
FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

def diffs(path, W=192, H=108):
    raw = subprocess.run(['ffmpeg','-v','error','-i',str(path),'-vf',f'fps={FPS},scale={W}:{H},format=gray','-f','rawvideo','-'],capture_output=True).stdout
    a = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(int)
    return np.abs(np.diff(a, axis=0)).mean(axis=(1, 2))

def plan(path):
    d = diffs(path); act = d > 0.3
    n = len(d)
    # typing starts at first activity after 0.8s
    i = int(0.8*FPS)
    while not act[i]: i += 1
    typing_start = i
    # Enter = first burst after a >=0.6s quiet gap following typing
    quiet = 0; j = i
    while j < n:
        if act[j]:
            if quiet >= int(0.6*FPS): break
            quiet = 0
        else: quiet += 1
        j += 1
    enter = j / FPS
    last = max(k for k in range(n) if act[k]) / FPS + 0.2
    return typing_start/FPS, enter, last

def render(name):
    src = ROOT/'raw'/f'{name}.mp4'; dst = ROOT/'final'/f'{name}.mp4'
    ts, enter, last = plan(src)
    a0 = max(0, ts - INTRO_PAD); a1 = enter + 0.6
    c0 = max(a1 + 1.0, last - ANSWER_STREAM)
    b0, b1 = a1, c0
    f = max(MIN_SPEED, (b1 - b0) / FAST_TARGET)
    hold = min(HOLD, MAX_TOTAL - (a1 - a0) - (b1 - b0) / f - (last - c0))
    c1 = last + hold
    total = (a1 - a0) + (b1 - b0) / f + (c1 - c0)
    print(f'{name}: typing@{ts:.1f} enter@{enter:.1f} last@{last:.1f} fast x{f:.1f} total {total:.1f}s')
    show_badge = True
    badge = ROOT/'final'/f'.badge-{name}.png'
    if show_badge: subprocess.run(['magick','-background','#E64553','-fill','white','-font',FONT,'-pointsize','36',f'label: >> {f:.0f}x speed (thinking) ','-bordercolor','#E64553','-border','10',str(badge)],check=True)
    fc = (f"[0:v]trim={a0}:{a1},setpts=PTS-STARTPTS[a];"
          f"[0:v]trim={b0}:{b1},setpts=(PTS-STARTPTS)/{f}[b0];"
          + ("[b0][1:v]overlay=W-w-40:40[b];" if show_badge else "[b0]null[b];") +
          f"[0:v]trim={c0}:{c1},setpts=PTS-STARTPTS[c];"
          f"[a][b][c]concat=n=3:v=1:a=0,fps=30,format=yuv420p[v]")
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(src),*(['-i',str(badge)] if show_badge else []),'-filter_complex',fc,'-map','[v]','-c:v','libx264','-crf','20','-preset','medium','-movflags','+faststart',str(dst)],check=True)
    if show_badge: badge.unlink()
    return total

if __name__ == '__main__':
    (ROOT/'final').mkdir(exist_ok=True)
    names = sys.argv[1:] or sorted(p.stem for p in (ROOT/'raw').glob('*.mp4'))
    for n in names: render(n)
