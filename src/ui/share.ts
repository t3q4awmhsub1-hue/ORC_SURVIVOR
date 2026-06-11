/** リザルト共有カード（1200x630 / OGP比率）をCanvasで動的生成する */

export interface RunStats {
  won: boolean;
  kills: number;
  score: number;
  timeSec: number;
  level: number;
  title: string;
  stage: string;
  buildIcons: string[];
}

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function drawShareCard(canvas: HTMLCanvasElement, stats: RunStats): void {
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d')!;

  // 背景: 深緑のグラデーション + 装飾
  const grad = ctx.createLinearGradient(0, 0, 0, 630);
  grad.addColorStop(0, '#1c2b18');
  grad.addColorStop(1, '#0d1409');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1200, 630);

  // 背景の牙モチーフ
  ctx.fillStyle = 'rgba(93, 155, 69, 0.08)';
  for (let i = 0; i < 8; i++) {
    const x = 80 + i * 150;
    ctx.beginPath();
    ctx.moveTo(x, 630);
    ctx.lineTo(x + 40, 420 - (i % 3) * 60);
    ctx.lineTo(x + 80, 630);
    ctx.fill();
  }

  ctx.textAlign = 'center';

  // ロゴ
  ctx.font = '900 84px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
  ctx.fillStyle = '#5d9b45';
  ctx.fillText('ORC SURVIVOR', 600, 110);
  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = '#c9d6bb';
  ctx.fillText('〜5分間、勇者を返り討て〜', 600, 158);

  // 勝敗
  ctx.font = '900 44px sans-serif';
  ctx.fillStyle = stats.won ? '#ffd34d' : '#ff7a5c';
  ctx.fillText(stats.won ? '👑 生存達成！真の勇者を討伐' : '💀 力尽きた…', 600, 235);

  // 称号
  ctx.font = '900 64px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`称号「${stats.title}」`, 600, 330);

  // 討伐数（主役の数字）
  ctx.font = '900 96px sans-serif';
  ctx.fillStyle = '#ff5544';
  ctx.fillText(`討伐した勇者 ${stats.kills.toLocaleString()}人`, 600, 450);

  // サブ情報
  ctx.font = 'bold 34px sans-serif';
  ctx.fillStyle = '#c9d6bb';
  ctx.fillText(
    `${stats.stage}　/　生存 ${formatTime(stats.timeSec)}　/　SCORE ${stats.score.toLocaleString()}　/　Lv${stats.level}`,
    600, 520,
  );

  // ビルド
  ctx.font = '40px sans-serif';
  ctx.fillText(stats.buildIcons.join(' '), 600, 580);
}

export function shareText(stats: RunStats, url: string): string {
  const result = stats.won ? '真の勇者を返り討ちにした！' : `${formatTime(stats.timeSec)}で力尽きた…`;
  return `【ORC SURVIVOR】${stats.stage}で討伐した勇者${stats.kills.toLocaleString()}人！称号「${stats.title}」を獲得！${result}\n#オークサバイバー\n${url}`;
}

export function openXShare(stats: RunStats, url: string): void {
  const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText(stats, url))}`;
  window.open(intent, '_blank', 'noopener');
}

export function downloadCard(canvas: HTMLCanvasElement): void {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `orc-survivor-result.png`;
  a.click();
}

export async function copyCard(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}
