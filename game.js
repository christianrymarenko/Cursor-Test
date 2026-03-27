const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreLabel = document.getElementById("score");
const bestLabel = document.getElementById("best");
const speedLabel = document.getElementById("speed");
const soundStatusLabel = document.getElementById("soundStatus");
const soundToggleButton = document.getElementById("soundToggle");

const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;
const ROAD_WIDTH = 230;
const ROAD_LEFT = (GAME_WIDTH - ROAD_WIDTH) / 2;
const ROAD_RIGHT = ROAD_LEFT + ROAD_WIDTH;
const LANE_COUNT = 3;
const LANE_WIDTH = ROAD_WIDTH / LANE_COUNT;
const PLAYER_WIDTH = 34;
const PLAYER_HEIGHT = 62;
const ENEMY_WIDTH = 34;
const ENEMY_HEIGHT = 62;

const STAR_COUNT = 36;
const ROAD_SEGMENT_LENGTH = 40;
const SOUND_STORAGE_KEY = "retro-road-rush-sound";
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const audioSupported = Boolean(AudioContextClass);

const MUSIC_LEAD_PATTERN = [
  523.25, 659.25, 783.99, 659.25, 523.25, 659.25, 880.0, 659.25,
  493.88, 622.25, 739.99, 622.25, 493.88, 622.25, 783.99, 622.25,
];
const MUSIC_BASS_PATTERN = [
  130.81, 0, 130.81, 0, 146.83, 0, 146.83, 0,
  123.47, 0, 123.47, 0, 110.0, 0, 110.0, 0,
];
const MUSIC_STEP_MS = 180;

const keys = {
  left: false,
  right: false,
  up: false,
  down: false,
};

let stars = [];
let roadOffset = 0;
let enemies = [];
let spawnTimer = 0;
let gameStarted = false;
let gameOver = false;
let score = 0;
let bestScore = Number(localStorage.getItem("retro-road-rush-best") || 0);
let distance = 0;
let soundEnabled = audioSupported ? localStorage.getItem(SOUND_STORAGE_KEY) !== "off" : false;

let audioCtx = null;
let masterGain = null;
let musicGain = null;
let sfxGain = null;
let engineOsc = null;
let engineGain = null;
let engineFilter = null;
let musicIntervalId = null;
let musicStep = 0;

const player = {
  x: GAME_WIDTH / 2 - PLAYER_WIDTH / 2,
  y: GAME_HEIGHT - 110,
  w: PLAYER_WIDTH,
  h: PLAYER_HEIGHT,
  speed: 0,
  maxSpeed: 10.5,
  minSpeed: 3.5,
  accel: 0.15,
  turnSpeed: 5,
};

bestLabel.textContent = bestScore.toString();

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateSoundUi() {
  if (!audioSupported) {
    soundStatusLabel.textContent = "N/A";
    soundToggleButton.textContent = "No Audio";
    soundToggleButton.disabled = true;
    return;
  }

  soundStatusLabel.textContent = soundEnabled ? "ON" : "OFF";
  soundToggleButton.textContent = soundEnabled ? "Mute" : "Unmute";
}

function ensureAudioGraph() {
  if (!audioSupported || audioCtx) return;

  audioCtx = new AudioContextClass();

  masterGain = audioCtx.createGain();
  masterGain.gain.value = soundEnabled ? 0.24 : 0;
  masterGain.connect(audioCtx.destination);

  musicGain = audioCtx.createGain();
  musicGain.gain.value = 0.35;
  musicGain.connect(masterGain);

  sfxGain = audioCtx.createGain();
  sfxGain.gain.value = 0.45;
  sfxGain.connect(masterGain);

  engineGain = audioCtx.createGain();
  engineGain.gain.value = 0;
  engineGain.connect(masterGain);

  engineFilter = audioCtx.createBiquadFilter();
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 350;

  engineOsc = audioCtx.createOscillator();
  engineOsc.type = "sawtooth";
  engineOsc.frequency.value = 80;
  engineOsc.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineOsc.start();
}

function resumeAudioContext() {
  if (!audioCtx || audioCtx.state !== "suspended") return;
  audioCtx.resume().catch(() => {});
}

function activateAudioFromGesture() {
  ensureAudioGraph();
  resumeAudioContext();
}

function setSoundEnabled(nextValue) {
  soundEnabled = nextValue;

  if (audioSupported) {
    localStorage.setItem(SOUND_STORAGE_KEY, soundEnabled ? "on" : "off");
  }

  if (audioCtx && masterGain) {
    const target = soundEnabled ? 0.24 : 0;
    masterGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.03);
  }

  if (!soundEnabled) {
    stopMusic();
  } else if (gameStarted && !gameOver) {
    startMusic();
  }

  updateSoundUi();
}

function toggleSound() {
  if (!audioSupported) return;
  activateAudioFromGesture();
  setSoundEnabled(!soundEnabled);
}

function playTone({
  freq,
  when,
  duration = 0.1,
  volume = 0.15,
  type = "square",
  targetNode = sfxGain,
  slideTo = null,
}) {
  if (!audioCtx || !soundEnabled || !targetNode || !freq) return;

  const start = when ?? audioCtx.currentTime;
  const oscillator = audioCtx.createOscillator();
  const envelope = audioCtx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, start);
  if (slideTo && slideTo > 0) {
    oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  }

  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.linearRampToValueAtTime(volume, start + 0.006);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration + 0.05);

  oscillator.connect(envelope);
  envelope.connect(targetNode);

  oscillator.start(start);
  oscillator.stop(start + duration + 0.06);
}

function playStartJingle() {
  if (!audioCtx || !soundEnabled) return;
  const start = audioCtx.currentTime + 0.01;
  const notes = [523.25, 659.25, 783.99];
  notes.forEach((note, index) => {
    playTone({
      freq: note,
      when: start + index * 0.09,
      duration: 0.08,
      volume: 0.13,
      type: "square",
    });
  });
}

function playPassSfx() {
  if (!audioCtx || !soundEnabled) return;
  const now = audioCtx.currentTime;
  playTone({
    freq: 920,
    when: now,
    duration: 0.045,
    volume: 0.07,
    type: "triangle",
  });
  playTone({
    freq: 1240,
    when: now + 0.03,
    duration: 0.035,
    volume: 0.05,
    type: "square",
  });
}

function playCrashSfx() {
  if (!audioCtx || !soundEnabled) return;
  const now = audioCtx.currentTime;
  playTone({
    freq: 280,
    when: now,
    duration: 0.28,
    volume: 0.2,
    type: "sawtooth",
    slideTo: 75,
  });
  playTone({
    freq: 120,
    when: now + 0.04,
    duration: 0.32,
    volume: 0.16,
    type: "square",
    slideTo: 45,
  });
}

function runMusicStep() {
  if (!audioCtx || !soundEnabled || !gameStarted || gameOver) return;

  const lead = MUSIC_LEAD_PATTERN[musicStep % MUSIC_LEAD_PATTERN.length];
  const bass = MUSIC_BASS_PATTERN[musicStep % MUSIC_BASS_PATTERN.length];
  const when = audioCtx.currentTime + 0.01;

  if (lead > 0) {
    playTone({
      freq: lead,
      when,
      duration: 0.11,
      volume: 0.06,
      type: "square",
      targetNode: musicGain,
    });
  }

  if (bass > 0) {
    playTone({
      freq: bass,
      when,
      duration: 0.14,
      volume: 0.08,
      type: "triangle",
      targetNode: musicGain,
    });
  }

  musicStep += 1;
}

function startMusic() {
  if (!audioCtx || !soundEnabled || !gameStarted || gameOver || musicIntervalId) return;
  musicStep = 0;
  runMusicStep();
  musicIntervalId = window.setInterval(runMusicStep, MUSIC_STEP_MS);
}

function stopMusic() {
  if (!musicIntervalId) return;
  window.clearInterval(musicIntervalId);
  musicIntervalId = null;
}

function updateEngineAudio() {
  if (!audioCtx || !engineOsc || !engineGain || !engineFilter) return;

  const normalizedSpeed = clamp(
    (player.speed - player.minSpeed) / (player.maxSpeed - player.minSpeed),
    0,
    1
  );
  const isActive = gameStarted && !gameOver && soundEnabled;
  const targetFrequency = isActive ? 95 + normalizedSpeed * 170 : 70;
  const targetFilter = isActive ? 380 + normalizedSpeed * 650 : 260;
  const targetGain = isActive ? 0.035 + normalizedSpeed * 0.085 : 0;
  const now = audioCtx.currentTime;

  engineOsc.frequency.setTargetAtTime(targetFrequency, now, 0.05);
  engineFilter.frequency.setTargetAtTime(targetFilter, now, 0.05);
  engineGain.gain.setTargetAtTime(targetGain, now, 0.06);
}

function initStars() {
  stars = [];
  for (let i = 0; i < STAR_COUNT; i += 1) {
    stars.push({
      x: Math.random() * GAME_WIDTH,
      y: Math.random() * GAME_HEIGHT,
      size: Math.random() > 0.75 ? 2 : 1,
      twinkle: Math.random() * Math.PI * 2,
    });
  }
}

function resetGame() {
  enemies = [];
  spawnTimer = 0;
  score = 0;
  distance = 0;
  gameOver = false;
  roadOffset = 0;

  player.x = GAME_WIDTH / 2 - PLAYER_WIDTH / 2;
  player.speed = 6.2;

  scoreLabel.textContent = "0";
  speedLabel.textContent = Math.round(player.speed * 10).toString();
}

function startGame() {
  activateAudioFromGesture();
  resetGame();
  gameStarted = true;
  gameOver = false;
  playStartJingle();
  startMusic();
}

function laneCenterX(laneIndex) {
  return ROAD_LEFT + laneIndex * LANE_WIDTH + LANE_WIDTH / 2;
}

function spawnEnemy() {
  const lane = Math.floor(Math.random() * LANE_COUNT);
  const type = Math.random() > 0.65 ? "truck" : "car";

  const width = type === "truck" ? ENEMY_WIDTH + 8 : ENEMY_WIDTH;
  const height = type === "truck" ? ENEMY_HEIGHT + 10 : ENEMY_HEIGHT;

  enemies.push({
    x: laneCenterX(lane) - width / 2,
    y: -height - 10,
    w: width,
    h: height,
    speed: randomRange(3.8, 7.2),
    color: type === "truck" ? "#ffce3a" : "#ff4b7d",
  });
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function update() {
  if (!gameStarted || gameOver) {
    updateEngineAudio();
    return;
  }

  if (keys.up) {
    player.speed = clamp(player.speed + player.accel, player.minSpeed, player.maxSpeed);
  } else if (keys.down) {
    player.speed = clamp(player.speed - player.accel * 1.2, player.minSpeed, player.maxSpeed);
  } else {
    player.speed = clamp(player.speed - 0.03, player.minSpeed, player.maxSpeed);
  }

  if (keys.left) player.x -= player.turnSpeed;
  if (keys.right) player.x += player.turnSpeed;

  player.x = clamp(player.x, ROAD_LEFT + 6, ROAD_RIGHT - player.w - 6);

  roadOffset += player.speed;
  if (roadOffset >= ROAD_SEGMENT_LENGTH) {
    roadOffset = 0;
  }

  stars.forEach((star) => {
    star.y += player.speed * (star.size === 2 ? 0.22 : 0.12);
    star.twinkle += 0.03;
    if (star.y > GAME_HEIGHT + 2) {
      star.y = -2;
      star.x = Math.random() * GAME_WIDTH;
    }
  });

  spawnTimer += 1;
  const spawnRate = Math.max(26, 70 - Math.floor(distance / 450));
  if (spawnTimer >= spawnRate) {
    spawnTimer = 0;
    spawnEnemy();
  }

  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];
    enemy.y += enemy.speed + player.speed * 0.75;

    if (enemy.y > GAME_HEIGHT + enemy.h + 8) {
      enemies.splice(i, 1);
      score += 10;
      playPassSfx();
    }
  }

  distance += player.speed;
  score += player.speed * 0.04;
  scoreLabel.textContent = Math.floor(score).toString();
  speedLabel.textContent = Math.round(player.speed * 10).toString();

  for (const enemy of enemies) {
    if (rectsOverlap(player, enemy)) {
      gameOver = true;
      gameStarted = false;
      playCrashSfx();
      stopMusic();
      const finalScore = Math.floor(score);
      if (finalScore > bestScore) {
        bestScore = finalScore;
        localStorage.setItem("retro-road-rush-best", String(bestScore));
      }
      bestLabel.textContent = bestScore.toString();
      break;
    }
  }

  updateEngineAudio();
}

function drawBackground() {
  ctx.fillStyle = "#06040f";
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  for (const star of stars) {
    const alpha = 0.45 + Math.sin(star.twinkle) * 0.2;
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }
}

function drawRoad() {
  const shoulderWidth = 14;
  ctx.fillStyle = "#2a2a48";
  ctx.fillRect(ROAD_LEFT - shoulderWidth, 0, ROAD_WIDTH + shoulderWidth * 2, GAME_HEIGHT);

  ctx.fillStyle = "#11131f";
  ctx.fillRect(ROAD_LEFT, 0, ROAD_WIDTH, GAME_HEIGHT);

  const laneMarkWidth = 4;
  ctx.fillStyle = "#f4f4f4";
  for (let lane = 1; lane < LANE_COUNT; lane += 1) {
    const x = ROAD_LEFT + lane * LANE_WIDTH - laneMarkWidth / 2;
    for (let y = -ROAD_SEGMENT_LENGTH; y < GAME_HEIGHT + ROAD_SEGMENT_LENGTH; y += ROAD_SEGMENT_LENGTH) {
      ctx.fillRect(x, y + roadOffset, laneMarkWidth, 22);
    }
  }

  ctx.fillStyle = "#ff5c8a";
  ctx.fillRect(ROAD_LEFT - shoulderWidth, 0, 5, GAME_HEIGHT);
  ctx.fillRect(ROAD_RIGHT + shoulderWidth - 5, 0, 5, GAME_HEIGHT);
}

function drawCar(entity, color, isPlayer = false) {
  ctx.fillStyle = color;
  ctx.fillRect(entity.x, entity.y, entity.w, entity.h);

  ctx.fillStyle = "#0f0f1f";
  ctx.fillRect(entity.x + 4, entity.y + 8, entity.w - 8, entity.h - 16);

  ctx.fillStyle = isPlayer ? "#49f5ff" : "#ffffff";
  ctx.fillRect(entity.x + 6, entity.y + 12, entity.w - 12, 12);

  ctx.fillStyle = "#ffef66";
  ctx.fillRect(entity.x + 3, entity.y + entity.h - 8, 6, 4);
  ctx.fillRect(entity.x + entity.w - 9, entity.y + entity.h - 8, 6, 4);

  ctx.fillStyle = "#ff3f67";
  ctx.fillRect(entity.x + 3, entity.y + 4, 6, 4);
  ctx.fillRect(entity.x + entity.w - 9, entity.y + 4, 6, 4);
}

function drawOverlay() {
  if (!gameStarted && !gameOver) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    ctx.textAlign = "center";
    ctx.fillStyle = "#49f5ff";
    ctx.font = "bold 28px 'Press Start 2P', monospace";
    ctx.fillText("GET READY!", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 16);

    ctx.fillStyle = "#ffffff";
    ctx.font = "12px 'Press Start 2P', monospace";
    ctx.fillText("PRESS SPACE TO RACE", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 26);
  }

  if (gameOver) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ff4b7d";
    ctx.font = "bold 30px 'Press Start 2P', monospace";
    ctx.fillText("CRASHED!", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20);

    ctx.fillStyle = "#ffffff";
    ctx.font = "12px 'Press Start 2P', monospace";
    ctx.fillText(`SCORE ${Math.floor(score)}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 12);
    ctx.fillText("PRESS ENTER TO RETRY", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 44);
  }
}

function draw() {
  drawBackground();
  drawRoad();

  enemies.forEach((enemy) => {
    drawCar(enemy, enemy.color, false);
  });
  drawCar(player, "#27d5ff", true);
  drawOverlay();
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (key === "arrowleft" || key === "a") keys.left = true;
  if (key === "arrowright" || key === "d") keys.right = true;
  if (key === "arrowup" || key === "w") keys.up = true;
  if (key === "arrowdown" || key === "s") keys.down = true;

  if (key === "m" && !event.repeat) {
    toggleSound();
  }

  if (key === " " || key === "enter") {
    if (!gameStarted) {
      startGame();
    }
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (key === "arrowleft" || key === "a") keys.left = false;
  if (key === "arrowright" || key === "d") keys.right = false;
  if (key === "arrowup" || key === "w") keys.up = false;
  if (key === "arrowdown" || key === "s") keys.down = false;
});

soundToggleButton.addEventListener("click", () => {
  toggleSound();
});

initStars();
resetGame();
updateSoundUi();
draw();
loop();
