// Canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Canvas center for convenience
const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;

// Game state variables
let score = 0;
let lives = 3;
let comboCount = 1;
let lastKillTime = 0;
let gameOver = false;

// Player (camera) orientation
let camYaw = 0;    // rotation around Y axis (left/right turn)
let camPitch = 0;  // rotation around X axis (up/down tilt)

// Controls state
const keys = {
  left: false,
  right: false,
  up: false,
  down: false,
  shoot: false
};

// Timing and spawning
let lastSpawnTime = 0;
let lastShotTime = 0;
const spawnBaseInterval = 2000;    // base interval between spawns (ms)
const spawnMinInterval = 800;      // minimum interval (ms) at high difficulty
const shotInterval = 200;          // 200ms between shots for auto-fire
const bulletLifeTime = 3;          // bullets live for 3 seconds

// Difficulty progression
const startTime = performance.now();

// Game objects
let enemies = [];
let bullets = [];

// Enemy model definition (wireframe lines connecting points)
const enemyModelLines = [
  // Fuselage (nose to tail)
  { from: { x: 0, y: 0, z: -10 }, to: { x: 0, y: 0, z: 10 } },
  // Main wing (left to right)
  { from: { x: -8, y: 0, z: 0 }, to: { x: 8, y: 0, z: 0 } },
  // Tail wing (left to right, near tail)
  { from: { x: -4, y: 0, z: 8 }, to: { x: 4, y: 0, z: 8 } },
  // Vertical tail fin (upwards from tail)
  { from: { x: 0, y: 0, z: 10 }, to: { x: 0, y: 3, z: 10 } }
];

// Setup audio context for sound effects
let audioCtx;
function playSound(freq = 440, duration = 0.1, type = 'square') {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start();
  // Gradually decrease volume to avoid clicks
  gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.stop(audioCtx.currentTime + duration);
}

// Initialize AudioContext on first user interaction (to comply with browser policies)
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Try to play background music if provided
    const bgm = document.getElementById('bgm');
    if (bgm) {
      bgm.volume = 0.5;
      bgm.play().catch(err => {
        console.warn('BGM playback failed or no file provided.');
      });
    }
  }
}

// Handle keyboard input
window.addEventListener('keydown', (e) => {
  // Prevent arrow keys and space from scrolling the page
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
    e.preventDefault();
  }
  if (gameOver) {
    // Allow restart with 'R' if game over
    if (e.code === 'KeyR') restartGame();
    return;
  }
  switch (e.code) {
    case 'ArrowLeft':
    case 'KeyA':
      keys.left = true;
      break;
    case 'ArrowRight':
    case 'KeyD':
      keys.right = true;
      break;
    case 'ArrowUp':
    case 'KeyW':
      keys.up = true;
      break;
    case 'ArrowDown':
    case 'KeyS':
      keys.down = true;
      break;
    case 'Space':
      // Initialize audio (for first user action)
      initAudio();
      keys.shoot = true;
      // Fire immediately if enough time passed since last shot
      const now = performance.now();
      if (now - lastShotTime > shotInterval) {
        fireBullet();
        lastShotTime = now;
      }
      break;
  }
});

window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'ArrowLeft':
    case 'KeyA':
      keys.left = false;
      break;
    case 'ArrowRight':
    case 'KeyD':
      keys.right = false;
      break;
    case 'ArrowUp':
    case 'KeyW':
      keys.up = false;
      break;
    case 'ArrowDown':
    case 'KeyS':
      keys.down = false;
      break;
    case 'Space':
      keys.shoot = false;
      break;
  }
});

// Function to fire a bullet from the player's plane
function fireBullet() {
  // Bullet starts at camera (origin) with direction based on current camera orientation
  const bulletSpeed = 500; // units per second
  // Compute direction vector from camera yaw and pitch
  const dir = {
    x: Math.sin(camYaw) * Math.cos(camPitch),
    y: Math.sin(camPitch),
    z: Math.cos(camYaw) * Math.cos(camPitch)
  };
  // Bullet velocity in world coordinates
  const vx = dir.x * bulletSpeed;
  const vy = dir.y * bulletSpeed;
  const vz = dir.z * bulletSpeed;
  bullets.push({
    x: 0, y: 0, z: 0,     // starts at camera position
    vx: vx, vy: vy, vz: vz,
    time: 0               // time alive
  });
  // Play shooting sound (a short high-pitched beep)
  playSound(880, 0.05, 'square');
}

// Spawn a single enemy or a formation of enemies
function spawnEnemyWave() {
  // Determine difficulty scaling based on time elapsed
  const elapsed = performance.now() - startTime;
  const difficultyLevel = Math.floor(elapsed / 30000); // increase every 30 seconds
  const enemySpeed = 100 * (1 + 0.2 * difficultyLevel); // increase speed by 20% each level

  if (Math.random() < 0.3) {
    // Spawn a formation of 3 enemies (e.g., a line or slight V formation)
    const baseX = (Math.random() * 600) - 300;   // horizontal spawn range [-300, 300]
    const baseY = (Math.random() * 300) - 150;   // vertical spawn range [-150, 150]
    const baseZ = 1000 + Math.random() * 200;    // distance 1000-1200
    // Leader
    const leader = createEnemy(baseX, baseY, baseZ, enemySpeed);
    // Wingmen positions relative to leader
    const wing1 = createEnemy(baseX - 60, baseY + 10, baseZ + 20, enemySpeed);
    const wing2 = createEnemy(baseX + 60, baseY - 10, baseZ + 20, enemySpeed);
    enemies.push(leader, wing1, wing2);
  } else {
    // Spawn a single enemy at random position
    const sx = (Math.random() * 600) - 300;
    const sy = (Math.random() * 300) - 150;
    const sz = 1000 + Math.random() * 200;
    const enemy = createEnemy(sx, sy, sz, enemySpeed);
    enemies.push(enemy);
  }
}

// Helper to create an enemy object with given position and speed toward origin
function createEnemy(sx, sy, sz, speed) {
  // Direction vector from spawn to origin (camera position 0,0,0)
  const dx = -sx;
  const dy = -sy;
  const dz = -sz;
  // Normalize the direction
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const vx = (dx / dist) * speed;
  const vy = (dy / dist) * speed;
  const vz = (dz / dist) * speed;
  // Optional evasion: small perpendicular velocity components that flip periodically
  let evasionAxis = Math.random() < 0.5 ? 'x' : 'y';
  let evasionSpeedX = 0, evasionSpeedY = 0;
  if (evasionAxis === 'x') {
    evasionSpeedX = (Math.random() < 0.5 ? 1 : -1) * 20; // 20 units/s sideways
  } else {
    evasionSpeedY = (Math.random() < 0.5 ? 1 : -1) * 20; // 20 units/s up/down
  }
  const evasionInterval = 1000 + Math.random() * 1000; // flip every 1-2 seconds
  return {
    x: sx, y: sy, z: sz,
    vx: vx, vy: vy, vz: vz,
    evasionAxis: evasionAxis,
    evasionVX: evasionSpeedX,
    evasionVY: evasionSpeedY,
    evasionTimer: evasionInterval,
    yaw: 0,
    pitch: 0,
    hitRadius: 15 // collision radius
  };
}

// Update enemy positions and behaviors
function updateEnemies(dt) {
  enemies.forEach(enemy => {
    // Basic movement
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    enemy.z += enemy.vz * dt;
    // Evasion maneuver: zigzag by flipping direction periodically
    if (enemy.evasionAxis) {
      enemy.evasionTimer -= dt * 1000;
      if (enemy.evasionTimer <= 0) {
        // Flip evasion direction
        if (enemy.evasionAxis === 'x') {
          enemy.evasionVX = -enemy.evasionVX;
        } else {
          enemy.evasionVY = -enemy.evasionVY;
        }
        // Reset timer for next flip
        enemy.evasionTimer = 1000 + Math.random() * 1000;
      }
      // Apply evasion velocity
      enemy.x += enemy.evasionVX * dt;
      enemy.y += enemy.evasionVY * dt;
    }
    // Update orientation (yaw and pitch) based on velocity direction
    const vx = enemy.vx + enemy.evasionVX;
    const vy = enemy.vy + enemy.evasionVY;
    const vz = enemy.vz;
    // Calculate yaw (horizontal angle) and pitch (vertical angle)
    enemy.yaw = Math.atan2(vx, -vz);           // angle around Y axis
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (speed > 0) {
      enemy.pitch = Math.asin(vy / speed);     // angle around X axis
    } else {
      enemy.pitch = 0;
    }
  });
  // Remove enemies that passed behind the player (escaped) and decrement lives
  for (let i = 0; i < enemies.length; i++) {
    if (enemies[i].z <= 0) {  // passed the camera
      enemies.splice(i, 1);
      i--;
      lives--;
      if (lives <= 0) {
        lives = 0;
        // Trigger game over (will be handled in main loop)
        gameOver = true;
      }
    }
  }
}

// Update bullets positions and check for collisions
function updateBullets(dt) {
  bullets.forEach(bullet => {
    // Move bullet
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.z += bullet.vz * dt;
    bullet.time += dt;
  });
  // Collision detection (bullet vs enemy)
  bullets.forEach(bullet => {
    if (bullet._dead) return;
    for (let enemy of enemies) {
      if (enemy._dead) continue;
      // Compute squared distance between bullet and enemy
      const dx = enemy.x - bullet.x;
      const dy = enemy.y - bullet.y;
      const dz = enemy.z - bullet.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < enemy.hitRadius * enemy.hitRadius) {
        // Collision: enemy is hit
        enemy._dead = true;
        bullet._dead = true;
        // Update score with combo system
        const now = performance.now();
        if (now - lastKillTime < 2000) {
          // Within 2 seconds of last kill -> combo
          comboCount++;
        } else {
          comboCount = 1;
        }
        lastKillTime = now;
        // Base score per enemy (100) times combo multiplier
        const points = 100 * comboCount;
        score += points;
        // Play explosion sound (lower frequency boom)
        playSound(200, 0.1, 'sawtooth');
        break; // one bullet hits only one enemy (exit loop)
      }
    }
  });
  // Remove bullets that are dead or expired
  bullets = bullets.filter(b => {
    return !b._dead && b.time < bulletLifeTime;
  });
  // Remove enemies that were hit
  enemies = enemies.filter(e => !e._dead);
}

// Draw all game objects (enemies, bullets, crosshair, etc.)
function drawScene() {
  // Clear canvas
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = "#FFF";
  ctx.lineWidth = 1;

  // Start drawing path for all enemy lines
  ctx.beginPath();
  for (let enemy of enemies) {
    // Transform each model line from enemy's local space to camera view
    for (let line of enemyModelLines) {
      // Local coordinates of line endpoints
      const { from, to } = line;
      // Apply enemy orientation (yaw then pitch) and translation to each endpoint
      const p1 = applyEnemyTransform(from, enemy);
      const p2 = applyEnemyTransform(to, enemy);
      // Apply camera transformation to points (camera yaw and pitch)
      const cp1 = applyCameraTransform(p1);
      const cp2 = applyCameraTransform(p2);
      // Only draw if both points are in front of camera (z > 0)
      if (cp1.z > 0 && cp2.z > 0) {
        // Project points to 2D canvas
        const x1 = CENTER_X + (cp1.x * 500 / cp1.z);
        const y1 = CENTER_Y - (cp1.y * 500 / cp1.z);
        const x2 = CENTER_X + (cp2.x * 500 / cp2.z);
        const y2 = CENTER_Y - (cp2.y * 500 / cp2.z);
        // Draw the line segment
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
    }
  }
  // Stroke all enemy lines at once
  ctx.stroke();

  // Draw bullets as small squares
  ctx.fillStyle = "#FFF";
  for (let bullet of bullets) {
    const cp = applyCameraTransform(bullet);
    if (cp.z > 0) {
      const bx = CENTER_X + (cp.x * 500 / cp.z);
      const by = CENTER_Y - (cp.y * 500 / cp.z);
      // Draw a 2x2 pixel dot for the bullet
      ctx.fillRect(bx - 1, by - 1, 2, 2);
    }
  }

  // Draw a simple crosshair at the center of the screen
  ctx.strokeStyle = "#0F0";
  ctx.beginPath();
  ctx.moveTo(CENTER_X - 10, CENTER_Y);
  ctx.lineTo(CENTER_X + 10, CENTER_Y);
  ctx.moveTo(CENTER_X, CENTER_Y - 10);
  ctx.lineTo(CENTER_X, CENTER_Y + 10);
  ctx.stroke();

  // If game over, overlay "Game Over" text
  if (gameOver) {
    ctx.fillStyle = "#FFF";
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", CENTER_X, CENTER_Y - 20);
    ctx.font = "20px sans-serif";
    ctx.fillText(`Final Score: ${score}`, CENTER_X, CENTER_Y + 10);
    ctx.fillText("Press R to Restart", CENTER_X, CENTER_Y + 40);
  }
}

// Apply enemy's orientation and position to a model point
function applyEnemyTransform(point, enemy) {
  const cosYaw = Math.cos(enemy.yaw);
  const sinYaw = Math.sin(enemy.yaw);
  const cosPitch = Math.cos(enemy.pitch);
  const sinPitch = Math.sin(enemy.pitch);
  // Yaw rotation (around Y axis)
  let x = cosYaw * point.x - sinYaw * point.z;
  let z = sinYaw * point.x + cosYaw * point.z;
  let y = point.y;
  // Pitch rotation (around X axis)
  let y2 = cosPitch * y - sinPitch * z;
  let z2 = sinPitch * y + cosPitch * z;
  let x2 = x;
  // Translate to world position
  return {
    x: enemy.x + x2,
    y: enemy.y + y2,
    z: enemy.z + z2
  };
}

// Apply camera's orientation (yaw and pitch) to a world coordinate point
function applyCameraTransform(point) {
  const cosYaw = Math.cos(camYaw);
  const sinYaw = Math.sin(camYaw);
  const cosPitch = Math.cos(camPitch);
  const sinPitch = Math.sin(camPitch);
  // Translate point relative to camera (camera at origin)
  // (If camera could move, we'd subtract camera position here, but camera stays at (0,0,0).)
  let px = point.x;
  let py = point.y;
  let pz = point.z;
  // Apply inverse camera yaw (rotate world in opposite direction)
  let x = cosYaw * px + sinYaw * pz;
  let z = -sinYaw * px + cosYaw * pz;
  let y = py;
  // Apply inverse camera pitch
  let y2 = cosPitch * y + sinPitch * z;
  let z2 = -sinPitch * y + cosPitch * z;
  let x2 = x;
  return { x: x2, y: y2, z: z2 };
}

// Update scoreboard HUD
function updateHUD() {
  const scoreboard = document.getElementById('scoreboard');
  scoreboard.textContent = `Score: ${score}   Lives: ${lives}`;
}

// Main game loop using requestAnimationFrame
let prevTime;
function gameLoop(timestamp) {
  if (!prevTime) prevTime = timestamp;
  const dt = (timestamp - prevTime) / 1000; // delta time in seconds
  prevTime = timestamp;

  // Update player orientation based on input
  const turnSpeed = 2.0; // radians per second
  if (keys.left) camYaw -= turnSpeed * dt;
  if (keys.right) camYaw += turnSpeed * dt;
  if (keys.up) camPitch += turnSpeed * dt;
  if (keys.down) camPitch -= turnSpeed * dt;
  // Constrain pitch to avoid flipping (e.g., +-85 degrees)
  if (camPitch > 1.4) camPitch = 1.4;
  if (camPitch < -1.4) camPitch = -1.4;

  // Shooting (for auto-fire if holding Space)
  if (keys.shoot) {
    const now = performance.now();
    if (now - lastShotTime > shotInterval) {
      fireBullet();
      lastShotTime = now;
    }
  }

  // Spawn enemies at intervals (increasing frequency with difficulty)
  const currentInterval = Math.max(spawnBaseInterval - (performance.now() - startTime) * 0.02, spawnMinInterval);
  if (performance.now() - lastSpawnTime > currentInterval) {
    spawnEnemyWave();
    lastSpawnTime = performance.now();
  }

  // Update game objects
  updateEnemies(dt);
  updateBullets(dt);

  // Update HUD
  updateHUD();

  // Draw everything
  drawScene();

  // Continue the loop or end if game over
  if (!gameOver) {
    requestAnimationFrame(gameLoop);
  }
}

// Restart the game after game over
function restartGame() {
  // Reset state
  score = 0;
  lives = 3;
  comboCount = 1;
  lastKillTime = 0;
  gameOver = false;
  camYaw = 0;
  camPitch = 0;
  enemies = [];
  bullets = [];
  lastSpawnTime = performance.now();
  lastShotTime = 0;
  prevTime = undefined;
  // Clear any existing game over text by forcing a redraw of scene
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // Restart loop
  requestAnimationFrame(gameLoop);
}

// Start the game loop immediately
requestAnimationFrame(gameLoop);
