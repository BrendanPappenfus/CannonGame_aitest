const canvas = document.querySelector("#game-canvas");
const ctx = canvas.getContext("2d");

const SPRITE_SCALE = 3;
const player = {
  x: canvas.width / 2,
  y: 370,
};

// The barrel sprite points left in its unrotated orientation. Its breech
// (right-hand end) is the rotation pivot, mounted above the fixed stand.
const BARREL_PIVOT_X = 0.88;
const BARREL_PIVOT_Y = 0.5;

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

      const pivotX = player.x;
      const pivotY = player.y + 1 * SPRITE_SCALE;
      const targetAngle = Math.atan2(mouseY - pivotY, mouseX - pivotX);

      // The artwork's muzzle points left, so offset the target direction by PI.
      aimAngle = targetAngle - Math.PI;
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

  const pivotX = player.x;
  const pivotY = player.y + 1 * SPRITE_SCALE;

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
