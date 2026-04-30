/**
 * team-particles.js
 * ─────────────────
 * Attraction-based particle system for the "Meet the IT Team" hero.
 *
 * BEHAVIOUR
 *   • Many small orbs (particles) spawn randomly across the hero canvas.
 *   • Each orb is attracted toward the mouse cursor with a spring-like force,
 *     but is also repelled when it gets too close — creating a soft "orbit"
 *     rather than a hard collision. This is the "attraction mask" effect.
 *   • Orbs are connected to their nearest neighbours with faint lines when
 *     within a connection radius, giving a constellation / neural-net feel.
 *   • Without a cursor (touch devices / keyboard-only), orbs drift gently
 *     with a slow autonomous wander force so the canvas is never static.
 *   • The canvas is absolutely positioned inside .team-hero and never
 *     receives pointer events — all real UI interactions are unaffected.
 *
 * ACCESSIBILITY
 *   • The entire module is gated behind
 *       window.matchMedia('(prefers-reduced-motion: no-preference)')
 *     If the user prefers reduced motion the canvas stays hidden and no JS
 *     runs after the initial check.
 *   • The <canvas> element carries aria-hidden="true" in the HTML so screen
 *     readers never see or describe it.
 *   • CPU cost: requestAnimationFrame is paused when the hero section is
 *     scrolled fully out of view (IntersectionObserver), and the animation
 *     loop is also paused when the document becomes hidden (visibilitychange).
 *
 * PHYSICS (simplified Euler integration, 60 fps target)
 *   acceleration = (attraction toward cursor) + (repulsion from cursor)
 *                + (wander noise) + (boundary spring)
 *   velocity     = (velocity + acceleration) × damping
 *   position     = position + velocity
 */

(function () {
  'use strict';

  /* ─── Bail immediately if the user prefers reduced motion ─────────────── */
  const motionOK = window.matchMedia('(prefers-reduced-motion: no-preference)');
  if (!motionOK.matches) return;

  /* Also bail if the manual toggle was already on before this script ran */
  if (localStorage.getItem('tssc-reduce-motion') === 'true') return;

  /* ─── DOM references ──────────────────────────────────────────────────── */
  const canvas = document.getElementById('teamHeroCanvas');
  const hero   = canvas ? canvas.closest('.team-hero') : null;
  if (!canvas || !hero) return;

  const ctx = canvas.getContext('2d');

  /* ─── Show canvas now that we know motion is allowed ─────────────────── */
  canvas.style.display = 'block';

  /* ─── Configuration ───────────────────────────────────────────────────── */
  const CONFIG = {
    count:           90,      // number of particles
    radiusMin:        2,      // smallest orb radius (px)
    radiusMax:        5,      // largest orb radius (px)
    attractStrength:  0.018,  // spring constant toward cursor
    repelRadius:     80,      // px — cursor pushes orbs away within this range
    repelStrength:    3.2,    // strength of cursor repulsion
    damping:          0.88,   // velocity decay per frame (0–1)
    wanderStrength:   0.12,   // autonomous drift when no cursor
    connectRadius:   110,     // px — draw a line between closer-than-this orbs
    connectMaxAlpha:  0.18,   // max opacity of connection lines
    boundaryMargin:  20,      // px — soft spring pushes back from edges
    boundaryForce:    0.35,   // strength of boundary spring
    /* Palette: white/gold on navy (all meet WCAG AA at these alpha levels) */
    colorOrb:  'rgba(255, 255, 255, {a})',
    colorLine: 'rgba(255, 201, 77,  {a})',
  };

  /* ─── State ───────────────────────────────────────────────────────────── */
  let W = 0, H = 0;
  let mouse = { x: -9999, y: -9999, active: false };
  let particles = [];
  let rafId = null;
  let paused = false;

  /* ─── Particle factory ────────────────────────────────────────────────── */
  function createParticle () {
    const r = CONFIG.radiusMin + Math.random() * (CONFIG.radiusMax - CONFIG.radiusMin);
    return {
      x:  r + Math.random() * (W - r * 2),
      y:  r + Math.random() * (H - r * 2),
      vx: (Math.random() - 0.5) * 1.2,
      vy: (Math.random() - 0.5) * 1.2,
      r,
      alpha: 0.45 + Math.random() * 0.45,
      /* Individual wander phase so each orb drifts differently */
      wanderAngle: Math.random() * Math.PI * 2,
      wanderSpeed: 0.008 + Math.random() * 0.012,
    };
  }

  /* ─── Resize canvas to match hero section ────────────────────────────── */
  function resize () {
    const rect = hero.getBoundingClientRect();
    W = Math.round(rect.width);
    H = Math.round(rect.height);
    /* Use devicePixelRatio for crisp rendering on HiDPI screens */
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);
    /* Rebuild particles to fill new dimensions */
    particles = Array.from({ length: CONFIG.count }, createParticle);
  }

  /* ─── Physics update ──────────────────────────────────────────────────── */
  function update () {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      /* 1. Attraction toward cursor (spring toward mouse position) */
      let ax = 0, ay = 0;
      if (mouse.active) {
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;

        /* Attraction */
        ax += dx * CONFIG.attractStrength;
        ay += dy * CONFIG.attractStrength;

        /* Repulsion when very close — creates the "orbit" feel */
        if (dist < CONFIG.repelRadius) {
          const repel = (1 - dist / CONFIG.repelRadius) * CONFIG.repelStrength;
          ax -= (dx / dist) * repel;
          ay -= (dy / dist) * repel;
        }
      }

      /* 2. Autonomous wander (prevents static clusters without cursor) */
      p.wanderAngle += p.wanderSpeed * (Math.random() - 0.5) * 6;
      ax += Math.cos(p.wanderAngle) * CONFIG.wanderStrength;
      ay += Math.sin(p.wanderAngle) * CONFIG.wanderStrength;

      /* 3. Soft boundary spring — pushes back from canvas edges */
      const m = CONFIG.boundaryMargin;
      if (p.x < m)     ax += (m - p.x)     * CONFIG.boundaryForce;
      if (p.x > W - m) ax -= (p.x - (W-m)) * CONFIG.boundaryForce;
      if (p.y < m)     ay += (m - p.y)     * CONFIG.boundaryForce;
      if (p.y > H - m) ay -= (p.y - (H-m)) * CONFIG.boundaryForce;

      /* 4. Integrate */
      p.vx = (p.vx + ax) * CONFIG.damping;
      p.vy = (p.vy + ay) * CONFIG.damping;
      p.x += p.vx;
      p.y += p.vy;
    }
  }

  /* ─── Draw frame ──────────────────────────────────────────────────────── */
  function draw () {
    ctx.clearRect(0, 0, W, H);

    /* Connection lines between nearby particles — drawn first (below orbs) */
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i];
        const b = particles[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;
        const maxSq  = CONFIG.connectRadius * CONFIG.connectRadius;
        if (distSq > maxSq) continue;

        const t = 1 - Math.sqrt(distSq) / CONFIG.connectRadius;
        const alpha = t * CONFIG.connectMaxAlpha;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = CONFIG.colorLine.replace('{a}', alpha.toFixed(3));
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    /* Orbs */
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      /* Radial gradient gives each orb a soft glowing edge */
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.4);
      grad.addColorStop(0,   `rgba(255, 255, 255, ${p.alpha})`);
      grad.addColorStop(0.5, `rgba(255, 220, 130, ${p.alpha * 0.55})`);
      grad.addColorStop(1,   'rgba(255, 201, 77,  0)');

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 2.4, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      /* Solid bright core */
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = CONFIG.colorOrb.replace('{a}', (p.alpha * 0.9).toFixed(3));
      ctx.fill();
    }
  }

  /* ─── Animation loop ──────────────────────────────────────────────────── */
  function loop () {
    if (!paused) {
      update();
      draw();
    }
    rafId = requestAnimationFrame(loop);
  }

  /* ─── Mouse / touch tracking (canvas-relative coords) ────────────────── */
  function heroCoords (clientX, clientY) {
    const rect = hero.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  window.addEventListener('mousemove', function (e) {
    const c = heroCoords(e.clientX, e.clientY);
    /* Only register if cursor is actually over the hero */
    if (c.x >= 0 && c.x <= W && c.y >= 0 && c.y <= H) {
      mouse.x = c.x;
      mouse.y = c.y;
      mouse.active = true;
    } else {
      mouse.active = false;
    }
  }, { passive: true });

  window.addEventListener('mouseleave', function () {
    mouse.active = false;
  }, { passive: true });

  /* Touch: treat first touch point as the attraction anchor */
  window.addEventListener('touchmove', function (e) {
    if (e.touches.length > 0) {
      const c = heroCoords(e.touches[0].clientX, e.touches[0].clientY);
      mouse.x = c.x;
      mouse.y = c.y;
      mouse.active = c.x >= 0 && c.x <= W && c.y >= 0 && c.y <= H;
    }
  }, { passive: true });

  window.addEventListener('touchend', function () {
    mouse.active = false;
  }, { passive: true });

  /* ─── Pause when tab is hidden or hero is off screen ─────────────────── */
  document.addEventListener('visibilitychange', function () {
    paused = document.hidden;
  });

  const io = new IntersectionObserver(function (entries) {
    paused = !entries[0].isIntersecting;
  }, { threshold: 0 });
  io.observe(hero);

  /* ─── Resize observer (keeps canvas pinned to hero size) ─────────────── */
  const ro = new ResizeObserver(function () {
    resize();
  });
  ro.observe(hero);

  /* ─── Listen for the manual toggle (live pause/resume) ──────────────────
     The toggle button dispatches 'tssc-motion-change' with detail.reduced.
     We pause the RAF loop and hide the canvas when reduced = true, and
     resume + show when reduced = false — no page reload needed.
  ─────────────────────────────────────────────────────────────────────── */
  window.addEventListener('tssc-motion-change', function (e) {
    if (e.detail.reduced) {
      /* Pause: cancel the loop; canvas is hidden by CSS (.no-motion) */
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      ctx.clearRect(0, 0, W, H);
    } else {
      /* Resume: ensure canvas is visible and restart the loop */
      canvas.style.display = 'block';
      if (!rafId) loop();
    }
  });

  /* ─── Boot ────────────────────────────────────────────────────────────── */
  resize();
  loop();

})();
