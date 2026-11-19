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
const GRAVITY = 520;

let aimAngle = 0;
let chargingSince = null;
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

    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || chargingSince !== null) return;
      event.preventDefault();
      chargingSince = performance.now();
      charge = 0;
      canvas.setPointerCapture?.(event.pointerId);
    });

    window.addEventListener("pointerup", (event) => {
      if (chargingSince === null) return;
      event.preventDefault();
      fireProjectile(barrel, base, cannonball);
      chargingSince = null;
      charge = 0;
    });

    window.addEventListener("pointercancel", () => {
      chargingSince = null;
      charge = 0;
    });

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
  const muzzleOffsetX = (barrel.naturalWidth * BARREL_PIVOT_X) * SPRITE_SCALE;
  const muzzleOffsetY = 0;
  const muzzleDistance = muzzleOffsetX;
  const muzzleX = pivot.x + Math.cos(aimAngle) * muzzleDistance;
  const muzzleY = pivot.y + Math.sin(aimAngle) * muzzleDistance;

  projectiles.push({
    x: muzzleX,
    y: muzzleY,
    vx: Math.cos(aimAngle) * speed,
    vy: Math.sin(aimAngle) * speed,
    image: cannonball,
    size: 3,
  });
}

function gameLoop(time, barrel, base, cannonball) {
  const deltaSeconds = lastFrameTime ? Math.min((time - lastFrameTime) / 1000, 0.04) : 0;
  lastFrameTime = time;

  if (chargingSince !== null) {
    charge = Math.min((time - chargingSince) / MAX_CHARGE_MS, 1);
  }

  updateProjectiles(deltaSeconds);
  drawScene(barrel, base);
  requestAnimationFrame((nextTime) => gameLoop(nextTime, barrel, base, cannonball));
}

function updateProjectiles(deltaSeconds) {
  for (const projectile of projectiles) {
    projectile.vy += GRAVITY * deltaSeconds;
    projectile.x += projectile.vx * deltaSeconds;
    projectile.y += projectile.vy * deltaSeconds;
  }

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (p.x < -50 || p.x > canvas.width + 50 || p.y > canvas.height + 50 || p.y < -100) {
      projectiles.splice(i, 1);
    }
  }
}

function drawScene(barrel, base) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  // Projectiles are drawn first, behind the cannon artwork.
  for (const projectile of projectiles) {
    const size = projectile.size * SPRITE_SCALE;
    ctx.drawImage(
      projectile.image,
      projectile.x - size / 2,
      projectile.y - size / 2,
      size,
      size,
    );
  }

  drawPlayer(barrel, base);
  drawChargeMeter(base);
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
