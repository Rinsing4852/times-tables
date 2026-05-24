import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const outDir = fileURLToPath(new URL("../public/assets/creatures", import.meta.url));
mkdirSync(outDir, { recursive: true });

const stages = {
  Egg: { slug: "egg", size: 0.78, hat: false, crown: false, arms: false, legs: false },
  Hatchling: { slug: "hatchling", size: 0.9, hat: false, crown: false, arms: false, legs: true },
  Youngling: { slug: "youngling", size: 1, hat: false, crown: false, arms: true, legs: true },
  Explorer: { slug: "explorer", size: 1.1, hat: true, crown: false, arms: true, legs: true },
  Champion: { slug: "champion", size: 1.18, hat: false, crown: true, arms: true, legs: true }
};

const types = {
  Blob: {
    slug: "blob",
    body: ["#dff7ff", "#6fcf97", "#42aa6f"],
    accent: "#f2d133",
    ears: "round",
    extra: ""
  },
  Dragon: {
    slug: "dragon",
    body: ["#e7ffd9", "#69b34c", "#2f8f46"],
    accent: "#f2d133",
    ears: "horn",
    extra: "<path d=\"M181 141c29 6 42 25 33 46-18-19-32-21-51-12\" fill=\"#69b34c\" stroke=\"#18212f\" stroke-width=\"7\" stroke-linejoin=\"round\"/>"
  },
  Robot: {
    slug: "robot",
    body: ["#e7f2ff", "#8fb7d8", "#557da4"],
    accent: "#77e0ff",
    ears: "antenna",
    extra: "<path d=\"M83 78h74\" stroke=\"#18212f\" stroke-width=\"7\" stroke-linecap=\"round\"/><circle cx=\"120\" cy=\"33\" r=\"9\" fill=\"#77e0ff\" stroke=\"#18212f\" stroke-width=\"6\"/>"
  },
  "Forest Sprite": {
    slug: "forest-sprite",
    body: ["#e8ffe9", "#56b58a", "#2d8f6b"],
    accent: "#8ad46f",
    ears: "leaf",
    extra: "<path d=\"M126 40c22-21 47-20 63 3-23 3-38 13-48 31\" fill=\"#8ad46f\" stroke=\"#18212f\" stroke-width=\"7\" stroke-linejoin=\"round\"/>"
  },
  "Rock Golem": {
    slug: "rock-golem",
    body: ["#f1eee8", "#a59d91", "#726b63"],
    accent: "#d8c29a",
    ears: "stone",
    extra: "<path d=\"M72 75 95 43h51l23 32\" fill=\"#8d867d\" stroke=\"#18212f\" stroke-width=\"7\" stroke-linejoin=\"round\"/>"
  },
  "Space Beast": {
    slug: "space-beast",
    body: ["#efeaff", "#7e6ed6", "#5545a8"],
    accent: "#7de3ff",
    ears: "star",
    extra: "<circle cx=\"190\" cy=\"58\" r=\"10\" fill=\"#7de3ff\" stroke=\"#18212f\" stroke-width=\"5\"/><path d=\"M53 58h18M62 49v18\" stroke=\"#f2d133\" stroke-width=\"6\" stroke-linecap=\"round\"/>"
  }
};

function ears(kind, accent) {
  if (kind === "horn") {
    return `<path d="M77 74 44 35l3 62" fill="${accent}" stroke="#18212f" stroke-width="7" stroke-linejoin="round"/>
<path d="m163 74 33-39-3 62" fill="${accent}" stroke="#18212f" stroke-width="7" stroke-linejoin="round"/>`;
  }
  if (kind === "antenna") {
    return `<path d="M91 72 69 44M149 72l22-28" stroke="#18212f" stroke-width="7" stroke-linecap="round"/>
<circle cx="67" cy="42" r="8" fill="${accent}" stroke="#18212f" stroke-width="5"/>
<circle cx="173" cy="42" r="8" fill="${accent}" stroke="#18212f" stroke-width="5"/>`;
  }
  if (kind === "leaf") {
    return `<path d="M80 73C60 44 43 40 26 45c11 23 27 35 52 36" fill="${accent}" stroke="#18212f" stroke-width="7" stroke-linejoin="round"/>
<path d="M160 73c20-29 37-33 54-28-11 23-27 35-52 36" fill="${accent}" stroke="#18212f" stroke-width="7" stroke-linejoin="round"/>`;
  }
  if (kind === "stone") {
    return `<path d="M77 73 55 47l-16 42" fill="${accent}" stroke="#18212f" stroke-width="7" stroke-linejoin="round"/>
<path d="m163 73 22-26 16 42" fill="${accent}" stroke="#18212f" stroke-width="7" stroke-linejoin="round"/>`;
  }
  if (kind === "star") {
    return `<path d="m78 72-27-8-15 24 30 8" fill="${accent}" stroke="#18212f" stroke-width="7" stroke-linejoin="round"/>
<path d="m162 72 27-8 15 24-30 8" fill="${accent}" stroke="#18212f" stroke-width="7" stroke-linejoin="round"/>`;
  }
  return `<path d="M79 75 50 54l-1 42" fill="${accent}" stroke="#18212f" stroke-width="7" stroke-linejoin="round"/>
<path d="m161 75 29-21 1 42" fill="${accent}" stroke="#18212f" stroke-width="7" stroke-linejoin="round"/>`;
}

function svg(typeName, type, stageName, stage) {
  const [light, mid, dark] = type.body;
  const sy = 120 - stage.size * 120;
  const bodyTop = Math.round(40 + sy * 0.08);
  const bodyWidth = Math.round(58 * stage.size);
  const bodyHeight = Math.round(86 * stage.size);
  const bodyBottom = Math.round(126 + bodyHeight * 0.38);
  const arms = stage.arms ? `<path d="M${62 - bodyWidth * 0.18} 140 25 160M${178 + bodyWidth * 0.18} 140l37 20" stroke="#18212f" stroke-width="10" stroke-linecap="round"/>` : "";
  const legs = stage.legs ? `<path d="M90 ${bodyBottom} 72 232M150 ${bodyBottom}l18 20" stroke="#18212f" stroke-width="10" stroke-linecap="round"/>` : "";
  const hat = stage.hat ? `<path d="M74 50h92l-10 28H84z" fill="#2563eb" stroke="#18212f" stroke-width="7" stroke-linejoin="round"/>` : "";
  const crown = stage.crown ? `<path d="M78 51h84l-7 29H85z" fill="#7c3aed" stroke="#18212f" stroke-width="7" stroke-linejoin="round"/><path d="M91 51 120 18l29 33" fill="${type.accent}" stroke="#18212f" stroke-width="7" stroke-linejoin="round"/>` : "";
  const eggCrack = stageName === "Egg" ? `<path d="M70 132c17-16 32-16 49 0 16 15 32 15 51 0" fill="none" stroke="#18212f" stroke-width="7" stroke-linecap="round"/>` : "";
  const label = `${typeName} ${stageName} stage`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="body" x1="48" x2="192" y1="28" y2="224" gradientUnits="userSpaceOnUse">
      <stop stop-color="${light}"/>
      <stop offset=".68" stop-color="${mid}"/>
      <stop offset="1" stop-color="${dark}"/>
    </linearGradient>
  </defs>
  ${type.extra}
  ${stageName === "Egg" ? "" : ears(type.ears, type.accent)}
  ${hat}${crown}
  ${arms}
  <path d="M${120 - bodyWidth} 128c0-${Math.round(56 * stage.size)} ${Math.round(26 * stage.size)}-${Math.round(88 * stage.size)} ${bodyWidth}-${Math.round(88 * stage.size)}s${bodyWidth} ${Math.round(32 * stage.size)} ${bodyWidth} ${Math.round(88 * stage.size)}v${Math.round(28 * stage.size)}c0 ${Math.round(38 * stage.size)}-${Math.round(25 * stage.size)} ${Math.round(62 * stage.size)}-${bodyWidth} ${Math.round(62 * stage.size)}s-${bodyWidth}-${Math.round(24 * stage.size)}-${bodyWidth}-${Math.round(62 * stage.size)}z" fill="url(#body)" stroke="#18212f" stroke-width="8"/>
  ${eggCrack}
  <circle cx="96" cy="${stageName === "Egg" ? 108 : 114}" r="${stageName === "Champion" ? 10 : 9}" fill="#18212f"/>
  <circle cx="144" cy="${stageName === "Egg" ? 108 : 114}" r="${stageName === "Champion" ? 10 : 9}" fill="#18212f"/>
  <path d="M106 153c11 10 17 10 28 0" fill="none" stroke="#18212f" stroke-width="7" stroke-linecap="round"/>
  ${legs}
</svg>`;
}

for (const [typeName, type] of Object.entries(types)) {
  for (const [stageName, stage] of Object.entries(stages)) {
    writeFileSync(join(outDir, `${type.slug}-${stage.slug}.svg`), svg(typeName, type, stageName, stage));
  }
}
