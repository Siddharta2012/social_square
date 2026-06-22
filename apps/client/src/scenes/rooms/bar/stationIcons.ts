export function drawBeerTap(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x2b2b30, 1);
  g.fillRoundedRect(-7, -32, 14, 8, 2);
  g.fillStyle(0xcfcfd8, 1);
  g.fillRect(-3, -48, 6, 18);
  g.lineStyle(1, 0x000000, 0.25);
  g.strokeRect(-3, -48, 6, 18);
  g.fillStyle(0xcfcfd8, 1);
  g.fillRect(-3, -48, 11, 4);
  g.fillRect(5, -48, 4, 8);
  g.fillStyle(0x111111, 1);
  g.fillRect(-1.5, -56, 3, 8);
  g.fillStyle(0xff4d4d, 1);
  g.fillCircle(0, -56, 3.5);
  g.fillStyle(0xffffff, 0.4);
  g.fillCircle(-1, -57, 1);
}

export function drawPretzelStand(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x6b3a2a, 1);
  g.fillRoundedRect(-12, -30, 24, 7, 2);
  g.lineStyle(1, 0x000000, 0.3);
  g.strokeRoundedRect(-12, -30, 24, 7, 2);
  for (const [ox, oy] of [[-5, -34], [5, -36]] as [number, number][]) {
    g.lineStyle(3, 0x8a4b1e, 1);
    g.strokeCircle(ox - 2.5, oy, 3.5);
    g.strokeCircle(ox + 2.5, oy, 3.5);
    g.lineStyle(3, 0x9c5a28, 1);
    g.beginPath();
    g.arc(ox, oy + 2, 4.5, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160), false);
    g.strokePath();
    g.fillStyle(0xffffff, 0.85);
    g.fillCircle(ox - 2, oy - 1, 0.7);
    g.fillCircle(ox + 2, oy, 0.7);
  }
}

export function drawPetalBloom(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x000000, 0.18);
  g.fillEllipse(0, 3, 28, 10);
  g.lineStyle(2, 0x2e7d36, 1);
  g.lineBetween(0, 0, 0, -22);
  g.lineBetween(0, -9, -9, -15);
  g.lineBetween(0, -10, 9, -16);

  const colors = [0xffd166, 0xe85d75, 0x9b7cff, 0xffffff];
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8;
    const x = Math.cos(angle) * 9;
    const y = -24 + Math.sin(angle) * 5;
    g.fillStyle(colors[i % colors.length], 1);
    g.fillEllipse(x, y, 6, 4);
  }
  g.fillStyle(0xfff4d0, 1);
  g.fillCircle(0, -24, 3);

  for (const [x, y, color] of [
    [-13, -2, 0xffd166],
    [-5, 5, 0xe85d75],
    [8, 1, 0x9b7cff],
    [15, 5, 0xffffff],
  ] as Array<[number, number, number]>) {
    g.fillStyle(color, 0.95);
    g.fillEllipse(x, y, 5, 3);
  }
}

export function drawHotspot(_g: Phaser.GameObjects.Graphics): void {
  _g.fillStyle(0xffffff, 0.001);
  _g.fillRect(-32, -56, 64, 56);
}

export function drawExitMarker(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0, 3, 58, 18);
  g.fillStyle(0x44ff88, 0.28);
  g.fillEllipse(0, -2, 48, 15);
  g.lineStyle(2, 0x44ff88, 0.9);
  g.strokeEllipse(0, -2, 50, 17);
  g.fillStyle(0x44ff88, 0.95);
  g.fillTriangle(-10, -12, 10, -2, -10, 8);
  g.fillRect(-16, -5, 18, 6);
  g.fillStyle(0xffffff, 0.65);
  g.fillCircle(12, -8, 2);
  g.fillCircle(18, -2, 2);
  g.fillCircle(12, 4, 2);
}
