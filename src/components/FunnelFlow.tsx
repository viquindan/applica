'use client';
import React, { useEffect, useRef } from 'react';

/**
 * A premium funnel animation: opportunities pour in from the top across many
 * sources, cascade down through the "Applica IA" filter neck, where most are
 * diverted out (discarded, faded grey) and only a few high-fit ones pass through
 * to settle as gold (selected). Designed for a light/white surface.
 */

const PETROL = '#2a4a4f';
const PETROL_LIGHT = '#5a8a90';
const GOLD = '#e0a92e';

const CX = 400;
const TOP_Y = 46;
const NECK_Y = 232;
const FLOOR_Y = 312;
const TOP_HALF = 252;
const NECK_HALF = 46;

function halfWidthAt(y: number): number {
  if (y <= TOP_Y) return TOP_HALF;
  if (y >= NECK_Y) return NECK_HALF;
  const t = (y - TOP_Y) / (NECK_Y - TOP_Y);
  return TOP_HALF + (NECK_HALF - TOP_HALF) * t;
}

type Phase = 'fall' | 'pass' | 'discard';
class Drop {
  x: number; y: number; vx: number; vy: number;
  phase: Phase = 'fall';
  size: number;
  alpha = 1;
  color = PETROL;
  constructor() {
    this.x = CX + (Math.random() - 0.5) * 2 * (TOP_HALF - 14);
    this.y = TOP_Y + Math.random() * 6;
    this.vx = (Math.random() - 0.5) * 0.4;
    this.vy = 0.7 + Math.random() * 0.7;
    this.size = 1.6 + Math.random() * 1.6;
    const shade = Math.random();
    this.color = shade > 0.5 ? PETROL : PETROL_LIGHT;
  }
  update() {
    if (this.phase === 'fall') {
      this.vy += 0.045; // gravity
      this.y += this.vy;
      this.x += this.vx;
      // Constrain inside funnel walls, nudging toward the neck.
      const half = halfWidthAt(this.y);
      if (this.x < CX - half) { this.x = CX - half; this.vx += 0.06; }
      if (this.x > CX + half) { this.x = CX + half; this.vx -= 0.06; }
      this.vx += (CX - this.x) * 0.0009; // gentle pull to center
      this.vx *= 0.99;
      // Decision at the neck.
      if (this.y >= NECK_Y - 4) {
        const nearCenter = Math.abs(this.x - CX) < NECK_HALF * 0.85;
        if (nearCenter && Math.random() < 0.5) {
          this.phase = 'pass'; this.color = GOLD; this.size += 0.6;
          this.vx = (Math.random() - 0.5) * 0.3; this.vy = 1.2 + Math.random();
        } else {
          this.phase = 'discard';
          this.vx = (this.x < CX ? -1 : 1) * (1.6 + Math.random() * 1.8);
          this.vy = 0.4 + Math.random() * 0.6;
        }
      }
    } else if (this.phase === 'pass') {
      this.vy += 0.05; this.y += this.vy; this.x += this.vx;
      if (this.y >= FLOOR_Y) { this.alpha -= 0.012; this.y = FLOOR_Y; this.vx *= 0.6; }
    } else { // discard
      this.vy += 0.05; this.x += this.vx; this.y += this.vy;
      this.alpha -= 0.018;
    }
  }
  get dead() { return this.alpha <= 0.02 || this.y > 360 || this.x < -20 || this.x > 820; }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.globalAlpha = this.phase === 'discard' ? this.alpha * 0.5 : this.alpha;
    ctx.fillStyle = this.color;
    if (this.phase === 'pass') { ctx.shadowBlur = 8; ctx.shadowColor = GOLD; }
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

export const FunnelFlow = ({ active = true }: { active?: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let drops: Drop[] = [];
    let raf = 0;
    let frame = 0;

    const drawWalls = () => {
      // Funnel walls
      const lx1 = CX - TOP_HALF, rx1 = CX + TOP_HALF;
      const lx2 = CX - NECK_HALF, rx2 = CX + NECK_HALF;
      const grad = ctx.createLinearGradient(0, TOP_Y, 0, FLOOR_Y);
      grad.addColorStop(0, 'rgba(42,74,79,0.10)');
      grad.addColorStop(1, 'rgba(42,74,79,0.32)');
      // Fill the funnel body subtly.
      ctx.beginPath();
      ctx.moveTo(lx1, TOP_Y); ctx.lineTo(lx2, NECK_Y);
      ctx.lineTo(lx2, FLOOR_Y); ctx.lineTo(rx2, FLOOR_Y);
      ctx.lineTo(rx2, NECK_Y); ctx.lineTo(rx1, TOP_Y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(42,74,79,0.035)';
      ctx.fill();
      // Wall strokes
      ctx.lineWidth = 2; ctx.strokeStyle = grad; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(lx1, TOP_Y); ctx.lineTo(lx2, NECK_Y); ctx.lineTo(lx2, FLOOR_Y);
      ctx.moveTo(rx1, TOP_Y); ctx.lineTo(rx2, NECK_Y); ctx.lineTo(rx2, FLOOR_Y);
      ctx.stroke();
      // Neck "filter" glow line
      ctx.strokeStyle = 'rgba(224,169,46,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(lx2, NECK_Y); ctx.lineTo(rx2, NECK_Y); ctx.stroke();
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawWalls();

      if (activeRef.current && frame % 2 === 0 && drops.length < 260) {
        drops.push(new Drop());
        if (Math.random() < 0.5) drops.push(new Drop());
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.update(); d.draw(ctx);
        if (d.dead) drops.splice(i, 1);
      }
      frame++;
      raf = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 720, margin: '0 auto' }}>
      <canvas ref={canvasRef} width={800} height={360}
        style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }} />
      {/* Crisp HTML labels overlaid on the canvas */}
      <div style={{ position: 'absolute', top: '4%', left: '50%', transform: 'translateX(-50%)', fontSize: '.7rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
        Fuentes de empleo
      </div>
      <div style={{ position: 'absolute', top: '60%', left: '50%', transform: 'translateX(-50%)', fontSize: '.64rem', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: GOLD, background: 'var(--surface)', padding: '1px 8px', borderRadius: 999, border: '1px solid rgba(224,169,46,.4)' }}>
        Filtro Applica IA
      </div>
      <div style={{ position: 'absolute', bottom: '2%', left: '50%', transform: 'translateX(-50%)', fontSize: '.7rem', fontWeight: 700, letterSpacing: '.04em', color: PETROL }}>
         Seleccionadas para ti
      </div>
    </div>
  );
};
