import React, { useEffect, useRef, useState, useCallback } from 'react';
import { startBgm, stopBgm, playDeathSound, playJumpSound, startDrawSound, stopDrawSound, resumeAudio } from '@/lib/retroAudio';

// --- Constants & Config ---
const CONFIG = {
  gravity: 0.6,
  jumpForce: -11,
  baseSpeed: 2.2,
  playerSpeed: 4,
  switchInterval: 6000,
  maxDrawLength: 400,
  groundOffset: 60,
  worldHeight: 0,
  maxEnergy: 100,
  energyDrain: 0.5,
  energyRegen: 0.2,
};

type World = 'A' | 'B';

interface Point { x: number; y: number; }
interface Line { points: Point[]; worldX: number; }
interface Platform { x: number; y: number; width: number; height: number; type: 'ground' | 'platform' | 'spike'; }

// Pre-generate star positions for World B
const STARS: { x: number; y: number; size: number; brightness: number }[] = [];
for (let i = 0; i < 120; i++) {
  STARS.push({
    x: (Math.sin(i * 123.45 + 67) * 0.5 + 0.5),
    y: (Math.cos(i * 543.21 + 89) * 0.5 + 0.5),
    size: Math.random() < 0.15 ? 2.5 : (Math.random() < 0.4 ? 1.5 : 1),
    brightness: 0.3 + Math.random() * 0.7,
  });
}

export default function ShiftingRealities() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [score, setScore] = useState(0);

  const state = useRef({
    frames: 0,
    cameraX: 0,
    activeWorld: 'A' as World,
    switchTimer: CONFIG.switchInterval,
    isDrawing: false,
    currentLine: null as Line | null,
    drawnLines: [] as Line[],
    terrainA: [] as Platform[],
    terrainB: [] as Platform[],
    clouds: [] as { x: number; y: number; speed: number; size: number }[],
    lastTerrainX: 0,
    glitchEffect: 0,
    energy: CONFIG.maxEnergy,
    isGravityOff: false,
    difficultyLevel: 1,
    difficultyTimer: 0,
    particles: [] as { x: number; y: number; vx: number; vy: number; life: number }[],
    bgParticlesB: [] as { x: number; y: number; vy: number; life: number; hue: number }[],
  });

  const keys = useRef({
    Space: false, ArrowUp: false, ArrowLeft: false, ArrowRight: false,
    KeyW: false, KeyA: false, KeyD: false, KeyG: false,
  });

  const player = useRef({
    x: 100, y: 0, prevY: 0, width: 30, height: 40, vy: 0, isGrounded: false,
  });

  const addPlatform = (world: World, x: number, y: number, w: number, h: number, type: 'ground' | 'platform' | 'spike') => {
    const target = world === 'A' ? state.current.terrainA : state.current.terrainB;
    target.push({ x, y, width: w, height: h, type });
  };

  const generateScenario = () => {
    const s = state.current;
    const startX = s.lastTerrainX;
    const width = 600 + s.difficultyLevel * 50;
    const groundY = CONFIG.worldHeight - CONFIG.groundOffset;

    const scenarios = [
      { type: 'BASIC_FLOW', weight: Math.max(10, 40 - s.difficultyLevel * 5) },
      { type: 'DRAW_REQUIRED', weight: 20 + s.difficultyLevel * 2 },
      { type: 'GRAVITY_DRAW_COMBO', weight: 15 + s.difficultyLevel * 3 },
      { type: 'SPIKE_LANDING_TRAP', weight: 15 + s.difficultyLevel * 2 },
      { type: 'MID_AIR_SWITCH_CHAOS', weight: 10 + s.difficultyLevel * 2 },
      { type: 'DOUBLE_PRESSURE', weight: 5 + s.difficultyLevel * 5 },
    ];

    const totalWeight = scenarios.reduce((a, c) => a + c.weight, 0);
    let random = Math.random() * totalWeight;
    let choice = 'BASIC_FLOW';
    for (const sc of scenarios) { random -= sc.weight; if (random <= 0) { choice = sc.type; break; } }

    switch (choice) {
      case 'BASIC_FLOW':
        addPlatform('A', startX, groundY, width, CONFIG.groundOffset, 'ground');
        addPlatform('B', startX, groundY, width, CONFIG.groundOffset, 'ground');
        if (Math.random() > 0.5) addPlatform('A', startX + 200, groundY - 20, 30, 20, 'spike');
        break;
      case 'DRAW_REQUIRED':
        addPlatform('A', startX, groundY, 150, CONFIG.groundOffset, 'ground');
        addPlatform('A', startX + 450, groundY, 150, CONFIG.groundOffset, 'ground');
        addPlatform('B', startX, groundY, 100, CONFIG.groundOffset, 'ground');
        addPlatform('B', startX + 100, groundY - 20, 400, 20, 'spike');
        addPlatform('B', startX + 500, groundY, 100, CONFIG.groundOffset, 'ground');
        break;
      case 'GRAVITY_DRAW_COMBO':
        addPlatform('A', startX, groundY, 150, CONFIG.groundOffset, 'ground');
        addPlatform('A', startX + 450, groundY, 150, CONFIG.groundOffset, 'ground');
        addPlatform('B', startX, groundY - 150, 100, 20, 'platform');
        addPlatform('B', startX + 100, groundY - 20, 400, 20, 'spike');
        break;
      case 'SPIKE_LANDING_TRAP':
        addPlatform('A', startX, groundY, width, CONFIG.groundOffset, 'ground');
        addPlatform('B', startX, groundY, width, CONFIG.groundOffset, 'ground');
        addPlatform('B', startX + 200, groundY - 20, 200, 20, 'spike');
        break;
      case 'MID_AIR_SWITCH_CHAOS':
        addPlatform('A', startX, groundY, 200, CONFIG.groundOffset, 'ground');
        addPlatform('B', startX + 300, groundY - 100, 300, 20, 'platform');
        break;
      case 'DOUBLE_PRESSURE':
        addPlatform('A', startX, groundY, 150, CONFIG.groundOffset, 'ground');
        addPlatform('A', startX + 200, groundY - 20, 30, 20, 'spike');
        addPlatform('A', startX + 450, groundY, 150, CONFIG.groundOffset, 'ground');
        addPlatform('B', startX, groundY - 80, 150, 20, 'platform');
        addPlatform('B', startX + 200, groundY - 150, 150, 20, 'platform');
        addPlatform('B', startX + 400, groundY - 20, 200, 20, 'spike');
        break;
    }
    s.lastTerrainX += width;
  };

  const resetGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    CONFIG.worldHeight = canvas.height / 2;

    state.current = {
      frames: 0, cameraX: 0, activeWorld: 'A', switchTimer: CONFIG.switchInterval,
      isDrawing: false, currentLine: null, drawnLines: [], terrainA: [], terrainB: [],
      clouds: [], lastTerrainX: 0, glitchEffect: 0, energy: CONFIG.maxEnergy,
      isGravityOff: false, difficultyLevel: 1, difficultyTimer: 0, particles: [], bgParticlesB: [],
    };

    player.current = {
      x: 100, y: CONFIG.worldHeight - CONFIG.groundOffset - 40,
      prevY: CONFIG.worldHeight - CONFIG.groundOffset - 40,
      width: 30, height: 40, vy: 0, isGrounded: true,
    };

    const groundY = CONFIG.worldHeight - CONFIG.groundOffset;
    for (let i = 0; i < 4; i++) {
      addPlatform('A', state.current.lastTerrainX, groundY, 300, CONFIG.groundOffset, 'ground');
      addPlatform('B', state.current.lastTerrainX, groundY, 300, CONFIG.groundOffset, 'ground');
      state.current.lastTerrainX += 300;
    }

    for (let i = 0; i < 6; i++) {
      state.current.clouds.push({
        x: Math.random() * canvas.width,
        y: 20 + Math.random() * (CONFIG.worldHeight - 140),
        speed: 0.15 + Math.random() * 0.4,
        size: 0.7 + Math.random() * 0.6,
      });
    }

    setIsGameOver(false);
    setShowInstructions(true);
    setScore(0);
  }, []);

  // Audio: play death sound + stop music when game ends
  useEffect(() => {
    if (isGameOver) {
      stopBgm();
      playDeathSound();
    }
  }, [isGameOver]);

  // Audio: start music once instructions are dismissed and game is running
  useEffect(() => {
    if (!showInstructions && !isGameOver) {
      resumeAudio();
      startBgm();
    }
    return () => {
      // pause music when instructions show again or game over
      if (showInstructions || isGameOver) stopBgm();
    };
  }, [showInstructions, isGameOver]);

  // Stop music when component unmounts
  useEffect(() => {
    return () => stopBgm();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      CONFIG.worldHeight = canvas.height / 2;
    };
    window.addEventListener('resize', resize);
    resize();
    resetGame();

    let animId: number;

    const loop = () => {
      if (isGameOver) return;
      update();
      draw(ctx);
      animId = requestAnimationFrame(loop);
    };

    const update = () => {
      const s = state.current;
      const p = player.current;
      s.frames++;

      if (s.frames === 300 && showInstructions) setShowInstructions(false);

      s.difficultyTimer += 16.67;
      if (s.difficultyTimer >= 25000) { s.difficultyLevel++; s.difficultyTimer = 0; }

      s.cameraX += CONFIG.baseSpeed + s.difficultyLevel * 0.1;
      setScore(Math.floor(s.cameraX / 10));

      s.switchTimer -= 16.67;
      if (s.switchTimer <= 0) {
        s.activeWorld = s.activeWorld === 'A' ? 'B' : 'A';
        s.switchTimer = CONFIG.switchInterval;
        s.glitchEffect = 20;
      }
      if (s.glitchEffect > 0) s.glitchEffect--;

      // Gravity toggle - hold G to float
      if (keys.current.KeyG && s.energy > 0) {
        if (!s.isGravityOff) s.isGravityOff = true;
        s.energy -= CONFIG.energyDrain;
        if (s.energy <= 0) { s.energy = 0; s.isGravityOff = false; }
      } else {
        s.isGravityOff = false;
        s.energy = Math.min(CONFIG.maxEnergy, s.energy + CONFIG.energyRegen);
      }

      // Terrain gen
      if (s.lastTerrainX - s.cameraX < canvas.width + 500) generateScenario();

      // Cleanup
      s.terrainA = s.terrainA.filter(t => t.x + t.width > s.cameraX - 200);
      s.terrainB = s.terrainB.filter(t => t.x + t.width > s.cameraX - 200);
      s.drawnLines = s.drawnLines.filter(l => (l.worldX + l.points[l.points.length - 1].x) > s.cameraX - 200);

      // Player particles
      if (s.isGravityOff) {
        s.particles.push({
          x: p.x + Math.random() * p.width, y: p.y + p.height,
          vx: Math.random() * 2 - 1, vy: Math.random() * 2, life: 1.0,
        });
      }
      s.particles.forEach(pt => { pt.x -= CONFIG.baseSpeed; pt.y += pt.vy; pt.life -= 0.02; });
      s.particles = s.particles.filter(pt => pt.life > 0);

      // World B ambient particles
      if (s.frames % 3 === 0) {
        s.bgParticlesB.push({
          x: Math.random() * canvas.width, y: CONFIG.worldHeight,
          vy: -(0.3 + Math.random() * 0.8), life: 1.0,
          hue: Math.random() > 0.5 ? 270 : 190,
        });
      }
      s.bgParticlesB.forEach(pt => { pt.y += pt.vy; pt.life -= 0.008; });
      s.bgParticlesB = s.bgParticlesB.filter(pt => pt.life > 0);

      // Clouds
      s.clouds.forEach(c => { c.x -= c.speed; if (c.x + 150 < 0) c.x = canvas.width + 100; });

      // Physics
      p.prevY = p.y;
      if (s.isGravityOff) {
        p.vy = Math.sin(s.frames * 0.1) * 0.5;
      } else {
        p.vy += CONFIG.gravity;
      }
      p.y += p.vy;

      if (keys.current.ArrowLeft || keys.current.KeyA) p.x -= CONFIG.playerSpeed;
      if (keys.current.ArrowRight || keys.current.KeyD) p.x += CONFIG.playerSpeed;
      if (p.x < s.cameraX) p.x = s.cameraX;
      if (p.x > s.cameraX + canvas.width / 2) p.x = s.cameraX + canvas.width / 2;

      // Collision
      const activeTerrain = s.activeWorld === 'A' ? s.terrainA : s.terrainB;
      let grounded = false;

      // Pass 1: Spike collision - ANY touch = death (top, side, bottom)
      // Checked FIRST and separately so landing on a ground tile doesn't skip
      // a spike that sits on top of it.
      for (const t of activeTerrain) {
        if (t.type !== 'spike') continue;
        const sh = { x: t.x + 2, y: t.y + 2, w: t.width - 4, h: t.height - 2 };
        if (
          p.x < sh.x + sh.w &&
          p.x + p.width > sh.x &&
          p.y < sh.y + sh.h &&
          p.y + p.height > sh.y
        ) {
          setIsGameOver(true);
          return;
        }
      }

      // Pass 2: Ground/platform landing
      for (const t of activeTerrain) {
        if (t.type === 'spike') continue;
        if (p.x < t.x + t.width && p.x + p.width > t.x &&
            p.y + p.height >= t.y && p.prevY + p.height <= t.y + 15 && p.vy >= 0) {
          p.y = t.y - p.height; p.vy = 0; grounded = true; break;
        }
      }

      if (!grounded) {
        for (const line of s.drawnLines) {
          for (let i = 0; i < line.points.length - 1; i++) {
            const p1 = { x: line.worldX + line.points[i].x, y: line.points[i].y };
            const p2 = { x: line.worldX + line.points[i + 1].x, y: line.points[i + 1].y };
            if (p.x + p.width > Math.min(p1.x, p2.x) && p.x < Math.max(p1.x, p2.x)) {
              const tt = (p.x + p.width / 2 - p1.x) / (p2.x - p1.x);
              const lineY = p1.y + tt * (p2.y - p1.y);
              if (p.y + p.height >= lineY - 5 && p.prevY + p.height <= lineY + 15 && p.vy >= 0) {
                p.y = lineY - p.height; p.vy = 0; grounded = true; break;
              }
            }
          }
          if (grounded) break;
        }
      }

      p.isGrounded = grounded;
      if ((keys.current.Space || keys.current.ArrowUp || keys.current.KeyW) && p.isGrounded) {
        p.vy = CONFIG.jumpForce; p.isGrounded = false;
        playJumpSound();
      }
      if (p.y > CONFIG.worldHeight + 100) setIsGameOver(true);
    };

    // ======= DRAWING =======

    const draw = (ctx: CanvasRenderingContext2D) => {
      const s = state.current;
      const p = player.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drawWorld(ctx, 'A', 0);
      drawWorld(ctx, 'B', CONFIG.worldHeight);

      // Divider line with glow
      ctx.save();
      const divGrad = ctx.createLinearGradient(0, CONFIG.worldHeight - 2, 0, CONFIG.worldHeight + 2);
      divGrad.addColorStop(0, 'rgba(0,255,204,0.4)');
      divGrad.addColorStop(0.5, 'rgba(0,255,204,0.8)');
      divGrad.addColorStop(1, 'rgba(0,255,204,0.4)');
      ctx.fillStyle = divGrad;
      ctx.fillRect(0, CONFIG.worldHeight - 1, canvas.width, 2);
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#00ffcc';
      ctx.fillRect(0, CONFIG.worldHeight - 1, canvas.width, 2);
      ctx.restore();

      // Player
      const worldOffsetY = s.activeWorld === 'A' ? 0 : CONFIG.worldHeight;

      ctx.save();
      ctx.translate(0, worldOffsetY);
      s.particles.forEach(pt => {
        ctx.fillStyle = `rgba(0,255,204,${pt.life})`;
        ctx.fillRect(pt.x - s.cameraX, pt.y, 4, 4);
      });
      ctx.restore();

      ctx.save();
      ctx.translate(-s.cameraX, worldOffsetY);
      if (s.glitchEffect > 0) ctx.translate(Math.random() * 6 - 3, 0);
      drawPlayer(ctx, p.x, p.y, s.switchTimer, s.isGravityOff);
      ctx.restore();

      drawUI(ctx);
    };

    const drawWorld = (ctx: CanvasRenderingContext2D, world: World, offsetY: number) => {
      const s = state.current;
      const isActive = s.activeWorld === world;

      ctx.save();
      ctx.translate(0, offsetY);
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, CONFIG.worldHeight);
      ctx.clip();

      if (world === 'A') {
        // Sky gradient - lush and warm
        const grad = ctx.createLinearGradient(0, 0, 0, CONFIG.worldHeight);
        grad.addColorStop(0, '#4a90d9');
        grad.addColorStop(0.3, '#74b9ff');
        grad.addColorStop(0.6, '#a8d8ea');
        grad.addColorStop(1, '#dfe6e9');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, CONFIG.worldHeight);

        // Sun
        const sunX = canvas.width - 120;
        const sunY = 60;
        ctx.save();
        ctx.shadowBlur = 40;
        ctx.shadowColor = '#ffeaa7';
        ctx.fillStyle = '#ffeaa7';
        ctx.beginPath();
        ctx.arc(sunX, sunY, 35, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 80;
        ctx.shadowColor = 'rgba(255,234,167,0.3)';
        ctx.fill();
        ctx.restore();

        // Distant mountains/hills
        ctx.fillStyle = 'rgba(116,185,255,0.3)';
        ctx.beginPath();
        ctx.moveTo(0, CONFIG.worldHeight - 80);
        for (let mx = 0; mx <= canvas.width; mx += 60) {
          ctx.lineTo(mx, CONFIG.worldHeight - 80 - Math.sin(mx * 0.008) * 30 - Math.cos(mx * 0.015) * 15);
        }
        ctx.lineTo(canvas.width, CONFIG.worldHeight);
        ctx.lineTo(0, CONFIG.worldHeight);
        ctx.fill();

        // Clouds
        s.clouds.forEach(c => drawCloud(ctx, c.x, c.y, c.size));
      } else {
        // World B: Deep space neon
        const grad = ctx.createLinearGradient(0, 0, 0, CONFIG.worldHeight);
        grad.addColorStop(0, '#050510');
        grad.addColorStop(0.5, '#0a0a25');
        grad.addColorStop(1, '#120a30');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, CONFIG.worldHeight);

        // Stars with twinkle
        STARS.forEach(star => {
          const twinkle = 0.5 + 0.5 * Math.sin(s.frames * 0.03 + star.x * 100);
          const alpha = star.brightness * twinkle;
          ctx.fillStyle = `rgba(200,200,255,${alpha})`;
          ctx.beginPath();
          ctx.arc(star.x * canvas.width, star.y * CONFIG.worldHeight, star.size, 0, Math.PI * 2);
          ctx.fill();
        });

        // Neon grid lines on floor area
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.strokeStyle = '#b040ff';
        ctx.lineWidth = 1;
        const gridSpacing = 40;
        const scrollOffset = (s.cameraX * 0.3) % gridSpacing;
        for (let gx = -scrollOffset; gx < canvas.width; gx += gridSpacing) {
          ctx.beginPath();
          ctx.moveTo(gx, CONFIG.worldHeight * 0.6);
          ctx.lineTo(gx, CONFIG.worldHeight);
          ctx.stroke();
        }
        for (let gy = CONFIG.worldHeight * 0.6; gy < CONFIG.worldHeight; gy += gridSpacing) {
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.lineTo(canvas.width, gy);
          ctx.stroke();
        }
        ctx.restore();

        // Ambient rising particles
        s.bgParticlesB.forEach(pt => {
          const alpha = pt.life * 0.4;
          ctx.fillStyle = `hsla(${pt.hue},80%,60%,${alpha})`;
          ctx.fillRect(pt.x, pt.y, 2, 2);
        });
      }

      if (!isActive) ctx.globalAlpha = 0.2;

      // Terrain
      const terrain = world === 'A' ? s.terrainA : s.terrainB;
      ctx.save();
      ctx.translate(-s.cameraX, 0);

      terrain.forEach(t => {
        if (t.type === 'spike') {
          drawSpike(ctx, t, world);
        } else {
          if (world === 'A') {
            drawGrassTile(ctx, t);
          } else {
            drawNeonTile(ctx, t);
          }
        }
      });

      // Drawn lines
      s.drawnLines.forEach(line => {
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 5;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00ffcc';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        line.points.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(line.worldX + pt.x, pt.y);
          else ctx.lineTo(line.worldX + pt.x, pt.y);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      if (s.currentLine) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        s.currentLine.points.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(s.currentLine!.worldX + pt.x, pt.y);
          else ctx.lineTo(s.currentLine!.worldX + pt.x, pt.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore(); // translate
      ctx.restore(); // clip + translate
    };

    const drawGrassTile = (ctx: CanvasRenderingContext2D, t: Platform) => {
      // Dirt/earth base
      const earthGrad = ctx.createLinearGradient(t.x, t.y, t.x, t.y + t.height);
      earthGrad.addColorStop(0, '#8B7355');
      earthGrad.addColorStop(0.3, '#6B5344');
      earthGrad.addColorStop(1, '#4a3728');
      ctx.fillStyle = earthGrad;
      ctx.fillRect(t.x, t.y + 10, t.width, t.height - 10);

      // Stone brick pattern
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1;
      const brickH = 16;
      const brickW = 28;
      for (let by = 10; by < t.height; by += brickH) {
        const offset = (Math.floor(by / brickH) % 2) * (brickW / 2);
        for (let bx = -offset; bx < t.width; bx += brickW) {
          ctx.strokeRect(t.x + bx, t.y + by, brickW, brickH);
        }
      }

      // Grass top layer
      const grassGrad = ctx.createLinearGradient(t.x, t.y, t.x, t.y + 12);
      grassGrad.addColorStop(0, '#2ecc71');
      grassGrad.addColorStop(1, '#27ae60');
      ctx.fillStyle = grassGrad;
      ctx.fillRect(t.x, t.y, t.width, 10);

      // Grass blades
      ctx.fillStyle = '#55efc4';
      for (let gx = 0; gx < t.width; gx += 6) {
        const bladeH = 3 + Math.sin(gx * 0.8) * 3;
        ctx.fillRect(t.x + gx, t.y - bladeH + 2, 3, bladeH + 2);
      }

      // Lighter grass highlight
      ctx.fillStyle = '#00b894';
      for (let gx = 3; gx < t.width; gx += 12) {
        ctx.fillRect(t.x + gx, t.y, 4, 5);
      }
    };

    const drawNeonTile = (ctx: CanvasRenderingContext2D, t: Platform) => {
      // Dark tile body
      ctx.fillStyle = '#0d0d2b';
      ctx.fillRect(t.x, t.y, t.width, t.height);

      // Internal grid
      ctx.strokeStyle = 'rgba(160,60,255,0.12)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < t.width; gx += 12) {
        ctx.beginPath(); ctx.moveTo(t.x + gx, t.y); ctx.lineTo(t.x + gx, t.y + t.height); ctx.stroke();
      }
      for (let gy = 0; gy < t.height; gy += 12) {
        ctx.beginPath(); ctx.moveTo(t.x, t.y + gy); ctx.lineTo(t.x + t.width, t.y + gy); ctx.stroke();
      }

      // Neon purple border with glow
      ctx.save();
      ctx.strokeStyle = '#b040ff';
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#b040ff';
      ctx.strokeRect(t.x, t.y, t.width, t.height);
      ctx.restore();

      // Top edge highlight
      ctx.save();
      ctx.strokeStyle = '#d070ff';
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#d070ff';
      ctx.beginPath();
      ctx.moveTo(t.x, t.y);
      ctx.lineTo(t.x + t.width, t.y);
      ctx.stroke();
      ctx.restore();

      // Corner accents
      const cs = 5;
      ctx.fillStyle = '#ff00ff';
      ctx.shadowBlur = 6;
      ctx.shadowColor = '#ff00ff';
      ctx.fillRect(t.x - 1, t.y - 1, cs, cs);
      ctx.fillRect(t.x + t.width - cs + 1, t.y - 1, cs, cs);
      ctx.fillRect(t.x - 1, t.y + t.height - cs + 1, cs, cs);
      ctx.fillRect(t.x + t.width - cs + 1, t.y + t.height - cs + 1, cs, cs);
      ctx.shadowBlur = 0;
    };

    const drawSpike = (ctx: CanvasRenderingContext2D, t: Platform, world: World) => {
      const spikeWidth = 30;
      const numSpikes = Math.max(1, Math.floor(t.width / spikeWidth));

      for (let i = 0; i < numSpikes; i++) {
        const sx = t.x + i * spikeWidth;
        const sy = t.y;

        if (world === 'A') {
          // Organic-looking spikes
          ctx.fillStyle = '#636e72';
          ctx.beginPath();
          ctx.moveTo(sx + 5, sy + 20);
          ctx.lineTo(sx + 15, sy);
          ctx.lineTo(sx + 25, sy + 20);
          ctx.fill();

          ctx.fillStyle = '#2d3436';
          ctx.beginPath();
          ctx.moveTo(sx + 11, sy + 8);
          ctx.lineTo(sx + 15, sy);
          ctx.lineTo(sx + 19, sy + 8);
          ctx.fill();

          // Base
          ctx.fillStyle = '#4b4b4b';
          ctx.fillRect(sx + 3, sy + 16, 24, 4);
        } else {
          // Neon spikes
          ctx.save();
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#ff0055';

          ctx.fillStyle = '#1a0010';
          ctx.beginPath();
          ctx.moveTo(sx + 5, sy + 20);
          ctx.lineTo(sx + 15, sy);
          ctx.lineTo(sx + 25, sy + 20);
          ctx.fill();

          ctx.strokeStyle = '#ff0055';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(sx + 5, sy + 20);
          ctx.lineTo(sx + 15, sy);
          ctx.lineTo(sx + 25, sy + 20);
          ctx.closePath();
          ctx.stroke();

          // Tip glow
          ctx.fillStyle = '#ff3377';
          ctx.beginPath();
          ctx.arc(sx + 15, sy + 2, 3, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        }
      }
    };

    const drawCloud = (ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(20, 70, 28, Math.PI * 0.5, Math.PI * 1.5);
      ctx.arc(45, 42, 38, Math.PI, Math.PI * 2);
      ctx.arc(78, 52, 28, Math.PI, Math.PI * 2);
      ctx.arc(88, 73, 24, Math.PI * 1.5, Math.PI * 0.5);
      ctx.closePath();
      ctx.fill();

      // Cloud highlight
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(45, 46, 22, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawPlayer = (ctx: CanvasRenderingContext2D, x: number, y: number, switchTimer: number, isGravityOff: boolean) => {
      const u = 30 / 12;
      const v = 40 / 16;

      let pulseColor: string | null = null;
      if (isGravityOff) {
        pulseColor = '#00ffcc';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#00ffcc';
      } else if (switchTimer < 1500) {
        const pulsePhase = (1500 - switchTimer) / 500;
        const pulseVal = Math.sin(pulsePhase * Math.PI);
        if (pulseVal > 0.3) {
          pulseColor = '#00ff00';
          ctx.shadowBlur = 20;
          ctx.shadowColor = '#00ff00';
        }
      }

      const R = pulseColor || '#e52521';
      const BL = pulseColor || '#0043bb';
      const P = '#ffcca6';
      const BR = '#5c3a21';
      const Y = '#fdf104';

      ctx.save();
      ctx.translate(x, y);

      // Hat
      ctx.fillStyle = R;
      ctx.fillRect(3 * u, 0, 5 * u, 2 * v);
      ctx.fillRect(2 * u, 2 * v, 9 * u, v);

      // Head
      ctx.fillStyle = BR;
      ctx.fillRect(2 * u, 3 * v, 3 * u, 3 * v);
      ctx.fillRect(u, 4 * v, u, 3 * v);

      ctx.fillStyle = P;
      ctx.fillRect(5 * u, 3 * v, 4 * u, 4 * v);
      ctx.fillRect(9 * u, 4 * v, 2 * u, 2 * v);
      ctx.fillRect(3 * u, 6 * v, 6 * u, v);

      ctx.fillStyle = BR;
      ctx.fillRect(7 * u, 3 * v, u, 2 * v);
      ctx.fillRect(7 * u, 5 * v, 4 * u, v);

      // Body
      ctx.fillStyle = R;
      ctx.fillRect(2 * u, 7 * v, 3 * u, 4 * v);
      ctx.fillRect(7 * u, 7 * v, 3 * u, 4 * v);
      ctx.fillRect(4 * u, 7 * v, 4 * u, 2 * v);

      ctx.fillStyle = BL;
      ctx.fillRect(4 * u, 9 * v, 4 * u, 4 * v);
      ctx.fillRect(3 * u, 8 * v, u, 3 * v);
      ctx.fillRect(8 * u, 8 * v, u, 3 * v);

      ctx.fillStyle = Y;
      ctx.fillRect(3 * u, 10 * v, u, v);
      ctx.fillRect(8 * u, 10 * v, u, v);

      // Hands
      ctx.fillStyle = P;
      ctx.fillRect(u, 9 * v, 2 * u, 2 * v);
      ctx.fillRect(9 * u, 9 * v, 2 * u, 2 * v);

      // Legs
      ctx.fillStyle = BR;
      ctx.fillRect(3 * u, 13 * v, 3 * u, 3 * v);
      ctx.fillRect(6 * u, 13 * v, 3 * u, 3 * v);

      ctx.restore();
      ctx.shadowBlur = 0;
    };

    const drawUI = (ctx: CanvasRenderingContext2D) => {
      const s = state.current;

      // Score
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#00ffcc';
      ctx.font = 'bold 24px "Bowlby One", "Pixel Game", cursive';
      ctx.textAlign = 'left';
      ctx.fillText(`SCORE: ${Math.floor(s.cameraX / 10)}`, 24, 40);
      ctx.restore();

      // Reality Stability Bar
      const timerWidth = Math.min(280, canvas.width * 0.3);
      const currentWidth = (s.switchTimer / CONFIG.switchInterval) * timerWidth;
      const tx = canvas.width / 2 - timerWidth / 2;
      const ty = 22;
      const isLow = s.switchTimer < 1500;

      // Label
      ctx.fillStyle = isLow ? '#00ff00' : 'rgba(255,255,255,0.6)';
      ctx.font = 'bold 10px "Bowlby One", "Pixel Game", cursive';
      ctx.textAlign = 'center';
      ctx.fillText('REALITY STABILITY', canvas.width / 2, ty - 4);

      // Bar BG
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      roundRect(ctx, tx, ty, timerWidth, 14, 7);
      ctx.fill();

      // Bar fill
      ctx.save();
      if (isLow) {
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#00ff00';
        ctx.fillStyle = '#00ff00';
        if (Math.random() > 0.85) ctx.translate(Math.random() * 3 - 1.5, 0);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
      }
      roundRect(ctx, tx, ty, currentWidth, 14, 7);
      ctx.fill();
      ctx.restore();

      // Energy Bar
      const energyWidth = Math.min(180, canvas.width * 0.2);
      const ex = 24;
      const ey = 60;

      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = 'bold 9px "Bowlby One", "Pixel Game", cursive';
      ctx.textAlign = 'left';
      ctx.fillText('GRAVITY CORE', ex, ey - 4);

      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      roundRect(ctx, ex, ey, energyWidth, 8, 4);
      ctx.fill();

      ctx.save();
      if (s.isGravityOff) {
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#00ffcc';
        ctx.fillStyle = '#00ffcc';
      } else {
        ctx.fillStyle = 'rgba(0,255,204,0.6)';
      }
      roundRect(ctx, ex, ey, (s.energy / CONFIG.maxEnergy) * energyWidth, 8, 4);
      ctx.fill();
      ctx.restore();

      // World indicator
      ctx.save();
      ctx.textAlign = 'right';
      ctx.font = 'bold 11px "Bowlby One", "Pixel Game", cursive';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('ACTIVE DIMENSION', canvas.width - 24, 28);
      ctx.font = 'bold 16px "Bowlby One", "Pixel Game", cursive';
      if (s.activeWorld === 'A') {
        ctx.fillStyle = '#55efc4';
        ctx.fillText('◈ PAST: ANALOG', canvas.width - 24, 48);
      } else {
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#b040ff';
        ctx.fillStyle = '#d070ff';
        ctx.fillText('◈ FUTURE: DIGITAL', canvas.width - 24, 48);
      }
      ctx.restore();

      // Difficulty indicator
      ctx.save();
      ctx.textAlign = 'right';
      ctx.font = 'bold 9px "Bowlby One", "Pixel Game", cursive';
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillText(`LEVEL ${s.difficultyLevel}`, canvas.width - 24, 64);
      ctx.restore();
    };

    const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };

    animId = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animId);
    };
  }, [isGameOver]);

  // --- Input ---
  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (isGameOver) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const relativeY = (clientY - rect.top) % CONFIG.worldHeight;
    state.current.isDrawing = true;
    state.current.currentLine = {
      worldX: state.current.cameraX,
      points: [{ x: clientX - rect.left, y: relativeY }],
    };
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!state.current.isDrawing || !state.current.currentLine) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const relativeY = (clientY - rect.top) % CONFIG.worldHeight;
    const lastPoint = state.current.currentLine.points[state.current.currentLine.points.length - 1];
    const dx = (clientX - rect.left) + (state.current.cameraX - state.current.currentLine.worldX) - lastPoint.x;
    const dy = relativeY - lastPoint.y;
    if (Math.sqrt(dx * dx + dy * dy) > 10) {
      state.current.currentLine.points.push({
        x: (clientX - rect.left) + (state.current.cameraX - state.current.currentLine.worldX),
        y: relativeY,
      });
    }
  };

  const handleMouseUp = () => {
    if (state.current.isDrawing && state.current.currentLine) {
      state.current.drawnLines.push(state.current.currentLine);
    }
    state.current.isDrawing = false;
    state.current.currentLine = null;
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code in keys.current) (keys.current as any)[e.code] = true; };
    const up = (e: KeyboardEvent) => { if (e.code in keys.current) (keys.current as any)[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden touch-none select-none bg-background">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
        className="block w-full h-full cursor-crosshair"
      />

      {isGameOver && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm z-50">
          <div className="text-center space-y-6 px-8">
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-destructive drop-shadow-[0_0_30px_rgba(255,71,87,0.5)]">
              REALITY COLLAPSED
            </h1>
            <p className="text-2xl md:text-3xl font-mono text-foreground/80">
              STABILITY SCORE: <span className="text-primary font-black">{score}</span>
            </p>
            <button
              onClick={() => { resumeAudio(); resetGame(); }}
              className="px-10 py-4 bg-primary text-primary-foreground font-black text-lg rounded-2xl transition-all hover:scale-105 shadow-[0_0_30px_hsl(var(--primary)/0.4)]"
            >
              REBOOT SYSTEM
            </button>
          </div>
        </div>
      )}

      {showInstructions && (
        <div className="absolute inset-0 flex items-center justify-center z-40 px-4">
          <div className="bg-card/95 backdrop-blur-xl p-8 rounded-3xl border border-border shadow-2xl w-full max-w-md">
            <button
              onClick={() => { resumeAudio(); setShowInstructions(false); }}
              className="absolute top-6 right-6 text-muted-foreground hover:text-foreground transition-colors text-xl"
            >
              ✕
            </button>
            <h2 className="text-3xl md:text-4xl font-black text-primary mb-2 tracking-tight">
              SHIFTING REALITIES
            </h2>
            <p className="text-muted-foreground text-sm mb-6">Draw to Survive</p>
            <p className="text-foreground/80 text-base mb-6 leading-relaxed">
              Think ahead. Draw platforms to survive the{' '}
              <span className="text-primary font-bold">NEXT</span> world.
              <br />
              <span className="text-destructive font-bold">SPIKES = INSTANT DEATH</span>
            </p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {[
                { label: 'Jump', key: 'SPACE / W' },
                { label: 'Move', key: 'A / D' },
                { label: 'Gravity', key: 'HOLD G' },
                { label: 'Draw Bridge', key: 'MOUSE DRAG', full: true },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`bg-muted/50 p-3 rounded-xl border border-border ${item.full ? 'col-span-2' : ''}`}
                >
                  <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">{item.label}</p>
                  <p className="text-foreground font-mono text-sm">{item.key}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => { resumeAudio(); setShowInstructions(false); }}
              className="w-full py-4 bg-primary text-primary-foreground font-black rounded-2xl transition-all hover:brightness-110 text-lg shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
            >
              START MISSION
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
