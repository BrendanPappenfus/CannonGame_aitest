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
// These coordinates come from the assembled reference on the supplied sheet.
const STAND_PIVOT_X = 44;
const STAND_PIVOT_Y = 6;

let aimAngle = 0;

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

async function startGame() {
  try {
    const [barrel, base] = await Promise.all([
      loadSprite(barrelPath),
      loadSprite(basePath),
    ]);

    canvas.addEventListener("pointermove", (event) => {
      const bounds = canvas.getBoundingClientRect();
      const mouseX = (event.clientX - bounds.left) * (canvas.width / bounds.width);
      const mouseY = (event.clientY - bounds.top) * (canvas.height / bounds.height);

      const pivotX = player.x - (base.naturalWidth * SPRITE_SCALE) / 2 + STAND_PIVOT_X * SPRITE_SCALE;
      const pivotY = player.y + STAND_PIVOT_Y * SPRITE_SCALE;
      const targetAngle = Math.atan2(mouseY - pivotY, mouseX - pivotX);

      // The muzzle points right in the source artwork, so use the target angle directly.
      aimAngle = targetAngle;
      drawPlayer(barrel, base);
    });

    drawPlayer(barrel, base);
  } catch (error) {
    console.error(error);
  }
}

function drawPlayer(barrel, base) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  const barrelWidth = barrel.naturalWidth * SPRITE_SCALE;
  const barrelHeight = barrel.naturalHeight * SPRITE_SCALE;
  const baseWidth = base.naturalWidth * SPRITE_SCALE;
  const baseHeight = base.naturalHeight * SPRITE_SCALE;

  const pivotX = player.x - baseWidth / 2 + STAND_PIVOT_X * SPRITE_SCALE;
  const pivotY = player.y + STAND_PIVOT_Y * SPRITE_SCALE;

  // Rotate only the barrel around its breech; the stand remains stationary.
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(aimAngle);
  ctx.drawImage(
    barrel,
    -barrelWidth * BARREL_PIVOT_X,
    -barrelHeight * BARREL_PIVOT_Y,
    barrelWidth,
    barrelHeight,
  );
  ctx.restore();

  // Draw the stand last so it remains fixed and in front of the barrel.
  ctx.drawImage(
    base,
    player.x - baseWidth / 2,
    player.y,
    baseWidth,
    baseHeight,
  );
}

startGame();
