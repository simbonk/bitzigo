#!/usr/bin/env python3
"""Record any missing announcer lines in voice/lines.txt (name|text) as voice/<name>.mp3.

  GEMINI_API_KEY=... python3 tools/voice.py            # only the missing ones
  GEMINI_API_KEY=... python3 tools/voice.py duck boss_time --force   # redo these

Same voice ("Puck") and the same trimming as the Would You Rather questions.
Needs ffmpeg. The game never calls Gemini; it only plays these files.
"""
import os, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wyr import post, TTS_MODEL, ROOT  # noqa: E402

key = os.environ.get('GEMINI_API_KEY')
if not key:
    sys.exit('Set GEMINI_API_KEY first.')
args = [a for a in sys.argv[1:] if not a.startswith('--')]
force = '--force' in sys.argv
trim = 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse'
for line in open(os.path.join(ROOT, 'voice', 'lines.txt'), encoding='utf-8'):
    if '|' not in line:
        continue
    name, text = line.strip().split('|', 1)
    path = os.path.join(ROOT, 'voice', name + '.mp3')
    if (args and name not in args) or (os.path.exists(path) and not force):
        continue
    print('recording', name)
    body = {
        'contents': [{'parts': [{'text': 'Say like an excited, friendly cartoon game announcer for kids: ' + text}]}],
        'generationConfig': {'responseModalities': ['AUDIO'], 'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': 'Puck'}}}},
    }
    pcm = post(TTS_MODEL, body, key, name)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', '-',
                    '-af', trim + ',loudnorm=I=-15:TP=-1.5,afade=t=in:d=0.01', '-ar', '24000', '-ac', '1', '-b:a', '32k', path],
                   input=pcm, check=True)
