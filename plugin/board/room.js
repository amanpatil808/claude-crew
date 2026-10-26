// Crew Room board: one page, five sections (Active, Queued, Crew, Recent, Facts), fed from /api/state.
// Counts and the task lists come only from state.tasks, filtered by the picked project. All text goes in with textContent.
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const hm = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
const mins = (iso) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
const span = (m) => m < 1 ? "now" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
const store = {   // storage can be blocked, so every access is guarded
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  put: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// ---- Faces: each role's character, keyed by the agent file name. Only the kind is needed; colours live in the CSS. ----
const CREW = {
  doraemon: "cat", "miguel-rivera": "miguel", nobita: "nobita", shinchan: "kid", kevin: "kevin", bob: "bobm",
  "mike-wazowski": "mike", sulley: "sulley", "ninja-hattori": "ninja", "joe-gardner": "joe", "twenty-two": "ttwo",
  dekisugi: "dekisugi", olaf: "olaf", shizuka: "girl", stuart: "stuart",
};
const MGR = "doraemon";   // the lead is the session itself, never a task, so he is not listed in the Crew

const KINDS = {
  cat: ["head", "face", "eye l", "eye r", "blush l", "blush r", "nose", "whisk", "collar", "bell"],
  ninja: ["body", "hood", "face", "band", "knot", "eye l", "eye r", "blush l", "blush r"],
  dekisugi: ["body", "tie", "head", "hair", "part", "eye l", "eye r", "blush l", "blush r", "smile"],
  nobita: ["body", "head", "hair", "glass l", "glass r", "eye l", "eye r", "blush l", "blush r", "smile"],
  kid: ["body", "head", "hair", "brow l", "brow r", "eye l", "eye r", "blush l", "blush r", "grin"],
  girl: ["body", "pig l", "pig r", "tie l", "tie r", "head", "hair", "eye l", "eye r", "blush l", "blush r", "smile"],
  miguel: ["body", "hood", "head", "hair", "eye l", "eye r", "blush l", "blush r", "smile"],
  kevin: ["body", "over", "strap", "hair", "eye l", "eye r", "mouth"],
  bobm: ["body", "over", "strap", "hair", "eye l", "eye r", "mouth"],
  stuart: ["body", "over", "strap", "hair", "eye c", "mouth"],
  olaf: ["arm l", "arm r", "low", "head", "hair", "eye l", "eye r", "nose", "smile", "btn"],
};

// ---- Film look (Mike, Sulley, Joe, 22): one smooth inline SVG in the 48x54 .av box (viewBox 60x68).
// Markup is a fixed string built here (no data in it); ids carry a counter so every avatar owns its gradients.
let flN = 0;
const flDrop = (x, y) => `<path class="fl-drop" d="M${x} ${y} Q${x - 2.6} ${y + 4.2} ${x} ${y + 5.6} Q${x + 2.6} ${y + 4.2} ${x} ${y} Z" fill="#6EC8FF" stroke="#2C83A8" stroke-width=".7"/>`;
// Sulley's fluffy outline: a broad superellipse with a soft bump between every pair of points.
function flFur(cx, cy, rx, ry, n, bumps, puff) {
  const pt = (a, k) => { const c = Math.cos(a), s = Math.sin(a); return [cx + k * rx * Math.sign(c) * Math.abs(c) ** (2 / n), cy + k * ry * Math.sign(s) * Math.abs(s) ** (2 / n)]; };
  let d = "";
  for (let i = 0; i <= bumps; i++) {
    const a = -Math.PI / 2 + (i / bumps) * 2 * Math.PI, [x, y] = pt(a, 1);
    if (i === 0) { d += `M${x.toFixed(1)} ${y.toFixed(1)}`; continue; }
    const [qx, qy] = pt(a - Math.PI / bumps, puff);
    d += ` Q${qx.toFixed(1)} ${qy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d + " Z";
}
const SULLEY_FUR = flFur(30, 39, 26.5, 27, 2.7, 30, 1.09);
const FILM = {
  mike(n) {
    return `<defs><radialGradient id="mk${n}" cx=".38" cy=".3" r=".78"><stop offset="0" stop-color="#C8F59A"/><stop offset=".55" stop-color="#9BE15D"/><stop offset="1" stop-color="#6DBF3A"/></radialGradient></defs>
      <path d="M24.5 53 L23.5 62.5 M35.5 53 L36.5 62.5" stroke="#5E9E33" stroke-width="2.4" stroke-linecap="round"/>
      <ellipse cx="22" cy="64" rx="4.2" ry="2.1" fill="#5E9E33" stroke="#2E5A1C" stroke-width=".8"/><ellipse cx="38" cy="64" rx="4.2" ry="2.1" fill="#5E9E33" stroke="#2E5A1C" stroke-width=".8"/>
      <path d="M9.5 35 Q4.5 40 5.5 46.5 M50.5 35 Q55.5 40 54.5 46.5" stroke="#5E9E33" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <circle cx="5.6" cy="47.6" r="2.3" fill="#6DBF3A" stroke="#2E5A1C" stroke-width=".8"/><circle cx="54.4" cy="47.6" r="2.3" fill="#6DBF3A" stroke="#2E5A1C" stroke-width=".8"/>
      <path d="M18.5 14.5 Q15.5 8.5 18.6 5 Q20.6 9.5 23.4 12.4 Z" fill="#F1E6C0" stroke="#2E5A1C" stroke-width="1" stroke-linejoin="round"/>
      <path d="M41.5 14.5 Q44.5 8.5 41.4 5 Q39.4 9.5 36.6 12.4 Z" fill="#F1E6C0" stroke="#2E5A1C" stroke-width="1" stroke-linejoin="round"/>
      <circle cx="30" cy="32" r="22" fill="url(#mk${n})" stroke="#2E5A1C" stroke-width="1.6"/>
      <g class="fl-eyes open"><circle cx="30" cy="26" r="11" fill="#fff" stroke="#2E5A1C" stroke-width="1.4"/><circle cx="30" cy="27" r="6.6" fill="#3FA34D" stroke="#2A7A36" stroke-width="1"/><circle cx="30" cy="27" r="3.2" fill="#14210F"/><circle cx="27.3" cy="24.2" r="2" fill="#fff"/><circle cx="32.7" cy="29.6" r=".9" fill="#fff"/></g>
      <g class="fl-eyes happy"><path d="M20.5 28 Q30 17.5 39.5 28" stroke="#2E5A1C" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>
      <g class="fl-eyes shut"><path d="M20.5 27 Q30 31 39.5 27" stroke="#2E5A1C" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>
      <ellipse cx="14.5" cy="37.5" rx="3" ry="1.8" fill="#FF9DB0" opacity=".75"/><ellipse cx="45.5" cy="37.5" rx="3" ry="1.8" fill="#FF9DB0" opacity=".75"/>
      <path d="M17.5 38 Q30 40.5 42.5 38 Q40.5 48.5 30 48.5 Q19.5 48.5 17.5 38 Z" fill="#3A1F2B" stroke="#2E5A1C" stroke-width="1" stroke-linejoin="round"/>
      <path d="M19 38.7 Q30 40.9 41 38.7 L40.5 41 Q30 42.8 19.5 41 Z" fill="#fff"/>
      <path d="M24 47.4 Q30 42.6 36 47.4 Q30 48.9 24 47.4 Z" fill="#E8727F"/>
      ${flDrop(52, 10)}`;
  },
  sulley(n) {
    const eye = (x) => `<g class="fl-eyes open"><ellipse cx="${x}" cy="27" rx="3.4" ry="3.7" fill="#fff" stroke="#1E4E60" stroke-width=".8"/><circle cx="${x + .4}" cy="27.6" r="2.3" fill="#2F7FD0"/><circle cx="${x + .4}" cy="27.6" r="1.1" fill="#101828"/><circle cx="${x - .5}" cy="26.4" r=".8" fill="#fff"/></g>`
      + `<g class="fl-eyes happy"><path d="M${x - 3.2} 28.6 Q${x} 24.4 ${x + 3.2} 28.6" stroke="#1E2A40" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>`
      + `<g class="fl-eyes shut"><path d="M${x - 3.2} 27.8 Q${x} 29.6 ${x + 3.2} 27.8" stroke="#1E2A40" stroke-width="1.5" fill="none" stroke-linecap="round"/></g>`;
    const paw = (x, flip) => `<g transform="translate(${x} 53) scale(${flip} 1)"><ellipse cx="0" cy="0" rx="7.2" ry="6.2" fill="#3FB0C6" stroke="#1E4E60" stroke-width="1.2"/><path d="M-4.2 5 l.9 -2.6 l1 2.7 M-.5 5.8 l.9 -2.7 l1 2.8 M3.2 5 l.9 -2.6 l1 2.6" fill="#F1E3B0" stroke="#F1E3B0" stroke-width="1" stroke-linejoin="round"/></g>`;
    return `<defs><radialGradient id="sg${n}" cx=".36" cy=".26" r=".85"><stop offset="0" stop-color="#9AE6F0"/><stop offset=".5" stop-color="#5CC8DB"/><stop offset="1" stop-color="#3AA6BC"/></radialGradient><clipPath id="sc${n}"><path d="${SULLEY_FUR}"/></clipPath></defs>
      <path d="M19 14.5 Q15.6 8.4 19.4 4.6 Q20.6 9.6 24 12.6 Z" fill="#F1E3B0" stroke="#1E4E60" stroke-width="1" stroke-linejoin="round"/>
      <path d="M41 14.5 Q44.4 8.4 40.6 4.6 Q39.4 9.6 36 12.6 Z" fill="#F1E3B0" stroke="#1E4E60" stroke-width="1" stroke-linejoin="round"/>
      <path d="${SULLEY_FUR}" fill="url(#sg${n})" stroke="#1E4E60" stroke-width="1.3" stroke-linejoin="round"/>
      <g clip-path="url(#sc${n})" fill="#8E5FD3"><ellipse cx="11" cy="23" rx="4" ry="3.2"/><ellipse cx="49" cy="20" rx="4.4" ry="3.4"/><ellipse cx="30" cy="13.6" rx="3.4" ry="2.2"/><ellipse cx="6" cy="40" rx="3" ry="4.2"/><ellipse cx="54" cy="41" rx="3" ry="4"/><ellipse cx="17" cy="60" rx="4" ry="3"/><ellipse cx="44" cy="61" rx="3.6" ry="2.8"/></g>
      <g stroke="#2C8EA3" stroke-width="1" fill="none" stroke-linecap="round" opacity=".7"><path d="M9 31 l2 -2.5 M51 31 l-2 -2.5 M14 15.5 l1.6 2.2 M46 15.5 l-1.6 2.2 M24 59 l1 -2.4 M36 59 l-1 -2.4"/></g>
      <path d="M18.6 22.2 Q23 19.4 27.2 22.4 M32.8 22.4 Q37 19.4 41.4 22.2" stroke="#2C8EA3" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      ${eye(23)}${eye(37)}
      <ellipse cx="30" cy="33" rx="4.4" ry="2.9" fill="#3B2D6B"/><ellipse cx="28.6" cy="32.1" rx="1.3" ry=".7" fill="#fff" opacity=".55"/>
      <path d="M19.5 37 Q30 47.5 40.5 37 Q30 41 19.5 37 Z" fill="#2A1F3D" stroke="#1E4E60" stroke-width=".8" stroke-linejoin="round"/>
      <path d="M24.4 41 l1.2 -2.5 l1.3 2.7 Z M33.1 41.2 l1.3 -2.7 l1.2 2.5 Z" fill="#fff"/>
      ${paw(8.5, 1)}${paw(51.5, -1)}
      ${flDrop(55, 9)}`;
  },
  // Soul forms (Joe, 22): translucent, volumetric glow (luminous core, cooler edge, soft halo), airbrushed, no outline.
  joe(n) {
    const BODY = "M30 12 C41 12 44 22 44 31 C44 41 46.4 47 45.4 54 C44.8 59.6 40 62.5 30 62.5 C20 62.5 15.2 59.6 14.6 54 C13.6 47 16 41 16 31 C16 22 19 12 30 12 Z";
    const eye = (x) => `<g class="fl-eyes open"><ellipse cx="${x}" cy="24.6" rx="2.9" ry="3" fill="#fff"/><circle cx="${x}" cy="23.6" r="2.1" fill="#7A5230"/><circle cx="${x}" cy="23.4" r="1" fill="#2A1A10"/><circle cx="${x - .7}" cy="22.7" r=".7" fill="#fff"/></g>`
      + `<g class="fl-eyes happy"><path d="M${x - 2.7} 25.6 Q${x} 21.8 ${x + 2.7} 25.6" stroke="#5B4030" stroke-width="1.4" fill="none" stroke-linecap="round"/></g>`
      + `<g class="fl-eyes shut"><path d="M${x - 2.7} 24.4 Q${x} 26.6 ${x + 2.7} 24.4" stroke="#5B4030" stroke-width="1.3" fill="none" stroke-linecap="round"/></g>`;
    return `<defs><linearGradient id="jb${n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#78B6F4"/><stop offset=".45" stop-color="#62D8D6"/><stop offset="1" stop-color="#A4EE98"/></linearGradient>
      <radialGradient id="jc${n}" cx=".5" cy=".5" r=".55"><stop offset="0" stop-color="#EFFFFB" stop-opacity=".75"/><stop offset=".6" stop-color="#CFFAF0" stop-opacity=".25"/><stop offset="1" stop-color="#CFFAF0" stop-opacity="0"/></radialGradient>
      <radialGradient id="je${n}" cx=".5" cy=".5" r=".62"><stop offset=".6" stop-color="#3F80E0" stop-opacity="0"/><stop offset="1" stop-color="#3F80E0" stop-opacity=".42"/></radialGradient>
      <linearGradient id="jt${n}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9ED0F4"/><stop offset="1" stop-color="#8DE0CE"/></linearGradient>
      <filter id="jg${n}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3"/></filter></defs>
      <path d="${BODY}" fill="#8FEFFF" opacity=".6" filter="url(#jg${n})" transform="translate(30 37) scale(1.16) translate(-30 -37)"/>
      <ellipse cx="24.4" cy="63.8" rx="3.8" ry="2.9" fill="#98E6B0" opacity=".9"/><ellipse cx="35.6" cy="63.8" rx="3.8" ry="2.9" fill="#98E6B0" opacity=".9"/>
      <ellipse cx="12.8" cy="45" rx="3" ry="5.6" transform="rotate(12 12.8 45)" fill="#78D8D8" opacity=".85"/><ellipse cx="47.2" cy="45" rx="3" ry="5.6" transform="rotate(-12 47.2 45)" fill="#78D8D8" opacity=".85"/>
      <path d="${BODY}" fill="url(#jb${n})" fill-opacity=".92"/><path d="${BODY}" fill="url(#jc${n})"/><path d="${BODY}" fill="url(#je${n})"/>
      <g transform="rotate(-9 30 11)"><path d="M17 12.6 Q16.6 3 30 3 Q43.4 3 43 12.6 Z" fill="url(#jt${n})"/><path d="M17.3 10.4 Q30 12.6 42.7 10.4 L43 12.6 Q30 14.6 17 12.6 Z" fill="#7FC2DE" opacity=".8"/><ellipse cx="30" cy="12.8" rx="15.4" ry="3.2" fill="#B4E4F2"/></g>
      <path d="M20.4 17.6 Q23.4 15 26.8 17.2 M33.2 17.2 Q36.6 15 39.6 17.6" stroke="#4F9BD0" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".8"/>
      <g fill="#fff" fill-opacity=".26" stroke="#F4FCFF" stroke-opacity=".95" stroke-width="1.5"><rect x="17.6" y="19.2" width="11.8" height="10.4" rx="4.8"/><rect x="30.6" y="19.2" width="11.8" height="10.4" rx="4.8"/></g><path d="M29.4 23 Q30 22.2 30.6 23" stroke="#F4FCFF" stroke-width="1.4" fill="none"/>
      ${eye(23.5)}${eye(36.5)}
      <ellipse cx="30" cy="36.4" rx="2.1" ry="2.7" fill="#2D5E92" opacity=".9"/>
      ${flDrop(54, 9)}`;
  },
  ttwo(n) {
    const eye = (x) => `<g class="fl-eyes open"><ellipse cx="${x}" cy="28.6" rx="4.7" ry="5.2" fill="#fff"/><circle cx="${x}" cy="28.2" r="3.2" fill="#6D62D8"/><circle cx="${x}" cy="28" r="1.7" fill="#1B1F4A"/><circle cx="${x - 1.2}" cy="26.9" r="1" fill="#fff"/></g>`
      + `<g class="fl-eyes happy"><path d="M${x - 3.9} 30.4 Q${x} 24.4 ${x + 3.9} 30.4" stroke="#2C3470" stroke-width="1.8" fill="none" stroke-linecap="round"/></g>`
      + `<g class="fl-eyes shut"><path d="M${x - 3.9} 28.6 Q${x} 31.6 ${x + 3.9} 28.6" stroke="#2C3470" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>`;
    return `<defs><radialGradient id="tb${n}" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#E2FFF4"/><stop offset=".45" stop-color="#8DE6DC"/><stop offset=".85" stop-color="#7DB6F2"/><stop offset="1" stop-color="#5E92EA"/></radialGradient>
      <radialGradient id="tk${n}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FF7D9E" stop-opacity=".85"/><stop offset="1" stop-color="#FF7D9E" stop-opacity="0"/></radialGradient>
      <radialGradient id="tl${n}" cx=".4" cy=".25" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <filter id="tg${n}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3"/></filter></defs>
      <circle cx="30" cy="32" r="24" fill="#8FEFFF" opacity=".6" filter="url(#tg${n})"/>
      <ellipse cx="24" cy="62" rx="4.4" ry="2.8" fill="#82C6EE" opacity=".95"/><ellipse cx="36" cy="62" rx="4.4" ry="2.8" fill="#82C6EE" opacity=".95"/>
      <ellipse cx="30" cy="54" rx="13" ry="9.6" fill="#86CCEE" opacity=".95"/>
      <ellipse cx="11" cy="52" rx="3.2" ry="4.8" transform="rotate(20 11 52)" fill="#86CCEE"/>
      <path d="M43.4 55 Q46.4 52 47 48.6" stroke="#86CCEE" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="44.4" cy="47" rx="4.4" ry="4" fill="#9BE8E0"/><ellipse cx="49.4" cy="45.6" rx="3.6" ry="3.5" fill="#9BE8E0"/>
      <path d="M13.4 22.6 Q8.4 16.4 11.2 11 Q16.4 14 19.6 19 Z" fill="#8DC4F2"/>
      <circle cx="30" cy="31" r="19.6" fill="url(#tb${n})" fill-opacity=".95"/><circle cx="30" cy="31" r="19.6" fill="url(#tl${n})"/>
      <path d="M17.8 21.4 Q22.6 18.6 27.2 20.6 M32.8 20.6 Q37.4 18.6 42.2 21.4" stroke="#4E92CE" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".6"/>
      ${eye(23)}${eye(37)}
      <circle cx="15.2" cy="38.4" r="5.4" fill="url(#tk${n})"/><circle cx="44.8" cy="38.4" r="5.4" fill="url(#tk${n})"/>
      <path d="M21.6 37.4 Q30 41.6 38.4 37.4 Q36.8 47.8 30 47.8 Q23.2 47.8 21.6 37.4 Z" fill="#5B2A55"/>
      <path d="M26.2 39.6 L33.8 39.6 L33.8 43.4 L26.2 43.4 Z" fill="#fff"/><path d="M30 39.6 V43.4" stroke="#C9D6E8" stroke-width=".7"/>
      <path d="M26 46 Q30 42.8 34 46 Q30 47.4 26 46 Z" fill="#F08AA0"/>
      ${flDrop(54, 9)}`;
  },
};
function rFilm(kind) {
  const t = document.createElement("template");
  t.innerHTML = `<svg class="fl" viewBox="0 0 60 68" width="48" height="54.4" aria-hidden="true">${FILM[kind](++flN)}</svg>`;
  return t.content.firstChild;
}

// status: "working" (eyes open), "queued" (eyes shut, waiting) or "done" (happy eyes).
function rAvatar(kind, status) {
  const a = el("div", "av av-" + kind); a.dataset.s = status;
  if (FILM[kind]) { a.append(rFilm(kind)); return a; }
  for (const p of KINDS[kind]) a.append(el("i", p));
  return a;
}
function face(role, status) {
  const w = el("span", "face"); w.setAttribute("aria-hidden", "true");
  w.append(rAvatar(CREW[role] || "cat", status));
  return w;
}

// ---- State ----
const ALL = "all";
const PRIORITY_HINT = { P0: "P0: do first", P1: "P1: next", P2: "P2: when free" };
let S = null, pick = null, seenActive = null, seenRecent = null;

const query = new URLSearchParams(location.search);
const names = () => S.projects.map((p) => p.name);
// Default pick: ?project=, then the last pick (an old "" meant all projects), then the project in focus; else all.
function choose() {
  const stored = store.get("crewProject");
  const ok = (p) => p === ALL || names().includes(p);
  const keep = ok(pick) ? pick : null;
  return keep || [query.get("project"), stored === "" ? ALL : stored, S.focus].find(ok) || ALL;
}
const inView = (x) => pick === ALL || x.project === pick;
const roleName = (id) => S.room.roles.find((r) => r.id === id)?.mascot || id;

// ---- Rows ----
const time = (iso, text, label) => { const t = el("time", null, text); t.dateTime = iso; t.title = label; return t; };

// One task row. kind: "active" (time working) or "queued" (time waiting).
function taskRow(t, kind) {
  const li = el("li", "row"), who = roleName(t.role), active = kind === "active";
  const l1 = el("div", "l1"); l1.append(el("span", "who", who));
  if (t.priority) { const c = el("span", "chip", t.priority); c.dataset.p = t.priority; c.title = PRIORITY_HINT[t.priority]; l1.append(c); }
  const iso = active ? t.startedAt : t.queuedAt, m = mins(iso);
  l1.append(time(iso, span(m), `${active ? "Started" : "Queued"} ${hm(iso)} IST`));
  const txt = el("p", "txt", t.text); txt.title = t.text;
  li.append(face(t.role, active ? "working" : "queued"), l1, txt);
  const meta = el("p", "meta");
  if (pick === ALL) meta.append(el("span", "proj", t.project));
  if (t.ref) meta.append(el("span", "ref", t.ref));
  if (t.modelOverride) meta.append(el("span", null, `model override: ${t.modelOverride}`));
  if (meta.childElementCount) li.append(meta);
  li.setAttribute("aria-label", `${who}${t.priority ? ", " + t.priority : ""}: ${t.text}. ${active ? "Working for" : "Waiting"} ${span(m)}${pick === ALL ? ". " + t.project : ""}`);
  if (active && seenActive && !seenActive.has(t.id)) li.classList.add("fresh");
  return li;
}

// One outcome: a hand-back, a pull request, a CI failure or a deploy.
function recentRow(f) {
  const li = el("li", "row"), l1 = el("div", "l1");
  let who, mark;
  // Roles show their face; PRs, CI and deploys a short mark. Only a failure gets a chip: the text already says the rest.
  if (f.role) { who = roleName(f.role); mark = face(f.role, "done"); }
  else {
    const deploy = f.tone === "deploy" || /^deploy/i.test(f.text), pr = f.tone === "pr";
    const [glyph, word] = pr ? ["PR", "Pull request"] : deploy ? ["▲", "Deploy"] : ["CI", "CI"];
    who = word; mark = el("span", "glyph", glyph); mark.setAttribute("aria-hidden", "true");
    if (!pr) mark.dataset.t = f.tone === "bad" ? "bad" : "ok";
  }
  l1.append(el("span", "who", who));
  if (f.tone === "done") l1.append(el("span", "verb", "handed back"));
  if (f.tone === "bad") l1.append(el("span", "chip fail", "failed"));
  l1.append(time(f.ts, hm(f.ts), `${hm(f.ts)} IST`));
  // A hand-back's text starts with "<Name> handed back"; the line above already says it.
  const txt = el("p", "txt", f.say || f.text);
  li.append(mark, l1, txt);
  if (pick === ALL && f.project) { const meta = el("p", "meta"); meta.append(el("span", "proj", f.project)); li.append(meta); }
  if (seenRecent && !seenRecent.has(f.id)) li.classList.add("fresh");
  return li;
}

// ---- Sections ----
function renderPicker() {
  const active = (n) => S.tasks.active.filter((t) => n === ALL || t.project === n).length;
  const chip = (n, label) => {
    const li = el("li"), b = el("button", "pchip"); b.type = "button"; b.setAttribute("aria-pressed", String(pick === n));
    b.append(el("span", "pn", label), el("span", "pc", `${active(n)} active`));
    b.onclick = () => {
      if (pick === n) return;
      pick = n; store.put("crewProject", n);
      const u = new URL(location.href); u.searchParams.set("project", n); history.replaceState(null, "", u);
      render();
    };
    li.append(b); return li;
  };
  $("picker").replaceChildren(...names().map((n) => chip(n, n)), chip(ALL, "All projects"));
}

// Crew: roles with active or queued work in view, one entry per project and role. Source: tasks only, never room.members.
function renderCrew(act, que) {
  const people = new Map();
  for (const t of [...act, ...que]) {
    const k = `${t.project}|${t.role}`, p = people.get(k) || { role: t.role, project: t.project, working: null, queued: 0 };
    if (t.state === "active") p.working = p.working || t; else p.queued++;
    people.set(k, p);
  }
  const list = [...people.values()].sort((a, b) => (b.working ? 1 : 0) - (a.working ? 1 : 0) || roleName(a.role).localeCompare(roleName(b.role)));
  const working = list.filter((p) => p.working).length;
  $("n-crew").textContent = list.length ? `${working} working` : "";
  $("crew").replaceChildren(...list.map((p) => {
    const li = el("li", "person"); li.dataset.s = p.working ? "working" : "free";
    const nm = el("b", null, roleName(p.role)); if (pick === ALL) nm.append(el("span", "pj", p.project));
    li.append(face(p.role, p.working ? "working" : "queued"), nm, el("span", null, p.working ? `Working · ${span(mins(p.working.startedAt))}` : `Free · ${p.queued} queued`));
    return li;
  }));
  const retired = new Set((S.room.retired || []).map((r) => r.id));
  const roster = S.room.roles.map((r) => r.id).filter((id) => id !== MGR && !retired.has(id));
  const busy = new Set(list.map((p) => p.role)), free = roster.filter((id) => !busy.has(id)).length;
  $("crew-more").hidden = !roster.length;
  $("crew-more").textContent = busy.size ? `${free} others free, nothing queued for them.` : `All ${roster.length} crew are free.`;
}

// Facts per project: Live (version, outcome, since) and Branch. Uses factsByProject when the server sends it,
// and falls back to the focus project's room.facts, plus the project's deploy snapshot for the time.
function factsOf(n) {
  const by = (S.factsByProject || S.room.factsByProject || {})[n] || (n === S.focus ? S.room.facts : []) || [];
  const get = (label) => by.find((f) => f.label === label), dep = S.snapshots?.[n]?.deploy, live = get("Live");
  return {
    live: live ? { version: live.value, ok: live.tone === "ok", at: dep?.at } : dep?.version ? { version: dep.version, ok: dep.status === "ok", at: dep.at } : null,
    branch: get("Branch")?.value || "",
  };
}
function renderFacts() {
  const liveBits = (f) => f.live
    ? [el("span", "v", f.live.version), el("span", `chip ${f.live.ok ? "live" : "fail"}`, f.live.ok ? "ok" : "failed"), ...(f.live.at ? [el("span", "when", `since ${hm(f.live.at)}`)] : [])]
    : [el("span", "when", "Not checked for this project")];
  const rows = [];
  for (const n of pick === ALL ? names() : [pick]) {
    const f = factsOf(n);
    if (pick === ALL) { const dd = el("dd"); dd.append(...liveBits(f), el("span", "ref-b", f.branch || "branch unknown")); rows.push(el("dt", "pdt", n), dd); continue; }
    const live = el("dd"), br = el("dd"); live.append(...liveBits(f)); br.append(el("span", "v", f.branch || "unknown"));
    rows.push(el("dt", null, "Live"), live, el("dt", null, "Branch"), br);
  }
  $("facts").replaceChildren(...rows);
  $("facts-hint").textContent = pick === ALL ? "live version · branch" : "";
}

function render() {
  pick = choose();
  renderPicker();
  const label = pick === ALL ? "all projects" : pick;
  const act = S.tasks.active.filter(inView), que = S.tasks.queued.filter(inView);
  $("n-active").textContent = act.length; $("n-queued").textContent = que.length;
  $("hint-active").hidden = !act.length; $("hint-queued").hidden = !que.length;
  const empty = (text) => el("li", "empty", text);
  $("active").replaceChildren(...(act.length ? act.map((t) => taskRow(t, "active")) : [empty(`Nobody is working on ${label} right now.`)]));
  $("queued").replaceChildren(...(que.length ? que.map((t) => taskRow(t, "queued")) : [empty("Nothing queued.")]));
  renderCrew(act, que);
  // Recent: outcomes only. Starts and assigns are left out because Active already shows them.
  const rec = S.room.feed.filter((f) => ["done", "pr", "deploy", "bad"].includes(f.tone) && (!f.project || inView(f))).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 8);
  $("recent").replaceChildren(...(rec.length ? rec.map(recentRow) : [empty("No hand-backs, PRs or deploys yet.")]));
  renderFacts();
  seenActive = new Set(S.tasks.active.map((t) => t.id)); seenRecent = new Set(S.room.feed.map((f) => f.id));
  document.title = `Crew Room · ${pick === ALL ? "All projects" : pick} · ${act.length} active`;
}

// ---- Polling: every 4 s. When the server stops answering, the last data stays and the status turns amber. ----
let lastOk = "";
function setStatus(live) {
  $("status").dataset.s = live ? "live" : "stale";
  $("status-t").textContent = live ? `Live · ${hm(lastOk)} IST` : lastOk ? `Not answering · last ${hm(lastOk)}` : "Not answering";
}
async function tick() {
  try {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    S = await r.json(); lastOk = S.now;
    render(); setStatus(true);
  } catch (e) { console.error(e); setStatus(false); }
}
(function loop() { tick().finally(() => setTimeout(loop, 4000)); })();
