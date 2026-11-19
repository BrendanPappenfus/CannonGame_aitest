const canvas = document.querySelector("#game-canvas");
const ctx = canvas.getContext("2d");

const SPRITE_SCALE = 3;
const player = {
  x: 90,
  y: 370,
};

// The barrel's circular pivot collar is centered 42 px from its left edge
// and 11 px down from its top (85 x 22 source sprite).
const BARREL_PIVOT_X = 42 / 85;
const BARREL_PIVOT_Y = 11 / 22;

// Matching center of the gray pivot cap on the 52 x 36 stand sprite.
const STAND_PIVOT_X = 44;
const STAND_PIVOT_Y = 6;

const MAX_CHARGE_MS = 1800;
const MIN_PROJECTILE_SPEED = 260;
const MAX_PROJECTILE_SPEED = 1050;
const GRAVITY = 1050;
const ROUND_DURATION_SECONDS = 120;
const POINTS_PER_UPGRADE = 200;
const TARGET_SPAWN_MIN_MS = 1500;
const TARGET_SPAWN_MAX_MS = 2600;
const MAX_TARGETS = 8;
const TARGET_LIFETIME_MIN_MS = 9000;
const TARGET_LIFETIME_MAX_MS = 15000;
const TARGETS = [
  { type: "red", points: 10, weight: 55, path: "public/assets/sprites/targets/red_target01.png" },
  { type: "blue", points: 25, weight: 27, path: "public/assets/sprites/targets/blue_target01.png" },
  { type: "green", points: 50, weight: 13, path: "public/assets/sprites/targets/green_target01.png" },
  { type: "gold", points: 100, weight: 5, path: "public/assets/sprites/targets/gold_target01.png" },
];

let score = 0;
let timeRemaining = ROUND_DURATION_SECONDS;
let scoreTowardUpgrade = 0;
let gamePaused = false;
let gameOver = false;
let upgradeChoices = [];
let pendingUpgradePicks = 0;
let chargeUpgradeLevel = 0;
let targetSpawnUpgradeLevel = 0;
let rareTargetUpgradeLevel = 0;
let cannonballTier = 0;
let cannonballSprites = [];
let targets = [];
let scorePopups = [];
let nextTargetSpawn = 0;

let aimAngle = 0;
let chargingSince = null;
let activePointerId = null;
let charge = 0;
let lastFrameTime = 0;
const projectiles = [];

function loadSprite(path) {
  return new Promise((resolve, reject) => {
    const sprite = new Image();
    sprite.onload = () => resolve(sprite);
    sprite.onerror = () => reject(new Error(`Could not load sprite: ${path}`));
    sprite.src = path;
  });
}

const barrelPath = "public/assets/sprites/cannon/cannon_barrel01.png";
const basePath = "public/assets/sprites/cannon/cannon_stand01.png";
const cannonballPaths = [
  "public/assets/sprites/projectiles/cannonball_small01.png",
  "public/assets/sprites/projectiles/cannonball_medium01.png",
  "public/assets/sprites/projectiles/cannonball_large01.png",
];

async function startGame() {
  try {
    const [barrel, base, ...loadedSprites] = await Promise.all([
      loadSprite(barrelPath),
      loadSprite(basePath),
      ...cannonballPaths.map(loadSprite),
      ...TARGETS.map((target) => loadSprite(target.path)),
    ]);
    cannonballSprites = loadedSprites.slice(0, cannonballPaths.length);
    const targetImages = loadedSprites.slice(cannonballPaths.length);
    const targetSprites = Object.fromEntries(
      TARGETS.map((target, index) => [target.type, targetImages[index]])
    );

    canvas.addEventListener("pointermove", (event) => {
      const pointer = getCanvasPoint(event);
      const pivot = getCannonPivot(base);
      aimAngle = Math.atan2(pointer.y - pivot.y, pointer.x - pivot.x);
    });

    // Pointer events cover mouse, pen, and touch with one input path.
    canvas.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const point = getCanvasPoint(event);

      if (gamePaused && !gameOver) {
        event.preventDefault();
        handleUpgradeChoice(point);
        return;
      }
      if (gameOver) {
        event.preventDefault();
        restartRun();
        return;
      }
      if (chargingSince !== null || gamePaused) return;

      event.preventDefault();
      activePointerId = event.pointerId;
      chargingSince = performance.now();
      charge = 0;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // The window-level release fallback still handles the gesture.
      }
    });

    function finishCharge(event) {
      if (chargingSince === null) return;
      if (event && activePointerId !== null &&
          event.pointerId !== activePointerId) return;
      event?.preventDefault();
      // Fire before clearing the start time; fireProjectile uses it to calculate power.
      fireProjectile(barrel, base, cannonballSprites[cannonballTier]);
      chargingSince = null;
      activePointerId = null;
      charge = 0;
    }

    function cancelCharge(event) {
      if (chargingSince === null) return;
      if (event && activePointerId !== null &&
          event.pointerId !== activePointerId) return;
      chargingSince = null;
      activePointerId = null;
      charge = 0;
    }

    canvas.addEventListener("pointerup", finishCharge);
    window.addEventListener("pointerup", finishCharge);
    canvas.addEventListener("pointercancel", cancelCharge);
    canvas.addEventListener("lostpointercapture", cancelCharge);
    window.addEventListener("blur", cancelCharge);

    requestAnimationFrame((time) => gameLoop(time, barrel, base, targetSprites));
  } catch (error) {
    console.error(error);
  }
}

function getCanvasPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
    y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
  };
}

function getCannonPivot(base) {
  const baseWidth = base.naturalWidth * SPRITE_SCALE;
  return {
    x: player.x - baseWidth / 2 + STAND_PIVOT_X * SPRITE_SCALE,
    y: player.y + STAND_PIVOT_Y * SPRITE_SCALE,
  };
}

function fireProjectile(barrel, base, cannonball) {
  const effectiveChargeMs = MAX_CHARGE_MS / (1 + chargeUpgradeLevel * 0.35);
  const heldFor = Math.min(performance.now() - chargingSince, effectiveChargeMs);
  const power = Math.max(0, heldFor / effectiveChargeMs);
  const speed = MIN_PROJECTILE_SPEED +
    (MAX_PROJECTILE_SPEED - MIN_PROJECTILE_SPEED) * power;

  const pivot = getCannonPivot(base);
  // Distance from the barrel pivot collar to the muzzle at the sprite's right edge.
  const muzzleDistance = barrel.naturalWidth * (1 - BARREL_PIVOT_X) * SPRITE_SCALE;
  const muzzleX = pivot.x + Math.cos(aimAngle) * muzzleDistance;
  const muzzleY = pivot.y + Math.sin(aimAngle) * muzzleDistance;

  projectiles.push({
    x: muzzleX,
    y: muzzleY,
    vx: Math.cos(aimAngle) * speed,
    vy: Math.sin(aimAngle) * speed,
    image: cannonball,
  });
}

function gameLoop(time, barrel, base, targetSprites) {
  const deltaSeconds = lastFrameTime ? Math.min((time - lastFrameTime) / 1000, 0.04) : 0;
  lastFrameTime = time;

  if (!gamePaused && !gameOver) {
    timeRemaining = Math.max(0, timeRemaining - deltaSeconds);
    if (timeRemaining <= 0) {
      gameOver = true;
      chargingSince = null;
      activePointerId = null;
      charge = 0;
    }

    if (chargingSince !== null) {
      const effectiveChargeMs = MAX_CHARGE_MS / (1 + chargeUpgradeLevel * 0.35);
      charge = Math.min((time - chargingSince) / effectiveChargeMs, 1);
    }

    if (!gameOver) {
      updateProjectiles(deltaSeconds);
      updateTargets(time, deltaSeconds, targetSprites);
    }
  }

  drawScene(barrel, base);
  requestAnimationFrame((nextTime) => gameLoop(nextTime, barrel, base, targetSprites));
}

function updateProjectiles(deltaSeconds) {
  for (const projectile of projectiles) {
    const previousX = projectile.x;
    const previousY = projectile.y;
    projectile.vy += GRAVITY * deltaSeconds;
    projectile.x += projectile.vx * deltaSeconds;
    projectile.y += projectile.vy * deltaSeconds;

    // Check the whole movement segment so fast cannonballs do not skip targets.
    for (let i = targets.length - 1; i >= 0; i--) {
      const target = targets[i];
      if (segmentHitsCircle(
        previousX, previousY, projectile.x, projectile.y,
        target.x, target.y, target.radius + 12
      )) {
        awardPoints(target.points);
        scorePopups.push({
          x: target.x,
          y: target.y,
          text: `+${target.points}`,
          age: 0,
          lifetime: 1100,
        });
        targets.splice(i, 1);
      }
    }
  }

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (p.x < -50 || p.x > canvas.width + 50 || p.y > canvas.height + 50 || p.y < -100) {
      projectiles.splice(i, 1);
    }
  }
}

function segmentHitsCircle(x1, y1, x2, y2, cx, cy, radius) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((cx - x1) * dx + (cy - y1) * dy) / lengthSquared
  ));
  const nearestX = x1 + t * dx;
  const nearestY = y1 + t * dy;
  return (cx - nearestX) ** 2 + (cy - nearestY) ** 2 <= radius ** 2;
}

function updateTargets(time, deltaSeconds, targetSprites) {
  if (!nextTargetSpawn) {
    nextTargetSpawn = time + 700;
  } else if (time >= nextTargetSpawn) {
    if (targets.length < MAX_TARGETS) spawnTarget(time, targetSprites);
    const spawnSpeed = Math.pow(0.82, targetSpawnUpgradeLevel);
    nextTargetSpawn = time + (TARGET_SPAWN_MIN_MS +
      Math.random() * (TARGET_SPAWN_MAX_MS - TARGET_SPAWN_MIN_MS)) * spawnSpeed;
  }

  for (let i = targets.length - 1; i >= 0; i--) {
    const target = targets[i];
    target.age += deltaSeconds * 1000;
    if (target.age >= target.lifetime) targets.splice(i, 1);
  }

  for (let i = scorePopups.length - 1; i >= 0; i--) {
    scorePopups[i].age += deltaSeconds * 1000;
    if (scorePopups[i].age >= scorePopups[i].lifetime) {
      scorePopups.splice(i, 1);
    }
  }
}

function spawnTarget(time, targetSprites) {
  const weightedTargets = TARGETS.map((target) => ({
    ...target,
    adjustedWeight: target.weight * (
      target.type === "red" ? 1 :
      target.type === "blue" ? 1 + rareTargetUpgradeLevel * 0.25 :
      target.type === "green" ? 1 + rareTargetUpgradeLevel * 0.6 :
      1 + rareTargetUpgradeLevel
    ),
  }));
  const totalWeight = weightedTargets.reduce((sum, target) => sum + target.adjustedWeight, 0);
  let roll = Math.random() * totalWeight;
  let selected = weightedTargets[0];
  for (const target of weightedTargets) {
    roll -= target.adjustedWeight;
    if (roll < 0) {
      selected = target;
      break;
    }
  }

  const lifetime = TARGET_LIFETIME_MIN_MS +
    Math.random() * (TARGET_LIFETIME_MAX_MS - TARGET_LIFETIME_MIN_MS);
  targets.push({
    ...selected,
    image: targetSprites[selected.type],
    x: 255 + Math.random() * 665,
    y: 65 + Math.random() * 390,
    radius: Math.max(
      targetSprites[selected.type].naturalWidth,
      targetSprites[selected.type].naturalHeight
    ) * SPRITE_SCALE / 2,
    age: 0,
    lifetime,
    bornAt: time,
  });
}

function drawScene(barrel, base) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  // Targets appear in the playfield in front of the cannon.
  for (const target of targets) drawTarget(target);

  // Projectiles are drawn behind the cannon artwork.
  for (const projectile of projectiles) {
    // Use the same pixel-art scale as the cannon, preserving the sprite's
    // native width-to-height ratio rather than forcing it into a square.
    const drawWidth = projectile.image.naturalWidth * SPRITE_SCALE;
    const drawHeight = projectile.image.naturalHeight * SPRITE_SCALE;
    ctx.drawImage(
      projectile.image,
      projectile.x - drawWidth / 2,
      projectile.y - drawHeight / 2,
      drawWidth,
      drawHeight,
    );
  }

  drawPlayer(barrel, base);
  drawChargeMeter(base);
  drawScore();
  drawScorePopups();
  drawTopProgressBar();
  if (gamePaused && !gameOver) drawUpgradeScreen();
  if (gameOver) drawGameOverScreen();
}

function drawTarget(target) {
  const fade = target.age > target.lifetime - 1800
    ? Math.max(0, (target.lifetime - target.age) / 1800)
    : 1;
  const pulse = 1 + Math.sin(target.age / 180) * 0.025;
  const drawWidth = target.image.naturalWidth * SPRITE_SCALE;
  const drawHeight = target.image.naturalHeight * SPRITE_SCALE;

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(target.x, target.y);
  ctx.scale(pulse, pulse);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    target.image,
    -drawWidth / 2,
    -drawHeight / 2,
    drawWidth,
    drawHeight
  );
  ctx.restore();
}

function drawScore() {
  ctx.save();
  ctx.fillStyle = "rgba(30, 35, 45, 0.82)";
  ctx.fillRect(canvas.width / 2 - 92, 20, 184, 42);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(canvas.width / 2 - 92, 20, 184, 42);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 21px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`SCORE: ${score}`, canvas.width / 2, 41);
  ctx.fillStyle = "#263238";
  ctx.font = "bold 17px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(formatTime(timeRemaining), canvas.width - 22, 41);
  ctx.restore();
}

function formatTime(seconds) {
  const whole = Math.ceil(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function awardPoints(points) {
  score += points;
  scoreTowardUpgrade += points;
  while (scoreTowardUpgrade >= POINTS_PER_UPGRADE) {
    scoreTowardUpgrade -= POINTS_PER_UPGRADE;
    pendingUpgradePicks++;
  }
  if (!gamePaused && pendingUpgradePicks > 0) showUpgradeChoices();
}

const UPGRADE_DEFINITIONS = [
  {
    id: "faster-charge",
    title: "Faster Charge",
    description: "Charge your cannon 35% faster. Stacks with every pick.",
    available: () => true,
    apply: () => chargeUpgradeLevel++,
  },
  {
    id: "more-targets",
    title: "More Targets",
    description: "Targets spawn 18% faster. Stacks with every pick.",
    available: () => true,
    apply: () => targetSpawnUpgradeLevel++,
  },
  {
    id: "bigger-cannonballs",
    title: "Bigger Cannonballs",
    description: "Upgrade your cannonball to the next size.",
    available: () => cannonballTier < cannonballSprites.length - 1,
    apply: () => cannonballTier++,
  },
  {
    id: "rarer-targets",
    title: "Rarer Targets",
    description: "Boost the odds of blue, green, and gold targets. Stacks.",
    available: () => true,
    apply: () => rareTargetUpgradeLevel++,
  },
];

function showUpgradeChoices() {
  gamePaused = true;
  chargingSince = null;
  activePointerId = null;
  charge = 0;
  const available = UPGRADE_DEFINITIONS.filter((upgrade) => upgrade.available());
  upgradeChoices = shuffleArray(available).slice(0, Math.min(3, available.length));
}

function shuffleArray(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function handleUpgradeChoice(point) {
  const cardWidth = 250;
  const gap = 18;
  const totalWidth = cardWidth * upgradeChoices.length + gap * (upgradeChoices.length - 1);
  const startX = (canvas.width - totalWidth) / 2;
  const cardY = 220;
  const cardHeight = 150;

  for (let i = 0; i < upgradeChoices.length; i++) {
    const x = startX + i * (cardWidth + gap);
    if (point.x >= x && point.x <= x + cardWidth &&
        point.y >= cardY && point.y <= cardY + cardHeight) {
      upgradeChoices[i].apply();
      pendingUpgradePicks = Math.max(0, pendingUpgradePicks - 1);
      if (pendingUpgradePicks > 0) {
        showUpgradeChoices();
      } else {
        upgradeChoices = [];
        gamePaused = false;
      }
      return;
    }
  }
}

function drawTopProgressBar() {
  const x = 0;
  const y = 0;
  const width = canvas.width;
  const height = 8;
  ctx.fillStyle = "#252b34";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "#f1c40f";
  ctx.fillRect(x, y, width * (scoreTowardUpgrade / POINTS_PER_UPGRADE), height);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(x, y + height - 1, width, 1);
}

function drawUpgradeScreen() {
  ctx.save();
  ctx.fillStyle = "rgba(15, 20, 30, 0.82)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 32px sans-serif";
  ctx.fillText("CHOOSE AN UPGRADE", canvas.width / 2, 155);
  ctx.font = "16px sans-serif";
  ctx.fillText("Gameplay and the round timer are paused", canvas.width / 2, 184);

  const cardWidth = 250;
  const gap = 18;
  const totalWidth = cardWidth * upgradeChoices.length + gap * (upgradeChoices.length - 1);
  const startX = (canvas.width - totalWidth) / 2;
  const cardY = 220;
  const cardHeight = 150;

  upgradeChoices.forEach((upgrade, index) => {
    const x = startX + index * (cardWidth + gap);
    ctx.fillStyle = "#f4f5f7";
    ctx.fillRect(x, cardY, cardWidth, cardHeight);
    ctx.strokeStyle = "#e0b33d";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, cardY, cardWidth, cardHeight);

    ctx.fillStyle = "#263238";
    ctx.font = "bold 19px sans-serif";
    ctx.fillText(upgrade.title, x + cardWidth / 2, cardY + 38);

    ctx.font = "14px sans-serif";
    wrapCanvasText(upgrade.description, x + cardWidth / 2, cardY + 76, cardWidth - 30, 20);
    ctx.fillStyle = "#9a6b00";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("CLICK TO SELECT", x + cardWidth / 2, cardY + 128);
  });
  ctx.restore();
}

function wrapCanvasText(text, centerX, startY, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let y = startY;
  ctx.textAlign = "center";
  for (const word of words) {
    const testLine = line ? line + " " + word : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, centerX, y);
      line = word;
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, centerX, y);
}

function drawGameOverScreen() {
  ctx.save();
  ctx.fillStyle = "rgba(15, 20, 30, 0.84)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 42px sans-serif";
  ctx.fillText("ROUND OVER", canvas.width / 2, 190);
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(`FINAL SCORE: ${score}`, canvas.width / 2, 250);
  ctx.font = "18px sans-serif";
  ctx.fillText("Click anywhere to play again", canvas.width / 2, 310);
  ctx.restore();
}

function restartRun() {
  score = 0;
  timeRemaining = ROUND_DURATION_SECONDS;
  scoreTowardUpgrade = 0;
  gamePaused = false;
  gameOver = false;
  upgradeChoices = [];
  pendingUpgradePicks = 0;
  chargeUpgradeLevel = 0;
  targetSpawnUpgradeLevel = 0;
  rareTargetUpgradeLevel = 0;
  cannonballTier = 0;
  targets = [];
  projectiles.length = 0;
  scorePopups = [];
  nextTargetSpawn = 0;
  chargingSince = null;
  activePointerId = null;
  charge = 0;
}

function drawScorePopups() {
  for (const popup of scorePopups) {
    const progress = popup.age / popup.lifetime;
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.fillStyle = "#20252b";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    const y = popup.y - 18 - progress * 34;
    ctx.strokeText(popup.text, popup.x, y);
    ctx.fillText(popup.text, popup.x, y);
    ctx.restore();
  }
}

function drawPlayer(barrel, base) {
  const barrelWidth = barrel.naturalWidth * SPRITE_SCALE;
  const barrelHeight = barrel.naturalHeight * SPRITE_SCALE;
  const baseWidth = base.naturalWidth * SPRITE_SCALE;
  const baseHeight = base.naturalHeight * SPRITE_SCALE;
  const pivot = getCannonPivot(base);

  // Rotate only the barrel around its pivot collar.
  ctx.save();
  ctx.translate(pivot.x, pivot.y);
  ctx.rotate(aimAngle);
  ctx.drawImage(
    barrel,
    -barrelWidth * BARREL_PIVOT_X,
    -barrelHeight * BARREL_PIVOT_Y,
    barrelWidth,
    barrelHeight,
  );
  ctx.restore();

  // The fixed stand remains in front of the barrel.
  ctx.drawImage(
    base,
    player.x - baseWidth / 2,
    player.y,
    baseWidth,
    baseHeight,
  );
}

function drawChargeMeter(base) {
  const baseHeight = base.naturalHeight * SPRITE_SCALE;
  const meterX = player.x - 8;
  const meterY = player.y + baseHeight + 17;
  const meterWidth = 110;
  const meterHeight = 12;

  ctx.fillStyle = "#333333";
  ctx.fillRect(meterX - 2, meterY - 2, meterWidth + 4, meterHeight + 4);
  ctx.fillStyle = "#d8d8d8";
  ctx.fillRect(meterX, meterY, meterWidth, meterHeight);

  if (charge > 0) {
    ctx.fillStyle = charge >= 1 ? "#e15b36" : "#e0a52f";
    ctx.fillRect(meterX, meterY, meterWidth * charge, meterHeight);
  }

  ctx.fillStyle = "#333333";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("POWER", meterX, meterY + 27);
}

startGame();
