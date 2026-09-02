/* ═══════════════════════════════════════════
   Diego Crisafulli — portfolio

   Three pieces: the hero point field, the
   engagement timeline, and the impact figures.
   Charts are hand-drawn SVG rather than a
   library — two small figures do not justify
   shipping a charting runtime to a portfolio.
   ═══════════════════════════════════════════ */

(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ══════════ HERO POINT FIELD ══════════
     A rotating point cloud, which is what five years of this CV actually
     touched — LiDAR sensor pipelines, Omniverse digital twins, scene graphs
     for VR. Cheaper and more honest than a stock hero image. */

  function field() {
    const cv = $('#field');
    if (!cv) return;
    const ctx = cv.getContext('2d', { alpha: true });
    let w = 0, h = 0, dpr = 1, pts = [], raf = null;

    function build() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Fewer points on small screens — this runs behind text, not as the show.
      const n = Math.round(Math.min(1500, (w * h) / 1400));
      pts = new Array(n).fill(0).map(() => {
        // Distribute on a sphere so rotation reads as depth, not drift.
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 0.72 + Math.random() * 0.28;
        return {
          x: r * Math.sin(phi) * Math.cos(theta),
          y: r * Math.sin(phi) * Math.sin(theta),
          z: r * Math.cos(phi),
          s: 0.5 + Math.random() * 1.1
        };
      });
    }

    let t = 0, mx = 0, my = 0, tx = 0, ty = 0;

    function frame() {
      ctx.clearRect(0, 0, w, h);
      t += 0.0016;
      // Ease toward the pointer so the field feels responsive, not jumpy.
      mx += (tx - mx) * 0.045;
      my += (ty - my) * 0.045;

      const cxr = Math.cos(t + my * 0.4), sxr = Math.sin(t + my * 0.4);
      const cyr = Math.cos(t * 0.62 + mx * 0.5), syr = Math.sin(t * 0.62 + mx * 0.5);
      const cx = w / 2, cy = h / 2;
      const scale = Math.min(w, h) * 0.46;

      for (const p of pts) {
        // rotate Y then X
        let x = p.x * cyr - p.z * syr;
        let z = p.x * syr + p.z * cyr;
        const y = p.y * cxr - z * sxr;
        z = p.y * sxr + z * cxr;

        const persp = 1 / (2.1 - z);
        const sx = cx + x * scale * persp * 1.9;
        const sy = cy + y * scale * persp * 1.9;
        if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;

        const depth = (z + 1) / 2;               // 0 far … 1 near
        ctx.globalAlpha = 0.06 + depth * 0.42;
        ctx.fillStyle = depth > 0.72 ? '#4a86e8' : '#8ea0bd';
        ctx.beginPath();
        ctx.arc(sx, sy, p.s * persp * 1.5, 0, 6.283);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }

    function start() {
      build();
      if (reduced) { drawStill(); return; }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    }

    // Reduced motion still gets the image, just not the movement.
    function drawStill() { const k = t; t = 0.6; frame(); cancelAnimationFrame(raf); t = k; }

    addEventListener('resize', start, { passive: true });
    addEventListener('pointermove', e => {
      tx = (e.clientX / innerWidth - 0.5) * 2;
      ty = (e.clientY / innerHeight - 0.5) * 2;
    }, { passive: true });

    // Stop painting when the hero is off-screen.
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !reduced) { if (!raf) raf = requestAnimationFrame(frame); }
      else { cancelAnimationFrame(raf); raf = null; }
    }, { threshold: 0.02 });
    io.observe(cv);

    start();
  }

  /* ══════════ TIMELINE ══════════
     Duration data, so a horizontal span chart. Company carries the colour and
     is also written on every row, so identity never rests on hue alone. */

  const COMPANIES = {
    McKesson: '#4a86e8',
    'CAE': '#2f9e86',
    Presagis: '#9b7ede'
  };

  const ROLES = [
    { role: 'Software Developer',            co: 'McKesson', note: 'contract extension', from: '2026-08', to: '2026-12' },
    { role: 'Software Developer Intern',     co: 'McKesson', from: '2026-05', to: '2026-08' },
    { role: 'Cloud Engineer Intern',         co: 'CAE',      from: '2025-05', to: '2025-08' },
    { role: 'Software Developer Intern',     co: 'CAE',      from: '2024-09', to: '2025-05' },
    { role: 'Software Engineer Intern',      co: 'CAE',      note: '+ extension', from: '2023-08', to: '2024-09' },
    { role: 'Simulation Developer Intern',   co: 'Presagis', note: '+ extension', from: '2022-05', to: '2023-06' },
    { role: '3D Digital Twin Developer',     co: 'Presagis', from: '2021-06', to: '2022-05' }
  ];

  const months = s => { const [y, m] = s.split('-').map(Number); return y * 12 + (m - 1); };

  function timeline() {
    const host = $('#timeline');
    if (!host) return;

    const lo = months('2021-06'), hi = months('2027-01');
    const span = hi - lo;

    host.innerHTML = ROLES.map(r => {
      const a = (months(r.from) - lo) / span * 100;
      const b = (months(r.to)   - lo) / span * 100;
      const colour = COMPANIES[r.co];
      const label = new Date(r.from + '-01').toLocaleDateString('en-CA', { month: 'short', year: '2-digit' });
      return `<div class="tl-row">
        <div class="tl-label"><b>${r.role}</b>${r.co}${r.note ? ' · ' + r.note : ''}</div>
        <div class="tl-track">
          <div class="tl-bar" style="left:${a.toFixed(2)}%;width:${(b - a).toFixed(2)}%;background:${colour}"
               title="${r.role}, ${r.co}: ${r.from} to ${r.to}">${(b - a) > 9 ? label : ''}</div>
        </div>
      </div>`;
    }).join('');

    // Ticks are placed on the same month scale as the bars. Laying them out as
    // equal columns looks fine and is wrong: the range starts in June and ends
    // in January, so equal thirds would put every year in the wrong place.
    const years = [2022, 2023, 2024, 2025, 2026, 2027];
    const axis = $('#tl-axis');
    axis.style.gridTemplateColumns = '168px 1fr';
    axis.innerHTML = `<div></div><div style="position:relative;height:16px">` +
      years.map(y => {
        const pos = (months(y + '-01') - lo) / span * 100;
        return `<span class="tl-tick" style="position:absolute;left:${pos.toFixed(2)}%;transform:translateX(-50%)">${y}</span>`;
      }).join('') + `</div>`;

    $('#legend').innerHTML = Object.entries(COMPANIES).map(([co, c]) =>
      `<span class="legend-item"><span class="swatch" style="background:${c}"></span>${co}</span>`).join('');

    // Table alternative, for screen readers and anyone who wants the numbers.
    $('#tl-table').querySelector('tbody').innerHTML = ROLES.map(r =>
      `<tr><td>${r.role}</td><td>${r.co}</td><td>${r.from}</td><td>${r.to}</td></tr>`).join('');
  }

  /* ══════════ IMPACT ══════════
     Each figure measures a different system, so each is its own small multiple
     with its own scale. One shared axis would imply a comparability that is not
     there. Single hue throughout: this is magnitude, not identity. */

  const METRICS = [
    { v: 35, unit: '%', k: 'More configuration-governance coverage, by diffing Git-versioned assets across environments', src: 'CAE · PowerShell' },
    { v: 25, unit: '%', k: 'Fewer manual modelling hours, by automating digital-twin asset preparation', src: 'Presagis · Omniverse' },
    { v: 20, unit: '%', k: 'More LiDAR and infrared test coverage, adding and optimising C++ algorithms', src: 'CAE · C++' },
    { v: 20, unit: '%', k: 'Less data inconsistency in sensor streams, with validation and automated tests', src: 'CAE · C++' },
    { v: 15, unit: '%', k: 'Faster simulation platform, refactoring sensor processing with a Strategy redesign', src: 'CAE · profiling' },
    { v: 87, unit: '%', k: 'Less time on a recurring developer task — four hours down to thirty minutes', src: 'CAE · XML tooling', display: '4h→30m' }
  ];

  function impact() {
    const host = $('#impact-grid');
    if (!host) return;

    const D = 'M8 40 A 42 20 0 0 1 92 40';   // the arc both paths trace

    host.innerHTML = METRICS.map((m, i) => {
      // A single-value arc: thin mark, rounded ends, recessive track. The
      // dash length is set from the path's measured length after mount —
      // computing it as a circle's circumference would misreport an ellipse
      // and make every proportion subtly wrong.
      return `<div class="metric">
        <svg class="metric-fig" viewBox="0 0 100 46" role="img"
             aria-label="${m.display || m.v + m.unit}: ${m.k}">
          <path d="${D}" fill="none" stroke="var(--line-2)" stroke-width="3" stroke-linecap="round"/>
          <path d="${D}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"
                data-fill="${m.v}" style="transition:stroke-dasharray 1.1s cubic-bezier(.2,.7,.2,1)"/>
        </svg>
        <div class="metric-val">${m.display
          ? `<span style="font-size:32px">${m.display}</span>`
          : m.v + `<small>${m.unit}</small>`}</div>
        <div class="metric-k">${m.k}</div>
        <div class="metric-src">${m.src}</div>
      </div>`;
    }).join('');

    // Measure each arc and set its dash from the real length.
    host.querySelectorAll('path[data-fill]').forEach(p => {
      const len = p.getTotalLength();
      const on = (Number(p.dataset.fill) / 100) * len;
      p.setAttribute('stroke-dasharray', '0 ' + len.toFixed(1));
      // Animate in once the section is on screen.
      new IntersectionObserver(([e], io) => {
        if (!e.isIntersecting) return;
        p.setAttribute('stroke-dasharray', on.toFixed(1) + ' ' + len.toFixed(1));
        io.disconnect();
      }, { threshold: 0.3 }).observe(p);
    });
  }

  /* ══════════ SCROLL BEHAVIOUR ══════════ */

  function reveal() {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
    document.querySelectorAll('.rise').forEach(el => io.observe(el));
  }

  function navState() {
    const nav = $('#nav');
    addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', scrollY > 24);
    }, { passive: true });

    const links = Array.from(document.querySelectorAll('[data-nav]'));
    const spy = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        links.forEach(l => l.classList.toggle('on', l.dataset.nav === e.target.id));
      }
    }, { threshold: 0.3 });
    links.forEach(l => {
      const sec = document.getElementById(l.dataset.nav);
      if (sec) spy.observe(sec);
    });
  }

  field();
  timeline();
  impact();
  reveal();
  navState();
})();
