// The crew as the board knows it: display name, job and desk order per agent file. Model, effort, colour,
// turns and the "(v0.2, training)" tag come from the agent file's frontmatter, never from here.
export interface RosterEntry { id: string; mascot: string; role: string; order: number }

export const ROSTER: readonly RosterEntry[] = [
  { id: "doraemon", mascot: "Doraemon", role: "Manager", order: 1 },
  { id: "scrooge", mascot: "Scrooge McDuck", role: "Expert backend developer", order: 2 },
  { id: "bob-the-builder", mascot: "Bob the Builder", role: "Developer", order: 3 },
  { id: "chhota-bheem", mascot: "Chhota Bheem", role: "DevOps / SRE", order: 4 },
  { id: "nobita", mascot: "Nobita", role: "UX lead", order: 5 },
  { id: "shinchan", mascot: "Shinchan", role: "UI builder", order: 6 },
  { id: "scooby-doo", mascot: "Scooby-Doo", role: "Security tester", order: 7 },
  { id: "tom", mascot: "Tom", role: "Tester", order: 8 },
  { id: "chip-and-dale", mascot: "Chip & Dale", role: "Quick lookups", order: 9 },
  { id: "dorami", mascot: "Dorami", role: "Crew keeper", order: 10 },
  { id: "shizuka", mascot: "Shizuka", role: "Writer and editor", order: 11 },
  { id: "dexter", mascot: "Dexter", role: "Research lead", order: 12 },
  { id: "velma", mascot: "Velma", role: "Research analyst", order: 13 },
];

// Characters merged away in the plugin; the screen hangs them as framed pictures.
export interface Retired { id: string; name: string; show: string; mergedInto: string }
export const RETIRED: readonly Retired[] = [
  { id: "dekisugi", name: "Dekisugi", show: "Doraemon", mergedInto: "chhota-bheem" },
  { id: "suneo", name: "Suneo", show: "Doraemon", mergedInto: "shizuka" },
  { id: "ninja-hattori", name: "Ninja Hattori", show: "Ninja Hattori", mergedInto: "bob-the-builder" },
  { id: "shaktimaan", name: "Shaktimaan", show: "Shaktimaan", mergedInto: "scrooge" },
];

// Old agent types in the event log (and spelling variants) count for their new role.
export const ALIASES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(RETIRED.map((r) => [r.id, r.mergedInto])),
  "chip-n-dale": "chip-and-dale",
  "scrooge-mcduck": "scrooge",
};
