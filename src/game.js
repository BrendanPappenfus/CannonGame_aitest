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
const TARGET_SPAWN_MIN_MS = 1500;
const TARGET_SPAWN_MAX_MS = 2600;
const MAX_TARGETS = 8;
const TARGET_LIFETIME_MIN_MS = 9000;
const TARGET_LIFETIME_MAX_MS = 15000;
const TARGETS = [
  { type: "red", color: "#e74c3c", points: 10, weight: 55 },
  { type: "blue", color: "#3498db", points: 25, weight: 27 },
  { type: "green", color: "#2ecc71", points: 50, weight: 13 },
  { type: "gold", color: "#f1c40f", points: 100, weight: 5 },
];

let score = 0;
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
const ballPath = "public/assets/sprites/projectiles/cannonball_small01.png";

async function startGame() {
  try {
    const [barrel, base, cannonball] = await Promise.all([
      loadSprite(barrelPath),
      loadSprite(basePath),
      loadSprite(ballPath),
    ]);

    canvas.addEventListener("pointermove", (event) => {
      const pointer = getCanvasPoint(event);
      const pivot = getCannonPivot(base);
      aimAngle = Math.atan2(pointer.y - pivot.y, pointer.x - pivot.x);
    });

    // Pointer events cover mouse, pen, and touch with one input path.
    canvas.addEventListener("pointerdown", (event) => {
      if ((event.pointerType === "mouse" && event.button !== 0) ||
          chargingSince !== null) return;
      event.preventDefault();
      activePointerId = event.pointerId;
      chargingSince = performance.now();
      charge = 0;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // The window-level release fallback below still handles the gesture.
      }
    });

    function finishCharge(event) {
      if (chargingSince === null) return;
      if (event && activePointerId !== null &&
          event.pointerId !== activePointerId) return;
      event?.preventDefault();
      // Fire before clearing the start time; fireProjectile uses it to calculate power.
      fireProjectile(barrel, base, cannonball);
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

    requestAnimationFrame((time) => gameLoop(time, barrel, base, cannonball));
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
  const heldFor = Math.min(performance.now() - chargingSince, MAX_CHARGE_MS);
  const power = Math.max(0, heldFor / MAX_CHARGE_MS);
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

function gameLoop(time, barrel, base, cannonball) {
  const deltaSeconds = lastFrameTime ? Math.min((time - lastFrameTime) / 1000, 0.04) : 0;
  lastFrameTime = time;

  if (chargingSince !== null) {
    charge = Math.min((time - chargingSince) / MAX_CHARGE_MS, 1);
  }

  updateProjectiles(deltaSeconds);
  updateTargets(time, deltaSeconds);
  drawScene(barrel, base);
  requestAnimationFrame((nextTime) => gameLoop(nextTime, barrel, base, cannonball));
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
        score += target.points;
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

function updateTargets(time, deltaSeconds) {
  if (!nextTargetSpawn) {
    nextTargetSpawn = time + 700;
  } else if (time >= nextTargetSpawn) {
    if (targets.length < MAX_TARGETS) spawnTarget(time);
    nextTargetSpawn = time + TARGET_SPAWN_MIN_MS +
      Math.random() * (TARGET_SPAWN_MAX_MS - TARGET_SPAWN_MIN_MS);
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

function spawnTarget(time) {
  const totalWeight = TARGETS.reduce((sum, target) => sum + target.weight, 0);
  let roll = Math.random() * totalWeight;
  let selected = TARGETS[0];
  for (const target of TARGETS) {
    roll -= target.weight;
    if (roll < 0) {
      selected = target;
      break;
    }
  }

  const lifetime = TARGET_LIFETIME_MIN_MS +
    Math.random() * (TARGET_LIFETIME_MAX_MS - TARGET_LIFETIME_MIN_MS);
  targets.push({
    ...selected,
    x: 255 + Math.random() * 665,
    y: 65 + Math.random() * 390,
    radius: 19,
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
}

function drawTarget(target) {
  const remaining = Math.max(0, 1 - target.age / target.lifetime);
  const fade = target.age > target.lifetime - 1800
    ? Math.max(0, (target.lifetime - target.age) / 1800)
    : 1;
  const pulse = 1 + Math.sin(target.age / 180) * 0.035;

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(target.x, target.y);
  ctx.scale(pulse, pulse);

  // Bright, layered bullseye targets with a distinct tier color.
  ctx.fillStyle = "rgba(25, 30, 40, 0.18)";
  ctx.beginPath();
  ctx.arc(2, 3, target.radius + 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = target.color;
  ctx.beginPath();
  ctx.arc(0, 0, target.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 4;
  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(0, 0, target.radius - 5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#263238";
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(target.points.toString(), 0, target.radius + 13);
  ctx.restore();
}

function drawScore() {
  ctx.save();
  ctx.fillStyle = "rgba(30, 35, 45, 0.82)";
  ctx.fillRect(canvas.width / 2 - 92, 12, 184, 42);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(canvas.width / 2 - 92, 12, 184, 42);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 21px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`SCORE: ${score}`, canvas.width / 2, 33);
  ctx.restore();
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
