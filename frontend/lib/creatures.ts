export const CREATURE_TYPES = ["Blob", "Dragon", "Robot", "Forest Sprite", "Rock Golem", "Space Beast"];

export const CREATURE_STAGES = [
  { name: "Egg", level: 1 },
  { name: "Hatchling", level: 2 },
  { name: "Youngling", level: 4 },
  { name: "Explorer", level: 7 },
  { name: "Champion", level: 11 },
];

const STAGE_SLUGS: Record<string, string> = {
  Egg: "egg",
  Hatchling: "hatchling",
  Youngling: "youngling",
  Explorer: "explorer",
  Champion: "champion",
  Mega: "mega",
};

const CREATURE_SLUGS: Record<string, string> = {
  Blob: "blob",
  Dragon: "dragon",
  Robot: "robot",
  "Forest Sprite": "forest-sprite",
  "Rock Golem": "rock-golem",
  "Space Beast": "space-beast",
};

export function creatureAsset(type: string, stage: string) {
  const typeSlug = CREATURE_SLUGS[type] || "blob";
  const stageSlug = STAGE_SLUGS[stage] || "egg";
  return `/assets/creatures/${typeSlug}-${stageSlug}.svg`;
}

export function creatureSlug(type: string) {
  return CREATURE_SLUGS[type] || "blob";
}
