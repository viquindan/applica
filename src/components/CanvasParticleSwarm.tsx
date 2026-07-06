'use client';
import React, { useEffect, useRef } from 'react';

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  state: 'toCenter' | 'toFail' | 'toMatch' | 'done';
  color: string;
  maxSpeed: number;
  maxForce: number;
  size: number;

  constructor(startX: number, startY: number, targetX: number, targetY: number) {
    this.x = startX;
    this.y = startY + (Math.random() - 0.5) * 40; // Initial vertical spread
    this.vx = (Math.random() - 0.5) * 4;
    this.vy = (Math.random() - 0.5) * 4;
    this.targetX = targetX;
    this.targetY = targetY;
    this.state = 'toCenter';
    this.color = 'rgba(255, 255, 255, 0.9)'; // Bright for first stage
    this.maxSpeed = 4 + Math.random() * 3; // Fast
    this.maxForce = 0.15 + Math.random() * 0.1; // Agile
    this.size = 1.5 + Math.random() * 1.5;
  }

  update() {
    if (this.state === 'done') return;

    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.sqrt(dx*dx + dy*dy);

    // Arrival and State Transition
    if (dist < 30) {
       if (this.state === 'toCenter') {
          // 5% chance to match
          if (Math.random() < 0.05) {
             this.state = 'toMatch';
             this.targetX = 660;
             this.targetY = 100 + (Math.random() - 0.5) * 20;
             this.color = '#F5B041'; // Gold
             this.maxSpeed = 3 + Math.random() * 2; // Slower ascent
             this.size = 2.5 + Math.random(); // Slightly larger for match
          } else {
             this.state = 'toFail';
             this.targetX = 660;
             this.targetY = 300 + (Math.random() - 0.5) * 60;
             this.color = 'rgba(150, 150, 150, 0.25)'; // Faded gray
             this.maxSpeed = 6 + Math.random() * 4; // Fast descent
          }
       } else {
          this.state = 'done';
       }
    }

    // Steering
    let desiredVx = 0;
    let desiredVy = 0;

    if (dist > 0) {
      desiredVx = (dx / dist) * this.maxSpeed;
      desiredVy = (dy / dist) * this.maxSpeed;
    }

    let steerX = desiredVx - this.vx;
    let steerY = desiredVy - this.vy;

    // Limit force
    const steerMag = Math.sqrt(steerX*steerX + steerY*steerY);
    if (steerMag > this.maxForce) {
       steerX = (steerX / steerMag) * this.maxForce;
       steerY = (steerY / steerMag) * this.maxForce;
    }

    // Wander noise to make it swarm-like
    steerX += (Math.random() - 0.5) * 0.8;
    steerY += (Math.random() - 0.5) * 0.8;

    this.vx += steerX;
    this.vy += steerY;

    // Friction
    this.vx *= 0.98;
    this.vy *= 0.98;

    this.x += this.vx;
    this.y += this.vy;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.state === 'done') return;

    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();

    // Glow effect for matches
    if (this.state === 'toMatch') {
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#F5B041';
      ctx.fill();
      ctx.shadowBlur = 0; // Reset
    }
  }
}

export const CanvasParticleSwarm = ({
  totalFound = 54196,
}: {
  totalFound?: number;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles: Particle[] = [];
    let animationFrameId: number;
    let frameCount = 0;

    // Node coordinates (virtual 800x400 space)
    const leftSources = [
      { x: 140, y: 80 },
      { x: 140, y: 200 },
      { x: 140, y: 320 }
    ];
    const centerNode = { x: 400, y: 200 };

    const animate = () => {
      // Clear with slight trail effect (needs careful background color handling, using clearRect for clean look)
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Spawn new particles continuously
      if (frameCount % 2 === 0) { // Adjust spawn rate
        const source = leftSources[Math.floor(Math.random() * leftSources.length)];
        particles.push(new Particle(source.x, source.y, centerNode.x, centerNode.y));
      }

      // Update and draw
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        p.draw(ctx);
        if (p.state === 'done') {
          particles.splice(i, 1);
        }
      }

      // Draw fixed nodes (the UI elements over the particles)
      drawStaticUI(ctx);

      frameCount++;
      animationFrameId = requestAnimationFrame(animate);
    };

    const drawStaticUI = (ctx: CanvasRenderingContext2D) => {
      ctx.font = '700 14px "Inter", sans-serif';
      ctx.textAlign = 'right';

      // Left Nodes
      ctx.fillStyle = '#1A202C'; // Dark text
      ctx.fillText('LinkedIn', 120, 85);
      ctx.fillText('RemoteOK', 120, 205);
      ctx.fillText('Glassdoor', 120, 325);

      // Node circles
      ctx.fillStyle = '#4A5568';
      leftSources.forEach(s => {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, Math.PI*2);
        ctx.fill();
      });

      // Center Node
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#2B6CB0'; // Petrol-like
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(340, 120, 120, 160, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#1A202C';
      ctx.textAlign = 'center';
      ctx.font = '700 14px "Inter", sans-serif';
      ctx.fillText('Applica Engine', 400, 150);

      ctx.fillStyle = '#2B6CB0';
      ctx.font = '600 12px "Inter", sans-serif';
      ctx.fillText('Procesando...', 400, 175);

      ctx.fillStyle = '#718096';
      ctx.font = '400 11px "Inter", sans-serif';
      ctx.fillText(`${totalFound.toLocaleString()} analizadas`, 400, 195);

      // Right Nodes
      ctx.textAlign = 'left';

      ctx.fillStyle = '#F5B041';
      ctx.beginPath(); ctx.arc(660, 100, 4, 0, Math.PI*2); ctx.fill();
      ctx.fillText('Selección Final', 675, 105);

      ctx.fillStyle = '#A0AEC0';
      ctx.beginPath(); ctx.arc(660, 300, 4, 0, Math.PI*2); ctx.fill();
      ctx.fillText('Descartadas', 675, 305);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [totalFound]);

  return (
    <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto', overflow: 'hidden', padding: '1rem', background: 'transparent' }}>
      <canvas
        ref={canvasRef}
        width={800}
        height={400}
        style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }}
      />
    </div>
  );
};
