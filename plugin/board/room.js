// Crew Room tab: the retro board, fed from /api/state (room.* is already shaped and de-noised by the server).
// All text goes in with textContent. The chosen tab, project and motion setting are remembered per viewer.
const RSVG = (id) => document.getElementById(id);
const rel = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const rclock = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) + " IST";
const rGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const rPut = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

// The crew by role id (the agent file name): lore room, pixel-art kind and board colour. Colours come from the data when it has a hex.
const CREW = {
  doraemon: { room: "closet", kind: "cat", hex: "#1F7FD6" }, dorami: { room: "closet", kind: "dorami", hex: "#F2C12E" },
  nobita: { room: "nobita", kind: "nobita", hex: "#F5C518" }, shizuka: { room: "nobita", kind: "girl", hex: "#E85A9B" }, shinchan: { room: "nobita", kind: "kid", hex: "#D7263D" },
  scrooge: { room: "workshop", kind: "duck", hex: "#C62828" }, "bob-the-builder": { room: "workshop", kind: "builder", hex: "#3B5BA9" }, "chhota-bheem": { room: "workshop", kind: "strong", hex: "#EF7D1A" },
  "scooby-doo": { room: "mystery", kind: "dog", hex: "#A8642A" }, tom: { room: "mystery", kind: "tomcat", hex: "#6B7FA3" },
  dexter: { room: "lab", kind: "dexter", hex: "#6B3FA0" }, velma: { room: "lab", kind: "velma", hex: "#E8731C" },
  "chip-and-dale": { room: "tree", kind: "pair", hex: "#C98A3B" },
};
const MGR = "doraemon", BHEEM = "chhota-bheem";
// Rooms from the shows, in display order. Roles not listed land in "Others".
const R_ROOMS = [
  ["closet", "THE CLOSET", ["doraemon", "dorami"], ["sconce", "clock"], ["shelf", "plant"]],
  ["nobita", "NOBITA'S ROOM", ["nobita", "shizuka", "shinchan"], ["sconce", "window", "poster"], ["plant", "sofa"]],
  ["workshop", "THE WORKSHOP", ["scrooge", "bob-the-builder", "chhota-bheem"], ["sconce", "board", "vent"], ["shelf", "rack"]],
  ["mystery", "MYSTERY MACHINE", ["scooby-doo", "tom"], ["window", "poster", "window"], ["sofa", "plant"]],
  ["lab", "DEXTER'S LAB", ["dexter", "velma"], ["vent", "board", "clock"], ["rack", "shelf"]],
  ["tree", "TREE HOUSE", ["chip-and-dale"], ["window", "sconce"], ["plant"]],
];
// Working people carry a gadget: time machine for deploys, 4D pocket for tools, bamboo-copter for everyone else.
const R_GADGET = { "chhota-bheem": "timem", scrooge: "pocket", "bob-the-builder": "pocket", "chip-and-dale": "pocket" };
const R_ICON = { working: "⌨", done: "✓", queued: "z" };
// Retired characters hang as framed pictures; their art is kept here, keyed by id.
const R_RETIRED_KIND = { dekisugi: "dekisugi", suneo: "smug", "ninja-hattori": "ninja", shaktimaan: "hero" };
// Claude's eight colour names, for a role that has a name but no board hex.
const R_CLAUDE_HEX = { red: "#D7263D", blue: "#1F7FD6", yellow: "#F2C12E", purple: "#6B3FA0", orange: "#EF7D1A", pink: "#E85A9B", cyan: "#1FA3B8", green: "#2E8B57" };

const KINDS = {
  cat: ["head", "face", "eye l", "eye r", "blush l", "blush r", "nose", "whisk", "collar", "bell"],
  duck: ["head", "hat", "band", "brim", "eye l", "eye r", "blush l", "blush r", "mono", "beak"],
  hero: ["cape", "body", "emblem", "head", "band", "eye l", "eye r", "blush l", "blush r"],
  builder: ["body", "head", "hat", "brim", "eye l", "eye r", "blush l", "blush r", "smile"],
  dorami: ["head", "face", "bow l", "bow r", "knot", "eye l", "eye r", "blush l", "blush r", "nose", "collar"],
  ninja: ["body", "hood", "face", "band", "knot", "eye l", "eye r", "blush l", "blush r"],
  dexter: ["body", "collar", "head", "hair", "glass l", "glass r", "eye l", "eye r", "smile", "goggle"],
  velma: ["bob", "body", "neck", "head", "bangs", "glass l", "glass r", "eye l", "eye r", "blush l", "blush r"],
  dekisugi: ["body", "tie", "head", "hair", "part", "eye l", "eye r", "blush l", "blush r", "smile"],
  nobita: ["body", "head", "hair", "glass l", "glass r", "eye l", "eye r", "blush l", "blush r", "smile"],
  kid: ["body", "head", "hair", "brow l", "brow r", "eye l", "eye r", "blush l", "blush r", "grin"],
  strong: ["body", "arm", "head", "tuft", "eye l", "eye r", "blush l", "blush r", "smile"],
  dog: ["ear l", "ear r", "head", "spot", "muzzle", "nose", "eye l", "eye r", "collar", "tag"],
  tomcat: ["ear l", "ear r", "head", "muzzle", "nose", "eye l", "eye r", "blush l", "blush r"],
  girl: ["body", "pig l", "pig r", "tie l", "tie r", "head", "hair", "eye l", "eye r", "blush l", "blush r", "smile"],
  smug: ["body", "head", "hair", "brow l", "brow r", "eye l", "eye r", "blush l", "blush r", "grin"],
  pair: ["one", "two", "nose1", "nose2", "fed", "shirt"],
};

// Role id -> crew key. The agent file name is the id; a role the table does not know falls back to its mascot's words.
let rKeys = {};
const rKeyOf = (id) => rKeys[id] || (CREW[id] ? id : "");
function rCrewKey(role) {
  if (CREW[role.id]) return role.id;
  const n = String(role.mascot || role.id).toLowerCase();
  return Object.keys(CREW).find((k) => n.includes(k.split("-")[0])) || "";
}
const rKindOf = (id) => CREW[rKeyOf(id)]?.kind || R_RETIRED_KIND[id] || "cat";

function rAvatarKind(kind, status, seed) {
  const a = rel("div", "av av-" + kind); a.dataset.s = status; a.style.setProperty("--blink", (seed % 5) * .7 + "s");
  for (const p of KINDS[kind] || KINDS.cat) a.append(rel("i", p));
  a.append(rel("i", "foot l"), rel("i", "foot r"));
  return a;
}
const rAvatar = (id, status, seed) => rAvatarKind(rKindOf(id), status, seed);
const rMini = (id, status, seed) => { const w = rel("span", "mini"); w.append(rAvatar(id, status, seed)); return w; };
const rDecor = (kinds) => { const d = rel("div", "decor"); d.setAttribute("aria-hidden", "true"); for (const k of kinds) d.append(rel("i", "d-" + k)); return d; };
const rProps = (kinds) => { const row = rel("div", "props"); row.setAttribute("aria-hidden", "true"); for (const k of kinds || []) row.append(rel("i", "f-" + k)); return row; };

// ---- Board colour: the data's hex when present, else the table above ----
const HEX = /^#[0-9a-f]{6}$/i;
const rColor = (role) => [role.hex, role.boardColor, role.color].find((c) => HEX.test(String(c || ""))) || CREW[rKeyOf(role.id)]?.hex || R_CLAUDE_HEX[String(role.color || "").toLowerCase()] || "#6b7280";
// Light yellows and oranges get a dark outline so they still read on a light floor.
const rLight = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150; };

// ---- Small touches: own pixel art on or beside each desk, drawn in CSS. Each is [class, number of child pieces, floor?] ----
const TOUCHES = {
  doraemon: [["t-dorayaki"]], dorami: [["t-melon"], ["t-cards", 3]],
  shizuka: [["t-violin", 0, 1], ["t-teacup", 1]], shinchan: [["t-figure", 2], ["t-shiro", 2, 1]],
  scrooge: [["t-dime", 1], ["t-hatstand", 2, 1]], "bob-the-builder": [["t-toolbox", 3, 1]], "chhota-bheem": [["t-laddoos", 4]],
  "scooby-doo": [["t-snacks"]], tom: [["t-hole", 1, 1]], dexter: [["t-beaker", 3]], velma: [["t-lens"]], "chip-and-dale": [["t-acorns", 5, 1]],
};
function rTouches(key) {
  return (TOUCHES[key] || []).map(([cls, n, floor]) => {
    const t = rel("i", "tc " + cls + (floor ? " fl" : "")); t.setAttribute("aria-hidden", "true");
    for (let i = 0; i < (n || 0); i++) t.append(rel("b"));
    return t;
  });
}

const R_MODEL = /opus|sonnet|haiku/;
const rModelOf = (x) => (x.modelOverride || x.model || "").toLowerCase().match(R_MODEL)?.[0];
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
// Chips under the name: [OPUS] [HIGH bars]. Each carries its own word, so nothing depends on colour.
const R_EFFORT = { low: 1, medium: 2, high: 3, xhigh: 4, max: 4 };
function rChips(x) {
  const row = rel("div", "chips"), mod = rModelOf(x), eff = String(x.effort || "").toLowerCase();
  if (mod) row.append(rel("span", "mchip m-" + mod, mod.toUpperCase() + (x.modelOverride ? "*" : "")));
  if (eff && R_EFFORT[eff]) {          // quiet outlined chip with 1 to 4 bars, so levels compare at a glance
    const c = rel("span", "echip"), bars = rel("span", "bars"); bars.setAttribute("aria-hidden", "true");
    for (let i = 1; i <= 4; i++) bars.append(rel("i", i <= R_EFFORT[eff] ? "on" : ""));
    c.append(bars, document.createTextNode(eff.toUpperCase())); row.append(c);
  }
  return row.childElementCount ? row : null;
}
const rModelLine = (x) => { const mod = rModelOf(x); return mod ? [cap(mod), x.effort && x.effort + " effort", x.maxTurns && "up to " + x.maxTurns + " turns"].filter(Boolean).join(" · ") : "Inherits the lead's model"; };
const rStageLine = (x) => [x.version, x.stage === "training" && "in training"].filter(Boolean).join(" · ");

// Nobita dozes off after 10 minutes without work; everyone else just sits.
const NAP_MS = 10 * 60000;
const rNaps = (key, m) => key === "nobita" && m.status === "done" && !!m.since && Date.now() - Date.parse(m.since) >= NAP_MS;

let rProj = rGet("crewProject", "");     // "" = all projects
function rDesk(role, m, i) {
  const waiting = rPending.has(role.id);                       // assigned but Doraemon has not arrived yet: seated, waiting
  if (waiting) m = { ...m, status: "idle", line: "Waiting for task" };
  const key = rKeyOf(role.id), nap = rNaps(key, m);
  const s = m.status === "idle" || nap ? "queued" : m.status;
  const desk = rel("div", "desk"); desk.dataset.s = s; desk.dataset.id = role.id; desk.style.setProperty("--i", i * 60 + "ms");
  if (key) desk.dataset.who = key;
  if (nap) desk.dataset.nap = "1";
  const hex = rColor(role); desk.style.setProperty("--c", hex); desk.style.setProperty("--c-edge", rLight(hex) ? "#7a5c00" : "var(--wall-ink)");
  if (rProj && m.status === "working" && m.project && m.project !== rProj) desk.dataset.dim = "1";
  if (rAway.has(role.id)) desk.classList.add("away");
  desk.tabIndex = 0; desk.setAttribute("role", "button"); { const x = { ...role, ...m }, mod = rModelOf(x); desk.setAttribute("aria-label", `${role.mascot}, ${role.role}: ${m.line}.${m.project && m.status === "working" ? " Project " + m.project + "." : ""}${mod ? " Model " + cap(mod) + "," : ""}${x.effort ? " " + x.effort + " effort." : ""} Show details`); }
  const pace = rel("span", "pace"), scale = rel("span", "scale"); scale.append(rAvatar(role.id, s, i)); pace.append(scale);
  const stage = rel("div", "stage"); stage.append(pace);
  if (s === "queued") stage.append(rel("span", "zzz", "z"));
  if (s === "working") { const g = rel("span", "gadget " + (R_GADGET[role.id] || "copter")); g.setAttribute("aria-hidden", "true"); stage.append(g); }
  if (s === "done") { for (const c of ["spark a", "spark b"]) { const d = rel("span", c + " dorayaki"); d.setAttribute("aria-hidden", "true"); stage.append(d); } }
  const table = rel("div", "table"); table.append(rel("span", "led"), rel("span", "laptop"), rel("span", "mug"));
  const seat = rel("div", "seat"); seat.append(stage, table, ...rTouches(key));
  const plate = rel("div", "plate"), nm = rel("div", "plate-name"), st = rel("span", s === "working" ? "st bell" : "st", R_ICON[s]); st.setAttribute("aria-hidden", "true");
  const sw = rel("i", "swatch"); sw.setAttribute("aria-hidden", "true");
  nm.append(sw, rel("b", null, role.mascot), st);
  plate.append(nm); const chips = rChips({ ...role, ...m }); if (chips) plate.append(chips);
  plate.append(rel("div", "plate-role", role.role), rel("div", "plate-task", m.line));
  if (m.project && m.status === "working") plate.append(rel("div", "ptag", m.project));
  if (m.ref) plate.append(rel("div", "plate-ref", m.ref));
  desk.append(seat, plate);
  if (waiting) { const w = rel("div", "wait", "…"); w.setAttribute("aria-hidden", "true"); desk.append(w); }
  rWireCard(desk, role.id);
  rFxPaint(desk, role.id);
  return desk;
}

// ---- Projects: a slim strip under the title; the pick filters the facts, dims other projects' workers and trims the feed ----
const rProjName = (p) => typeof p === "string" ? p : p?.name || "";
const rProjectsOf = (s) => {
  const list = (s.projects || s.room?.projects || []).map(rProjName).filter(Boolean);
  for (const m of s.room?.members || []) if (m.project && !list.includes(m.project)) list.push(m.project);
  return list;
};
function rRenderProjects(s) {
  const names = rProjectsOf(s), box = RSVG("r-projects");
  if (rProj && !names.includes(rProj)) rProj = "";
  box.hidden = !names.length;
  if (!names.length) { box.replaceChildren(); return; }
  const working = (n) => (s.room?.members || []).filter((m) => m.status === "working" && (!n || m.project === n)).length;
  const label = rel("span", "plabel", "PROJECTS");
  const btn = (n, text) => {
    const b = rel("button", "pchip"); b.type = "button"; b.setAttribute("aria-pressed", String(rProj === n));
    b.append(rel("span", "pn", text)); const w = working(n); if (w) b.append(rel("span", "pc", w + " working"));
    b.onclick = () => { rProj = n; rPut("crewProject", n); rSig = ""; rFeedSeen = null; if (last) renderRoom(last); };
    return b;
  };
  box.replaceChildren(label, btn("", "All"), ...names.map((n) => btn(n, n)));
}
// The three top facts for the picked project. The server may send them per project; otherwise they come from the members.
function rFactsFor(s) {
  const r = s.room, by = s.factsByProject || r.factsByProject;
  if (!rProj) return r.facts || [];
  if (by?.[rProj]) return by[rProj];
  const live = s.snapshots?.[rProj]?.deploy;
  const mine = r.members.filter((m) => m.project === rProj), n = (st) => String(mine.filter((m) => m.status === st).length);
  return [live?.version ? { label: "Live", value: live.version, tone: live.status === "ok" ? "ok" : "bad" } : { label: "Project", value: rProj }, { label: "Working", value: n("working"), tone: "run" }, { label: "Done", value: n("done"), tone: "ok" }];
}

// ---- Framed pictures: the retired characters, calm and still, each with a brass plate saying where they went ----
function rRenderGallery(s) {
  const box = RSVG("r-gallery"), list = s.retired || s.room?.retired || [], roles = s.room?.roles || [];
  const sig = JSON.stringify([list, roles.map((x) => [x.id, x.mascot])]);
  if (box.dataset.sig === sig) return; box.dataset.sig = sig;
  box.hidden = !list.length;
  if (!list.length) { box.replaceChildren(); return; }
  const frames = list.map((p) => {
    const to = roles.find((x) => x.id === p.mergedInto)?.mascot || p.mergedInto || "";
    const f = rel("figure", "frame"); f.setAttribute("aria-label", `${p.name}${to ? ", now with " + to : ""}`);
    const pic = rel("div", "pic"), mat = rel("div", "mat"); mat.setAttribute("aria-hidden", "true");
    mat.append(rAvatarKind(R_RETIRED_KIND[p.id] || "cat", "queued", 1)); pic.append(mat);
    const plate = rel("figcaption", "fplate"); plate.append(rel("b", null, p.name)); if (to) plate.append(rel("span", null, "Now with " + to));
    f.append(pic, plate); return f;
  });
  const head = rel("div", "g-head"); head.append(rel("b", "sign", "ON THE WALL"));
  const row = rel("div", "frames"); row.append(...frames);
  box.replaceChildren(head, row);
}

let rSig = "", rFeedSeen = null, rState = null;
function renderRoom(s) {
  const r = s.room; if (!r) return;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date())) % 24;
  RSVG("r-sky").textContent = hour >= 6 && hour < 18 ? "☀️" : "🌙";
  rKeys = Object.fromEntries(r.roles.map((x) => [x.id, rCrewKey(x)]));
  rRenderProjects(s); rRenderGallery(s);
  // Facts: at most three, for the picked project.
  RSVG("r-facts").replaceChildren(...rFactsFor(s).slice(0, 3).map((f) => { const c = rel("span", "count", `${f.label.toUpperCase()}  ${f.value}`); if (f.tone) c.dataset.s = f.tone === "run" ? "working" : f.tone === "ok" ? "done" : "blocked"; return c; }));
  // Rooms: only rebuilt when something changed, so the pop-in and pacing do not restart every poll.
  const sig = JSON.stringify([r.roles, rProj, r.members.map((m) => [m.id, m.status, m.line, m.ref, m.project, rNaps(rKeyOf(m.id), m)])]);
  if (sig !== rSig) {
    rSig = sig;
    const retired = new Set(Object.keys(R_RETIRED_KIND));
    const roles = Object.fromEntries(r.roles.filter((x) => !retired.has(x.id)).map((x) => [x.id, x])), mem = Object.fromEntries(r.members.map((x) => [x.id, x]));
    const placed = new Set(R_ROOMS.flatMap(([, , ids]) => ids));
    const teams = R_ROOMS.map(([k, name, ids, decor, furn]) => ({ k, name, decor, furn, ids: ids.filter((id) => roles[id]) }));
    const others = Object.keys(roles).filter((id) => !placed.has(id)); if (others.length) teams.push({ k: "others", name: "OTHERS", decor: ["sconce", "window"], furn: ["plant"], ids: others });
    let i = 0;
    const rooms = teams.filter((t) => t.ids.length).map((t) => {
      const team = rel("section", "team"); team.dataset.room = t.k; team.dataset.n = t.ids.length; team.setAttribute("aria-label", t.name);
      const busy = t.ids.filter((id) => mem[id]?.status === "working").length;
      const wall = rel("div", "wall"), floor = rel("div", "room-floor"), grid = rel("div", "stations");
      const sign = rel("b", "sign", t.name); if (busy) sign.dataset.busy = busy;
      wall.append(sign, rDecor(t.decor));
      for (const id of t.ids) grid.append(rDesk(roles[id], mem[id] || { status: "idle", line: "Idle" }, i++));
      floor.append(grid, rProps(t.furn)); team.append(wall, floor);
      return team;
    });
    RSVG("r-rooms").replaceChildren(...(rooms.length ? rooms : [rel("p", "empty", "No roles found.")]));
  }
  // Feed: real outcomes, plus Doraemon's instructions ("Doraemon -> Shinchan: ..."); new rows slide in.
  const roleOf = Object.fromEntries(r.roles.map((x) => [x.id, x])), name = (id) => roleOf[id]?.mascot || id;
  const ids = new Set(r.feed.map((f) => f.id));
  const talks = (r.talks || []).filter((t) => !ids.has(t.id)).map((t) => ({ id: t.id, ts: t.ts, tone: "talk", role: t.to, from: t.from, to: t.to, say: t.text, text: `${name(t.from)} → ${name(t.to)}: ${t.text}` }));
  const feed = [...r.feed, ...talks].filter((f) => !rProj || !f.project || f.project === rProj).sort((x, y) => y.ts.localeCompare(x.ts)).slice(0, 25);
  if (!feed.length) { RSVG("r-feed").replaceChildren(rel("p", "empty", "No outcomes yet.")); }
  else RSVG("r-feed").replaceChildren(...feed.map((f) => {
    const row = rel("div", "feed-row"); if (rFeedSeen && !rFeedSeen.has(f.id)) row.classList.add("fresh");
    const k = rel("span", "kind", { start: "▶", done: "✓", pr: "⇄", deploy: "↑", bad: "!", talk: "»" }[f.tone] || "•"); k.dataset.k = f.tone; k.setAttribute("aria-hidden", "true");
    row.append(f.role && roleOf[f.role] ? rMini(f.role, f.tone === "start" ? "working" : "done", 0) : rel("span", "mini"), rel("time", null, rclock(f.ts)), k, rel("div", "txt", f.text));
    return row;
  }));
  rFeedSeen = new Set(feed.map((f) => f.id));
  rState = r; rRefreshCard();
  rPlanWalks(feed); rPlanCheckins(r);
}

// ---- Catchphrases and little reactions: short, our own wording, only with Motion on. They survive a desk rebuild. ----
const rFx = {};
function rFxSet(id, { cls, say }, ms) {
  if (!rMotion() || !rKeyOf(id)) return;
  rFx[id] = { cls, say, until: Date.now() + ms };
  const d = rDeskEl(id); if (d) rFxPaint(d, id);
  setTimeout(() => { const d2 = rDeskEl(id); if (d2) rFxPaint(d2, id); }, ms + 50);
}
function rFxPaint(desk, id) {
  const fx = rFx[id]; desk.querySelectorAll(".quip").forEach((q) => q.remove());
  for (const c of [...desk.classList]) if (c.startsWith("fx-")) desk.classList.remove(c);
  if (!fx || fx.until < Date.now()) { delete rFx[id]; return; }
  if (fx.cls) desk.classList.add("fx-" + fx.cls);
  if (fx.say) { const q = rel("div", "quip", fx.say); const idx = Math.round((parseInt(desk.style.getPropertyValue("--i")) || 0) / 60); q.dataset.side = idx % 2 ? "r" : "l"; desk.append(q); }
}
const FX_CRIT = /\bcritical\b/i, FX_SOURCE = /\b(verified|confirmed|checks? out|cross-?checked|sources? (?:agree|confirm|match))\b/i;
// Called once for every fresh feed item.
function rReact(f, age) {
  if (age > 20000) return;
  const key = rKeyOf(f.role || ""), text = f.text || "";
  if (f.tone === "start" && key === "bob-the-builder") rFxSet(f.role, { say: "Can we fix it?" }, 3500);
  if ((f.tone === "start" || f.tone === "assign" || f.tone === "talk") && rKeyOf(f.to || f.role || "") === "tom") rFxSet(f.to || f.role, { cls: "prep" }, 2000);
  if (f.tone === "done" && key === "scooby-doo" && FX_CRIT.test(text)) rFxSet(f.role, { say: "Ruh-roh!" }, 3500);
  if (f.tone === "done" && key === "velma" && FX_SOURCE.test(text)) rFxSet(f.role, { say: "Jinkies!" }, 3500);
  if (f.tone === "deploy") rFxSet(BHEEM, { cls: "eat" }, 3500);        // a green deploy: Bheem eats a laddoo
}


// Tabs: Live is the default; the pick is remembered per viewer (storage can be blocked, so every access is guarded).
function setTab(name) {
  const room = name === "room";
  document.documentElement.dataset.tab = room ? "room" : "live";
  $("view-live").hidden = room; $("view-room").hidden = !room;
  $("tab-live").setAttribute("aria-selected", String(!room)); $("tab-room").setAttribute("aria-selected", String(room));
  rPut("crewTab", name);
  if (room && typeof last !== "undefined" && last) { try { renderRoom(last); } catch (e) { console.error(e); } }
}
$("tab-live").onclick = () => setTab("live"); $("tab-room").onclick = () => setTab("room");
document.querySelector(".tabs").addEventListener("keydown", (e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { const go = $("tab-room").getAttribute("aria-selected") === "true" ? "live" : "room"; setTab(go); $("tab-" + go).focus(); } });
setTab(location.hash === "#room" ? "room" : rGet("crewTab", "live") === "room" ? "room" : "live");   // a #room link opens the Crew Room

// ---- Motion: follows the system setting, but the owner can force it on or off with the Motion button (kept per viewer). ----
const rMotion = () => { const m = document.documentElement.dataset.motion; return m === "on" || (m !== "off" && !matchMedia("(prefers-reduced-motion: reduce)").matches); };
function rSetMotion(v) {
  if (v) document.documentElement.dataset.motion = v; else delete document.documentElement.dataset.motion;
  const b = $("r-motion"); if (b) { b.textContent = rMotion() ? "MOTION ON" : "MOTION OFF"; b.setAttribute("aria-pressed", String(rMotion())); }
}

// ---- Walks: Doraemon visits people he messages or checks on; finished people walk to him. Everyone else stays seated. ----
// One size everywhere (60 x 68), feet-anchored, 4 facings, a 4-frame step at 150 ms, steady pace, one rAF loop.
const rAway = new Set(), rPending = new Set();                 // roles currently out of their seat
const rWalkQ = []; const rDone = new Set(); const rContact = {}, rChecked = {};
let rActive = 0, rReports = 0, rLastCheck = 0;
const REPLAY_MS = 120000;                // on load or when the tab comes back, the last two minutes are replayed once
const PRIO = { report: 0, task: 1, visit: 2, checkin: 3, errand: 4 };
const rSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rBubbleMs = (t) => Math.min(4000, Math.max(2000, 1200 + 40 * (t || "").length));
const rDeskEl = (id) => document.querySelector(`#r-rooms .desk[data-id="${id}"]`);

function rEnqueue(job) {
  if (job.kind === "visit") { const q = rWalkQ.find((j) => j.kind === "visit" && j.to === job.to); if (q) { q.say = job.say; return; } }   // several messages to one person: one visit, latest text
  if (job.kind === "report" && rWalkQ.some((j) => j.kind === "report" && j.role === job.role)) return;
  rWalkQ.push(job);
  while (rWalkQ.length > 8) {            // queue cap 8: drop check-ins first, then the oldest visit, never a hand-over
    let i = rWalkQ.findIndex((j) => j.kind === "checkin"); if (i < 0) i = rWalkQ.findIndex((j) => j.kind === "errand"); if (i < 0) i = rWalkQ.findIndex((j) => j.kind === "visit");
    if (i < 0) break; rWalkQ.splice(i, 1);
  }
}

const PAIR_MS = 10000, FRESH_TASK_MS = 20000;
function rPlanWalks(feed) {
  if (RSVG("view-room").hidden) return;                      // other tab: keep the items for the replay when this tab opens
  const near = (f, tone) => feed.find((g) => g.tone === tone && g.role === f.role && Math.abs(Date.parse(g.ts) - Date.parse(f.ts)) <= PAIR_MS);
  const fresh = feed.filter((f) => !rDone.has(f.id)).reverse();
  for (const f of fresh) {
    if (rDone.has(f.id)) continue;
    rDone.add(f.id);
    const age = Date.now() - Date.parse(f.ts);
    rReact(f, age);
    let job = null;
    if (f.tone === "start" && f.role || (f.tone === "assign" || f.tone === "talk") && near({ role: f.to || f.role, ts: f.ts }, "start")) {
      // an assignment and the start of the same member (within 10 s) are one scene: Doraemon brings the task, then the member starts
      const role = f.tone === "start" ? f.role : f.to || f.role, st = f.tone === "start" ? f : near({ role, ts: f.ts }, "start"), as = f.tone === "start" ? near({ role, ts: f.ts }, "assign") : f;
      if (st) rDone.add(st.id); if (as) rDone.add(as.id);
      if (age > FRESH_TASK_MS || role === MGR) continue;
      const say = (as?.say || as?.text?.replace(/^.*?:\s*/, "") || rState?.members.find((x) => x.id === role)?.task || "New task").slice(0, 70);
      job = { kind: "task", role: MGR, to: role, say };
    } else {
      if (age > REPLAY_MS) continue;
      if (f.tone === "done" && f.role && f.role !== MGR) {
        const said = f.text.replace(/^.*?handed back:?\s*/, "").slice(0, 70), item = /\bPR\b|#\d+|commit|\b[0-9a-f]{7}\b/i.test(said) ? "paper" : "folder";
        rPending.delete(f.role);
        job = { kind: "report", role: f.role, say: said && said !== f.text ? said : "Done!", item };
      } else if ((f.tone === "talk" || f.tone === "assign") && (f.to || f.role)) job = { kind: "visit", role: f.from || MGR, to: f.to || f.role, say: (f.say || "").slice(0, 70) };
      else if ((f.tone === "pr" || f.tone === "deploy") && !rWalkQ.length && !rAway.has(MGR)) job = { kind: "errand", role: MGR, to: BHEEM, say: f.text.slice(0, 40) };
    }
    if (!job) continue;
    if (!rMotion()) { rStatic(job); continue; }
    if (job.kind === "task") {
      rPending.add(job.to); rRefreshDesk(job.to);
      // Doraemon is busy: after about 6 s the member starts anyway, with the paper on the desk
      job.timer = setTimeout(() => { const i = rWalkQ.indexOf(job); if (i >= 0) { rWalkQ.splice(i, 1); rWake(job.to, true); } }, 6000);
    }
    rEnqueue(job);
  }
  rPump();
}
function rRefreshDesk(id) {
  const old = rDeskEl(id), role = rState?.roles.find((x) => x.id === id), m = rState?.members.find((x) => x.id === id); if (!old || !role || !m) return null;
  const nd = rDesk(role, m, (parseInt(old.style.getPropertyValue("--i")) || 0) / 60); nd.style.animation = "none"; if (old.classList.contains("away")) nd.classList.add("away");
  old.replaceWith(nd); return nd;
}
function rWake(id, paper) {                    // the member starts: bell, laptop, typing
  rPending.delete(id); const d = rRefreshDesk(id); if (!d) return;
  d.classList.add("wake"); setTimeout(() => d.classList.remove("wake"), 1400);
  if (paper) d.querySelector(".table")?.append(rel("i", "pile paper"));
}

// Check-in: a visit with no words, for someone who has worked 8 min without contact while the manager is around.
function rPlanCheckins(r) {
  if (RSVG("view-room").hidden) return;
  const now = Date.now();
  if (!r.managerActive || now - rLastCheck < 180000) return;
  for (const m of r.members) {
    if (m.id === MGR || m.status !== "working" || !m.since || rAway.has(m.id) || rPending.has(m.id) || rWalkQ.some((j) => j.to === m.id)) continue;
    const base = Math.max(Date.parse(m.lastContactAt || 0) || 0, Date.parse(m.since) || 0, rContact[m.id] || 0);
    if (now - base < 480000 || now - (rChecked[m.id] || 0) < 600000) continue;
    rLastCheck = rChecked[m.id] = now;
    const job = { kind: "checkin", role: MGR, to: m.id, say: "" };
    if (rMotion()) rEnqueue(job); else rStatic(job);
    break;
  }
  rPump();
}

function rPump() {
  while (rActive < 2) {                                      // at most 2 walkers on screen
    const ok = (j) => !rAway.has(j.role) && (j.role !== MGR || (rReports === 0 && !rAway.has(j.to)));   // Doraemon: one thing at a time; a member on the way to him goes first
    const c = rWalkQ.map((j, i) => [j, i]).filter(([j]) => ok(j)).sort((x, y) => PRIO[x[0].kind] - PRIO[y[0].kind] || x[1] - y[1])[0];
    if (!c) return;
    const job = rWalkQ.splice(c[1], 1)[0]; rActive++; rAway.add(job.role); if (job.kind === "report") rReports++;
    (job.kind === "report" ? rReport(job) : job.kind === "task" ? rTask(job) : rVisit(job)).catch(() => {}).finally(() => {
      rAway.delete(job.role); document.querySelectorAll(`#r-rooms .desk[data-id="${job.role}"]`).forEach((d) => { d.classList.remove("away"); if (job.role === MGR) d.querySelectorAll(".pile").forEach((p) => p.remove()); });
      if (job.kind === "report") rReports--; rActive--; rPump();
    });
  }
}

// ---- Geometry: where a desk meets the hallway. Points are feet positions, relative to the hall. ----
const CHAR_W = 60;
const rGeo = () => { const hall = RSVG("r-hall"); return { hb: hall.getBoundingClientRect(), corr: parseFloat(getComputedStyle(hall).getPropertyValue("--corr")) || 44 }; };
function rAccess(el, g) {
  const t = el.closest(".team").getBoundingClientRect(), tb = el.querySelector(".table").getBoundingClientRect();
  const L = t.left - g.hb.left, R = t.right - g.hb.left, top = t.top - g.hb.top, dx = (L + R) / 2;
  const tx = tb.left - g.hb.left + tb.width / 2, ty = tb.top - g.hb.top + tb.height;     // feet on the table line
  const side = R - tx >= tx - L ? 1 : -1, sx = Math.max(L + 34, Math.min(R - 34, tx + side * CHAR_W));   // stand one body width aside, where there is more room
  const lane = top + 46, cy = top - g.corr / 2;
  return { room: el.closest(".team"), seat: [tx, ty], stand: [sx, ty], side, sx, lane, dx, cy, out: [[tx, ty], [sx, ty], [sx, lane], [dx, lane], [dx, cy]] };
}
const rDedupe = (p) => p.filter((q, i) => !i || Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) > 1);
const rLen = (p) => p.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
// from/to: "seat" or "stand" at each end.
function rRoute(a, b, spine, from, to) {
  if (a.room === b.room) {
    const p = from === "seat" ? [a.seat, a.stand] : [a.stand]; p.push([a.sx, a.lane], [b.sx, a.lane], b.stand); if (to === "seat") p.push(b.seat); return rDedupe(p);
  }
  const p = [...(from === "seat" ? a.out : a.out.slice(1))];
  if (Math.abs(a.cy - b.cy) < 2) p.push([b.dx, b.cy]); else p.push([spine, a.cy], [spine, b.cy], [b.dx, b.cy]);
  const back = [...b.out].reverse().slice(1); p.push(...(to === "seat" ? back : back.slice(0, -1)));
  return rDedupe(p);
}

// ---- The loop: whole-pixel positions, facing from the direction of travel, a foot frame every 15 px of ground ----
const rMovers = new Set(); let rRaf = 0, rPrev = 0;
function rPlace(w, x, y) { w.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`; w.style.zIndex = 10 + Math.round(y); }
function rTick(ts) {
  const dt = Math.min(64, ts - (rPrev || ts)); rPrev = ts;
  for (const m of [...rMovers]) {
    m.t += dt;
    const left = m.L - m.dist, k = Math.min(1, Math.max(.25, m.t / 120), Math.max(.25, left / (m.speed * .12)));   // ease in and out over 120 ms
    m.dist = Math.min(m.L, m.dist + (m.speed * k * dt) / 1000);
    let d = m.dist, i = 0; while (i < m.seg.length - 1 && d > m.seg[i]) { d -= m.seg[i]; i++; }
    const a = m.pts[i], b = m.pts[i + 1], f = m.seg[i] ? d / m.seg[i] : 1, dx = b[0] - a[0], dy = b[1] - a[1];
    rPlace(m.w, a[0] + dx * f, a[1] + dy * f);
    m.w.dataset.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    if (m.arc) { const p = m.dist / m.L; m.w.style.setProperty("--lift", -Math.round(4 * m.arc * p * (1 - p)) + "px"); m.w.dataset.frame = "s"; }   // in the air: the body rises, the shadow stays on the floor
    else m.w.dataset.frame = String(Math.floor(m.dist / 15) % 4);
    if (m.dist >= m.L) { m.w.dataset.frame = "s"; rMovers.delete(m); m.res(); }
  }
  rRaf = rMovers.size ? requestAnimationFrame(rTick) : 0; if (!rRaf) rPrev = 0;
}
function rMove(w, pts, fly) {
  pts = rDedupe(pts); if (pts.length < 2) return Promise.resolve();
  const L = rLen(pts), seg = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
  rPlace(w, pts[0][0], pts[0][1]);
  return new Promise((res) => { rMovers.add({ w, pts, seg, L, dist: 0, t: 0, speed: fly ? 150 : L > 700 ? 160 : 100, arc: fly ? Math.min(64, 24 + L / 12) : 0, res }); if (!rRaf) rRaf = requestAnimationFrame(rTick); });   // ~100 px/s, up to 1.6x on long trips
}
const rFace = (w, dir) => { w.dataset.dir = dir; w.dataset.frame = "s"; };
function rWalker(roleId, item, at) {
  const w = rel("div", "walker"), fig = rel("span", "fig"); w.dataset.dir = "down"; w.dataset.frame = "s";
  fig.append(rAvatar(roleId, "walk", 1)); w.append(rel("span", "shadow"), fig);
  if (item) w.append(rel("i", "carry " + item));
  if (rKeyOf(roleId) === MGR && rMotion()) { const d = rel("i", "ding"); d.setAttribute("aria-hidden", "true"); w.append(d); setTimeout(() => d.remove(), 1400); }   // the bell tinkles softly when he stands up
  RSVG("r-walkers").append(w); rPlace(w, at[0], at[1]);
  return w;
}
// A trip: normally along the corridors. Over about 7 s even at 1.6x, the walker puts on a Bamboo-copter,
// lifts off, flies over the hallway in a gentle arc at full size, lands near the destination and walks the last step.
async function rTrip(w, a, b, spine, from, to) {
  const pts = rRoute(a, b, spine, from, to);
  if (a.room !== b.room && rLen(pts) > 1120) {
    const p0 = pts[0], p1 = pts[pts.length - 1], land = [p1[0], p1[1] - 44];
    const hat = rel("i", "copterhat"); w.append(hat); w.classList.add("flying");
    await rSleep(300);                                        // blade spins up
    await rMove(w, [p0, land], true);
    w.style.setProperty("--lift", "0px"); await rSleep(150);
    hat.remove(); w.classList.remove("flying");
    await rMove(w, [land, p1]);
  } else await rMove(w, pts);
}

// ---- Bubbles: at most two lines, kept inside the hall, only the speaker shows one ----
function rSay(w, text) {
  if (!text) return;
  const g = rGeo(), b = rel("div", "bubble"); b.style.maxWidth = Math.min(180, g.hb.width - 16) + "px"; b.append(rel("span", null, text)); w.append(b);
  const wb = w.getBoundingClientRect(), bw = b.offsetWidth, ideal = wb.left + wb.width / 2 - bw / 2, left = Math.max(g.hb.left + 8, Math.min(g.hb.right - 8 - bw, ideal));
  b.style.marginLeft = left - ideal + "px"; b.style.setProperty("--tail", bw / 2 - (left - ideal) + "px");
}
const rUnsay = async (w) => { const b = w.querySelector(".bubble"); if (!b) return; b.classList.add("out"); await rSleep(500); b.remove(); };

// ---- Scenes ----
async function rVisit(job) {                  // Doraemon (or anyone) walks to a person, says his piece, walks home
  const g = rGeo(), home = rDeskEl(job.role), target = rDeskEl(job.to); if (!home || !target || home === target) return;
  home.classList.add("away");
  const a = rAccess(home, g), b = rAccess(target, g), spine = g.corr / 2, w = rWalker(job.role, null, a.seat);
  try {
    await rTrip(w, a, b, spine, "seat", "stand"); rFace(w, b.side > 0 ? "left" : "right");
    rSay(w, job.kind === "checkin" ? "📋 Checking in" : job.say);
    await rSleep(job.kind === "checkin" ? 1500 : rBubbleMs(job.say)); await rUnsay(w);
    await rTrip(w, b, a, spine, "stand", "seat");
  } finally { w.remove(); }
  rContact[job.to] = Date.now();
}
async function rTask(job) {                   // Doraemon brings the task paper; the member starts only after the hand-over
  clearTimeout(job.timer);
  const g = rGeo(), home = rDeskEl(MGR), target = rDeskEl(job.to);
  if (!home || !target || home === target) { rWake(job.to); return; }
  home.classList.add("away");
  const a = rAccess(home, g), b = rAccess(target, g), spine = g.corr / 2, w = rWalker(MGR, "paper", a.seat);
  try {
    await rTrip(w, a, b, spine, "seat", "stand"); rFace(w, b.side > 0 ? "left" : "right");
    const c = w.querySelector(".carry"); if (c) { c.style.setProperty("--hx", -b.side * 44 + "px"); c.classList.add("give"); }
    await rSleep(600); c?.remove(); (rDeskEl(job.to)?.querySelector(".table"))?.append(rel("i", "pile paper"));   // the paper lands on their desk
    rSay(w, job.say); await rSleep(Math.min(3000, Math.max(2000, rBubbleMs(job.say))));
    rWake(job.to, true); await rUnsay(w);
    await rTrip(w, b, a, spine, "stand", "seat");
  } finally { w.remove(); }
  rContact[job.to] = Date.now();
}
async function rReport(job) {                 // a finished member hands the result to Doraemon
  const g = rGeo(), home = rDeskEl(job.role), mgr = rDeskEl(MGR); if (!home || !mgr || home === mgr) return;
  home.classList.add("away");
  const a = rAccess(home, g), b = rAccess(mgr, g), spine = g.corr / 2, w = rWalker(job.role, job.item, a.seat);
  try {
    await rTrip(w, a, b, spine, "seat", "stand"); rFace(w, b.side > 0 ? "left" : "right");
    for (let t = 0; rAway.has(MGR) && t < 6000; t += 200) await rSleep(200);   // he is out on a visit: wait up to 6 s
    if (!rAway.has(MGR)) {
      rSay(w, job.say);
      const c = w.querySelector(".carry"); if (c) { c.style.setProperty("--hx", (b.side > 0 ? -16 : 16) + "px"); c.classList.add("give"); }
      await rSleep(600); c?.remove();
      const av = mgr.querySelector(".av"); if (av) { av.classList.add("hop"); setTimeout(() => av.classList.remove("hop"), 700); }
      await rSleep(Math.max(0, rBubbleMs(job.say) - 600)); await rUnsay(w);
    } else { w.querySelector(".carry")?.remove(); mgr.querySelector(".table")?.append(rel("i", "pile " + job.item)); }   // left on his desk until he sits down
    await rTrip(w, b, a, spine, "stand", "seat");
  } finally { w.remove(); }
}

// ---- Reduced motion / Motion off: the same information with no movement ----
function rStatic(job) {
  const tick = (el, cls, ms = 4000) => { el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms); };
  if (job.kind === "report") {
    const d = rDeskEl(job.role), m = rDeskEl(MGR); if (!d) return;
    tick(d, "ring"); if (m) tick(m, "ring");
    const n = rel("div", "plate-note", "→ Doraemon"); d.querySelector(".plate")?.append(n); setTimeout(() => n.remove(), 4000);
    rStaticBubble(d, job.say);
  } else if (job.kind === "task") {
    const d = rDeskEl(job.to); if (!d) return;
    const pin = rMini(MGR, "working", 0); pin.classList.add("pin"); const ico = rel("i", "papericon"); ico.setAttribute("aria-hidden", "true");
    d.querySelector(".plate")?.append(pin, ico); setTimeout(() => { pin.remove(); ico.remove(); }, 4000); rStaticBubble(d, job.say);
  } else {
    const d = rDeskEl(job.to); if (!d) return;
    const pin = rMini(MGR, "working", 0); pin.classList.add("pin"); d.querySelector(".plate")?.append(pin); setTimeout(() => pin.remove(), 4000);
    rStaticBubble(d, job.kind === "checkin" ? "📋 Checking in" : job.say);
  }
}
function rStaticBubble(desk, text) { if (!text) return; const b = rel("div", "sbubble"); b.append(rel("span", null, text)); desk.append(b); setTimeout(() => b.remove(), 4000); }

// ---- Card: hover, focus or tap a character or plate. Esc or a click elsewhere closes it. ----
let rCardId = null, rPinned = null;
const rMins = (iso) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
const rSpan = (m) => m < 1 ? "under a minute" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
function rCardEl() { let c = $("r-card"); if (!c) { c = rel("div", "rcard"); c.id = "r-card"; c.hidden = true; c.setAttribute("role", "status"); RSVG("view-room").append(c); } return c; }
function rHideCard() { rCardId = rPinned = null; rCardEl().hidden = true; }
function rRefreshCard() { if (rCardId && rDeskEl(rCardId)) rShowCard(rCardId); else if (rCardId) rHideCard(); }
function rShowCard(id) {
  const role = rState?.roles.find((x) => x.id === id), m = rState?.members.find((x) => x.id === id), desk = rDeskEl(id); if (!role || !m || !desk) return;
  rCardId = id;
  const c = rCardEl(), s = m.status === "idle" ? "queued" : m.status;
  const hand = m.lastHandback && typeof m.lastHandback === "object" ? m.lastHandback.text : m.lastHandback;   // may be ""
  const state = s === "working" ? (m.since ? `Working for ${rSpan(rMins(m.since))}` : "Working now") : s === "done" ? (m.since ? `Done ${rSpan(rMins(m.since))} ago` : "Done") : "Idle";
  const head = rel("div", "rc-head"), who = rel("div", "rc-who");
  who.append(rel("b", null, role.mascot), rel("span", null, role.role));
  head.append(rMini(id, s, 0), who);
  const x = { ...role, ...m }, rows = [head, rel("div", "rc-state", state), rel("p", "rc-task", m.task || m.line), rel("p", "rc-model", rModelLine(x))];
  if (hand && hand !== m.line) rows.push(rel("p", "rc-hand", "Last hand-back: " + hand));
  else if (s === "done" && m.line) rows.push(rel("p", "rc-hand", "Handed back: " + m.line));
  if (m.ref) rows.push(rel("p", "rc-ref", m.ref));
  c.replaceChildren(...rows); c.hidden = false;
  const b = desk.getBoundingClientRect(), w = c.offsetWidth, h = c.offsetHeight;
  c.style.left = Math.max(8, Math.min(innerWidth - w - 8, b.left + b.width / 2 - w / 2)) + "px";
  c.style.top = (b.top - h - 8 >= 52 ? b.top - h - 8 : Math.min(innerHeight - h - 8, b.bottom + 8)) + "px";
}
function rWireCard(desk, id) {
  desk.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") rShowCard(id); });
  desk.addEventListener("pointerleave", () => { if (rPinned !== id) rHideCard(); });
  desk.addEventListener("focus", () => rShowCard(id));
  desk.addEventListener("blur", () => { if (rPinned !== id) rHideCard(); });
  desk.addEventListener("click", (e) => { e.stopPropagation(); if (rPinned === id) rHideCard(); else { rPinned = id; rShowCard(id); } });
  desk.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); desk.click(); } });
}
addEventListener("keydown", (e) => { if (e.key === "Escape") rHideCard(); });
addEventListener("click", () => rHideCard());
addEventListener("scroll", () => rHideCard(), { passive: true });

$("r-motion").onclick = () => { const on = rMotion(); rPut("crewMotion", on ? "off" : "on"); rSetMotion(on ? "off" : "on"); if (on) { RSVG("r-walkers").replaceChildren(); } };
rSetMotion((() => { try { const v = localStorage.getItem("crewMotion"); return v === "on" || v === "off" ? v : ""; } catch { return ""; } })());
