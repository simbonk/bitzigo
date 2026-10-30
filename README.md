# Quad Squad

A living-room motion game for up to four kids at once. A phone or laptop camera watches the kids standing in place; each one becomes a blocky character running down their own lane, and they **jump** over brick walls, **punch** crates, **lean their head** away from crazy birds and put **both hands up** to grab a rope and swing over puddles. A couple of times per workout everyone stops for **throw time**: throw overhand to knock down a pyramid of cans. Built as a proof of concept to see how the mechanics feel.

Everything runs in the browser. There is no server, no account, and the camera picture never leaves the device.

## Playing

1. Open the site on an iPhone (Safari) or a laptop and mirror the screen to the TV (iPhone: Control Centre, Screen Mirroring).
2. Prop the device up at waist height, 3 to 4 metres back, so every kid is in the picture from head to knees.
3. On the setup screen pick the number of players, their names and ages, the workout length and the world (Forest, Snow, Desert, Space).
4. In the lobby the kids stand wherever they like. The TV says "Found 3 of 4" until everyone is visible. Player 1 is whoever is furthest left on the TV. Pointing an arm out to the side changes character; both hands up (held for a second) means ready, and snaps a photo of their face for their score bubble.
5. "Arms down, stand tall!" calibrates each kid's normal stance, then a short spoken intro shows each obstacle once before the workout starts.
6. After the workout, the results screen shows each kid's score and an award. **Heart check** walks through each kid lying down with the phone flat on their chest for 30 seconds, then shows the highest score and the hardest-working heart.

Parent controls: the buttons in the bottom-right corner (or keys) start the lobby early with whoever is there, hide or show the camera view, mute, and end the workout. `` ` `` shows debug numbers, `C` recalibrates.

## How difficulty works

Every kid has their own skill level (shown as LV in their lane):

- It starts from their age, a little on the easy side.
- Each success nudges it up (quickly for the first few obstacles while the game is finding their level, then gently); each miss drops it four times as much. That settles where a kid succeeds about 80% of the time.
- After two misses in a row the game gives a longer gap and the kind of obstacle that kid is best at.
- Higher levels bring faster obstacles, shorter gaps, tighter timing, left/right crates, stars and quick pairs.
- On top of that, the whole squad ramps up a little as the workout timer counts down, and the last 15 seconds are double points.

Nobody is ever knocked out; a miss just breaks the streak.

## Testing without kids

Choose **Keyboard** on the setup screen. P1 uses W/A/S/D, P2 T/F/G/H, P3 I/J/K/L and P4 the arrow keys: up jumps (or throws in throw time), left/right punches, left+right together is hands up, and down plus left/right leans.

## Hosting

It's a static site with no build step. On Vercel, import the repo with framework preset "Other", no build command and the root as the output directory. Any static host works, but it must be served over https for the camera and motion sensors.

```
python3 -m http.server 8000   # then open http://localhost:8000
```

## How it works

- `js/pose.js`: camera plus [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) (lite model). One wide frame with four small people is hard for the detector, so the frame is cut into overlapping vertical tiles, each tracked separately, and duplicates are merged.
- `js/game.js`: move detection relative to each kid's calibrated standing pose, obstacles, scoring and the adaptive difficulty.
- `js/render.js`: the world is drawn on a small canvas and scaled up without smoothing for the chunky pixel look; text and the HUD are drawn on top at full resolution.
- `js/heart.js`: the heart check. Signal processing comes from [Sternum](https://github.com/simbonk/sternum) (`vendor/sternum/analysis.js`).
- `js/audio.js`: synthesised sound effects, a chiptune music loop that speeds up as the workout goes on, and spoken cues (a squeaky cartoon voice for each move) using the device's built-in speech, so there are no audio files or API keys.

The MediaPipe runtime (Apache-2.0) and pose model are vendored in `vendor/` and `models/` so the game doesn't depend on a CDN.

**The heart check is for fun, not a medical device.**
