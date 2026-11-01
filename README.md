# Bitzigo

A living-room motion game for two kids per camera, or four when a friend's house joins. A phone or laptop camera watches the kids standing in place; each one becomes a blocky character running down their own lane, and they **jump** over brick walls, **punch** crates, **duck** under crazy birds (which get hopping mad when they're ducked, and laugh at you and pinch some of your points when they bonk you: the score counts backwards in red) and put **both hands up** to grab a rope and swing over puddles. A few times per workout everyone stops for a break game: **throw time** (knock down cans), **snowball time** (knock down a snowman), **karate time** (chop down to break boards), **fire time** (point an arm to aim a hose and put out the fires) and **bubble time** (flap, flap, flap up to a bubble, pop it with your head and drop back down), plus **Would You Rather?** (everyone gets the same silly question with two to four picture cards, and picks one by holding the pose drawn under it: one arm up on the left or right, both arms up, or hands together in front; then everyone sees who picked the same thing). Silly cameos keep an eye on them: geese, a cat in a hot-air balloon, a floating cow, a grumpy cloud, a UFO and a pilot hang in the sky on the flying and climbing breaks (shocked as a kid flies past, squinting up after them), something flies past during the run and does a double take when a kid jumps, and a bird on the rope's branch gets bounced off it. Everything on the road lands on a beat of the music: a ring closes in on each move's picture cue and the cue bounces in time, and a move right on the beat scores ON BEAT, with a beat combo that adds a bonus and plays a chime climbing up a scale. Smashing a crate freezes the game for a split second (hit-stop), shakes the lane and throws chunky splinters at the screen. Crouching squishes the character down like a spring, glowing brighter the lower they go. Characters face away down the road the whole time, break games and boss fight included, with their arms out in front of them (hidden by the body, like a real back view), and do a quick head turn to the camera after a move, when they're bonked or on a streak. Anything to chop, knock over, spray or bomb sits out in front of them, down the road; the chop frenzy has a log on a stump that splits on every chop. A set is three rounds, and the last one ends in a **boss fight**: Captain Squawk, the crazy bird in a pirate hat, hovers overhead while everyone throws bombs at him (one shared health bar, so every kid's bomb counts the same) and swoops at their heads so they have to duck (miss the duck and he pinches 250 points). When he's worn out, **Super Eagle**, his arch enemy, dives in and knocks him out of the sky, and then the kids throw their points into Super Eagle's beak. He remembers everything he's eaten from one day to the next, and levels up and gets bigger as the family feeds him. A streak counter shows how many moves in a row each kid has landed. Everyone runs the same course at the same time (or their own course, from setup). Thirteen characters to pick from, including a ninja, a blue hedgehog, a pink axolotl, a firefighter, a cow, a ginger cat and a Bernese mountain dog. Built as a proof of concept to see how the mechanics feel.

Everything runs in the browser. There is no account, and the camera picture never leaves the device. The only network use is the optional friend game, below.

## Playing

1. Open the site on an iPhone (Safari) or a laptop and mirror the screen to the TV (iPhone: Control Centre, Screen Mirroring).
2. Prop the device up at waist height, 3 to 4 metres back, so every kid is in the picture from head to knees.
3. On the **Play here** tab of the setup screen pick the number of players and their names and ages. The workout length, world (Forest, Snow, Desert, Space and more, picked with the arrows), camera, course and tutorial have defaults and live on the **Extras** tab.
4. In the lobby the kids stand wherever they like. The TV says "Found 3 of 4" until everyone is visible. Player 1 is whoever is furthest left on the TV. Pointing an arm out to the side changes character; both hands up (held for a second) means ready, and snaps a photo of their face for their score plate (top left of their lane).
5. "Arms down, stand tall!" calibrates each kid's normal stance, then a short spoken intro shows each obstacle once before the workout starts.
6. After the workout, the results screen shows each kid's score and an award. **Heart check** walks through each kid lying down with the phone flat on their chest for 15 seconds, then shows the highest score and the hardest-working heart.

Parent controls: the toolbar of arcade buttons along the bottom (it tucks away during a game; tap the screen to bring it back), or keys, pauses, hides or shows the camera view, mutes and ends the workout; in the lobby its **Start now** starts early with whoever is there. `` ` `` shows debug numbers, `C` recalibrates.

## How difficulty works

Every kid has their own hidden skill level:

- It starts from their age, a little on the easy side.
- Each success nudges it up (quickly for the first few obstacles while the game is finding their level, then gently); each miss drops it four times as much. That settles where a kid succeeds about 80% of the time.
- After two misses in a row the game gives a longer gap and the kind of obstacle that kid is best at.
- Higher levels bring faster obstacles, shorter gaps, tighter timing, left/right crates, stars and quick pairs.
- Scoring is about timing. A move right as the obstacle arrives is PERFECT (100), a little off is GREAT (70), and anything else that still counts is GOOD (40), plus a streak bonus. How close counts as PERFECT depends on age, so a 4 year old gets more leeway than a 10 year old, and the same move is worth the same points to everyone. In breaks, younger kids get a points boost instead.
- On top of that, the whole squad ramps up a little as the workout timer counts down, and the last 15 seconds are double points.

Nobody is ever knocked out; a miss just breaks the streak.

## Playing with a friend

Up to four devices (phones, iPads or laptops) can race at the same time, four lanes in all: with two devices it's 2 kids each, with three or four it's 1 kid each. The code maker's device links to the others and passes their updates along. On the home screen's **Play with friends** tab one family taps **Make a code** and picks how many **Devices** will play (2, 3 or 4); the game waits until that many have joined and are ready and gets something like `FROG-42`; **Copy invite** copies short steps for the friend (**Text it** opens the phone's share sheet with the same steps): open the site, Add to Home Screen, open Bitzigo from the icon, tap **Play with friends**, type the code and tap **Join**. Steps rather than a bare link because a link opened in iPhone Safari can't go full screen. A `?room=FROG-42` link still joins by itself, for laptops. Then both press **Let's go**. Each lobby waits until both squads are ready, and the code maker's world, workout length, tutorial setting and break games are used for both. During the race the friends' kids get lanes 3 and 4 next to yours, showing what they're doing and facing: their moves, obstacles, break games and scores, and both squads' totals show under the timer; the results screen shows both families. If the friends drop out, **Start now** carries on without them.

Each phone still does its own body tracking. Only a few kilobytes of game updates a second go between the two browsers, directly over WebRTC; no video or face photos are sent. Codes are friends-only: there is no list of games and no matching with strangers, and a room takes up to four devices.

To find each other the two browsers use [PeerJS](https://peerjs.com)'s free public matchmaking server, which also offers a free best-effort relay for home networks that block direct connections. That's fine for trying it out. For something you rely on, set these optional environment variables on Vercel (`api/net.mjs` hands them to the game; with none set it uses the free defaults):

| Variable | What for |
| --- | --- |
| `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN` | Your own relay (Cloudflare Realtime TURN key). The game gets short-lived passwords, so the token never reaches the browser. |
| `PEER_HOST`, `PEER_PORT`, `PEER_PATH`, `PEER_KEY` | Your own PeerJS matchmaking server (for example the `peer` npm package on Render or Fly). |

## Testing without kids

Choose **Keyboard** on the setup screen's Extras tab. P1 uses W/A/S/D, P2 T/F/G/H, P3 I/J/K/L and P4 the arrow keys: up jumps (or throws, chops or flaps in the break games), left/right punches, left+right together is hands up, and down ducks.

## Would You Rather pictures

The 100 questions live in `tools/wyr-questions.txt` (question, then each answer as `label ; emoji ; picture description`). The pixel-art cards in `img/wyr/` were drawn once with Google's Gemini image model and shrunk to 48px sprites (under 1 KB each); the game never calls Gemini. After changing the questions:

```
python3 tools/wyr.py                                   # rebuild js/wyr-questions.js
GEMINI_API_KEY=... python3 tools/wyr.py --images       # draw only the missing pictures (about 4 cents per question)
GEMINI_API_KEY=... python3 tools/wyr.py --images --only 105 --force   # redraw one question
GEMINI_API_KEY=... python3 tools/wyr.py --voice        # record any missing spoken questions (needs ffmpeg)
```

The announcer reads each question and then its answers out (`voice/wyr/<id>.mp3`, about 35 KB each), and a question can't end until it has finished. `--voice` stops at Gemini's daily limit of 100 text-to-speech requests; `WYR_TTS_MODEL=gemini-2.5-pro-preview-tts` has its own limit. A card shows its emoji until its picture exists.

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
- `js/audio.js`: synthesised sound effects, a chiptune music loop that speeds up as the workout goes on, and an announcer that calls each move (short MP3 clips in `voice/`, recorded once with Gemini text-to-speech, voice "Puck"; lines in `voice/lines.txt`; `GEMINI_API_KEY=... python3 tools/voice.py` records any line that has no clip yet). On separate courses it would talk over itself, so there each move gets a synthesised sound cue instead.

The MediaPipe runtime (Apache-2.0) and pose model are vendored in `vendor/` and `models/` so the game doesn't depend on a CDN.

**The heart check is for fun, not a medical device.**
