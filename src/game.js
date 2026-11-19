const canvas = document.querySelector("#game-canvas");
const ctx = canvas.getContext("2d");

const SPRITE_SCALE = 3;
const player = {
  x: canvas.width / 2,
  y: 370,
};

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

  // Draw the barrel first, centered on the player's position.
  ctx.drawImage(
    barrel,
    player.x - barrelWidth / 2,
    player.y - barrelHeight + 12 * SPRITE_SCALE,
    barrelWidth,
    barrelHeight,
  );

  // Draw the stand afterward so the base sits visually in front of the barrel.
  ctx.drawImage(
    base,
    player.x - baseWidth / 2,
    player.y,
    baseWidth,
    baseHeight,
  );
}

startGame();
