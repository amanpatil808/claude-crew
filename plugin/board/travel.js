// ===== Crew Room: one travel style per character. Inlined after room.js (same script), plugged in through window.crewTravel. =====
// Contract: crewTravel({ el, role, from:{x,y}, to:{x,y}, kind, reduced }) returns a Promise that resolves when el is at `to`, or undefined (reduced motion) so room.js keeps its default walk.
// Uses these room.js globals: rel, RSVG, rPlace, rDedupe, rLen, rRoute, rGeo, rAccess, rSleep, rFace, rKeyOf. Own rAF mover; transform and opacity only.
(() => {
  const W = () => RSVG("r-walkers");
  const easeIn = (p) => p * p, easeOut = (p) => 1 - (1 - p) * (1 - p), easeIO = (p) => (p < .5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p)), lin = (p) => p;
  const tPlace = (w, x, y) => { w._p = [x, y]; rPlace(w, x, y); };
  const tDir = (dx, dy) => Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  const side = (dir) => (dir === "left" ? -1 : 1);

  // ---- one-shot effect at a feet point, in the walkers layer (the Animation toggle clears it with the walkers) ----
  const BUDGET = 24, live = new Set();   // live: walkers on a trip now
  function tFx(cls, at, ms, o = {}) {
    const layer = W(); if (!layer) return null;
    if (![...live].some((w) => w.isConnected)) return null;   // the Animation toggle cleared the walkers mid-trip: no new effects
    const n = layer.querySelectorAll(".tfx").length;
    if (n >= BUDGET || (o.extra && n >= BUDGET - 4)) return null;   // trail and burst bits leave headroom, so a cover (puff, door, flare) always draws
    const e = rel("i", "tfx " + cls); e.setAttribute("aria-hidden", "true");
    for (let i = 0; i < (o.kids || 0); i++) e.append(rel("b"));
    for (const [k, v] of Object.entries(o.vars || {})) e.style.setProperty(k, v);
    e.style.setProperty("--ms", ms + "ms");
    e.style.transform = `translate3d(${Math.round(at[0])}px, ${Math.round(at[1])}px, 0)`;
    e.style.zIndex = String(10 + Math.round(at[1]) + (o.z || 0));
    layer.append(e); setTimeout(() => e.remove(), ms + 60); return e;
  }
  const up = (p, dy) => [p[0], p[1] - dy];
  const puff = (at, v = "smoke", ms = 480) => tFx("puff " + v, at, ms, { kids: 6, z: 2 });
  function burst(at, cls, n, ms, spread = 26, rise = -18) {
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + .4; tFx("bit " + cls, at, ms, { extra: true, kids: 1, z: 3, vars: { "--dx": Math.round(Math.cos(a) * spread) + "px", "--dy": Math.round(Math.sin(a) * spread * .6 + rise) + "px", "--r": (i % 2 ? 1 : -1) * (120 + i * 30) + "deg" } }); }
  }
  function door(at, colour, wpx, hpx, ms) {
    const d = tFx("door", up(at, 4), ms, { z: -6, vars: { "--dc": colour, "--dw": wpx + "px", "--dh": hpx + "px" } }); if (!d) return null;
    const g = rel("b", "dg"), pn = rel("b", "pn"), lp = rel("b", "lp"); g.append(pn); d.append(g); g.append(lp); return d;
  }
  function tProp(w, cls, kids = 0) { const p = rel("i", "tp " + cls); p.setAttribute("aria-hidden", "true"); for (let i = 0; i < kids; i++) p.append(rel("b")); w.querySelector(".fig").append(p); return p; }
  const dropProp = async (p) => { if (!p) return; p.classList.add("out"); await rSleep(250); p.remove(); };
  const pose = async (w, cls, ms) => { w.classList.add(cls); await rSleep(ms); w.classList.remove(cls); };

  // ---- polyline slice by distance ----
  function tSlice(pts, d0, d1) {
    const out = []; let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!L) continue;
      const s = Math.max(d0, acc), e = Math.min(d1, acc + L);
      if (e >= s) { const at = (d) => [a[0] + (b[0] - a[0]) * (d - acc) / L, a[1] + (b[1] - a[1]) * (d - acc) / L]; if (!out.length) out.push(at(s)); out.push(at(e)); }
      acc += L;
    }
    return rDedupe(out.length ? out : [pts[0]]);
  }

  // ---- duration-based leg: position, facing, step frames, lift curve, trail bits ----
  function tLeg(w, pts, o = {}) {
    pts = rDedupe(pts); if (pts.length < 2) return Promise.resolve();
    const seg = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1])), L = seg.reduce((a, b) => a + b, 0);
    const ease = o.ease || easeIO, ms = Math.max(120, o.ms || 400);
    if (o.go) w.classList.add(o.go);
    w.style.setProperty("--leg", ms + "ms");
    if (o.hop) w.style.setProperty("--hop", o.hop + "ms");
    let next = o.trail ? o.trail.every * .5 : Infinity, n = 0;
    return new Promise((res) => {
      const t0 = performance.now();
      const f = (now) => {
        if (!w.isConnected) return res();
        const p = Math.max(0, Math.min(1, (now - t0) / ms)), d0 = ease(p) * L;
        let d = d0, i = 0; while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
        const a = pts[i], b = pts[i + 1], k = seg[i] ? d / seg[i] : 1, dx = b[0] - a[0], dy = b[1] - a[1];
        tPlace(w, a[0] + dx * k, a[1] + dy * k);
        if (!o.keepDir) w.dataset.dir = tDir(dx, dy);
        w.style.setProperty("--lift", -Math.round(o.lift ? o.lift(p) : 0) + "px");
        w.dataset.frame = o.stride ? String(Math.floor(d0 / o.stride) % 4) : "s";
        const tr = o.trail;
        while (tr && d0 >= next && n < (tr.max || 0)) { if (!(tr.flat && Math.abs(dy) > Math.abs(dx))) tFx("bit " + tr.cls, up(w._p, tr.y || 0), tr.ms || 800, { extra: true, kids: 1, z: tr.z ?? -2, vars: tr.vars ? tr.vars(n) : {} }); n++; next += tr.every; }
        if (p < 1) requestAnimationFrame(f); else { if (o.go) w.classList.remove(o.go); w.dataset.frame = "s"; res(); }
      };
      requestAnimationFrame(f);
    });
  }

  // ---- the two trip shapes: near plays the whole path; cut shows a short exit leg, a cover, and a short enter leg ----
  const NEAR = 520, EXIT = 110, GAP = 90;
  const legOf = (st, extra, len, ms, ease) => ({ ...st.leg, ...(st.legFor ? st.legFor(len, ms) : {}), ...(extra || {}), ms, ease });
  async function tCut(w, path, st, dir) {
    const L = rLen(path), tele = !!st.teleport, ex = tele ? 0 : Math.min(st.exit ?? EXIT, L / 2), en = tele ? 0 : Math.min(st.enter ?? EXIT, L / 2);
    const out = tSlice(path, 0, ex), inn = tSlice(path, L - en, L), end = path.at(-1);
    tPlace(w, ...path[0]);
    await st.depart?.(w, dir, "cut");
    if (ex) await tLeg(w, out, legOf(st, st.exitLeg, ex, st.exitMs ?? 320, easeIn));
    await st.vanish?.(w, dir);
    w.style.visibility = "hidden";
    await rSleep(st.gap ?? GAP);
    tPlace(w, ...(en ? inn[0] : end)); w.dataset.dir = dir;
    await st.appear?.(w, dir);
    w.style.visibility = "";
    if (en) await tLeg(w, inn, legOf(st, st.enterLeg, en, st.enterMs ?? 320, easeOut));
    tPlace(w, ...end);
    if (st.face && !st.teleport) rFace(w, st.face);
    await st.arrive?.(w, dir);
  }
  async function tNear(w, path, st, dir) {
    const L = rLen(path), ms = Math.max(350, Math.min(1000, (L / (st.speed || 560)) * 1000));
    tPlace(w, ...path[0]);
    await st.depart?.(w, dir, "near");
    await tLeg(w, path, legOf(st, st.nearLeg, L, ms, st.leg?.ease || easeIO));
    tPlace(w, ...path.at(-1));
    if (st.face) rFace(w, st.face);
    await st.arrive?.(w, dir);
  }

  // ---- the crew: one style each ----
  const T = {};
  T.doraemon = { id: "copter", air: true, speed: 620,
    leg: { lift: (p) => 44 * Math.sin(Math.PI * p) },
    exitLeg: { lift: (p) => 8 + 60 * p }, enterLeg: { lift: (p) => 68 * (1 - p) },
    async depart(w) { w._hat = tProp(w, "copterhat"); w.style.setProperty("--lift", "0px"); await rSleep(220); },
    async vanish(w) { puff(up(w._p, 60), "smoke", 420); await rSleep(60); },
    async arrive(w) { w._hat?.classList.add("stow"); await rSleep(240); w._hat?.remove(); },
  };
  T["miguel-rivera"] = { id: "marigold", air: true, speed: 520,
    leg: { lift: (p) => 22 * Math.sin(Math.PI * p), trail: { cls: "petal", every: 20, max: 8, ms: 900, z: -1, vars: (i) => ({ "--dx": (i % 2 ? 5 : -5) + "px", "--dy": "14px", "--r": (i % 2 ? 200 : -160) + "deg" }) }, stride: 15 },
    exitLeg: { lift: (p) => 26 * p }, enterLeg: { lift: (p) => 26 * (1 - p) },
    async depart(w) { const g = tProp(w, "guitar"); w._g = g; g.classList.add("strum"); burst(up(w._p, 30), "petal", 6, 700, 22, -14); await rSleep(420); },
    async vanish(w) { burst(up(w._p, 50), "petal gold", 8, 650, 24, -6); await rSleep(120); },
    async appear(w) { burst(up(w._p, 50), "petal", 8, 650, 24, -6); await rSleep(120); },
    async arrive(w) { w._g?.classList.add("strum"); burst(up(w._p, 34), "petal", 4, 700, 18, -16); await rSleep(300); await dropProp(w._g); },
  };
  T.nobita = { id: "late", speed: 560,
    leg: { stride: 7, go: "go-run", trail: { cls: "dust", every: 26, max: 8, ms: 500, y: 2 } },
    async depart(w) { w._s = tProp(w, "sweat"); await pose(w, "p-squash", 180); },
    async vanish(w) { puff(w._p, "dust", 420); await rSleep(80); },
    async appear(w) { puff(w._p, "dust", 420); await rSleep(80); },
    async arrive(w) { w.classList.add("p-trip"); await rSleep(300); puff(w._p, "dust small", 360); await rSleep(400); w.classList.remove("p-trip"); w._s?.remove(); },
  };
  T.shinchan = { id: "wiggle", speed: 560,
    leg: { stride: 9, go: "go-wiggle" },
    async depart(w) { const d = w.querySelector(".dog"); puff(w._p, "snow small", 300); d?.classList.add("ball"); await rSleep(200); },
    async vanish(w) { puff(w._p, "dust", 420); await rSleep(80); },
    async appear(w) { puff(w._p, "dust", 420); await rSleep(80); },
    async arrive(w) { const d = w.querySelector(".dog"); w.classList.add("p-pose"); await rSleep(250); puff([w._p[0] - 20, w._p[1]], "snow small", 300); d?.classList.remove("ball"); await rSleep(260); w.classList.remove("p-pose"); },
  };
  const hopsFor = (L) => Math.max(2, Math.min(5, Math.round(L / 80)));
  T.kevin = { id: "pogo", air: true, speed: 420,
    leg: { ease: lin, go: "go-pogo" },
    exitLeg: { lift: (p) => 14 + (p < .5 ? 22 * Math.sin(Math.PI * p * 2) : 120 * (p - .5) * (p - .5) * 4) },
    enterLeg: { lift: (p) => 14 + (p < .5 ? 60 * (1 - p * 2) * (1 - p * 2) : 22 * Math.sin(Math.PI * (p - .5) * 2)) },
    legFor: (L, ms) => { const h = hopsFor(L); return { lift: (p) => 14 + 22 * Math.abs(Math.sin(Math.PI * h * p)), hop: ms / h }; },
    async depart(w) { w._pg = tProp(w, "pogo", 1); w.style.setProperty("--lift", "-14px"); await pose(w, "p-squash", 180); },
    async vanish(w) { burst(up(w._p, 70), "star", 5, 450, 20, -10); await rSleep(80); },
    async appear(w) { burst(up(w._p, 70), "star", 5, 450, 20, -10); await rSleep(80); },
    async arrive(w) { await pose(w, "p-squash", 180); w.style.setProperty("--lift", "0px"); await dropProp(w._pg); },
  };
  T.bob = { id: "scurry", speed: 520,
    leg: { stride: 5, go: "go-scurry", trail: { cls: "dust", every: 18, max: 10, ms: 420, y: 1 } },
    async depart(w) { w._t = tProp(w, "tim", 1); await pose(w, "p-squash", 160); },
    async vanish(w) { puff(w._p, "dust", 420); await rSleep(80); },
    async appear(w) { puff(w._p, "dust", 420); await rSleep(80); },
    async arrive(w) { w.classList.add("p-hug"); burst(up(w._p, 56), "heart", 1, 700, 0, -18); await rSleep(500); w.classList.remove("p-hug"); w._t?.remove(); },
  };
  T.stuart = { id: "peel", speed: 600,
    leg: { go: "go-slide", trail: { cls: "skid", every: 12, max: 14, ms: 700, y: 0, z: -3 } },
    async depart(w, dir) { tFx("peel", [w._p[0] + side(dir) * 16, w._p[1]], 300, { kids: 1, z: -1 }); await rSleep(300); w._pl = tProp(w, "peel"); },
    async vanish(w) { puff(w._p, "dust", 420); await rSleep(80); },
    async appear(w) { puff(w._p, "dust", 420); await rSleep(80); },
    async arrive(w, dir) { w.classList.add("p-spin"); await rSleep(250); w._pl?.remove(); tFx("bit peelfly", w._p, 600, { kids: 1, z: 3, vars: { "--dx": side(dir) * 18 + "px" } }); await rSleep(260); w.classList.remove("p-spin"); },
  };
  const doorStyle = (colour, wpx, hpx, duck) => ({ id: duck ? "door-duck" : "door-wink", teleport: true, always: true, gap: 60,
    async depart(w) { door(w._p, colour, wpx, hpx, 900); await rSleep(240); w.dataset.dir = "up"; if (duck) w.classList.add("p-duck"); w.classList.add("p-in"); await tLeg(w, [w._p, up(w._p, 8)], { ms: 200, keepDir: true, stride: 4 }); },
    async vanish() { await rSleep(20); },
    async appear(w) { door(w._p, colour, wpx, hpx, 900); w.style.visibility = "hidden"; await rSleep(260); tPlace(w, ...up(w._p, 8)); w.dataset.dir = "down"; w.classList.add("p-in"); },
    async arrive(w) { await rSleep(20); w.classList.remove("p-in"); await tLeg(w, [w._p, [w._p[0], w._p[1] + 8]], { ms: 220, keepDir: true, stride: 4 }); w.classList.remove("p-duck"); if (!duck) { const av = w.querySelector(".av"); av.dataset.s = "queued"; await rSleep(160); av.dataset.s = "walk"; } await rSleep(200); },
  });
  T["mike-wazowski"] = doorStyle("#5aa24a", 50, 64, false);
  T.sulley = doorStyle("#6a4aa8", 58, 76, true);
  T["ninja-hattori"] = { id: "smoke", air: true, teleport: true, speed: 700, gap: 120,
    leg: { lift: (p) => 56 * Math.sin(Math.PI * p), go: "go-flip" },
    async depart(w, dir, kind) { await pose(w, "p-squash", 140); if (kind === "near") puff(w._p, "smoke small", 360); },
    async vanish(w) { puff(up(w._p, 30), "smoke", 480); await rSleep(110); },
    async appear(w) { puff(up(w._p, 30), "smoke", 480); const d = w.querySelector(".dog"); if (d) d.style.visibility = "hidden"; await rSleep(110); setTimeout(() => { if (!d) return; puff([w._p[0] - 22, w._p[1]], "smoke small", 360); d.style.visibility = ""; }, 260); },
    async arrive(w) { puff(w._p, "smoke small", 300); await pose(w, "p-squash", 160); await rSleep(220); },
  };
  T["joe-gardner"] = { id: "soul", air: true, speed: 480,
    leg: { lift: (p) => 10 + 6 * Math.sin(Math.PI * p), trail: { cls: "note", every: 30, max: 8, ms: 800, y: 40, z: 2, vars: (i) => ({ "--dx": (i % 2 ? 8 : -6) + "px", "--dy": "-16px", "--r": (i % 2 ? 12 : -12) + "deg", "--nc": i % 2 ? "#1F7FD6" : "#7A4DB8" }) } },
    exitLeg: { lift: (p) => 10 + 20 * p }, enterLeg: { lift: (p) => 30 - 20 * p },
    async depart(w) { w.classList.add("tv-soul"); const av = w.querySelector(".av"); av.dataset.s = "done"; w.style.setProperty("--lift", "-10px"); await rSleep(320); },
    async vanish(w) { tFx("bit flare", up(w._p, 50), 360, { kids: 1, z: 3 }); await rSleep(120); },
    async appear(w) { tFx("bit flare", up(w._p, 50), 360, { kids: 1, z: 3 }); await rSleep(120); },
    async arrive(w) { w.style.setProperty("--lift", "0px"); await rSleep(160); w.classList.remove("tv-soul"); w.querySelector(".av").dataset.s = "walk"; },
  };
  T["twenty-two"] = { id: "drift", air: true, speed: 440,
    leg: { lift: (p) => 18 + 4 * Math.sin(Math.PI * p), go: "go-drift" },
    exitLeg: { lift: (p) => 18 + 16 * p }, enterLeg: { lift: (p) => 34 - 16 * p },
    async depart(w) { w.classList.add("tv-soul"); w.style.setProperty("--lift", "-18px"); await rSleep(220); },
    async vanish(w) { tFx("bit flare", up(w._p, 40), 360, { kids: 1, z: 3 }); await rSleep(120); },
    async appear(w) { tFx("bit flare", up(w._p, 40), 360, { kids: 1, z: 3 }); await rSleep(120); },
    async arrive(w) { w.style.setProperty("--lift", "0px"); w.classList.add("p-upright"); burst(up(w._p, 26), "star", 5, 520, 18, -14); await rSleep(380); w.classList.remove("p-upright", "tv-soul"); },
  };
  T.dekisugi = { id: "sprint", speed: 640,
    leg: { stride: 11, go: "go-sprint" },
    async depart(w) { await pose(w, "p-squash", 150); },
    async vanish(w, dir) { tFx("bit speed", w._p, 360, { kids: 3, z: 2, vars: { "--dx": -side(dir) * 10 + "px" } }); await rSleep(60); },
    async appear(w, dir) { tFx("bit speed", w._p, 360, { kids: 3, z: 2, vars: { "--dx": -side(dir) * 10 + "px" } }); await rSleep(60); },
    async arrive(w) { w.classList.add("p-bow"); await rSleep(220); burst(up(w._p, 64), "star", 1, 600, 0, -14); await rSleep(430); w.classList.remove("p-bow"); },
  };
  T.olaf = { id: "flurry", speed: 520,
    leg: { go: "go-glide", trail: { cls: "snow", every: 13, max: 10, ms: 700, y: 0, z: -3, flat: true } },
    async depart(w) { w._f = tProp(w, "flurry", 3); await rSleep(260); },
    async vanish(w) { puff(w._p, "snow", 440); await rSleep(80); },
    async appear(w) { puff(w._p, "snow", 440); await rSleep(80); },
    async arrive(w) { puff(w._p, "snow small", 320); await pose(w, "p-headpop", 500); await dropProp(w._f); },
  };
  T.shizuka = { id: "bubbles", speed: 500,
    leg: { go: "go-skip", trail: { cls: "bubble", every: 22, max: 10, ms: 900, y: 30, z: 2, vars: (i) => ({ "--dx": (i % 2 ? 6 : -6) + "px", "--dy": "-24px" }) } },
    legFor: (L) => ({ lift: (p) => 9 * Math.abs(Math.sin(Math.PI * Math.max(1, Math.round(L / 40)) * p)) }),
    async depart(w) { burst(up(w._p, 40), "bubble", 3, 700, 14, -20); await rSleep(200); },
    async vanish(w) { burst(up(w._p, 36), "bubble", 6, 600, 18, -16); await rSleep(100); },
    async appear(w) { burst(up(w._p, 36), "bubble", 6, 600, 18, -16); await rSleep(100); },
    async arrive(w) { await pose(w, "p-curtsey", 450); },
  };
  // anyone else (retired or unknown roles): today's walk, with dust puffs on a cut
  const WALK = { id: "walk", speed: 400, leg: { stride: 15 }, async vanish(w) { puff(w._p, "dust", 400); await rSleep(80); }, async appear(w) { puff(w._p, "dust", 400); await rSleep(80); } };

  // ---- the route: room.js hands over only the two end points, so find the desks they belong to and ask rRoute for the corridor path ----
  const close = (p, q) => Math.abs(p[0] - q[0]) < 2 && Math.abs(p[1] - q[1]) < 2;
  function tRoute(from, to) {
    try {
      const g = rGeo(), acc = [...document.querySelectorAll("#r-rooms .desk")].map((d) => { try { return rAccess(d, g); } catch { return null; } }).filter(Boolean);
      const find = (p) => { for (const a of acc) { if (close(p, a.seat)) return [a, "seat"]; if (close(p, a.stand)) return [a, "stand"]; } return null; };
      const A = find(from), B = find(to);
      if (A && B && A[0] !== B[0]) return { route: rRoute(A[0], B[0], g.corr / 2, A[1], B[1]), b: B[0], toKind: B[1] };
    } catch (e) { /* fall through to the elbow */ }
    return { route: rDedupe([from, [to[0], from[1]], to]), b: null, toKind: "seat" };
  }

  // ---- entry point ----
  window.crewTravel = function ({ el: w, role, from, to, reduced }) {
    if (reduced || !w || !w.isConnected) return undefined;   // reduced motion or Animation off: room.js keeps its default walk
    const fig = w.querySelector(".fig"), av = fig?.querySelector(":scope > .av");
    if (!fig) return undefined;
    if (av) { const tv = rel("span", "tv"); fig.insertBefore(tv, av); tv.append(av); }   // the pose layer between .fig (flip, lift) and .av (scale)
    const key = rKeyOf(role) || "", st = T[key] || WALK, f = [from.x, from.y], t = [to.x, to.y];
    const { route, b, toKind } = tRoute(f, t);
    const path = st.air ? rDedupe([route[0], route.at(-1)]) : route, L = rLen(path);
    if (L < 2) return Promise.resolve();
    const dir = tDir(path.at(-1)[0] - path[0][0], path.at(-1)[1] - path[0][1]);
    const near = !st.always && L <= NEAR;
    const face = toKind === "stand" ? (b && b.side > 0 ? "left" : "right") : "down";
    const st2 = { ...st, face };
    w._p = f; w.dataset.tv = st.id; live.add(w);
    return (async () => {
      try { await (near ? tNear : tCut)(w, path, st2, dir); }
      finally {
        live.delete(w);
        w.style.visibility = ""; w.style.setProperty("--lift", "0px"); delete w.dataset.tv;
        const d = w.querySelector(".dog"); if (d) { d.style.visibility = ""; d.classList.remove("ball"); }
        // the same walker makes the way back: leave it clean
        for (const c of [...w.classList]) if (/^(go-|p-|tv-)/.test(c)) w.classList.remove(c);
        w.querySelectorAll(".tp").forEach((p) => p.remove()); const a2 = w.querySelector(".av"); if (a2) a2.dataset.s = "walk";
        if (w.isConnected) tPlace(w, ...t);
      }
    })();
  };
  // ---- motion off or reduced: the desk note gains the mover's glyph; a visit pins the visitor, not always Doraemon ----
  if (typeof rStatic === "function") {
    const orig = rStatic;
    rStatic = function (job) {
      const plateOf = () => rDeskEl(job.kind === "report" ? job.role : job.to, job.proj)?.querySelector(".plate");
      const before = new Set(plateOf()?.querySelectorAll(".pin") || []);
      orig(job);
      try {
        const plate = plateOf(); if (!plate) return;
        const mover = job.kind === "task" ? MGR : job.role;
        if (job.kind !== "report" && job.kind !== "task" && mover && mover !== MGR) {
          for (const p of plate.querySelectorAll(".pin")) if (!before.has(p)) { const mini = rMini(mover, "working", 0); mini.classList.add("pin"); p.replaceWith(mini); setTimeout(() => mini.remove(), 4000); }
        }
        const g = rel("i", "tg tg-" + (T[rKeyOf(mover)] || WALK).id); g.setAttribute("aria-hidden", "true");
        plate.append(g); setTimeout(() => g.remove(), 4000);
      } catch (e) { console.error("travel glyph", e); }
    };
  }
  window.crewTravelStyles = T;   // for the film and timing scripts
})();
