// The crew as the board knows it: display name, job and desk order per agent file. Model, effort, colour,
// turns and the "(v0.2, training)" tag come from the agent file's frontmatter, never from here.
export interface RosterEntry { id: string; mascot: string; name: string; show: string; role: string; team: string; title: string; order: number; color: string }

// Source of truth: docs/planning/cast-v2.md. `mascot` and `name` are the same text; `role` repeats `title` for older readers.
const cast = (order: number, id: string, name: string, show: string, team: string, title: string, color: string): RosterEntry =>
  ({ id, mascot: name, name, show, role: title, team, title, order, color });

export const ROSTER: readonly RosterEntry[] = [
  cast(1, "doraemon", "Doraemon", "Doraemon", "Management", "Engineering Manager", "blue"),
  cast(2, "miguel-rivera", "Miguel Rivera", "Coco", "Management", "Knowledge Manager", "orange"),
  cast(3, "nobita", "Nobita", "Doraemon", "Frontend Team", "UX & Design Lead", "yellow"),
  cast(4, "shinchan", "Shinchan + Shiro", "Crayon Shin-chan", "Frontend Team", "Frontend Developer", "red"),
  cast(5, "kevin", "Kevin", "Minions", "Backend Team", "Backend Lead", "yellow"),
  cast(6, "bob", "Bob", "Minions", "Backend Team", "Backend Developer", "blue"),
  cast(7, "mike-wazowski", "Mike Wazowski", "Monsters University", "DevOps Team", "DevOps Engineer (CI, builds, Docker, local stack)", "cyan"),
  cast(8, "sulley", "Sulley", "Monsters University", "DevOps Team", "SRE (deploys, rollouts, rollbacks, backups, monitoring, incidents)", "purple"),
  cast(9, "ninja-hattori", "Ninja Hattori + Shishimaru", "Ninja Hattori-kun", "Security Team", "Security Engineer (review only)", "blue"),
  cast(10, "joe-gardner", "Joe Gardner", "Soul", "QA Team", "QA Engineer (runs every check, exact counts)", "purple"),
  cast(11, "twenty-two", "22", "Soul", "QA Team", "Exploratory Tester (edge cases, odd paths, browser walk-throughs; reports, never fixes)", "cyan"),
  cast(12, "dekisugi", "Dekisugi", "Doraemon", "Research Team", "Research Lead", "orange"),
  cast(13, "olaf", "Olaf", "Frozen", "Research Team", "Research Analyst", "cyan"),
  cast(14, "shizuka", "Shizuka", "Doraemon", "Documentation Team", "Technical Writer", "pink"),
  cast(15, "stuart", "Stuart", "Minions", "Helpers", "Code Search Assistant (quick lookups, path:line)", "yellow"),
];

// Characters merged away in the plugin; the screen hangs them as framed pictures.
export interface Retired { id: string; name: string; show: string; mergedInto: string }
export const RETIRED: readonly Retired[] = [
  { id: "dorami", name: "Dorami", show: "Doraemon", mergedInto: "miguel-rivera" },
  { id: "scrooge", name: "Scrooge McDuck", show: "DuckTales", mergedInto: "kevin" },
  { id: "bob-the-builder", name: "Bob the Builder", show: "Bob the Builder", mergedInto: "bob" },
  { id: "chhota-bheem", name: "Chhota Bheem", show: "Chhota Bheem", mergedInto: "mike-wazowski" },
  { id: "scooby-doo", name: "Scooby-Doo", show: "Scooby-Doo", mergedInto: "ninja-hattori" },
  { id: "tom", name: "Tom", show: "Tom and Jerry", mergedInto: "joe-gardner" },
  { id: "dexter", name: "Dexter", show: "Dexter's Laboratory", mergedInto: "dekisugi" },
  { id: "velma", name: "Velma", show: "Scooby-Doo", mergedInto: "olaf" },
  { id: "chip-and-dale", name: "Chip & Dale", show: "Chip 'n' Dale: Rescue Rangers", mergedInto: "stuart" },
  { id: "suneo", name: "Suneo", show: "Doraemon", mergedInto: "shizuka" },
  { id: "shaktimaan", name: "Shaktimaan", show: "Shaktimaan", mergedInto: "kevin" },
];

// Old agent types in the event log (and spelling variants) count for their new role.
export const ALIASES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(RETIRED.map((r) => [r.id, r.mergedInto])),
  "chip-n-dale": "stuart",
  "scrooge-mcduck": "kevin",
};
