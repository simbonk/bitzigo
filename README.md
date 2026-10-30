# Bitzigo

A living-room motion game for two kids per camera, or four when a friend's house joins. A phone or laptop camera watches the kids standing in place; each one becomes a blocky character running down their own lane, and they **jump** over brick walls, **punch** crates, **lean their head** away from crazy birds and put **both hands up** to grab a rope and swing over puddles. A few times per workout everyone stops for a break game: **throw time** (knock down cans), **snowball time** (knock down a snowman), **karate time** (chop down to break boards), **fire time** (point an arm to aim a hose and put out the fires) and **bubble time** (flap, flap, flap up to a bubble, pop it with your head and drop back down), plus **Would You Rather?** (everyone gets the same silly question with two to four picture cards, and picks one by holding the pose drawn under it: one arm up on the left or right, both arms up, or hands together in front; then everyone sees who picked the same thing). Hats and accessories float down the road as free prizes, and 8 in a row makes a kid **super charged**: electric sparks and 1.5× points until they miss, or spin all the way round to cash it in for a mega bonus. Everyone runs the same course at the same time (or their own course, from setup). Eleven characters to pick from, including a ninja, a blue hedgehog, a pink axolotl, a firefighter and a cow. Built as a proof of concept to see how the mechanics feel.

Everything runs in the browser. There is no account, and the camera picture never leaves the device. The only network use is the optional friend game, below.

## Playing

1. Open the site on an iPhone (Safari) or a laptop and mirror the screen to the TV (iPhone: Control Centre, Screen Mirroring).
2. Prop the device up at waist height, 3 to 4 metres back, so every kid is in the picture from head to knees.
3. On the setup screen pick the number of players, their names and ages, the workout length and the world (Forest, Snow, Desert, Space).
4. In the lobby the kids stand wherever they like. The TV says "Found 3 of 4" until everyone is visible. Player 1 is whoever is furthest left on the TV. Pointing an arm out to the side changes character; both hands up (held for a second) means ready, and snaps a photo of their face for their score bubble.
5. "Arms down, stand tall!" calibrates each kid's normal stance, then a short spoken intro shows each obstacle once before the workout starts.
6. After the workout, the results screen shows each kid's score and an award. **Heart check** walks through each kid lying down with the phone flat on their chest for 15 seconds, then shows the highest score and the hardest-working heart.

Parent controls: the buttons in the bottom-right corner (or keys) start the lobby early with whoever is there, hide or show the camera view, mute, and end the workout. `` ` `` shows debug numbers, `C` recalibrates.

## How difficulty works

Every kid has their own skill level (shown as LV in their lane):

- It starts from their age, a little on the easy side.
- Each success nudges it up (quickly for the first few obstacles while the game is finding their level, then gently); each miss drops it four times as much. That settles where a kid succeeds about 80% of the time.
- After two misses in a row the game gives a longer gap and the kind of obstacle that kid is best at.
- Higher levels bring faster obstacles, shorter gaps, tighter timing, left/right crates, stars and quick pairs.
- Scoring is about timing. A move right as the obstacle arrives is PERFECT (100), a little off is GREAT (70), and anything else that still counts is GOOD (40), plus a streak bonus. How close counts as PERFECT depends on age, so a 4 year old gets more leeway than a 10 year old, and the same move is worth the same points to everyone. In breaks, younger kids get a points boost instead.
- On top of that, the whole squad ramps up a little as the workout timer counts down, and the last 15 seconds are double points.

Nobody is ever knocked out; a miss just breaks the streak.

## Playing with a friend

Two households can race at the same time, 2 kids each. On the home screen one family taps **Make a code** and gets something like `FROG-42`; **Copy invite** copies short steps for the friend (**Text it** opens the phone's share sheet with the same steps): open the site, Add to Home Screen, open Bitzigo from the icon, type the code and tap **Join**. Steps rather than a bare link because a link opened in iPhone Safari can't go full screen. A `?room=FROG-42` link still joins by itself, for laptops. Then both press **Let's go**. Each lobby waits until both squads are ready, and the code maker's world, workout length, tutorial setting and break games are used for both. During the race the friends' kids get lanes 3 and 4 next to yours, with their characters doing their moves and their scores (their obstacles aren't sent, so their road is clear), and both squads' totals show under the timer; the results screen shows both families. If the friends drop out, **Start now** carries on without them.

Each phone still does its own body tracking. Only a few hundred bytes of game updates a second go between the two browsers, directly over WebRTC; no video or face photos are sent. Codes are friends-only: there is no list of games and no matching with strangers, and a room takes one friend.

To find each other the two browsers use [PeerJS](https://peerjs.com)'s free public matchmaking server, which also offers a free best-effort relay for home networks that block direct connections. That's fine for trying it out. For something you rely on, set these optional environment variables on Vercel (`api/net.mjs` hands them to the game; with none set it uses the free defaults):

| Variable | What for |
| --- | --- |
| `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN` | Your own relay (Cloudflare Realtime TURN key). The game gets short-lived passwords, so the token never reaches the browser. |
| `PEER_HOST`, `PEER_PORT`, `PEER_PATH`, `PEER_KEY` | Your own PeerJS matchmaking server (for example the `peer` npm package on Render or Fly). |

## Testing without kids

Choose **Keyboard** on the setup screen. P1 uses W/A/S/D, P2 T/F/G/H, P3 I/J/K/L and P4 the arrow keys: up jumps (or throws, chops or flaps in the break games), left/right punches, left+right together is hands up, and down plus left/right leans.

## Would You Rather pictures

The 100 questions live in `tools/wyr-questions.txt` (question, then each answer as `label ; emoji ; picture description`). The pixel-art cards in `img/wyr/` were drawn once with Google's Gemini image model and shrunk to 48px sprites (under 1 KB each); the game never calls Gemini. After changing the questions:

```
python3 tools/wyr.py                                   # rebuild js/wyr-questions.js
GEMINI_API_KEY=... python3 tools/wyr.py --images       # draw only the missing pictures (about 4 cents per question)
GEMINI_API_KEY=... python3 tools/wyr.py --images --only 105 --force   # redraw one question
GEMINI_API_KEY=... python3 tools/wyr.py --voice        # record any missing spoken questions (needs ffmpeg)
```

The announcer reads each question out (`voice/wyr/<id>.mp3`, about 10 KB each). A card shows its emoji until its picture exists.

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
- `js/net.js`: play with a friend (room codes, PeerJS data channel). PeerJS (MIT) is vendored in `vendor/peerjs/` and only loaded when a code is made or joined.
- `js/audio.js`: synthesised sound effects, a chiptune music loop that speeds up as the workout goes on, and an announcer that calls each move (short MP3 clips in `voice/`, recorded once with Gemini text-to-speech, voice "Puck"; lines in `voice/lines.txt`). On separate courses it would talk over itself, so there each move gets a synthesised sound cue instead.

The MediaPipe runtime (Apache-2.0) and pose model are vendored in `vendor/` and `models/` so the game doesn't depend on a CDN.

**The heart check is for fun, not a medical device.**
