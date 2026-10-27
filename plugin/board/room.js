// Crew Room tab: the retro board, fed from /api/state (room.* is already shaped and de-noised by the server).
// All text goes in with textContent. The chosen tab, project and motion setting are remembered per viewer.
const RSVG = (id) => document.getElementById(id);
const rel = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const rclock = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) + " IST";
const rGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const rPut = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

// The crew by role id (the agent file name): lore room, pixel-art kind and board colour. Colours come from the data when it has a hex.
const CREW = {
  doraemon: { kind: "cat", hex: "#1F7FD6" }, "miguel-rivera": { kind: "miguel", hex: "#E8731C" },
  nobita: { kind: "nobita", hex: "#F5C518" }, shinchan: { kind: "kid", hex: "#D7263D" },
  kevin: { kind: "kevin", hex: "#F2C12E" }, bob: { kind: "bobm", hex: "#3B5BA9" },
  "mike-wazowski": { kind: "mike", hex: "#1FA3B8" }, sulley: { kind: "sulley", hex: "#6B3FA0" },
  "ninja-hattori": { kind: "ninja", hex: "#3B6FD1" },
  "joe-gardner": { kind: "joe", hex: "#7A4DB8" }, "twenty-two": { kind: "ttwo", hex: "#22A6C4" },
  dekisugi: { kind: "dekisugi", hex: "#EF7D1A" }, olaf: { kind: "olaf", hex: "#3FB8D8" },
  shizuka: { kind: "girl", hex: "#E85A9B" }, stuart: { kind: "stuart", hex: "#E0B020" },
};
const MGR = "doraemon", SRE = "sulley";
// Rooms from the shows, in display order. Roles not listed land in "Others".
const R_ROOMS = [
  // [key, team name, lore name, members, wall decor, furniture]. Team names come from the data when it has them.
  ["closet", "Management", "The Closet", ["doraemon", "miguel-rivera"], ["sconce", "clock"], ["shelf", "plant"]],
  ["nobita", "Frontend Team", "Nobita's Room", ["nobita", "shinchan"], ["sconce", "window", "poster"], ["plant", "sofa"]],
  ["backend", "Backend Team", "Gru's Lab", ["kevin", "bob"], ["sconce", "board", "vent"], ["shelf", "rack"]],
  ["scare", "DevOps Team", "The Scare Floor", ["mike-wazowski", "sulley"], ["door", "door", "door", "door"], ["rack", "plant"]],
  ["dojo", "Security Team", "The Dojo", ["ninja-hattori"], ["sconce", "window"], ["plant", "shelf"]],
  ["jazz", "QA Team", "The Jazz Club", ["joe-gardner", "twenty-two"], ["poster", "sconce", "poster"], ["sofa", "plant"]],
  ["snow", "Research Team", "The Snow Study", ["dekisugi", "olaf"], ["window", "clock", "window"], ["shelf"]],
  ["library", "Documentation Team", "The Library", ["shizuka"], ["books", "sconce", "window"], ["bookcase", "typewriter", "plant"]],
  ["helpers", "Helpers", "Banana Corner", ["stuart"], ["window", "sconce"], ["shelf", "plant"]],
];
// Professional title and team per person: the data wins, this table covers a server that does not send them yet.
const R_PRO = {
  doraemon: ["Engineering Manager", "Management"], "miguel-rivera": ["Knowledge Manager", "Management"], nobita: ["UX & Design Lead", "Frontend Team"], shinchan: ["Frontend Developer", "Frontend Team"],
  kevin: ["Backend Lead", "Backend Team"], bob: ["Backend Developer", "Backend Team"], "mike-wazowski": ["DevOps Engineer", "DevOps Team"], sulley: ["SRE", "DevOps Team"],
  "ninja-hattori": ["Security Engineer", "Security Team"], "joe-gardner": ["QA Engineer", "QA Team"], "twenty-two": ["Exploratory Tester", "QA Team"],
  dekisugi: ["Research Lead", "Research Team"], olaf: ["Research Analyst", "Research Team"], shizuka: ["Technical Writer", "Documentation Team"], stuart: ["Code Search Assistant", "Helpers"],
};
const rTitleFull = (x) => x.title || R_PRO[x.id]?.[0] || x.role || "";
// The plate keeps the short form: "SRE (deploys, rollouts...)" shows as "SRE"; the card shows it all.
const rTitle = (x) => rTitleFull(x).replace(/\s*\(.*$/, "");
const rTeam = (x) => x.team || R_PRO[x.id]?.[1] || "";
// Working people carry a gadget: time machine for deploys, 4D pocket for tools, bamboo-copter for everyone else.
const R_PET = { shinchan: "t-shiro", "ninja-hattori": "t-shishi" };   // companion dogs that walk with their owner
const R_GADGET = { "mike-wazowski": "timem", sulley: "timem", kevin: "pocket", bob: "pocket", stuart: "pocket" };
const R_ICON = { working: "⌨", done: "✓", queued: "z" };
// Retired characters hang as framed pictures; their art is kept here, keyed by id.
const R_RETIRED_KIND = { dorami: "dorami", scrooge: "duck", shaktimaan: "hero", "bob-the-builder": "builder", "chhota-bheem": "strong", "scooby-doo": "dog", tom: "tomcat", dexter: "dexter", velma: "velma", "chip-and-dale": "pair", suneo: "smug" };
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
  miguel: ["body", "hood", "head", "hair", "eye l", "eye r", "blush l", "blush r", "smile"],
  kevin: ["body", "over", "strap", "hair", "eye l", "eye r", "mouth"],
  bobm: ["body", "over", "strap", "hair", "eye l", "eye r", "mouth"],
  stuart: ["body", "over", "strap", "hair", "eye c", "mouth"],
  olaf: ["arm l", "arm r", "low", "head", "hair", "eye l", "eye r", "nose", "smile", "btn"],
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

// ---- Film look (Mike, Sulley): one smooth inline SVG in the 48x54 .av box (viewBox 60x68 = the slot after the board's x1.25).
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

function rAvatarKind(kind, status, seed) {
  const a = rel("div", "av av-" + kind); a.dataset.s = status; a.style.setProperty("--blink", (seed % 5) * .7 + "s");
  if (FILM[kind]) { a.append(rFilm(kind)); a.append(rel("i", "foot l"), rel("i", "foot r")); return a; }
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
const rColor = (role) => [role.hex, role.boardColor, role.color].find((c) => HEX.test(String(c || ""))) || R_CLAUDE_HEX[String(role.color || "").toLowerCase()] || CREW[rKeyOf(role.id)]?.hex || "#6b7280";
// Light yellows and oranges get a dark outline so they still read on a light floor.
const rLight = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150; };

// ---- Small touches: own pixel art on or beside each desk, drawn in CSS. Each is [class, number of child pieces, floor?] ----
const TOUCHES = {
  doraemon: [["t-dorayaki"]], "miguel-rivera": [["t-guitar", 1, 1], ["t-marigolds", 3]],
  shizuka: [["t-violin", 0, 1], ["t-teacup", 1]], shinchan: [["t-figure", 2], ["t-shiro", 2, 1]],
  kevin: [["t-banana", 1]], bob: [["t-tim", 2, 1], ["t-goggles", 1]],
  "mike-wazowski": [["t-clip", 1]], sulley: [["t-can", 1, 1]],
  "ninja-hattori": [["t-shuriken", 1], ["t-shishi", 3, 1]],
  "joe-gardner": [["t-piano", 0, 1]], "twenty-two": [["t-badge", 1]],
  dekisugi: [["t-books", 3]], olaf: [["t-flake", 2]], stuart: [["t-banana", 1], ["t-uke", 1, 1]],
};
// Companion dogs (Shiro, Shishimaru): a fixed inline-SVG string facing right, four legs (a/b/c/d step in pairs), floppy or alert ears, tail.
const DOGS = {
  "t-shiro": `<svg viewBox="0 -3 40 31" aria-hidden="true"><path class="o" d="M8 15 Q2 11 4 5" fill="none" stroke-width="4.4"/><path d="M8 15 Q2 11 4 5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
    <rect class="o lg a" x="9" y="19" width="4.4" height="8" rx="2.2" fill="#fff"/><rect class="o lg b" x="14.4" y="19" width="4.4" height="8" rx="2.2" fill="#fff"/><rect class="o lg c" x="23" y="19" width="4.4" height="8" rx="2.2" fill="#fff"/><rect class="o lg d" x="28.4" y="19" width="4.4" height="8" rx="2.2" fill="#fff"/>
    <ellipse class="o" cx="18" cy="16" rx="12" ry="7.8" fill="#fff"/><circle class="o" cx="29" cy="11.4" r="8.2" fill="#fff"/>
    <path class="o" d="M22.6 4.6 Q18.4 7.4 20.2 15.4 Q25.6 14.6 26.4 7 Z" fill="#dfe3ee"/><path class="o" d="M33.4 3.8 Q39 5.4 37.6 12.6 Q33 11.6 32.6 5.8 Z" fill="#dfe3ee"/>
    <circle cx="31.6" cy="10.4" r="1.4" fill="#1b1b24"/><circle cx="36" cy="11.2" r="1.2" fill="#1b1b24"/><ellipse cx="38" cy="13.6" rx="1.7" ry="1.3" fill="#1b1b24"/><path d="M33.2 16 Q35.2 17.6 37.2 16" stroke="#1b1b24" stroke-width="1" fill="none" stroke-linecap="round"/></svg>`,
  "t-shishi": `<svg viewBox="0 -3 40 31" aria-hidden="true"><path class="o" d="M8 15 Q1 14 3 5" fill="none" stroke-width="4.4"/><path d="M8 15 Q1 14 3 5" fill="none" stroke="#c9955a" stroke-width="2" stroke-linecap="round"/>
    <rect class="o lg a" x="9" y="19" width="4.4" height="8" rx="2.2" fill="#c9955a"/><rect class="o lg b" x="14.4" y="19" width="4.4" height="8" rx="2.2" fill="#c9955a"/><rect class="o lg c" x="23" y="19" width="4.4" height="8" rx="2.2" fill="#c9955a"/><rect class="o lg d" x="28.4" y="19" width="4.4" height="8" rx="2.2" fill="#c9955a"/>
    <ellipse class="o" cx="18" cy="16" rx="12" ry="7.8" fill="#c9955a"/><ellipse cx="19" cy="19.6" rx="7" ry="3.4" fill="#f3e3c2"/><path class="o" d="M23.4 6 L24 -2 L29.6 3.6 Z" fill="#a8743f"/><path class="o" d="M32 3.6 L36.4 -2 L37.2 5.6 Z" fill="#a8743f"/>
    <circle class="o" cx="29" cy="11.4" r="8.2" fill="#c9955a"/><ellipse cx="35" cy="14.4" rx="4.6" ry="3.6" fill="#f3e3c2"/>
    <path class="o" d="M21.8 8.4 Q29 4.8 36.6 8.6 L36.4 11.4 Q29 8.2 21.8 11.2 Z" fill="#3b6fd1" stroke-width="1"/><path class="o" d="M22 9.4 L16.6 7.6 L18.6 11.6 L22 10.8 Z" fill="#3b6fd1" stroke-width="1"/>
    <circle cx="31.6" cy="12.6" r="1.4" fill="#1b1b24"/><circle cx="36" cy="12.8" r="1.1" fill="#1b1b24"/><ellipse cx="38.2" cy="14.4" rx="1.7" ry="1.3" fill="#1b1b24"/></svg>`,
};
function rDog(cls, seat) {
  const d = rel("span", "tc dog " + cls); d.setAttribute("aria-hidden", "true"); d.innerHTML = DOGS[cls]; return d;
}
function rTouches(key) {
  return (TOUCHES[key] || []).map(([cls, n, floor]) => {
    if (DOGS[cls]) return rDog(cls, true);
    const t = rel("i", "tc " + cls + (floor ? " fl" : "")); t.setAttribute("aria-hidden", "true");
    for (let i = 0; i < (n || 0); i++) t.append(rel("b"));
    return t;
  });
}

const R_MODEL = /opus|sonnet|haiku|fable/;
// ranOn is the model the run actually used (call > file > env > main); older payloads only have the file model.
const rModelOf = (x) => (x.ranOn || x.modelOverride || x.model || "").toLowerCase().match(R_MODEL)?.[0];
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
// Chips under the name: [OPUS] [HIGH bars]. Each carries its own word, so nothing depends on colour.
const R_EFFORT = { low: 1, medium: 2, high: 3, xhigh: 4, max: 4 };
function rChips(x) {
  const row = rel("div", "chips"), mod = rModelOf(x), eff = String(x.effort || "").toLowerCase();
  if (mod) row.append(rel("span", "mchip m-" + mod, mod.toUpperCase()));
  if (x.modelOverride) {               // the call beat the agent file: the one thing worth spotting on a cost check
    const b = rel("span", "ochip", "override"), asked = x.modelOverride, file = x.fileModel || "inherit";
    b.title = `asked for ${asked}, file says ${file}`; row.append(b);
  }
  if (eff && R_EFFORT[eff]) {          // quiet outlined chip with 1 to 4 bars, so levels compare at a glance
    const c = rel("span", "echip"), bars = rel("span", "bars"); bars.setAttribute("aria-hidden", "true");
    for (let i = 1; i <= 4; i++) bars.append(rel("i", i <= R_EFFORT[eff] ? "on" : ""));
    c.append(bars, document.createTextNode(eff.toUpperCase())); row.append(c);
  }
  return row.childElementCount ? row : null;
}
const rModelLine = (x) => { const mod = rModelOf(x); return mod ? [cap(mod) + (x.modelOverride ? ` (asked for ${x.modelOverride}, file says ${x.fileModel || "inherit"})` : ""), x.effort && x.effort + " effort", x.maxTurns && "up to " + x.maxTurns + " turns"].filter(Boolean).join(" · ") : "Inherits the lead's model"; };
const rStageLine = (x) => [x.version, x.stage === "training" && "in training"].filter(Boolean).join(" · ");

// Nobita dozes off after 10 minutes without work; everyone else just sits.
const NAP_MS = 10 * 60000;
const rNaps = (key, m) => key === "nobita" && m.status === "done" && !!m.since && Date.now() - Date.parse(m.since) >= NAP_MS;


// ===== The board: one page, fed by /api/state. Every string goes in with textContent; nothing from the data is parsed as HTML. =====
const $ = (id) => document.getElementById(id);
const IST = { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false };
const hm = (iso) => iso ? new Date(iso).toLocaleTimeString("en-GB", IST) : "";
const day = (iso) => iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : "";
const dayName = (iso) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const agoOf = (iso) => { if (!iso) return ""; const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000)); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; };
const shortSpan = (m) => m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
// Today: the clock time. Yesterday and older: the date, so a row never says "14:00" for last week.
const whenOf = (iso) => { if (!iso) return ""; const d = day(iso), now = Date.now(); return d === day(new Date(now).toISOString()) ? hm(iso) : d === day(new Date(now - 86400000).toISOString()) ? "Yesterday" : dayName(iso); };
const link = (href, text) => { const a = rel("a", null, text); if (/^https:\/\/github\.com\//.test(href || "")) { a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; } return a; };
const SVGNS = "http://www.w3.org/2000/svg";
const num = (n) => (Number.isFinite(n) ? n : 0);

// ---- pixel icons: [w, h, rects], drawn with currentColor ----
const ICONS = {
  check: [10, 8, [[0, 4, 2, 2], [2, 6, 2, 2], [4, 4, 2, 2], [6, 2, 2, 2], [8, 0, 2, 2]]],
  x: [8, 8, [[0, 0, 2, 2], [2, 2, 2, 2], [4, 4, 2, 2], [6, 6, 2, 2], [6, 0, 2, 2], [4, 2, 2, 2], [2, 4, 2, 2], [0, 6, 2, 2]]],
  arrow: [10, 8, [[0, 3, 8, 2], [6, 1, 2, 2], [6, 5, 2, 2], [8, 3, 2, 2]]],
  dot: [8, 8, [[2, 0, 4, 8], [0, 2, 8, 4]]],
  pr: [10, 11, [[0, 0, 3, 3], [0, 8, 3, 3], [7, 8, 3, 3], [1, 3, 1, 5], [8, 2, 1, 6], [5, 1, 3, 1], [5, 0, 1, 3]]],
  lock: [10, 11, [[1, 4, 8, 7], [2, 0, 6, 1], [2, 1, 1, 3], [7, 1, 1, 3]]],
  warn: [10, 9, [[4, 0, 2, 2], [3, 2, 4, 2], [3, 4, 4, 2], [2, 6, 6, 2], [1, 7, 8, 2]]],
  hand: [11, 12, [[1, 0, 2, 7], [4, 0, 2, 8], [7, 0, 2, 7], [0, 5, 1, 3], [2, 6, 7, 6], [9, 3, 2, 6]]],
};
function icon(name, scale = 1.5, cls = "") {
  const [w, h, rs] = ICONS[name] || ICONS.dot, s = rel("span", "ic" + (cls ? " " + cls : "")); s.setAttribute("aria-hidden", "true");
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("width", String(w * scale)); svg.setAttribute("height", String(h * scale)); svg.setAttribute("viewBox", `0 0 ${w} ${h}`); svg.setAttribute("fill", "currentColor");
  const rect = (x, y, a, b, fill) => { const r = document.createElementNS(SVGNS, "rect"); r.setAttribute("x", x); r.setAttribute("y", y); r.setAttribute("width", a); r.setAttribute("height", b); if (fill) r.setAttribute("fill", fill); svg.append(r); };
  for (const [x, y, a, b] of rs) rect(x, y, a, b);
  if (name === "lock") rect(4, 6, 2, 3, "var(--need-bg)");
  s.append(svg); return s;
}
// A pixel hand (skin, dark outline) that waves from a desk whose person is waiting for the owner.
function handEl() {
  const sk = "#ffd5b0", ol = "#232539", shapes = [[3, 1, 2, 7], [5, 0, 2, 8], [7, 1, 2, 7], [9, 3, 2, 6], [1, 5, 2, 4], [3, 7, 8, 6]];
  const wrap = rel("span", "hand"); wrap.setAttribute("aria-hidden", "true");
  const svg = document.createElementNS(SVGNS, "svg"); svg.setAttribute("viewBox", "0 -1 14 16"); svg.setAttribute("width", "24"); svg.setAttribute("height", "27");
  const g = (fill, grow, list) => { const e = document.createElementNS(SVGNS, "g"); e.setAttribute("fill", fill); for (const s of list) { const r = document.createElementNS(SVGNS, "rect"); r.setAttribute("x", s[0] - grow); r.setAttribute("y", s[1] - grow); r.setAttribute("width", s[2] + 2 * grow); r.setAttribute("height", s[3] + 2 * grow); e.append(r); } svg.append(e); };
  g(ol, 1, shapes); g(sk, 0, shapes); g(ol, 0, [[5, 3, 1, 4], [7, 3, 1, 4]]);
  wrap.append(svg); return wrap;
}

// ---- Names: the data's display name; a short form where a desk plate is narrow ----
const SHORT = { "miguel-rivera": "Miguel", "mike-wazowski": "Mike", "joe-gardner": "Joe", "ninja-hattori": "Ninja", shinchan: "Shinchan" };
const roleId = (x) => String(x || "").replace(/^.*:/, "");
// Pet names ("Shinchan + Shiro") show only in the hover card header; everywhere else the person's own name.
const stripPet = (n) => String(n || "").replace(/\s*\+.*$/, "");
const nameOf = (id) => { const r = roleId(id); return stripPet(rRoleName(r)); };
const shortOf = (id) => { const r = roleId(id); return SHORT[r] || nameOf(r).split(" ")[0]; };
const plateName = (role) => SHORT[role.id] || stripPet(role.mascot);
const own = (o, k) => !!o && typeof o === "object" && Object.hasOwn(o, k) ? o[k] : undefined;   // keys come from the server: never walk the prototype

let last = null, rProj = "", rPicked = false;     // rProj "" = all projects
// A desk is one role in one project room: walker, bubble and card state is keyed by role + project, so two Doraemons never share it.
const rK = (id, p) => id + "@" + (p || "");
let rNeed = new Set();                             // role@project keys whose person is waiting for the owner (state.needsYou)

function rDesk(role, m, i, showTeam, proj = "") {
  const k = rK(role.id, proj), waiting = rPending.has(k);          // assigned but Doraemon has not arrived yet: seated, waiting
  if (waiting) m = { ...m, status: "idle", line: "Waiting for task" };
  const key = rKeyOf(role.id), nap = rNaps(key, m), need = rNeed.has(k);
  const s = m.status === "idle" || nap ? "queued" : m.status;
  const desk = rel("div", "desk"); desk.dataset.s = s; desk.dataset.id = role.id; desk.dataset.p = proj; desk.dataset.k = k; desk.style.setProperty("--i", i * 60 + "ms");
  if (key) desk.dataset.who = key;
  if (nap) desk.dataset.nap = "1";
  if (need) desk.dataset.need = "1";
  const hex = rColor(role); desk.style.setProperty("--c", hex); desk.style.setProperty("--c-edge", rLight(hex) ? "#7a5c00" : "var(--wall-ink)");
  if (rAway.has(k)) desk.classList.add("away");
  desk.tabIndex = 0; desk.setAttribute("role", "button"); desk.setAttribute("aria-describedby", "r-card");
  { const x = { ...role, ...m }, mod = rModelOf(x); desk.setAttribute("aria-label", `${role.mascot}, ${rTitle(x)}${rTeam(x) ? ", " + rTeam(x) : ""}: ${m.line}.${m.project && m.status === "working" ? " Project " + m.project + "." : ""}${mod ? " Model " + cap(mod) + "," : ""}${x.effort ? " " + x.effort + " effort." : ""}${need ? " Waiting for you." : ""} Show details`); }
  const pace = rel("span", "pace"), scale = rel("span", "scale"); scale.append(rAvatar(role.id, s, i)); pace.append(scale);
  const stage = rel("div", "stage"); stage.append(pace);
  if (s === "queued") stage.append(rel("span", "zzz", "z"));
  if (s === "working") { const g = rel("span", "gadget " + (R_GADGET[role.id] || "copter")); g.setAttribute("aria-hidden", "true"); stage.append(g); }
  if (s === "done") for (const c of ["spark a", "spark b"]) { const d = rel("span", c + " dorayaki"); d.setAttribute("aria-hidden", "true"); stage.append(d); }
  if (need) { const h = handEl(); h.title = `${stripPet(role.mascot)} is waiting for you`; stage.append(h); }
  const table = rel("div", "table"); table.append(rel("span", "led"), rel("span", "laptop"), rel("span", "mug"));
  const seat = rel("div", "seat"); seat.append(stage, table, ...rTouches(key));
  // The plate keeps to a name and one status line: the full task text is in the Tasks card and the hover card.
  const plate = rel("div", "plate"), nm = rel("div", "plate-name"), st = rel("span", s === "working" ? "st bell" : "st", R_ICON[s]); st.setAttribute("aria-hidden", "true");
  const sw = rel("i", "swatch"); sw.setAttribute("aria-hidden", "true");
  nm.append(sw, rel("b", null, plateName(role)), st);
  const span = m.since ? shortSpan(rMins(m.since)) : "";
  const line = waiting ? "Waiting for task" : s === "working" ? (role.id === MGR ? m.line : "Working" + (span && span !== "now" ? " · " + span : "")) : s === "done" ? "Done" + (span ? " " + span + " ago" : "") : "Resting";
  const task = rel("div", "plate-task", line); task.title = m.task || m.line || ""; plate.append(nm, task);
  desk.append(seat, plate);
  if (waiting) { const w = rel("div", "wait", "…"); w.setAttribute("aria-hidden", "true"); desk.append(w); }
  rWireCard(desk, role.id, proj);
  rFxPaint(desk, k);
  return desk;
}

// ---- Projects: the picker filters the floor, the tasks, the cost and the log ----
const noTasks = { active: [], queued: [], done: [] };
const tasksOf = (s) => s.tasks || noTasks;
const inView = (t) => rProj === "" || t.project === rProj;
const rProjNames = (s) => (s.projects || []).map((p) => typeof p === "string" ? p : p?.name || "").filter(Boolean);
let rRoles = [];
const rRoleName = (id) => rRoles.find((x) => x.id === id)?.mascot || id;
// Pick: ?project=, then the last pick (an old "" meant all projects), then the project in focus; else all.
function pickInit(s) {
  const names = rProjNames(s);
  rRoles = s.room?.roles || [];
  rKeys = Object.fromEntries(rRoles.map((x) => [x.id, rCrewKey(x)]));
  if (rPicked && (rProj === "" || names.includes(rProj))) return;
  const raw = rGet("crewProject", null), stored = raw === "" ? "all" : raw, q = new URLSearchParams(location.search).get("project");
  const c = [q, stored, s.focus].find((p) => p === "all" || (p && names.includes(p)));
  rProj = !c || c === "all" ? "" : c; rPicked = true;
}
const sigs = {};                                   // section -> last painted signature: a section is repainted only when its data changed
const changed = (name, value) => { const sig = JSON.stringify(value); if (sigs[name] === sig) return false; sigs[name] = sig; return true; };
function pick(p) {
  if (rProj === p) return;
  rProj = p; rPut("crewProject", p || "all"); rSig = "";
  try { const u = new URL(location.href); u.searchParams.set("project", p || "all"); history.replaceState(null, "", u); } catch {}
  paintAll();
}
function renderProjects(s) {
  const names = rProjNames(s), T = tasksOf(s), n = (p) => T.active.filter((t) => !p || t.project === p).length;
  const nav = $("projects"); nav.hidden = !names.length;
  const nd = (p) => needList(s).some((x) => !p || x.project === p);
  if (!changed("projects", [names, rProj, names.map(n), n(""), names.map(nd), nd("")])) return;
  const chip = (p, text) => {
    const b = rel("button", "pchip"); b.type = "button"; b.setAttribute("aria-pressed", String(rProj === p));
    if (nd(p)) b.dataset.need = "1";                  // amber dot: someone in that project is waiting for you
    b.append(document.createTextNode(text + " "), rel("b", "num", String(n(p)))); b.setAttribute("aria-label", `${text}, ${n(p)} working${nd(p) ? ", needs you" : ""}`);
    b.onclick = () => pick(p); return b;
  };
  nav.replaceChildren(...names.map((p) => chip(p, p)), chip("", "All"));
}

// ---- Needs you: the amber strip. Gone when empty; "not tracked yet" is only said in the footer when the server does not send the key. ----
const NEED_ICON = { permission: "lock", input: "hand", idle: "hand", "agent-input": "hand", pr: "pr" };
const NEED_HINT = { permission: "Answer the prompt in your {p} Claude Code session.", input: "Reply in your {p} Claude Code session.", idle: "Reply in your {p} Claude Code session.", "agent-input": "An agent needs an answer in your {p} Claude Code session." };
// `code` spans in the text become <code>; everything else stays text.
function richText(box, text) {
  String(text || "").split("`").forEach((part, i) => { if (!part) return; box.append(i % 2 ? rel("code", null, part) : document.createTextNode(part)); });
  return box;
}
const needList = (s) => (Array.isArray(s.needsYou) ? s.needsYou.filter((x) => x && typeof x === "object") : []);
// The copy is built here from the kind, the role and the snapshot; the server's own text is only the fallback.
function needCopy(x, s, who) {
  if (x.kind === "pr") {
    const pr = (own(s.snapshots, x.project)?.prs || []).find((p) => p.number === x.number);
    return { text: x.number != null ? `PR #${x.number}${pr?.title ? ` "${pr.title}"` : ""} is ready for your review` : x.text, green: pr ? pr.checks === "pass" : /checks green/i.test(x.text || "") };
  }
  if (x.kind === "permission") return { text: `${who} is waiting for your permission` };
  if (x.kind === "idle") return { text: `${who} is waiting for your reply` };
  return { text: x.text };
}
function renderNeed(s) {
  const all = needList(s), list = rProj ? all.filter((x) => !x.project || x.project === rProj) : all, box = $("need"), now = Date.now();
  box.hidden = !all.length;
  if (!changed("need", [all, rProj, Math.floor(now / 60000), s.snapshots])) return;
  const more = $("need-more");
  if (!all.length) { $("need-items").replaceChildren(); more.hidden = true; return; }
  $("need-h").textContent = `Needs you · ${list.length}`;
  $("need-items").replaceChildren(...list.map((x) => {
    const row = rel("div", "nitem"); row.dataset.kind = x.kind;
    const rid = roleId(x.role), body = rel("div"), nt = rel("div", "nt"), who = rid ? nameOf(rid) : "Claude", cp = needCopy(x, s, who);
    row.append(icon(NEED_ICON[x.kind] || "hand", 2));
    if (rid) { const w = rel("span", "av-w"); w.setAttribute("aria-hidden", "true"); w.append(rMini(rid, "working", 0)); row.append(w); } else row.append(rel("span"));
    richText(nt, cp.text); body.append(nt);
    const meta = [x.project, cp.green && "checks green", x.since ? agoOf(x.since) : ""].filter(Boolean).join(" · ") + (x.stale ? " · may be old" : "");
    body.append(rel("div", "nm", meta)); row.append(body);
    if (x.kind === "pr") {
      const r = rel("div", "nr"); const a = link(x.ref, "Open on GitHub ↗"); if (!a.href) a.removeAttribute("target"); r.append(a); row.append(r);
    } else row.append(rel("div", "nx", (NEED_HINT[x.kind] || "Look at your Claude Code session.").replace("{p}", x.project || "")));
    return row;
  }));
  if (!list.length) $("need-items").replaceChildren(rel("p", "need-none", "Nothing is waiting in " + rProj + "."));
  // Waiting somewhere else: one button that goes there (or to All when it is several projects).
  const rest = all.filter((x) => !list.includes(x)), ps = [...new Set(rest.map((x) => x.project).filter(Boolean))];
  more.hidden = !rest.length;
  if (rest.length) {
    const one = ps.length === 1;
    more.textContent = "+" + rest.length + " waiting in " + (one ? ps[0] : "other projects") + " ▸"; more.onclick = () => pick(one ? ps[0] : "");
  }
}

// ---- Floor header ----
function renderFloor(s) {
  const T = tasksOf(s);
  $("floor-h").textContent = `The floor · ${rProj || "all projects"}`;
  $("floor-meta").textContent = `${T.active.filter(inView).length} working · ${T.queued.filter(inView).length} queued`;
}

// ---- Cost: Today / 7 days, for the picked project (All projects sums the rooms). usd null is "–", never $0. ----
let period = "today";
const tokOf = (u) => u ? num(u.in) + num(u.out) + num(u.cw5m) + num(u.cw1h) + num(u.cr) : 0;
const fmtTok = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + " M" : n >= 1e3 ? Math.round(n / 1e3) + " k" : String(n);
const fmtUsd = (v) => v == null ? "–" : v > 0 && v < 0.005 ? "<$0.01" : v >= 100 ? "$" + Math.round(v) : "$" + v.toFixed(2);
const fmtApprox = (v) => v == null ? "–" : "≈ " + fmtUsd(v);
// A total that leaves out an unpriced model is a floor: it always carries the "+".
const fmtFloor = (v, partial) => v == null ? "–" : fmtUsd(v) + (partial ? "+" : "");
function costFor(s) {
  const c = s.cost, w = c && typeof c === "object" ? own(c.windows, period) : null;
  if (!w) return null;
  const names = rProj ? [rProj] : [...new Set([...Object.keys(w.rooms || {}), ...Object.keys(w.agents || {})])];
  const out = { usd: null, tok: 0, runs: null, partial: false, agents: [], tasks: [] };
  const agents = new Map();
  for (const p of names) {
    const r = own(w.rooms, p);
    if (r) { out.tok += tokOf(r.usage); if (r.usd != null) out.usd = (out.usd ?? 0) + r.usd; if (r.partial || r.unpriced?.length) out.partial = true; }
    for (const a of own(w.agents, p) || []) {
      const k = a.role + (a.main ? "#main" : ""), cur = agents.get(k) || { role: a.role, main: !!a.main, runs: null, tok: 0, usd: null, partial: false };
      cur.tok += tokOf(a.usage); if (a.usd != null) cur.usd = (cur.usd ?? 0) + a.usd; if (a.runs != null) cur.runs = (cur.runs ?? 0) + a.runs;
      if (a.unpriced?.length) cur.partial = true;
      agents.set(k, cur);
    }
  }
  out.agents = [...agents.values()].sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1) || b.tok - a.tok);
  const runs = out.agents.filter((a) => a.runs != null); out.runs = runs.length ? runs.reduce((n, a) => n + a.runs, 0) : null;
  const T = tasksOf(s), byId = new Map([...T.active, ...T.queued, ...T.done].map((t) => [t.id, t]));
  for (const [id, v] of Object.entries(w.tasks || {})) { const t = byId.get(id); if (t && inView(t)) out.tasks.push({ text: t.text, role: t.role, tok: tokOf(v.usage), usd: v.usd ?? null, partial: !!v.unpriced?.length }); }
  out.tasks.sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1));
  return out;
}
const agentLabel = (a) => shortOf(a.role) + (a.main ? " (main)" : "");
const tr = (cells, th) => { const r = rel("tr"); cells.forEach((c, i) => r.append(rel(th && i === 0 ? "th" : "td", null, String(c)))); if (th) r.firstChild.scope = "row"; return r; };
const sumUsd = (l) => l.some((a) => a.usd != null) ? l.reduce((n, a) => n + (a.usd ?? 0), 0) : null;
function renderCost(s) {
  const card = $("cost"), c = costFor(s), tracked = !!c, body = $("cost-body");
  card.dataset.state = !last ? "loading" : tracked ? "ok" : "none";
  for (const b of document.querySelectorAll(".seg button")) { b.setAttribute("aria-pressed", String(b.dataset.p === period)); b.disabled = !tracked && !!last; }
  const prices = s.cost?.prices || {};
  if (!changed("cost", [c, period, rProj, prices, s.cost?.updatedAt ? Math.floor(Date.now() / 60000) : 0, !!last])) return;
  if (!tracked) {
    $("c-hero").hidden = !!last;                       // untracked: no big dash, just the sentence
    $("c-total").textContent = "–"; $("c-tok").textContent = "–"; $("c-runs").textContent = "";
    $("c-sub").textContent = "loading";
    $("c-bars").replaceChildren(); $("c-rows").replaceChildren(); $("c-task-rows").replaceChildren(); $("c-details").hidden = true;
    $("c-note").textContent = last ? "Cost isn't tracked yet. It appears here once the board records token usage." : "Waiting for the board.";
    $("c-badge").hidden = true; return;
  }
  $("c-hero").hidden = false;
  const label = period === "today" ? "today" : "last 7 days";
  $("c-total").textContent = c.usd == null ? "–" : "≈ " + fmtFloor(c.usd, c.partial);
  $("c-tok").textContent = fmtTok(c.tok); $("c-sub").textContent = "tokens"; $("c-runs").textContent = c.runs != null ? ` · ${c.runs} run${c.runs === 1 ? "" : "s"}` : "";
  // Bars: the main session first (its share of the total), then the crew against its own biggest member.
  const main = c.agents.filter((a) => a.main), crew = c.agents.filter((a) => !a.main);
  const mUsd = sumUsd(main), cUsd = sumUsd(crew), mPart = main.some((a) => a.partial), cPart = crew.some((a) => a.partial), all = (mUsd ?? 0) + (cUsd ?? 0);
  const top = crew.slice(0, 4), rest = crew.slice(4), max = Math.max(0.0001, ...crew.map((a) => a.usd ?? 0));
  const items = [];
  if (main.length) items.push({ n: "Main session", full: "Doraemon's own session", v: mUsd, part: mPart, pct: mUsd != null && all > 0 ? mUsd / all * 100 : 0, cls: " me" });
  if (crew.length) items.push({ head: "Crew ≈ " + fmtFloor(cUsd, cPart) });
  for (const a of top) items.push({ n: shortOf(a.role), full: nameOf(a.role), v: a.usd, part: a.partial, pct: a.usd != null ? a.usd / max * 100 : 0, cls: "" });
  if (rest.length) items.push({ n: "Others", full: `Others: ${rest.length} agent${rest.length === 1 ? "" : "s"}`, v: sumUsd(rest), part: rest.some((a) => a.partial), pct: sumUsd(rest) != null ? sumUsd(rest) / max * 100 : 0, cls: " oth" });
  $("c-bars").replaceChildren(...items.map((it) => {
    if (it.head) return rel("li", "chead", it.head);
    const li = rel("li", "cbar" + it.cls), trk = rel("span", "trk"), fill = rel("i");
    if (it.v == null) fill.hidden = true; else fill.style.width = Math.min(100, it.pct) + "%";
    trk.append(fill); li.append(rel("span", "who", it.n), trk, rel("span", "val", fmtFloor(it.v, it.part)));
    li.title = `${it.full}: ${it.v == null ? "–" : "≈ " + fmtFloor(it.v, it.part)}`; return li;
  }));
  $("c-bars").hidden = !items.length;
  $("c-details").hidden = !c.agents.length && !c.tasks.length;
  $("c-cap").textContent = `By agent, ${label} (estimated)`;
  $("c-rows").replaceChildren(...c.agents.map((a) => { const r = tr([agentLabel(a), a.runs ?? "–", fmtTok(a.tok), fmtFloor(a.usd, a.partial)], true); r.firstChild.title = nameOf(a.role); return r; }));
  $("c-foot").replaceChildren(...[tr(["Total", c.runs ?? "–", fmtTok(c.tok), fmtFloor(c.usd, c.partial)])]);
  $("c-task-cap").textContent = `By task, ${label} (estimated)`; $("c-task-table").hidden = !c.tasks.length;
  $("c-task-rows").replaceChildren(...c.tasks.slice(0, 12).map((t) => { const r = tr([t.text, shortOf(t.role), fmtFloor(t.usd, t.partial)]); r.firstChild.className = "tt"; r.children[1].title = nameOf(t.role); return r; }));
  // One sentence about what the number is; a floor note and the age only when they apply. The server's price note is not repeated.
  const note = $("c-note"); note.replaceChildren();
  note.append(document.createTextNode(`Estimated from token counts at Anthropic API list prices${prices.asOf ? " (" + prices.asOf + ")" : ""}. Not a bill: subscription plans aren't charged per token.`));
  if (c.partial) note.append(document.createTextNode(" Some models have no price, so the total is a floor."));
  if (prices.stale) { note.append(document.createTextNode(" "), rel("span", "stale-warn", "Prices may be out of date.")); }
  if (s.cost.updatedAt) note.append(document.createTextNode(` Updated ${agoOf(s.cost.updatedAt)}.`));
  const b = $("c-badge"); b.hidden = false; b.textContent = prices.stale ? "estimate · stale prices" : "estimate"; b.dataset.stale = prices.stale ? "1" : "";
}

// ---- Tasks: Running and Queued (the full task text lives here; desk plates keep a short status) ----
const TPRIO = { P0: 0, P1: 1, P2: 2 };
const R_PRIO = { P0: "P0: do first", P1: "P1: next", P2: "P2: when free" };
const tkOpen = { run: false, q: false };
function taskList(rows, kind, running) {
  const ul = rel("ul", "tl"), shown = tkOpen[kind] ? rows : rows.slice(0, 4);
  if (!rows.length) ul.append(rel("li", "tk-empty", running ? (rProj ? `Nobody is working on ${rProj} right now.` : "Nobody is working right now.") : "Nothing queued."));
  shown.forEach((t, k) => {
    const li = rel("li"), iso = running ? t.startedAt : t.queuedAt, mins = iso ? rMins(iso) : 0;
    const pr = Object.hasOwn(R_PRIO, t.priority) ? t.priority : "";
    const chip = rel("span", "pc " + (pr ? pr.toLowerCase() : "pn"), pr || "–"); chip.title = pr ? R_PRIO[pr] : "No priority set";
    const w = rel("span", "av-w"); w.setAttribute("aria-hidden", "true"); w.append(rMini(t.role, running ? "working" : "queued", k));
    const tx = rel("div", "tx2"), nm = rel("b", null, nameOf(t.role)); if (!rProj) nm.append(rel("small", null, " · " + t.project));
    const text = rel("span", null, t.text); tx.title = t.text; tx.append(nm, text);
    const age = rel("time", "age" + (running ? " run" : ""), shortSpan(mins)); if (iso) { age.dateTime = iso; age.title = `${running ? "Started" : "Queued"} ${rclock(iso)}`; }
    li.append(chip, w, tx, age); ul.append(li);
  });
  const out = [ul];
  if (rows.length > 4) {
    const b = rel("button", "more", tkOpen[kind] ? "Show fewer ▾" : `+${rows.length - 4} more ▸`); b.type = "button"; b.setAttribute("aria-expanded", String(tkOpen[kind]));
    b.onclick = () => { tkOpen[kind] = !tkOpen[kind]; sigs.tasks = ""; renderTasks(last); }; out.push(b);
  }
  return out;
}
function renderTasks(s) {
  const T = tasksOf(s), by = (key) => (a, b) => (TPRIO[a.priority] ?? 9) - (TPRIO[b.priority] ?? 9) || (a[key] || "").localeCompare(b[key] || "");
  const run = T.active.filter(inView).sort(by("startedAt")), que = T.queued.filter(inView).sort(by("queuedAt"));
  if (!changed("tasks", [run, que, tkOpen, rProj, Math.floor(Date.now() / 60000)])) return;
  $("run-n").textContent = String(run.length); $("q-n").textContent = String(que.length);
  $("tk-run").replaceChildren(...taskList(run, "run", true)); $("tk-q").replaceChildren(...taskList(que, "q", false));
  $("run-pulse").dataset.on = run.length ? "1" : "";
}

// ---- Ship: the picked project's snapshot (deploy, CI, PRs, commits, app errors); All projects shows the focus project's. Rows expand in place. ----
function snapOf(s) { const n = rProj || s.focus, sn = n && own(s.snapshots, n); return sn ? { ...s, ...sn, name: n } : { ...s, name: n, ci: [], prs: [], commits: {}, deploy: null, errors: [], problems: {}, polledAt: {} }; }
const shipOpen = new Set();
const tone = (c) => c === "success" || c === "ok" ? "ok" : c === "failure" || c === "failed" || c === "rolled-back" || c === "error" || c === "fatal" ? "bad" : "";
function shipRow(key, ic, icTone, title, when, items, emptyText) {
  if (!items) { const d = rel("div", "sl none"); d.append(icon(ic, 1.5, icTone), rel("span", null, title), rel("span", "when", when || "not read yet")); return d; }
  const d = rel("details", "sl"); d.dataset.key = key; if (shipOpen.has(key)) d.open = true;
  d.addEventListener("toggle", () => { if (d.open) shipOpen.add(key); else shipOpen.delete(key); });
  const sum = rel("summary"); sum.append(icon(ic, 1.5, icTone)); const t = rel("span"); if (typeof title === "string") t.textContent = title; else t.append(...title); sum.append(t, rel("span", "when", when || ""));
  d.append(sum); const ul = rel("ul"); ul.append(...items); d.append(ul); return d;
}
const li2 = (when, ...parts) => { const li = rel("li"), t = rel("time", null, when); const sp = rel("span"); sp.append(...parts.flat()); li.append(t, sp); return li; };
const txt = (t, cls) => cls ? rel("span", cls, t) : document.createTextNode(t);
function renderShip(s0) {
  const s = snapOf(s0), out = [], pa = s.polledAt || {}, read = pa.github || pa.box;
  const probs = [s.problems?.box && "Box: " + s.problems.box, s.problems?.ci, s.problems?.prs, s.problems?.git].filter(Boolean);
  const minute = Math.floor(Date.now() / 60000);
  if (!changed("ship", [s.name, s.deploy, s.ci, s.prs, s.commits, s.errors, probs, pa, minute])) return;
  $("ship-meta").textContent = [s.name, read ? "read " + agoOf(read) : ""].filter(Boolean).join(" · ");
  $("ship-meta").dataset.old = read && Date.now() - Date.parse(read) > 15 * 60000 ? "1" : "";
  const holder = $("ship-rows");
  if (probs.length) out.push(Object.assign(rel("p", "problem", probs.join(" · ")), {}));
  // Live (deploy)
  const d = s.deploy;
  if (d) {
    const bad = tone(d.status) === "bad", hist = (d.history || []).slice(0, 5).map((h) => {
      const m = String(h).match(/^(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/), at = m && Date.parse(m[3]) ? m[3] : "";
      return m ? li2(at ? whenOf(at) : "", txt(m[1] === "ok" ? "Deployed" : m[1] === "rolled-back" ? "Rolled back" : m[1], tone(m[1])), txt(" " + m[2] + (m[4] ? ": " + m[4] : ""))) : li2("", txt(String(h)));
    });
    out.push(shipRow("deploy", bad ? "x" : "check", bad ? "bad" : "ok", [bad ? txt(d.status === "rolled-back" ? "Rolled back " : "Deploy " + d.status + " ", "bad") : txt("Live "), rel("b", null, d.version || "?")], d.at ? `${hm(d.at)} · ${agoOf(d.at)}` : "", hist));
  } else out.push(shipRow("deploy", "dot", "", "Live version", "not read yet", null));
  // CI
  const ci = s.ci || [];
  if (ci.length) {
    const r = ci[0], res = r.status === "completed" ? r.conclusion : r.status, bad = tone(res) === "bad", okc = tone(res) === "ok";
    const word = res === "success" ? "passed" : res === "failure" ? "failed" : res;
    out.push(shipRow("ci", bad ? "x" : okc ? "check" : "dot", bad ? "bad" : okc ? "ok" : "", [txt("CI "), rel("code", null, r.branch), txt(" " + word)], whenOf(r.createdAt), ci.slice(0, 6).map((x) => {
      const rr = x.status === "completed" ? x.conclusion : x.status;
      return li2(whenOf(x.createdAt), link(x.url, `${x.workflow} · ${x.branch}`), txt(" " + (rr === "success" ? "passed" : rr === "failure" ? "failed" : rr), tone(rr)), txt(": " + x.title));
    })));
  } else out.push(shipRow("ci", "dot", "", "CI runs", "not read yet", null));
  // Pull requests
  const prs = s.prs || [], open = prs.filter((p) => p.state === "OPEN");
  if (prs.length) out.push(shipRow("prs", "pr", "", `${open.length} open PR${open.length === 1 ? "" : "s"}`, open[0] ? `#${open[0].number}${open[0].draft ? " draft" : ""}` : "none open", prs.slice(0, 6).map((p) => li2(whenOf(p.updatedAt), link(p.url, `#${p.number}`), txt(` ${p.draft ? "draft" : p.state.toLowerCase()}: ${p.title}`)))));
  else out.push(shipRow("prs", "pr", "", "Pull requests", "not read yet", null));
  // Commits
  const commits = Object.values(s.commits || {}).flat().sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  if (commits.length) out.push(shipRow("commits", "dot", "", `${commits.length} recent commit${commits.length === 1 ? "" : "s"}`, `last ${commits[0].short}`, commits.slice(0, 6).map((c) => li2(whenOf(c.at), rel("code", null, c.short), txt(" " + c.subject)))));
  else out.push(shipRow("commits", "dot", "", "Commits", "not read yet", null));
  // App errors
  const errs = s.errors || [];
  if (pa.box || errs.length) {
    const e = errs.filter((x) => x.level === "error" || x.level === "fatal").length, w = errs.length - e;
    out.push(shipRow("errors", errs.length ? "warn" : "check", errs.length ? (e ? "bad" : "") : "ok", errs.length ? `${e} error${e === 1 ? "" : "s"} · ${w} warning${w === 1 ? "" : "s"}` : "No app errors", "app log", errs.length ? errs.slice(0, 8).map((x) => li2(whenOf(x.at), txt(x.level + " ", tone(x.level) || "warn"), rel("b", null, x.service + ": "), txt(x.msg))) : null));
  } else out.push(shipRow("errors", "dot", "", "App errors", "not read yet", null));
  if (out.every((el) => el.classList?.contains("none"))) {   // nothing read at all: one line, not five identical ones
    const p = rel("p", "empty"); p.append(document.createTextNode("Nothing read yet. "), rel("code", null, "docs/setup.md"), document.createTextNode(" shows how to connect GitHub, CI and your deploy log."));
    holder.replaceChildren(p); return;
  }
  holder.replaceChildren(...out);
}

// ---- Log: one row per finished task (what was done, the hand-back summary, how long and what it cost) and per dropped task. Assignments, commits, PRs, CI and deploys are elsewhere. ----
// Rows are kept by id and only the difference is applied.
let logAll = false, logSeen = null;
const logNodes = new Map();
const HAND_JOIN_MS = 90000;                        // a hand-back belongs to the task that finished within 90 s of it, same role and project
const spanOf = (a, b) => { const m = Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000)); return m < 1 ? "<1 min" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? m % 60 + " min" : ""}`.trim(); };
function logEntries(s) {
  const out = [], ev = s.events || [], tc = own(s.cost?.windows, "7d")?.tasks;
  const stops = ev.filter((e) => e.kind === "agent-stop" && e.agentType);
  for (const t of tasksOf(s).done) {
    if (!inView(t) || !t.doneAt) continue;
    const near = stops.filter((e) => roleId(e.agentType) === t.role && e.project === t.project && Math.abs(Date.parse(e.ts) - Date.parse(t.doneAt)) <= HAND_JOIN_MS)
      .sort((a, b) => Math.abs(Date.parse(a.ts) - Date.parse(t.doneAt)) - Math.abs(Date.parse(b.ts) - Date.parse(t.doneAt)))[0];
    const sub = (near?.text.match(/\bfinished:\s*(.*)$/s)?.[1] || "").trim();
    const cv = own(tc, t.id), meta = [t.startedAt ? spanOf(t.startedAt, t.doneAt) : "", cv ? "≈ " + fmtFloor(cv.usd ?? null, !!cv.unpriced?.length) : ""].filter(Boolean).join(" · ");
    out.push({ id: "d:" + t.id, ts: t.doneAt, ic: "check", tone: "ok", title: `${nameOf(t.role)}: ${t.text}`, sub, meta });
  }
  for (const e of ev) {
    if (rProj && e.project && e.project !== rProj) continue;
    if (e.kind === "task-drop") out.push({ id: e.id, ts: e.ts, ic: "x", tone: "bad", title: `Task dropped: ${e.text}${e.role ? " (" + nameOf(e.role) + ")" : ""}`, sub: "", meta: "" });
  }
  return out;
}
function logRow(en, fresh) {
  const r = rel("div", "lrow"); r.dataset.id = en.id; r.dataset.sig = JSON.stringify([en.title, en.sub, en.meta]); if (fresh) r.classList.add("fresh");
  const t = rel("time", null, hm(en.ts)); t.dateTime = en.ts; t.title = `${day(en.ts)} ${hm(en.ts)} IST`;
  const tx = rel("div", "tx"); tx.append(rel("div", "lt", en.title)); if (en.sub) tx.append(rel("div", "ls", en.sub));
  r.append(t, icon(en.ic, 1.5, en.tone), tx, rel("div", "lm num", en.meta)); return r;
}
const dayLabel = (iso) => { const d = day(iso); return d === day(new Date().toISOString()) ? "Today" : d === day(new Date(Date.now() - 86400000).toISOString()) ? "Yesterday" : dayName(iso); };
function renderLog(s) {
  const list = logEntries(s).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 150), cap = logAll ? list.length : 12, shown = list.slice(0, cap);
  const box = $("logbox"), want = [];
  let lastDay = "";
  for (const e of shown) {
    const dl = dayLabel(e.ts);
    if (dl !== lastDay) { lastDay = dl; const k = "day:" + dl; let n = logNodes.get(k); if (!n) { n = rel("div", "day", dl); logNodes.set(k, n); } want.push([k, n]); }
    let n = logNodes.get(e.id); if (n && n.dataset.sig !== JSON.stringify([e.title, e.sub, e.meta])) { n.remove(); n = null; }
    if (!n) { n = logRow(e, logSeen && !logSeen.has(e.id)); logNodes.set(e.id, n); } want.push([e.id, n]);
  }
  const keep = new Set(want.map(([k]) => k));
  for (const [k, n] of logNodes) if (!keep.has(k)) { n.remove(); logNodes.delete(k); }
  let ref = box.firstChild;
  while (ref && !(ref.classList && (ref.classList.contains("lrow") || ref.classList.contains("day")))) ref = ref.nextSibling;   // skip the empty-state / button nodes
  for (const [, n] of want) { if (n === ref) ref = ref.nextSibling; else box.insertBefore(n, ref); }
  const empty = box.querySelector(".empty"), more = box.querySelector(".more");
  if (!want.length) { if (!empty) box.append(rel("p", "empty", "Nothing finished yet.")); } else empty?.remove();
  if (list.length > cap || (logAll && list.length > 12)) {
    const label = logAll ? "Show fewer ▾" : `Show ${list.length - cap} more ▸`;
    if (more) { more.textContent = label; more.setAttribute("aria-expanded", String(logAll)); }
    else { const b = rel("button", "more", label); b.type = "button"; b.setAttribute("aria-expanded", String(logAll)); b.onclick = () => { logAll = !logAll; renderLog(last); }; box.append(b); }
  } else more?.remove();
  logSeen = new Set(list.map((e) => e.id));
}

// ---- Header: connection, clock, title, favicon, announcer ----
const announceEl = $("announce");
let announceT = 0;
function announce(msg) { clearTimeout(announceT); announceEl.textContent = ""; announceT = setTimeout(() => { announceEl.textContent = msg; }, 60); }
const fav = (dot) => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="2" y="1" width="9" height="14" fill="#ff9ec7" stroke="#2b2340" stroke-width="2"/>${dot ? '<circle cx="12" cy="4" r="4" fill="#fbbf24" stroke="#2b2340"/>' : ""}</svg>`);
let needSeen = null, conn = "";
function renderHead(s) {
  const n = needList(s).length;
  document.title = n ? `(${n}) Needs you · Crew Room` : "Crew Room";
  const l = $("favicon"); if (l) l.href = fav(!!n);
  const ids = new Set(needList(s).map((x) => x.id));
  if (needSeen) { const fresh = needList(s).filter((x) => !needSeen.has(x.id)); if (fresh.length) announce(fresh.map((x) => `Needs you: ${x.text}`).join(". ")); }
  needSeen = ids;
  const f = $("foot-need");
  f.textContent = Array.isArray(s.needsYou) ? "Needs you shows: permission asks, replies, PR reviews. Not yet: merge asks." : "Needs you: not tracked yet. It starts when the board server sends it.";
}
// Offline is told in two steps: nothing at all for the first failed poll, then a quiet pill; after two minutes a band says what to do.
const pageStart = Date.now(); let lastOk = 0;
const hmAt = (ms) => hm(new Date(ms).toISOString());
function setConn(ok, s) {
  const st = $("status"), band = $("offband");
  if (ok) {
    lastOk = Date.now(); band.hidden = true;
    st.replaceChildren(rel("i"), document.createTextNode("Live · "), rel("span", "num", hm(s.now)), document.createTextNode(" IST"));
    st.dataset.s = "ok";
  } else {
    if (fails < 2) return;                                   // one miss is just a slow poll
    const base = lastOk || pageStart;
    st.replaceChildren(document.createTextNode("◐ " + (lastOk ? "Last update " + hmAt(lastOk) : "No update yet") + " · retrying")); st.dataset.s = "lost";
    if (Date.now() - base >= 120000) {
      band.replaceChildren(); richText(band, `The board stopped updating at ${hmAt(base)}. It may have been stopped. Run \`/toon-crew:board status\` to check.`); band.hidden = false;
    }
  }
  const next = ok ? "ok" : "lost"; document.documentElement.dataset.conn = next;
  if (conn && conn !== next) announce(ok ? "Board connection is back." : "Board connection lost. Showing the last data.");
  conn = next;
}

function needKeys(s) { return new Set(needList(s).filter((x) => x.role).map((x) => rK(roleId(x.role), x.project || (rProj || "")))); }
function paintAll() {
  const s = last; if (!s) return;
  const run = (name, f) => { try { f(s); } catch (e) { console.error(name, e); } };
  run("pick", pickInit); run("projects", renderProjects);
  rNeed = needKeys(s);
  run("head", renderHead); run("need", renderNeed); run("floor", renderFloor);
  run("room", renderRoom); run("cost", renderCost); run("tasks", renderTasks); run("ship", renderShip); run("log", renderLog);
  document.documentElement.dataset.ready = "1";
}
for (const b of document.querySelectorAll(".seg button")) b.onclick = () => { period = b.dataset.p; if (last) renderCost(last); };

// Each project has its own crew: a room shows only that project's people. Source: state.rooms[p].members when the server sends it,
// else room.members filtered by project. Desks follow the tasks of that project (a role with an active task there is working).
const inProj = (t, p) => !p || t.project === p;
function rMembersFor(s, p) {
  const T = tasksOf(s), rm = p && own(s.rooms, p), mine = T.active.filter((t) => inProj(t, p));
  return (rm?.members || s.room.members).map((m) => {
    if (m.id === MGR) {                              // the lead is the session itself, never a task
      if (rm || !p) return m;
      if (m.status === "working" && m.project === p) return m;
      return mine.length ? { ...m, status: "working", line: `Managing ${mine.length} task${mine.length > 1 ? "s" : ""}`, project: p } : { ...m, status: m.status === "working" ? "idle" : m.status, line: m.status === "working" ? "Idle" : m.line, project: undefined };
    }
    const own = mine.filter((x) => x.role === m.id), t = own[0];
    if (t) return { ...m, status: "working", line: t.text + (own.length > 1 ? ` (+${own.length - 1} more)` : ""), task: t.text, since: t.startedAt, project: t.project };
    return m.status === "working" ? { ...m, status: "idle", line: "Idle", since: undefined, project: undefined } : m;
  });
}
const rOpen = {};                                    // project -> the viewer's expand / collapse choice in All projects
// The rooms on screen: the picked project's, or every project's, busiest first. A project with nothing active starts collapsed.
function rGroupsOf(s) {
  const names = rProjNames(s), T = tasksOf(s);
  if (!names.length) return [{ p: "", head: false, open: true, w: 0, q: 0 }];
  const stat = (p) => ({ p, head: !rProj, w: T.active.filter((t) => t.project === p).length, q: T.queued.filter((t) => t.project === p).length, mb: !!own(s.rooms, p)?.managerBusy, who: [...new Set(T.active.filter((t) => t.project === p).map((t) => t.role))] });
  const list = (rProj ? [rProj] : names).map(stat).map((g, i) => ({ ...g, i }));
  list.sort((a, b) => (b.w + (b.mb ? 1 : 0) - a.w - (a.mb ? 1 : 0)) || b.q - a.q || a.i - b.i);
  list.forEach((g, k) => { g.open = !g.head || (g.p in rOpen ? rOpen[g.p] : k === 0); });   // in All only the busiest floor opens by itself
  return list;
}
let rSig = "", rFeedSeen = null, rState = null, rShown = [];   // rShown: projects whose room is on screen
const rMemOf = (id, p) => rState?.byProj?.[p || ""]?.find((x) => x.id === id) || rState?.members.find((x) => x.id === id);
function renderRoom(s) {
  if (!s.room) return;
  const groups = rGroupsOf(s), byProj = Object.fromEntries(groups.map((g) => [g.p, rMembersFor(s, g.p)]));
  const r = { ...s.room, members: byProj[groups[0].p], byProj, groups, mgrOn: Object.fromEntries(groups.map((g) => [g.p, g.p && own(s.rooms, g.p) ? !!own(s.rooms, g.p).managerActive : !!s.room.managerActive])) }, T = tasksOf(s);
  rShown = groups.filter((g) => g.open).map((g) => g.p);
  // Rooms: only rebuilt when something changed, so the pop-in and pacing do not restart every poll.
  const sig = JSON.stringify([r.roles, rProj, groups.map((g) => [g.p, g.head, g.open, g.w, g.q, g.who]), groups.map((g) => byProj[g.p].map((m) => [m.id, m.status, m.line, m.ref, m.project, m.team, m.title, rNaps(rKeyOf(m.id), m)])), T.active.map((t) => [t.id, t.project]), [...rNeed]]);
  if (sig !== rSig) {
    rSig = sig;
    const retired = new Set(Object.keys(R_RETIRED_KIND));
    const roles = Object.fromEntries(r.roles.filter((x) => !retired.has(x.id)).map((x) => [x.id, x]));
    const placed = new Set(R_ROOMS.flatMap((r) => r[3]));
    let i = 0;
    // One hall of team rooms for one project: desks, statuses and plates come from that project's members only.
    const hallOf = (g) => {
      const mem = Object.fromEntries(byProj[g.p].map((x) => [x.id, x]));
      const teams = R_ROOMS.map(([k, team, lore, ids, decor, furn]) => {
        const here = ids.filter((id) => roles[id]), names = [...new Set(here.map((id) => rTeam({ ...roles[id], ...mem[id] })).filter(Boolean))];
        return { k, name: (names.length ? names.join(" + ") : team).replace(/ Team$/, "").replace("Documentation", "Docs"), lore, shared: names.length > 1, furn, ids: here };
      });
      const others = Object.keys(roles).filter((id) => !placed.has(id)); if (others.length) teams.push({ k: "others", name: "Others", decor: ["sconce", "window"], furn: ["plant"], ids: others });
      const rooms = teams.filter((t) => t.ids.length).map((t) => {
        const team = rel("section", "team"); team.dataset.room = t.k; team.dataset.n = t.ids.length; team.setAttribute("aria-label", t.name + (t.lore ? ", " + t.lore : ""));
        const busy = T.active.filter((x) => t.ids.includes(x.role) && inProj(x, g.p)).length;
        const wall = rel("div", "wall"), floor = rel("div", "room-floor"), grid = rel("div", "stations");
        const sign = rel("b", "sign", t.name.toUpperCase()); wall.append(sign); if (busy) wall.append(rel("span", "wk", busy + " working"));
        for (const id of t.ids) grid.append(rDesk(roles[id], mem[id] || { status: "idle", line: "Idle" }, i++, t.shared, g.p));
        floor.append(grid, rProps(t.furn)); team.append(wall, floor);
        return team;
      });
      const box = rel("div", "rooms"); box.append(...rooms); return box;
    };
    const parts = groups.map((g) => {
      const sec = rel("section", "pgroup"); sec.dataset.project = g.p; sec.dataset.open = String(g.open);
      if (g.head) {
        const h = rel("button", "pg-head"); h.type = "button"; h.setAttribute("aria-expanded", String(g.open));
        const chev = rel("span", "pg-chev", g.open ? "\u25be" : "\u25b8"); chev.setAttribute("aria-hidden", "true");
        h.append(chev, rel("b", "pg-name", g.p));
        if (!g.open && g.who.length) {                       // a closed floor still shows who is at work
          const row = rel("span", "pg-who"); row.setAttribute("aria-hidden", "true");
          g.who.slice(0, 6).forEach((id, k) => { const w = rel("span", "av-w"); w.append(rMini(id, "working", k)); row.append(w); });
          if (g.who.length > 6) row.append(rel("span", "pg-more", "+" + (g.who.length - 6)));
          h.append(row);
        }
        h.append(rel("span", "pg-n", `${g.w} working \u00b7 ${g.q} queued`));
        h.setAttribute("aria-label", `${g.p}: ${g.w} working, ${g.q} queued. ${g.open ? "Collapse" : "Expand"}`);
        h.onclick = () => { rOpen[g.p] = !g.open; rSig = ""; if (last) renderRoom(last); };
        sec.append(h);
      }
      if (g.open) sec.append(hallOf(g));
      return sec;
    });
    RSVG("r-rooms").replaceChildren(...(roles && Object.keys(roles).length ? parts : [rel("p", "empty", "No roles found.")]));
  }
  // Feed: real outcomes, plus Doraemon's instructions ("Doraemon -> Shinchan: ..."); new rows slide in.
  const roleOf = Object.fromEntries(r.roles.map((x) => [x.id, x])), name = (id) => roleOf[id]?.mascot || id;
  const ids = new Set(r.feed.map((f) => f.id));
  const talks = (r.talks || []).filter((t) => !ids.has(t.id)).map((t) => ({ id: t.id, ts: t.ts, tone: "talk", role: t.to, from: t.from, to: t.to, say: t.text, text: `${name(t.from)} → ${name(t.to)}: ${t.text}` }));
  const feed = [...r.feed, ...talks].filter((f) => !rProj || !f.project || f.project === rProj).sort((x, y) => y.ts.localeCompare(x.ts)).slice(0, 25);
  rFeedSeen = new Set(feed.map((f) => f.id));
  rState = r; rRefreshCard();
  rPlanWalks(feed); rPlanCheckins(r);
}

// ---- Catchphrases and little reactions: short, our own wording, only with Motion on. They survive a desk rebuild. ----
const rFx = {};
const rP = (f) => (f && f.project) || rProj || rShown[0] || "";    // the project room an event belongs to
function rFxSet(id, { cls, say }, ms, p = "") {
  if (!rMotion() || !rKeyOf(id)) return;
  const k = rK(id, p); rFx[k] = { cls, say, until: Date.now() + ms };
  const d = rDeskEl(id, p); if (d) rFxPaint(d, k);
  setTimeout(() => { const d2 = rDeskEl(id, p); if (d2) rFxPaint(d2, k); }, ms + 50);
}
function rFxPaint(desk, id) {
  const fx = rFx[id]; desk.querySelectorAll(".quip").forEach((q) => q.remove());
  for (const c of [...desk.classList]) if (c.startsWith("fx-")) desk.classList.remove(c);
  if (!fx || fx.until < Date.now()) { delete rFx[id]; return; }
  if (fx.cls) desk.classList.add("fx-" + fx.cls);
  if (fx.say) { const q = rel("div", "quip", fx.say); const idx = Math.round((parseInt(desk.style.getPropertyValue("--i")) || 0) / 60); q.dataset.side = idx % 2 ? "r" : "l"; desk.append(q); }
}
const FX_CRIT = /\bcritical\b/i;
// Called once for every fresh feed item.
function rReact(f, age) {
  if (age > 20000) return;
  const key = rKeyOf(f.role || ""), text = f.text || "", p = rP(f);
  if (f.tone === "start" && key === "kevin") rFxSet(f.role, { say: "Bello!" }, 3500, p);
  if (f.tone === "start" && key === "bob") rFxSet(f.role, { say: "Bello!" }, 3500, p);
  if (f.tone === "start" && key === "stuart") rFxSet(f.role, { say: "Banana!" }, 3500, p);
  if (f.tone === "done" && key === "ninja-hattori" && FX_CRIT.test(text)) rFxSet(f.role, { say: "Nin nin!" }, 3500, p);
  if (f.tone === "done" && key === "olaf") rFxSet(f.role, { say: "Warm hugs!" }, 3500, p);
  if (f.tone === "deploy") rFxSet(SRE, { say: "Roar!" }, 3000, p);       // a green deploy: Sulley roars, softly
}


// ---- Motion: follows the system setting, but the owner can force it on or off with the Motion button (kept per viewer). ----
const rMotion = () => { const m = document.documentElement.dataset.motion; return m === "on" || (m !== "off" && !matchMedia("(prefers-reduced-motion: reduce)").matches); };
function rSetMotion(v) {
  if (v) document.documentElement.dataset.motion = v; else delete document.documentElement.dataset.motion;
  const b = $("anim"); if (b) b.setAttribute("aria-pressed", String(rMotion()));
}

// ---- Walks: Doraemon visits people he messages or checks on; finished people walk to him. Everyone else stays seated. ----
// One size everywhere (60 x 68), feet-anchored, 4 facings, a 4-frame step at 150 ms, steady pace, one rAF loop.
const rAway = new Set(), rPending = new Set();                 // roles currently out of their seat
const rWalkQ = []; const rDone = new Set(); const rContact = {}, rChecked = {};
let rActive = 0, rLastCheck = 0; const rReports = {};            // rReports: hand-overs under way, per project
const REPLAY_MS = 120000;                // on load or when the tab comes back, the last two minutes are replayed once
const PRIO = { report: 0, task: 1, visit: 2, checkin: 3, errand: 4 };
const rSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rBubbleMs = (t) => Math.min(4000, Math.max(2000, 1200 + 40 * (t || "").length));
const rDeskEl = (id, p = "") => { const all = [...document.querySelectorAll("#r-rooms .desk")].filter((d) => d.dataset.id === id); return all.find((d) => d.dataset.p === p) || (p ? null : all[0]) || null; };

function rEnqueue(job) {
  if (job.kind === "visit") { const q = rWalkQ.find((j) => j.kind === "visit" && j.to === job.to && j.proj === job.proj); if (q) { q.say = job.say; return; } }   // several messages to one person: one visit, latest text
  if (job.kind === "report" && rWalkQ.some((j) => j.kind === "report" && j.role === job.role && j.proj === job.proj)) return;
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
      const say = (as?.say || as?.text?.replace(/^.*?:\s*/, "") || rMemOf(role, rP(f))?.task || "New task").slice(0, 70);
      job = { kind: "task", role: MGR, to: role, say };
    } else {
      if (age > REPLAY_MS) continue;
      if (f.tone === "done" && f.role && f.role !== MGR) {
        const said = f.text.replace(/^.*?handed back:?\s*/, "").slice(0, 70), item = /\bPR\b|#\d+|commit|\b[0-9a-f]{7}\b/i.test(said) ? "paper" : "folder";
        rPending.delete(rK(f.role, rP(f)));
        job = { kind: "report", role: f.role, say: said && said !== f.text ? said : "Done!", item };
      } else if ((f.tone === "talk" || f.tone === "assign") && (f.to || f.role)) job = { kind: "visit", role: f.from || MGR, to: f.to || f.role, say: (f.say || "").slice(0, 70) };
      else if ((f.tone === "pr" || f.tone === "deploy") && !rWalkQ.length && !rAway.has(rK(MGR, rP(f)))) job = { kind: "errand", role: MGR, to: SRE, say: f.text.slice(0, 40) };
    }
    if (!job) continue;
    job.proj = rP(f);                                         // the walk happens inside that project's room
    if (!rMotion()) { rStatic(job); continue; }
    if (job.kind === "task") {
      rPending.add(rK(job.to, job.proj)); rRefreshDesk(job.to, job.proj);
      // Doraemon is busy: after about 6 s the member starts anyway, with the paper on the desk
      job.timer = setTimeout(() => { const i = rWalkQ.indexOf(job); if (i >= 0) { rWalkQ.splice(i, 1); rWake(job.to, job.proj, true); } }, 6000);
    }
    rEnqueue(job);
  }
  rPump();
}
function rRefreshDesk(id, p = "") {
  const old = rDeskEl(id, p), role = rState?.roles.find((x) => x.id === id), m = rMemOf(id, p); if (!old || !role || !m) return null;
  const nd = rDesk(role, m, (parseInt(old.style.getPropertyValue("--i")) || 0) / 60, undefined, p);nd.style.animation = "none"; if (old.classList.contains("away")) nd.classList.add("away");
  old.replaceWith(nd); return nd;
}
function rWake(id, p, paper) {                    // the member starts: bell, laptop, typing
  rPending.delete(rK(id, p)); const d = rRefreshDesk(id, p); if (!d) return;
  d.classList.add("wake"); setTimeout(() => d.classList.remove("wake"), 1400);
  if (paper) d.querySelector(".table")?.append(rel("i", "pile paper"));
}

// Check-in: a visit with no words, for someone who has worked 8 min without contact while the manager is around.
function rPlanCheckins(r) {
  if (RSVG("view-room").hidden) return;
  const now = Date.now();
  if (now - rLastCheck < 180000) return;
  scan: for (const p of rShown) {
    if (!r.mgrOn[p]) continue;
    for (const m of r.byProj[p] || []) {
      const k = rK(m.id, p);
      if (m.id === MGR || m.status !== "working" || !m.since || rAway.has(k) || rPending.has(k) || rWalkQ.some((j) => j.to === m.id && j.proj === p)) continue;
      const base = Math.max(Date.parse(m.lastContactAt || 0) || 0, Date.parse(m.since) || 0, rContact[k] || 0);
      if (now - base < 480000 || now - (rChecked[k] || 0) < 600000) continue;
      rLastCheck = rChecked[k] = now;
      const job = { kind: "checkin", role: MGR, to: m.id, say: "", proj: p };
      if (rMotion()) rEnqueue(job); else rStatic(job);
      break scan;
    }
  }
  rPump();
}

function rPump() {
  while (rActive < (rShown.length > 1 ? 3 : 2)) {            // at most 2 walkers on screen (3 when several project rooms are open)
    const ok = (j) => !rAway.has(rK(j.role, j.proj)) && (j.role !== MGR || ((rReports[j.proj] || 0) === 0 && !rAway.has(rK(j.to, j.proj))));   // Doraemon: one thing at a time per project; a member on the way to him goes first
    const c = rWalkQ.map((j, i) => [j, i]).filter(([j]) => ok(j)).sort((x, y) => PRIO[x[0].kind] - PRIO[y[0].kind] || x[1] - y[1])[0];
    if (!c) return;
    const job = rWalkQ.splice(c[1], 1)[0], jk = rK(job.role, job.proj); rActive++; rAway.add(jk); if (job.kind === "report") rReports[job.proj] = (rReports[job.proj] || 0) + 1;
    (job.kind === "report" ? rReport(job) : job.kind === "task" ? rTask(job) : rVisit(job)).catch(() => {}).finally(() => {
      rAway.delete(jk); document.querySelectorAll("#r-rooms .desk").forEach((d) => { if (d.dataset.k !== jk) return; d.classList.remove("away"); if (job.role === MGR) d.querySelectorAll(".pile").forEach((p) => p.remove()); });
      if (job.kind === "report") rReports[job.proj]--; rActive--; rPump();
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
  const pl = el.querySelector(".plate")?.getBoundingClientRect(), lane = pl ? pl.bottom - g.hb.top + 8 : top + 46, cy = top - g.corr / 2;
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
  const pet = R_PET[rKeyOf(roleId)];            // only Shinchan and Ninja Hattori have a dog that tags along
  if (pet) fig.append(rDog(pet, false));
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
  const g = rGeo(), home = rDeskEl(job.role, job.proj), target = rDeskEl(job.to, job.proj); if (!home || !target || home === target) return;
  home.classList.add("away");
  const a = rAccess(home, g), b = rAccess(target, g), spine = g.corr / 2, w = rWalker(job.role, null, a.seat);
  try {
    await rTrip(w, a, b, spine, "seat", "stand"); rFace(w, b.side > 0 ? "left" : "right");
    rSay(w, job.kind === "checkin" ? "📋 Checking in" : job.say);
    await rSleep(job.kind === "checkin" ? 1500 : rBubbleMs(job.say)); await rUnsay(w);
    await rTrip(w, b, a, spine, "stand", "seat");
  } finally { w.remove(); }
  rContact[rK(job.to, job.proj)] = Date.now();
}
async function rTask(job) {                   // Doraemon brings the task paper; the member starts only after the hand-over
  clearTimeout(job.timer);
  const g = rGeo(), home = rDeskEl(MGR, job.proj), target = rDeskEl(job.to, job.proj);
  if (!home || !target || home === target) { rWake(job.to, job.proj); return; }
  home.classList.add("away");
  const a = rAccess(home, g), b = rAccess(target, g), spine = g.corr / 2, w = rWalker(MGR, "paper", a.seat);
  try {
    await rTrip(w, a, b, spine, "seat", "stand"); rFace(w, b.side > 0 ? "left" : "right");
    const c = w.querySelector(".carry"); if (c) { c.style.setProperty("--hx", -b.side * 44 + "px"); c.classList.add("give"); }
    await rSleep(600); c?.remove(); (rDeskEl(job.to, job.proj)?.querySelector(".table"))?.append(rel("i", "pile paper"));   // the paper lands on their desk
    rSay(w, job.say); await rSleep(Math.min(3000, Math.max(2000, rBubbleMs(job.say))));
    rWake(job.to, job.proj, true); await rUnsay(w);
    await rTrip(w, b, a, spine, "stand", "seat");
  } finally { w.remove(); }
  rContact[rK(job.to, job.proj)] = Date.now();
}
async function rReport(job) {                 // a finished member hands the result to Doraemon
  const g = rGeo(), home = rDeskEl(job.role, job.proj), mgr = rDeskEl(MGR, job.proj), mk = rK(MGR, job.proj); if (!home || !mgr || home === mgr) return;
  home.classList.add("away");
  const a = rAccess(home, g), b = rAccess(mgr, g), spine = g.corr / 2, w = rWalker(job.role, job.item, a.seat);
  try {
    await rTrip(w, a, b, spine, "seat", "stand"); rFace(w, b.side > 0 ? "left" : "right");
    for (let t = 0; rAway.has(mk) && t < 6000; t += 200) await rSleep(200);   // he is out on a visit: wait up to 6 s
    if (!rAway.has(mk)) {
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
    const d = rDeskEl(job.role, job.proj), m = rDeskEl(MGR, job.proj); if (!d) return;
    tick(d, "ring"); if (m) tick(m, "ring");
    const n = rel("div", "plate-note", "→ Doraemon"); d.querySelector(".plate")?.append(n); setTimeout(() => n.remove(), 4000);
    rStaticBubble(d, job.say);
  } else if (job.kind === "task") {
    const d = rDeskEl(job.to, job.proj); if (!d) return;
    const pin = rMini(MGR, "working", 0); pin.classList.add("pin"); const ico = rel("i", "papericon"); ico.setAttribute("aria-hidden", "true");
    d.querySelector(".plate")?.append(pin, ico); setTimeout(() => { pin.remove(); ico.remove(); }, 4000); rStaticBubble(d, job.say);
  } else {
    const d = rDeskEl(job.to, job.proj); if (!d) return;
    const pin = rMini(MGR, "working", 0); pin.classList.add("pin"); d.querySelector(".plate")?.append(pin); setTimeout(() => pin.remove(), 4000);
    rStaticBubble(d, job.kind === "checkin" ? "📋 Checking in" : job.say);
  }
}
function rStaticBubble(desk, text) { if (!text) return; const b = rel("div", "sbubble"); b.append(rel("span", null, text)); desk.append(b); setTimeout(() => b.remove(), 4000); }

// ---- Card: hover, focus or tap a character or plate. Esc or a click elsewhere closes it. ----
let rCardId = null, rPinned = null;
const rMins = (iso) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
const rSpan = (m) => m < 1 ? "under a minute" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
function rCardEl() { let c = $("r-card"); if (!c) { c = rel("div", "rcard"); c.id = "r-card"; c.hidden = true; RSVG("view-room").append(c); } return c; }
function rHideCard() { rCardId = rPinned = null; rCardEl().hidden = true; }
function rRefreshCard() { if (!rCardId) return; const at = rCardId.indexOf("@"), id = rCardId.slice(0, at), p = rCardId.slice(at + 1); if (rDeskEl(id, p)) rShowCard(id, p); else rHideCard(); }
// Today's spend for one person in one room: "≈ $0.42 today · 1 run". Empty when the board has no figure for them.
function rCostLine(id, p) {
  const w = own(last?.cost?.windows, "today"); if (!w) return "";
  const rows = (p ? [own(w.agents, p)] : Object.values(w.agents || {})).flat().filter((a) => a && a.role === id);
  if (!rows.length) return "";
  const usd = sumUsd(rows), runs = rows.some((a) => a.runs != null) ? rows.reduce((n, a) => n + (a.runs ?? 0), 0) : null;
  return `${usd == null ? "–" : "≈ " + fmtFloor(usd, rows.some((a) => a.unpriced?.length))} today${runs != null ? ` · ${runs} run${runs === 1 ? "" : "s"}` : ""}`;
}
function rShowCard(id, p = "") {
  const role = rState?.roles.find((x) => x.id === id), m = rMemOf(id, p), desk = rDeskEl(id, p); if (!role || !m || !desk) return;
  rCardId = rK(id, p);
  const c = rCardEl(), s = m.status === "idle" ? "queued" : m.status;
  const hand = m.lastHandback && typeof m.lastHandback === "object" ? m.lastHandback.text : m.lastHandback;   // may be ""
  const state = s === "working" ? (m.since ? `Working for ${rSpan(rMins(m.since))}` : "Working now") : s === "done" ? (m.since ? `Done ${rSpan(rMins(m.since))} ago` : "Done") : "Idle";
  const head = rel("div", "rc-head"), who = rel("div", "rc-who");
  who.append(rel("b", null, role.mascot), rel("span", null, [rTitleFull({ ...role, ...m }), rTeam({ ...role, ...m })].filter(Boolean).join(" · ")));   // the full name, pet and all, lives only here
  head.append(rMini(id, s, 0), who);
  const x = { ...role, ...m }, rows = [head, rel("div", "rc-state", state)];
  const nMgr = id === MGR && s === "working" ? tasksOf(last).active.filter((t) => inProj(t, p)).length : 0;
  const task = id === MGR && nMgr ? `Managing ${nMgr} task${nMgr === 1 ? "" : "s"}` : m.task || m.line;
  if (task && task !== state) rows.push(rel("p", "rc-task", task));
  rows.push(rel("p", "rc-model", rModelLine(x)));
  const nd = needList(last || {}).find((n) => roleId(n.role) === id && (!n.project || n.project === p));
  if (nd) rows.push(rel("p", "rc-need", nd.kind === "permission" ? "Waiting for your permission" : nd.kind === "idle" ? "Waiting for your reply" : "Waiting for you"));
  const cl = rCostLine(id, p); if (cl) rows.push(rel("p", "rc-cost num", cl));
  if (hand && hand !== m.line) rows.push(rel("p", "rc-hand", "Last hand-back: " + hand));
  else if (s === "done" && m.line) rows.push(rel("p", "rc-hand", "Handed back: " + m.line));
  if (p && !rProj) rows.push(rel("p", "rc-ref", "Project: " + p));    // only in All: in one project the page already says which
  if (m.ref) rows.push(rel("p", "rc-ref", m.ref));
  c.replaceChildren(...rows); c.hidden = false;
  const b = desk.getBoundingClientRect(), w = c.offsetWidth, h = c.offsetHeight;
  c.style.left = Math.max(8, Math.min(innerWidth - w - 8, b.left + b.width / 2 - w / 2)) + "px";
  c.style.top = (b.top - h - 8 >= 52 ? b.top - h - 8 : Math.min(innerHeight - h - 8, b.bottom + 8)) + "px";
}
function rWireCard(desk, id, p = "") {
  const k = rK(id, p);
  desk.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") rShowCard(id, p); });
  desk.addEventListener("pointerleave", () => { if (rPinned !== k) rHideCard(); });
  desk.addEventListener("focus", () => rShowCard(id, p));
  desk.addEventListener("blur", () => { if (rPinned !== k) rHideCard(); });
  desk.addEventListener("click", (e) => { e.stopPropagation(); if (rPinned === k) rHideCard(); else { rPinned = k; rShowCard(id, p); } });
  desk.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); desk.click(); } });
}
addEventListener("keydown", (e) => { if (e.key === "Escape") rHideCard(); });
addEventListener("click", () => rHideCard());
addEventListener("scroll", () => rHideCard(), { passive: true });

$("anim").onclick = () => { const on = rMotion(); rPut("crewMotion", on ? "off" : "on"); rSetMotion(on ? "off" : "on"); if (on) { RSVG("r-walkers").replaceChildren(); } };
rSetMotion((() => { try { const v = localStorage.getItem("crewMotion"); return v === "on" || v === "off" ? v : ""; } catch { return ""; } })());

// ---- Theme: follows the device, the toggle overrides it for this viewer ----
const root = document.documentElement;
{ const t = rGet("crewTheme", ""); if (t === "dark" || t === "light") root.dataset.theme = t; }
const themeBtn = $("theme");
const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
const paintTheme = () => { const d = isDark(); themeBtn.textContent = d ? "☾ Dark" : "☀ Light"; themeBtn.setAttribute("aria-label", `Theme: ${d ? "dark" : "light"}. Switch to ${d ? "light" : "dark"}`); };
themeBtn.onclick = () => { const next = isDark() ? "light" : "dark"; root.dataset.theme = next; rPut("crewTheme", next); paintTheme(); };
try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintTheme); } catch {}
paintTheme();

// ---- Polling: every 2 s while the tab is visible, slower after failures, none while it is hidden ----
let pollT = 0, polling = false, fails = 0;
function schedule() { clearTimeout(pollT); if (document.hidden) return; pollT = setTimeout(tick, fails ? Math.min(15000, 2000 * (fails + 1)) : 2000); }
async function tick() {
  if (polling) return;
  polling = true; clearTimeout(pollT);
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch("/api/state", { cache: "no-store", signal: ctl.signal }); clearTimeout(to);
    if (!r.ok) throw new Error(String(r.status));
    last = await r.json(); fails = 0;
    setConn(true, last); paintAll();
  } catch (e) { fails++; setConn(false); }
  finally { polling = false; schedule(); }
}
document.addEventListener("visibilitychange", () => { if (document.hidden) clearTimeout(pollT); else tick(); });
tick();
