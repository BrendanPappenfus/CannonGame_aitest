const canvas = document.querySelector("#game-canvas");
const ctx = canvas.getContext("2d");

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Temporary drawing test: a simple circle.
  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, 32, 0, Math.PI * 2);
  ctx.fillStyle = "#222222";
  ctx.fill();
}

draw();
