# Retro Road Rush

A browser-based old-school arcade racing game with neon visuals and fast, lane-based traffic dodging.

## Features

- Retro arcade look with neon HUD and pixel-style rendering
- Keyboard controls for steering, boosting, and braking
- Procedural retro audio (engine hum, chiptune-style background loop, pass + crash SFX)
- Dynamic enemy traffic spawning and collision-based game-over logic
- Score + best score tracking (best score saved in localStorage)
- Instant restart flow for repeat runs

## Controls

- Move left/right: `Arrow Left` / `Arrow Right` or `A` / `D`
- Boost: `Arrow Up` or `W`
- Brake: `Arrow Down` or `S`
- Start / Restart: `Space` or `Enter`
- Toggle sound: `M` or the `Mute/Unmute` button

## Run locally

Because this is a static HTML/CSS/JS game, you can run it with any static server:

```bash
# Option 1: Node
npx serve .

# Option 2: If you already have another static server tool, use that.
```

Then open the served URL in your browser and race.
