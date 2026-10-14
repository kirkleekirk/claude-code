// Vector icons drawn with canvas paths: perks, power-ups, the Avion emblem and the Ghost skull.

export function skull(ctx, s, color = '#e9e4d6') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.translate(s / 2, s / 2);
  const k = s / 100;
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.moveTo(-30, -6);
  ctx.bezierCurveTo(-34, -46, 34, -46, 30, -6);
  ctx.lineTo(28, 14);
  ctx.lineTo(18, 18);
  ctx.lineTo(16, 30);
  ctx.lineTo(-16, 30);
  ctx.lineTo(-18, 18);
  ctx.lineTo(-28, 14);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  // eyes: angular, Ghosts-mask style
  ctx.beginPath();
  ctx.moveTo(-22, -4);
  ctx.lineTo(-6, -2);
  ctx.lineTo(-8, 8);
  ctx.lineTo(-20, 7);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(22, -4);
  ctx.lineTo(6, -2);
  ctx.lineTo(8, 8);
  ctx.lineTo(20, 7);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.lineTo(4, 17);
  ctx.lineTo(-4, 17);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2.5;
  for (let x = -12; x <= 12; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, 21);
    ctx.lineTo(x, 31);
    ctx.stroke();
  }
  ctx.restore();
}

export function emblem(ctx, s, color = '#e8e4d8') {
  ctx.save();
  ctx.translate(s / 2, s / 2);
  const k = s / 140;
  ctx.scale(k, k);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -48);
  ctx.lineTo(14, -14);
  ctx.lineTo(60, -26);
  ctx.lineTo(22, 6);
  ctx.lineTo(0, 46);
  ctx.lineTo(-22, 6);
  ctx.lineTo(-60, -26);
  ctx.lineTo(-14, -14);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(8, 2);
  ctx.lineTo(0, 18);
  ctx.lineTo(-8, 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function ring(ctx, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(50, 6);
  ctx.lineTo(90, 28);
  ctx.lineTo(90, 72);
  ctx.lineTo(50, 94);
  ctx.lineTo(10, 72);
  ctx.lineTo(10, 28);
  ctx.closePath();
  ctx.stroke();
}

export function perkIcon(ctx, s, id, color) {
  ctx.save();
  ctx.scale(s / 100, s / 100);
  ctx.fillStyle = 'rgba(10,12,14,0.85)';
  ctx.beginPath();
  ctx.moveTo(50, 6);
  ctx.lineTo(90, 28);
  ctx.lineTo(90, 72);
  ctx.lineTo(50, 94);
  ctx.lineTo(10, 72);
  ctx.lineTo(10, 28);
  ctx.closePath();
  ctx.fill();
  ring(ctx, color);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (id) {
    case 'health':
      ctx.beginPath();
      ctx.moveTo(50, 24);
      ctx.lineTo(72, 32);
      ctx.lineTo(70, 56);
      ctx.lineTo(50, 76);
      ctx.lineTo(30, 56);
      ctx.lineTo(28, 32);
      ctx.closePath();
      ctx.stroke();
      ctx.fillRect(46, 38, 8, 26);
      ctx.fillRect(37, 47, 26, 8);
      break;
    case 'reload':
      ctx.beginPath();
      ctx.arc(50, 50, 22, -0.3, Math.PI * 1.25);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(70, 26);
      ctx.lineTo(73, 44);
      ctx.lineTo(56, 40);
      ctx.fill();
      ctx.fillRect(45, 40, 10, 22);
      break;
    case 'medic':
      ctx.fillRect(44, 24, 12, 52);
      ctx.fillRect(24, 44, 52, 12);
      break;
    case 'slam':
      ctx.beginPath();
      ctx.moveTo(50, 22);
      ctx.lineTo(50, 60);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(36, 50);
      ctx.lineTo(50, 66);
      ctx.lineTo(64, 50);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(24, 76);
      ctx.lineTo(76, 76);
      ctx.stroke();
      break;
    case 'stabilizer':
      ctx.beginPath();
      ctx.arc(50, 50, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(50, 20);
      ctx.lineTo(50, 36);
      ctx.moveTo(50, 64);
      ctx.lineTo(50, 80);
      ctx.moveTo(20, 50);
      ctx.lineTo(36, 50);
      ctx.moveTo(64, 50);
      ctx.lineTo(80, 50);
      ctx.stroke();
      break;
    case 'velocity':
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(28 + k * 14, 30);
        ctx.lineTo(44 + k * 14, 50);
        ctx.lineTo(28 + k * 14, 70);
        ctx.stroke();
      }
      break;
    default:
      break;
  }
  ctx.restore();
}

export function powerupIcon(ctx, s, id, color = '#9dffcf') {
  ctx.save();
  ctx.scale(s / 100, s / 100);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (id) {
    case 'ammo':
      for (let k = 0; k < 3; k++) {
        const x = 30 + k * 16;
        ctx.fillRect(x, 40, 10, 34);
        ctx.beginPath();
        ctx.moveTo(x, 40);
        ctx.lineTo(x + 5, 24);
        ctx.lineTo(x + 10, 40);
        ctx.fill();
      }
      ctx.fillRect(24, 78, 52, 6);
      break;
    case 'insta':
      ctx.restore();
      skull(ctx, s, color);
      return;
    case 'double':
      ctx.font = 'bold 54px "Barlow Condensed", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('x2', 50, 54);
      break;
    case 'nuke':
      ctx.beginPath();
      ctx.arc(50, 50, 8, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.moveTo(50, 50);
        ctx.arc(50, 50, 32, a - 0.5, a + 0.5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(50, 50, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.arc(50, 50, 7, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'surge':
      ctx.beginPath();
      ctx.moveTo(56, 14);
      ctx.lineTo(30, 54);
      ctx.lineTo(48, 54);
      ctx.lineTo(42, 86);
      ctx.lineTo(70, 42);
      ctx.lineTo(52, 42);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      break;
  }
  ctx.restore();
}

export function iconCanvas(draw, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  return c;
}
