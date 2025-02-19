//=======================//
//   基本的な設定類       //
//=======================//

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Canvasサイズ
const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;

// スコア関連
let score = 0;
let lives = 3;
let comboCount = 1;
let lastKillTime = 0;
let gameOver = false;

// プレイヤー(カメラ)の向き
let camYaw = 0;    // Y軸回り（左右）
let camPitch = 0;  // X軸回り（上下）

// キー入力状態
const keys = {
  left: false,
  right: false,
  up: false,
  down: false,
  shoot: false
};

// 敵・弾の管理用
let enemies = [];
let bullets = [];
let explosions = []; // 爆発パーティクル

// 時間管理
let lastSpawnTime = 0;
let lastShotTime = 0;
let prevTime;
const startTime = performance.now();

// 敵出現の間隔（難易度に応じて短くする）
const spawnBaseInterval = 2000; // ms
const spawnMinInterval = 800;   // ms

// 弾の発射関連
const shotInterval = 200;       // オート連射は200ms間隔
const bulletLifeTime = 3;       // 弾の寿命(秒)

// オーディオ
let audioCtx = null;

//=======================//
//  ワイヤーフレームモデル  //
//=======================//

// 敵機のワイヤーフレーム構造: 点と点を結ぶ線分の定義
const enemyModelLines = [
  // 胴体(前後)
  { from: { x: 0, y: 0, z: -10 }, to: { x: 0, y: 0, z: 10 } },
  // 主翼(左右)
  { from: { x: -8, y: 0, z: 0 }, to: { x: 8, y: 0, z: 0 } },
  // 尾翼(左右)
  { from: { x: -4, y: 0, z: 8 }, to: { x: 4, y: 0, z: 8 } },
  // 垂直尾翼(上方向)
  { from: { x: 0, y: 0, z: 10 }, to: { x: 0, y: 3, z: 10 } }
];

//=======================//
//    環境(背景)の準備     //
//=======================//

// 星(背景)をランダム配置
const NUM_STARS = 200;
let stars = [];
function initStars() {
  // ある程度の範囲内にランダム配置 (zは遠方)
  for (let i = 0; i < NUM_STARS; i++) {
    stars.push({
      x: (Math.random() - 0.5) * 2000, // -1000 ~ 1000
      y: (Math.random() - 0.5) * 2000, // -1000 ~ 1000
      z: 500 + Math.random() * 2500    //  500 ~ 3000
    });
  }
}

// 地面(床)のワイヤーフレーム用の簡易グリッドを作成
// x,z軸方向に一定間隔でラインを引く
let groundGrid = [];
function initGroundGrid() {
  const size = 2000;
  const step = 200;
  // z方向ライン
  for (let x = -size; x <= size; x += step) {
    groundGrid.push({
      from: { x, y: -10, z: 100 },
      to: { x, y: -10, z: 2000 }
    });
  }
  // x方向ライン
  for (let z = 100; z <= 2000; z += step) {
    groundGrid.push({
      from: { x: -size, y: -10, z },
      to: { x: size, y: -10, z }
    });
  }
}

initStars();
initGroundGrid();

//=======================//
//      音関連の関数      //
//=======================//

function playSound(freq = 440, duration = 0.1, type = 'square') {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start();

  gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.stop(audioCtx.currentTime + duration);
}

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // BGMを自動再生したい場合
    const bgm = document.getElementById('bgm');
    if (bgm) {
      bgm.volume = 0.5;
      bgm.play().catch(err => {
        console.warn('BGM再生失敗または未指定です:', err);
      });
    }
  }
}

//=======================//
//   キー入力イベント     //
//=======================//

window.addEventListener('keydown', (e) => {
  // 矢印キーやスペースがスクロールを起こさないように
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
    e.preventDefault();
  }

  if (gameOver) {
    // ゲームオーバー時にRキーでリスタート
    if (e.code === 'KeyR') {
      restartGame();
    }
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
      initAudio(); // 初回のスペース押下でAudioContext初期化
      keys.shoot = true;
      // 連射タイミングならすぐ発射
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

//=======================//
//  カメラ空間→ワールド空間 //
//=======================//

/**
 * カメラ空間上の座標(cx,cy,cz)を、カメラのyaw/pitchに基づき
 * ワールド空間へ変換して返す。
 * （カメラはワールド原点(0,0,0)にあり、camYaw, camPitchのみを適用）
 */
function cameraSpaceToWorldSpace(cx, cy, cz) {
  const cosP = Math.cos(camPitch);
  const sinP = Math.sin(camPitch);
  const cosY = Math.cos(camYaw);
  const sinY = Math.sin(camYaw);

  // 1) ピッチ回転(カメラのX軸中心に回転)を適用
  //    ただし "逆" でなく "順" の変換(カメラ視点→ワールド)なので +pitch
  let x1 = cx;
  let y1 = cosP * cy - sinP * cz;
  let z1 = sinP * cy + cosP * cz;

  // 2) ヨー回転(カメラのY軸中心に回転)を適用
  //    同様に +yaw
  let x2 = cosY * x1 - sinY * z1;
  let y2 = y1;
  let z2 = sinY * x1 + cosY * z1;

  return { x: x2, y: y2, z: z2 };
}

//=======================//
//     弾の発射処理       //
//=======================//

function fireBullet() {
  // カメラ空間で "前方" とみなす座標: (0,0,1)
  // 少し前に置きたいので、発射位置は z=muzzleOffset 付近にする
  const muzzleOffset = 5;
  const spawnCS = { x: 0, y: 0, z: muzzleOffset }; // カメラ空間でちょい前
  const forwardCS = { x: 0, y: 0, z: 1 };          // カメラ空間で前を向くベクトル

  // カメラ空間→ワールド空間に変換
  const spawnWS = cameraSpaceToWorldSpace(spawnCS.x, spawnCS.y, spawnCS.z);
  const forwardWS = cameraSpaceToWorldSpace(forwardCS.x, forwardCS.y, forwardCS.z);

  // 弾速
  const bulletSpeed = 500;

  // (0,0,0)はカメラ位置。spawnWS はワールド空間での初期座標
  // forwardWS はワールド空間での向きベクトル
  bullets.push({
    x: spawnWS.x,
    y: spawnWS.y,
    z: spawnWS.z,
    vx: forwardWS.x * bulletSpeed,
    vy: forwardWS.y * bulletSpeed,
    vz: forwardWS.z * bulletSpeed,
    time: 0
  });

  // 発射音
  playSound(880, 0.05, 'square');
}

//=======================//
//    敵の生成関連処理     //
//=======================//

function spawnEnemyWave() {
  // 経過時間から難易度レベルを計算
  const elapsed = performance.now() - startTime;
  const difficultyLevel = Math.floor(elapsed / 30000); // 30秒ごとにレベルアップ
  const enemySpeed = 100 * (1 + 0.2 * difficultyLevel); // レベルごとに20%アップ

  // 3割くらいの確率でフォーメーション(3機)
  if (Math.random() < 0.3) {
    const baseX = (Math.random() * 600) - 300; // -300 ~ 300
    const baseY = (Math.random() * 300) - 150; // -150 ~ 150
    const baseZ = 1000 + Math.random() * 200;  // 1000~1200
    const leader = createEnemy(baseX, baseY, baseZ, enemySpeed);
    const wing1 = createEnemy(baseX - 60, baseY + 10, baseZ + 20, enemySpeed);
    const wing2 = createEnemy(baseX + 60, baseY - 10, baseZ + 20, enemySpeed);
    enemies.push(leader, wing1, wing2);
  } else {
    // 単体スポーン
    const sx = (Math.random() * 600) - 300;
    const sy = (Math.random() * 300) - 150;
    const sz = 1000 + Math.random() * 200;
    enemies.push(createEnemy(sx, sy, sz, enemySpeed));
  }
}

function createEnemy(sx, sy, sz, speed) {
  // 原点(0,0,0)へ向かう向き
  const dx = -sx;
  const dy = -sy;
  const dz = -sz;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const vx = (dx / dist) * speed;
  const vy = (dy / dist) * speed;
  const vz = (dz / dist) * speed;

  // ジグザグ回避行動 (ランダム軸 + スピード)
  let evasionAxis = Math.random() < 0.5 ? 'x' : 'y';
  let evasionSpeedX = 0;
  let evasionSpeedY = 0;
  if (evasionAxis === 'x') {
    evasionSpeedX = (Math.random() < 0.5 ? 1 : -1) * 20;
  } else {
    evasionSpeedY = (Math.random() < 0.5 ? 1 : -1) * 20;
  }
  const evasionInterval = 1000 + Math.random() * 1000; // 1~2秒ごと反転

  return {
    x: sx, y: sy, z: sz,
    vx, vy, vz,
    evasionAxis,
    evasionVX: evasionSpeedX,
    evasionVY: evasionSpeedY,
    evasionTimer: evasionInterval,
    yaw: 0,
    pitch: 0,
    hitRadius: 15
  };
}

//=======================//
//   爆発パーティクル生成   //
//=======================//

function createExplosion(x, y, z) {
  // 破片の個数
  const numParticles = 10;
  for (let i = 0; i < numParticles; i++) {
    // ランダム方向に飛ばす
    const speed = 100 + Math.random() * 100;
    const theta = Math.random() * 2 * Math.PI;
    const phi = (Math.random() - 0.5) * Math.PI; // -π/2 ~ π/2
    const vx = speed * Math.cos(phi) * Math.cos(theta);
    const vy = speed * Math.sin(phi);
    const vz = speed * Math.cos(phi) * Math.sin(theta);

    explosions.push({
      x, y, z,
      vx, vy, vz,
      life: 0,
      maxLife: 1 + Math.random() * 0.5
    });
  }
}

//=======================//
//  各オブジェクトの更新   //
//=======================//

function updateEnemies(dt) {
  enemies.forEach(enemy => {
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    enemy.z += enemy.vz * dt;

    // 回避行動(ジグザグ)
    enemy.evasionTimer -= dt * 1000;
    if (enemy.evasionTimer <= 0) {
      if (enemy.evasionAxis === 'x') {
        enemy.evasionVX = -enemy.evasionVX;
      } else {
        enemy.evasionVY = -enemy.evasionVY;
      }
      enemy.evasionTimer = 1000 + Math.random() * 1000;
    }
    enemy.x += enemy.evasionVX * dt;
    enemy.y += enemy.evasionVY * dt;

    // 見た目用：進行方向から機体のyaw/pitchを計算
    const vxTotal = enemy.vx + enemy.evasionVX;
    const vyTotal = enemy.vy + enemy.evasionVY;
    const vzTotal = enemy.vz;
    enemy.yaw = Math.atan2(vxTotal, -vzTotal);
    const speed = Math.sqrt(vxTotal * vxTotal + vyTotal * vyTotal + vzTotal * vzTotal);
    enemy.pitch = (speed > 0) ? Math.asin(vyTotal / speed) : 0;
  });

  // カメラ(Z=0)を通り過ぎたら(= z <= 0)消去 & ライフ減少
  for (let i = 0; i < enemies.length; i++) {
    if (enemies[i].z <= 0) {
      enemies.splice(i, 1);
      i--;
      lives--;
      if (lives <= 0) {
        lives = 0;
        gameOver = true;
      }
    }
  }
}

function updateBullets(dt) {
  bullets.forEach(b => {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.time += dt;
  });

  // 当たり判定(弾 vs 敵)
  bullets.forEach(bullet => {
    if (bullet._dead) return;
    for (let enemy of enemies) {
      if (enemy._dead) continue;
      const dx = enemy.x - bullet.x;
      const dy = enemy.y - bullet.y;
      const dz = enemy.z - bullet.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < enemy.hitRadius * enemy.hitRadius) {
        // ヒット
        enemy._dead = true;
        bullet._dead = true;

        // スコア & コンボ
        const now = performance.now();
        if (now - lastKillTime < 2000) {
          comboCount++;
        } else {
          comboCount = 1;
        }
        lastKillTime = now;
        score += 100 * comboCount;

        // 爆発パーティクル
        createExplosion(enemy.x, enemy.y, enemy.z);

        // 爆発音
        playSound(200, 0.1, 'sawtooth');
        break;
      }
    }
  });

  // 寿命切れまたはヒットした弾を除去
  bullets = bullets.filter(b => !b._dead && b.time < bulletLifeTime);
  // ヒットした敵も除去
  enemies = enemies.filter(e => !e._dead);
}

function updateExplosions(dt) {
  explosions.forEach(ex => {
    ex.x += ex.vx * dt;
    ex.y += ex.vy * dt;
    ex.z += ex.vz * dt;
    ex.life += dt;
  });
  // 寿命超過パーティクルを除去
  explosions = explosions.filter(ex => ex.life < ex.maxLife);
}

//=======================//
//     カメラ変換関数     //
//=======================//

// 敵機ワイヤーフレーム(ローカル座標) -> ワールド座標 -> カメラ座標
function applyEnemyTransform(point, enemy) {
  const cosYaw = Math.cos(enemy.yaw);
  const sinYaw = Math.sin(enemy.yaw);
  const cosPitch = Math.cos(enemy.pitch);
  const sinPitch = Math.sin(enemy.pitch);

  // 機体Yaw回転
  let x = cosYaw * point.x - sinYaw * point.z;
  let z = sinYaw * point.x + cosYaw * point.z;
  let y = point.y;

  // 機体Pitch回転
  let y2 = cosPitch * y - sinPitch * z;
  let z2 = sinPitch * y + cosPitch * z;
  let x2 = x;

  // ワールド位置に平行移動
  return {
    x: enemy.x + x2,
    y: enemy.y + y2,
    z: enemy.z + z2
  };
}

// ワールド座標 -> カメラ座標
function applyCameraTransform(pt) {
  const cosYaw = Math.cos(camYaw);
  const sinYaw = Math.sin(camYaw);
  const cosPitch = Math.cos(camPitch);
  const sinPitch = Math.sin(camPitch);

  // カメラは(0,0,0)なので、まず平行移動は不要(=そのまま)
  let px = pt.x;
  let py = pt.y;
  let pz = pt.z;

  // カメラYawの "逆" 回転
  let x = cosYaw * px + sinYaw * pz;
  let z = -sinYaw * px + cosYaw * pz;
  let y = py;

  // カメラPitchの "逆" 回転
  let y2 = cosPitch * y + sinPitch * z;
  let z2 = -sinPitch * y + cosPitch * z;
  let x2 = x;

  return { x: x2, y: y2, z: z2 };
}

//=======================//
//     描画関連処理       //
//=======================//

function drawScene() {
  // 背景クリア(黒)
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 1) 星を描画(単純なドット)
  ctx.fillStyle = "#AAA";
  for (let s of stars) {
    const cpt = applyCameraTransform(s);
    if (cpt.z > 0) {
      const sx = CENTER_X + (cpt.x * 500 / cpt.z);
      const sy = CENTER_Y - (cpt.y * 500 / cpt.z);
      ctx.fillRect(sx, sy, 1, 1);
    }
  }

  // 2) 地面のグリッドを描画(ワイヤーフレーム)
  ctx.strokeStyle = "#060";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let line of groundGrid) {
    const p1 = applyCameraTransform(line.from);
    const p2 = applyCameraTransform(line.to);
    if (p1.z > 0 && p2.z > 0) {
      const x1 = CENTER_X + (p1.x * 500 / p1.z);
      const y1 = CENTER_Y - (p1.y * 500 / p1.z);
      const x2 = CENTER_X + (p2.x * 500 / p2.z);
      const y2 = CENTER_Y - (p2.y * 500 / p2.z);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
  }
  ctx.stroke();

  // 3) 敵機ワイヤーフレームを描画
  ctx.strokeStyle = "#FFF";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let enemy of enemies) {
    for (let line of enemyModelLines) {
      const { from, to } = line;
      const p1 = applyEnemyTransform(from, enemy);
      const p2 = applyEnemyTransform(to, enemy);
      const cp1 = applyCameraTransform(p1);
      const cp2 = applyCameraTransform(p2);

      if (cp1.z > 0 && cp2.z > 0) {
        const x1 = CENTER_X + (cp1.x * 500 / cp1.z);
        const y1 = CENTER_Y - (cp1.y * 500 / cp1.z);
        const x2 = CENTER_X + (cp2.x * 500 / cp2.z);
        const y2 = CENTER_Y - (cp2.y * 500 / cp2.z);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
    }
  }
  ctx.stroke();

  // 4) 弾を描画(小さな四角)
  ctx.fillStyle = "#FFF";
  for (let b of bullets) {
    const cp = applyCameraTransform(b);
    if (cp.z > 0) {
      const bx = CENTER_X + (cp.x * 500 / cp.z);
      const by = CENTER_Y - (cp.y * 500 / cp.z);
      ctx.fillRect(bx - 1, by - 1, 2, 2);
    }
  }

  // 5) 爆発パーティクルを描画(小さな点)
  ctx.fillStyle = "#F80";
  for (let ex of explosions) {
    const cp = applyCameraTransform(ex);
    if (cp.z > 0) {
      const px = CENTER_X + (cp.x * 500 / cp.z);
      const py = CENTER_Y - (cp.y * 500 / cp.z);
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
  }

  // 6) クロスヘア(照準)を画面中央に
  ctx.strokeStyle = "#0F0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CENTER_X - 10, CENTER_Y);
  ctx.lineTo(CENTER_X + 10, CENTER_Y);
  ctx.moveTo(CENTER_X, CENTER_Y - 10);
  ctx.lineTo(CENTER_X, CENTER_Y + 10);
  ctx.stroke();

  // 7) ゲームオーバー時の表示
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

//=======================//
//       UI更新           //
//=======================//

function updateHUD() {
  const scoreboard = document.getElementById('scoreboard');
  scoreboard.textContent = `Score: ${score}   Lives: ${lives}`;
}

//=======================//
//    メインループ        //
//=======================//

function gameLoop(timestamp) {
  if (!prevTime) prevTime = timestamp;
  const dt = (timestamp - prevTime) / 1000;
  prevTime = timestamp;

  // カメラ操作(回転)
  const turnSpeed = 2.0; // 秒あたり2ラジアン
  if (keys.left) camYaw -= turnSpeed * dt;
  if (keys.right) camYaw += turnSpeed * dt;
  if (keys.up) camPitch += turnSpeed * dt;
  if (keys.down) camPitch -= turnSpeed * dt;
  // ピッチを上下約80度程度に制限
  if (camPitch > 1.4) camPitch = 1.4;
  if (camPitch < -1.4) camPitch = -1.4;

  // オート連射処理(スペース押下中)
  if (keys.shoot) {
    const now = performance.now();
    if (now - lastShotTime > shotInterval) {
      fireBullet();
      lastShotTime = now;
    }
  }

  // 敵のスポーン(難易度が上がるほど間隔短縮)
  const currentInterval = Math.max(
    spawnBaseInterval - (performance.now() - startTime) * 0.02,
    spawnMinInterval
  );
  if (performance.now() - lastSpawnTime > currentInterval) {
    spawnEnemyWave();
    lastSpawnTime = performance.now();
  }

  // 更新処理
  updateEnemies(dt);
  updateBullets(dt);
  updateExplosions(dt);

  // スコアなどHUD更新
  updateHUD();

  // 描画
  drawScene();

  if (!gameOver) {
    requestAnimationFrame(gameLoop);
  }
}

//=======================//
//   ゲームリスタート処理   //
//=======================//

function restartGame() {
  score = 0;
  lives = 3;
  comboCount = 1;
  lastKillTime = 0;
  gameOver = false;
  camYaw = 0;
  camPitch = 0;
  enemies = [];
  bullets = [];
  explosions = [];
  lastSpawnTime = performance.now();
  lastShotTime = 0;
  prevTime = undefined;

  // 再描画でGAME OVER文字等を消す
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  requestAnimationFrame(gameLoop);
}

//=======================//
//    ゲーム開始          //
//=======================//

requestAnimationFrame(gameLoop);
