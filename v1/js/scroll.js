// Touch-like scrolling for mouse users: drag to scroll with inertia and rubber-banding.
// Touch/trackpad scrolling stays native; this only handles mouse drags.

export function dragScroll(el, { axis = 'y' } = {}) {
  el.classList.add('scroll', axis === 'x' ? 'scroll-x' : 'scroll-y');
  const isY = axis === 'y';
  let down = false, dragging = false, start = 0, startScroll = 0, last = 0, lastT = 0, vel = 0, raf = 0, pid = null;
  const inner = () => el.firstElementChild;
  const max = () => isY ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
  const pos = () => isY ? el.scrollTop : el.scrollLeft;
  const setPos = v => { if (isY) el.scrollTop = v; else el.scrollLeft = v; };
  const bounce = px => {
    const c = inner(); if (!c) return;
    c.style.transform = px ? (isY ? `translate3d(0,${px}px,0)` : `translate3d(${px}px,0,0)`) : '';
    c.style.willChange = px ? 'transform' : '';
  };
  let over = 0;

  el.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (e.target.closest('input,textarea,select,[data-nodrag],.slider')) return;
    cancelAnimationFrame(raf);
    down = true; dragging = false; pid = e.pointerId;
    start = last = isY ? e.clientY : e.clientX; lastT = performance.now();
    startScroll = pos() - over * 0; vel = 0;
  });
  el.addEventListener('pointermove', e => {
    if (!down || e.pointerId !== pid) return;
    const p = isY ? e.clientY : e.clientX;
    const scale = el.getBoundingClientRect().width / el.offsetWidth || 1; // account for device scale
    if (!dragging && Math.abs(p - start) > 6 * scale) {
      dragging = true; el.setPointerCapture(pid);
      el.classList.add('dragging');
    }
    if (!dragging) return;
    const now = performance.now(), dt = Math.max(1, now - lastT);
    const dp = (p - last) / scale;
    vel = vel * .6 + (dp / dt) * .4 * 16; // px per frame
    last = p; lastT = now;
    let target = startScroll - (p - start) / scale;
    const m = max();
    if (target < 0) { over = -target; target = 0; setPos(0); bounce(Math.pow(over, .8) * 1.1); }
    else if (target > m) { over = target - m; setPos(m); bounce(-Math.pow(over, .8) * 1.1); }
    else { over = 0; bounce(0); setPos(target); }
  });
  const end = e => {
    if (!down || (e && e.pointerId !== pid)) return;
    down = false;
    if (!dragging) return;
    try { el.releasePointerCapture(pid); } catch { /* */ }
    el.classList.remove('dragging');
    // swallow the click that follows a drag
    const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
    el.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => el.removeEventListener('click', swallow, true), 60);
    dragging = false;
    const m = max();
    let v = vel; let ov = over;
    const step = () => {
      if (ov > 0.3) { // spring back from the rubber band
        ov *= .82; const dir = pos() <= 0 ? 1 : -1;
        bounce(dir * Math.pow(ov, .8) * 1.1);
        if (ov < 0.3) { ov = 0; over = 0; bounce(0); return; }
        raf = requestAnimationFrame(step); return;
      }
      if (Math.abs(v) < .15) { over = 0; return; }
      let t = pos() - v; v *= .95;
      if (t < 0) { t = 0; ov = Math.abs(v) * 6; v = 0; setPos(0); raf = requestAnimationFrame(step); return; }
      if (t > m) { t = m; ov = Math.abs(v) * 6; v = 0; setPos(m); raf = requestAnimationFrame(step); return; }
      setPos(t); raf = requestAnimationFrame(step);
    };
    over = 0;
    if (ov > 0 || Math.abs(v) > .3) raf = requestAnimationFrame(step);
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  return el;
}

/** Generic 1-D drag helper with velocity: calls back with delta and final velocity (px/ms). */
export function dragGesture(el, { onStart, onMove, onEnd, lock = 6, filter } = {}) {
  let st = null;
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (filter && !filter(e)) return;
    st = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), lx: e.clientX, ly: e.clientY, lt: performance.now(), vx: 0, vy: 0, active: false, target: e.target };
  });
  el.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    const s = el.closest('[data-scale]') ? 1 : 1;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    const k = window.__scale || 1;
    if (!st.active) {
      if (Math.hypot(dx, dy) < lock * k) return;
      st.active = true; try { el.setPointerCapture(st.id); } catch { /* */ }
      if (onStart && onStart({ dx: dx / k, dy: dy / k, e }) === false) { st = null; return; }
    }
    const now = performance.now(), dt = Math.max(1, now - st.lt);
    st.vx = st.vx * .5 + ((e.clientX - st.lx) / k / dt) * .5;
    st.vy = st.vy * .5 + ((e.clientY - st.ly) / k / dt) * .5;
    st.lx = e.clientX; st.ly = e.clientY; st.lt = now;
    onMove && onMove({ dx: dx / k, dy: dy / k, vx: st.vx, vy: st.vy, e });
  });
  const up = e => {
    if (!st || e.pointerId !== st.id) return;
    const s = st; st = null;
    if (!s.active) return;
    try { el.releasePointerCapture(s.id); } catch { /* */ }
    const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
    el.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => el.removeEventListener('click', swallow, true), 60);
    const k = window.__scale || 1;
    onEnd && onEnd({ dx: (e.clientX - s.x) / k, dy: (e.clientY - s.y) / k, vx: s.vx, vy: s.vy, e });
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
