import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const stages = ["egg", "hatchling", "youngling", "explorer", "champion"];
const outputDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "creatures");
const ink = "#172033";

const face = (x = 160, y = 150, scale = 1, eye = "#172033") => `
  <ellipse cx="${x - 25 * scale}" cy="${y}" rx="${7 * scale}" ry="${9 * scale}" fill="${eye}"/>
  <ellipse cx="${x + 25 * scale}" cy="${y}" rx="${7 * scale}" ry="${9 * scale}" fill="${eye}"/>
  <path d="M${x - 16 * scale} ${y + 25 * scale} Q${x} ${y + 39 * scale} ${x + 16 * scale} ${y + 25 * scale}" fill="none" stroke="${eye}" stroke-width="${6 * scale}" stroke-linecap="round"/>`;

const highlight = (x, y, size = 12) => `<path d="M${x} ${y - size}v${size * 2}M${x - size} ${y}h${size * 2}" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".86"/>`;

function svg(label, colors, content) {
  const accessibleLabel = label.replace(/\b(egg|hatchling|youngling|explorer|champion)\b/, (value) => value[0].toUpperCase() + value.slice(1));
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" role="img" aria-label="${accessibleLabel}">
  <defs>
    <linearGradient id="body" x1="95" y1="70" x2="228" y2="266" gradientUnits="userSpaceOnUse">
      <stop stop-color="${colors[0]}"/><stop offset=".62" stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[2]}"/>
    </linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="5"/></filter>
  </defs>
  ${content}
</svg>\n`;
  return markup.replace(/[ \t]+$/gm, "");
}

function blob(stage) {
  const s = stages.indexOf(stage);
  const colors = ["#b8fff0", "#54d9b0", "#198f85"];
  if (s === 0) return svg("Blob Egg stage", colors, `
    <ellipse cx="160" cy="262" rx="74" ry="15" fill="#172033" opacity=".12"/>
    <path d="M160 49C116 89 98 132 105 191c6 50 27 77 55 77s49-27 55-77c7-59-11-102-55-142Z" fill="url(#body)" stroke="${ink}" stroke-width="9" stroke-linejoin="round"/>
    <path d="M132 106c11-20 29-30 47-31" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".55"/>
    <circle cx="160" cy="180" r="27" fill="#ffe06b" stroke="${ink}" stroke-width="7"/>${highlight(160,180,8)}
    <path d="M130 225q30 17 60 0" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>`);
  const sizes = [[105,92,230],[111,72,248],[120,55,260],[130,38,274]][s - 1];
  const [rx, top, bottom] = sizes;
  const crest = s >= 2 ? `<path d="M139 ${top + 9}q21-35 42 0l-6 20h-30Z" fill="#ffe06b" stroke="${ink}" stroke-width="7"/>` : "";
  const arms = s >= 1 ? `<path d="M${160-rx+18} 171q-24 14-32 43M${160+rx-18} 171q24 14 32 43" fill="none" stroke="${ink}" stroke-width="13" stroke-linecap="round"/>` : "";
  const feet = s >= 2 ? `<path d="M126 ${bottom-24}q-22 25-45 27M194 ${bottom-24}q22 25 45 27" fill="none" stroke="${ink}" stroke-width="15" stroke-linecap="round"/>` : "";
  const fins = s >= 3 ? `<path d="M61 156q-28-33-17-61 35 8 49 42M259 156q28-33 17-61-35 8-49 42" fill="#72e8c8" stroke="${ink}" stroke-width="8" stroke-linejoin="round"/>` : "";
  const core = s >= 2 ? `<path d="m160 183 11 19 22 4-15 16 3 23-21-10-21 10 3-23-15-16 22-4Z" fill="#ffe06b" stroke="${ink}" stroke-width="6"/>` : `<circle cx="160" cy="207" r="16" fill="#ffe06b" stroke="${ink}" stroke-width="6"/>`;
  return svg(`Blob ${stage} stage`, colors, `
    <ellipse cx="160" cy="278" rx="${rx*.72}" ry="14" fill="#172033" opacity=".13"/>${fins}${arms}${feet}
    <path d="M160 ${top}C${160-rx*.76} ${top+12} ${160-rx} 122 ${160-rx} 190C${160-rx} ${bottom-24} ${160-rx*.55} ${bottom} 160 ${bottom}S${160+rx} ${bottom-24} ${160+rx} 190C${160+rx} 122 ${160+rx*.76} ${top+12} 160 ${top}Z" fill="url(#body)" stroke="${ink}" stroke-width="9" stroke-linejoin="round"/>
    ${crest}<path d="M112 113q14-25 42-29" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".45"/>
    ${face(160,148,1)}${core}`);
}

function dragon(stage) {
  const s = stages.indexOf(stage);
  const colors = ["#c9ff9d", "#68c95b", "#298d55"];
  if (s === 0) return svg("Dragon Egg stage", colors, `
    <ellipse cx="160" cy="270" rx="72" ry="14" fill="${ink}" opacity=".12"/>
    <path d="M160 48c-47 0-77 62-70 137 5 57 29 82 70 82s65-25 70-82c7-75-23-137-70-137Z" fill="url(#body)" stroke="${ink}" stroke-width="9"/>
    <path d="m108 159 28-18 25 20 26-22 25 18M126 213l34-22 34 22" fill="none" stroke="#f3d56a" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M193 79q31 22 21 54" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".5"/>
    <path d="M137 112q23-20 46 0" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>`);
  const growth = s - 1;
  const bodyHalf = [50, 59, 68, 76][growth];
  const bodyTop = [124, 109, 94, 80][growth];
  const bodyBottom = [248, 256, 266, 276][growth];
  const wingOuter = [76, 56, 38, 24][growth];
  const wingTop = [124, 105, 86, 70][growth];
  const horns = s >= 2 ? `<path d="M126 101 110 ${56-growth*5}l35 31M194 101l16-${45+growth*5}-35 31" fill="#f3d56a" stroke="${ink}" stroke-width="8" stroke-linejoin="round"/>` : "";
  const wings = `<path d="M${160-bodyHalf+10} 151Q${wingOuter+20} ${wingTop} ${wingOuter} ${wingTop+18}l${30+growth*7} ${27+growth*5}-${35+growth*7} ${24+growth*4}q36 6 66 29Z" fill="#87df78" stroke="${ink}" stroke-width="9" stroke-linejoin="round"/>
    <path d="M${160+bodyHalf-10} 151Q${320-wingOuter-20} ${wingTop} ${320-wingOuter} ${wingTop+18}l-${30+growth*7} ${27+growth*5} ${35+growth*7} ${24+growth*4}q-36 6-66 29Z" fill="#87df78" stroke="${ink}" stroke-width="9" stroke-linejoin="round"/>`;
  const crown = s === 4 ? `<path d="m133 74 10-29 17 20 18-20 10 29" fill="#f3d56a" stroke="${ink}" stroke-width="7" stroke-linejoin="round"/>` : "";
  return svg(`Dragon ${stage} stage`, colors, `
    <ellipse cx="160" cy="281" rx="86" ry="15" fill="${ink}" opacity=".13"/>
    <path d="M214 214q67 4 63-49-18 25-45 13" fill="#4aad58" stroke="${ink}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>${wings}${horns}${crown}
    <path d="M${160-bodyHalf+7} ${bodyTop+64}q-32 23-38 61M${160+bodyHalf-7} ${bodyTop+64}q32 23 38 61" fill="none" stroke="${ink}" stroke-width="15" stroke-linecap="round"/>
    <path d="M160 ${bodyTop}C${160-bodyHalf*.66} ${bodyTop} ${160-bodyHalf} ${bodyTop+31} ${160-bodyHalf} ${bodyTop+85}V${bodyBottom-42}C${160-bodyHalf} ${bodyBottom-14} ${160-bodyHalf*.52} ${bodyBottom} 160 ${bodyBottom}S${160+bodyHalf} ${bodyBottom-14} ${160+bodyHalf} ${bodyBottom-42}V${bodyTop+85}C${160+bodyHalf} ${bodyTop+31} ${160+bodyHalf*.66} ${bodyTop} 160 ${bodyTop}Z" fill="url(#body)" stroke="${ink}" stroke-width="10"/>
    <path d="M${160-bodyHalf*.44} ${bodyBottom-35} ${160-bodyHalf*.62} 278M${160+bodyHalf*.44} ${bodyBottom-35}l${bodyHalf*.18} ${313-bodyBottom}" fill="none" stroke="${ink}" stroke-width="16" stroke-linecap="round"/>
    <path d="M160 183q-25 0-35 23 35 20 70 0-10-23-35-23Z" fill="#f7e4a4" stroke="${ink}" stroke-width="7"/>
    ${face(160,145-growth*3,1)}
    <path d="m151 167 9 7 9-7" fill="none" stroke="${ink}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`);
}

function robot(stage) {
  const s = stages.indexOf(stage);
  const colors = ["#d9f4ff", "#8fc8e8", "#547ca5"];
  if (s === 0) return svg("Robot Egg stage", colors, `
    <ellipse cx="160" cy="272" rx="73" ry="14" fill="${ink}" opacity=".12"/>
    <rect x="91" y="56" width="138" height="207" rx="68" fill="url(#body)" stroke="${ink}" stroke-width="10"/>
    <rect x="113" y="100" width="94" height="74" rx="24" fill="#22304a" stroke="${ink}" stroke-width="7"/>
    <circle cx="139" cy="137" r="9" fill="#63e6ff"/><circle cx="181" cy="137" r="9" fill="#63e6ff"/>
    <path d="M133 211h54" stroke="#f4cc54" stroke-width="9" stroke-linecap="round"/>
    ${highlight(122,82,8)}`);
  const growth = s - 1;
  const torsoW = 104 + growth * 15;
  const x = 160 - torsoW / 2;
  const shoulders = s >= 3 ? `<path d="m${x+8} 158-42 15 18 40 29-20M${x+torsoW-8} 158l42 15-18 40-29-20" fill="#f4cc54" stroke="${ink}" stroke-width="9" stroke-linejoin="round"/>` : "";
  const antenna = `<path d="M160 ${78-growth*7}V${45-growth*4}" stroke="${ink}" stroke-width="8"/><circle cx="160" cy="${39-growth*4}" r="11" fill="#63e6ff" stroke="${ink}" stroke-width="7"/>`;
  const crown = s === 4 ? `<path d="M124 75 139 45l21 22 21-22 15 30" fill="#f4cc54" stroke="${ink}" stroke-width="8" stroke-linejoin="round"/>` : "";
  return svg(`Robot ${stage} stage`, colors, `
    <ellipse cx="160" cy="281" rx="91" ry="15" fill="${ink}" opacity=".13"/>${antenna}${crown}${shoulders}
    <path d="M${x+12} 194 65 240M${x+torsoW-12} 194l47 46" stroke="${ink}" stroke-width="17" stroke-linecap="round"/>
    <rect x="${x}" y="139" width="${torsoW}" height="108" rx="${25-growth*3}" fill="url(#body)" stroke="${ink}" stroke-width="10"/>
    <rect x="${108-growth*5}" y="${78-growth*7}" width="${104+growth*10}" height="91" rx="${30-growth*4}" fill="#d9f4ff" stroke="${ink}" stroke-width="10"/>
    <rect x="${124-growth*3}" y="${105-growth*4}" width="${72+growth*6}" height="42" rx="16" fill="#22304a"/>
    <circle cx="140" cy="${126-growth*4}" r="8" fill="#63e6ff"/><circle cx="180" cy="${126-growth*4}" r="8" fill="#63e6ff"/>
    <circle cx="160" cy="193" r="22" fill="#22304a" stroke="${ink}" stroke-width="5"/><path d="m160 177 6 11 13 2-10 9 2 13-11-6-11 6 2-13-10-9 13-2Z" fill="#f4cc54"/>
    <path d="M126 247v28M194 247v28" stroke="${ink}" stroke-width="18" stroke-linecap="round"/>`);
}

function forestSprite(stage) {
  const s = stages.indexOf(stage);
  const colors = ["#d7f2aa", "#78c96b", "#38875c"];
  if (s === 0) return svg("Forest Sprite Egg stage", colors, `
    <ellipse cx="160" cy="270" rx="69" ry="14" fill="${ink}" opacity=".12"/>
    <path d="M160 67c-50 0-72 54-65 122 6 54 29 75 65 75s59-21 65-75c7-68-15-122-65-122Z" fill="#b67845" stroke="${ink}" stroke-width="10"/>
    <path d="M159 70q-6-39 22-50 9 29-22 50Z" fill="#78c96b" stroke="${ink}" stroke-width="8"/>
    <path d="M115 145q45-37 90 0M126 213q34 22 68 0" fill="none" stroke="#f1d29a" stroke-width="9" stroke-linecap="round"/>
    <circle cx="160" cy="175" r="17" fill="#f1d29a" stroke="${ink}" stroke-width="6"/>`);
  const growth = s - 1;
  const canopy = s >= 2 ? `<path d="M109 ${103-growth*7}q-34-34-53-7 5 33 51 35M211 ${103-growth*7}q34-34 53-7-5 33-51 35" fill="#8bdc68" stroke="${ink}" stroke-width="9"/>
    <path d="M126 ${89-growth*8}q-9-46 23-55 18 27 11 57M194 ${89-growth*8}q9-46-23-55-18 27-11 57" fill="#4ba85f" stroke="${ink}" stroke-width="9"/>` : `<path d="M150 99q-20-44 13-58 25 29-3 60Z" fill="#78c96b" stroke="${ink}" stroke-width="8"/>`;
  const crown = s === 4 ? `<path d="M111 78q10-51 38-54l11 35 11-35q28 3 38 54" fill="none" stroke="#b67845" stroke-width="13" stroke-linecap="round"/>` : "";
  return svg(`Forest Sprite ${stage} stage`, colors, `
    <ellipse cx="160" cy="281" rx="83" ry="14" fill="${ink}" opacity=".13"/>${crown}${canopy}
    <path d="M111 174q-42 16-53 56M209 174q42 16 53 56" fill="none" stroke="#7d4f32" stroke-width="15" stroke-linecap="round"/>
    <path d="M160 ${99-growth*5}c-42 0-65 30-65 82v30c0 38 27 57 65 57s65-19 65-57v-30c0-52-23-82-65-82Z" fill="url(#body)" stroke="${ink}" stroke-width="10"/>
    <path d="M132 248q-8 23-28 29M188 248q8 23 28 29" fill="none" stroke="#7d4f32" stroke-width="16" stroke-linecap="round"/>
    <path d="M121 208q39 30 78 0" fill="#b67845" stroke="${ink}" stroke-width="7"/>
    ${face(160,157-growth*2,1)}
    <path d="M112 125q48-27 96 0" fill="none" stroke="#e8ffc8" stroke-width="8" stroke-linecap="round" opacity=".7"/>`);
}

function rockGolem(stage) {
  const s = stages.indexOf(stage);
  const colors = ["#e4dfd5", "#a9a197", "#6d6a70"];
  if (s === 0) return svg("Rock Golem Egg stage", colors, `
    <ellipse cx="160" cy="271" rx="74" ry="14" fill="${ink}" opacity=".13"/>
    <path d="m160 48 58 37 18 74-19 79-57 30-57-30-19-79 18-74Z" fill="url(#body)" stroke="${ink}" stroke-width="10" stroke-linejoin="round"/>
    <path d="m160 48-14 66 37 30-23 124M102 85l44 29-62 45M218 85l-35 59 53 15" fill="none" stroke="#7469d8" stroke-width="8" stroke-linejoin="round"/>
    <path d="m145 145 15-21 15 21-15 31Z" fill="#7de3ff" stroke="${ink}" stroke-width="6"/>`);
  const growth = s - 1;
  const shoulder = 35 + growth * 10;
  const crystals = s >= 2 ? `<path d="m108 124-17-${35+growth*5} 34 17 18 1M212 124l17-${35+growth*5}-34 17-18 1" fill="#7469d8" stroke="${ink}" stroke-width="8" stroke-linejoin="round"/>` : "";
  const crown = s === 4 ? `<path d="m125 91 9-53 26 35 28-42 10 60" fill="#7de3ff" stroke="${ink}" stroke-width="9" stroke-linejoin="round"/>` : "";
  return svg(`Rock Golem ${stage} stage`, colors, `
    <ellipse cx="160" cy="282" rx="104" ry="15" fill="${ink}" opacity=".14"/>${crystals}${crown}
    <path d="M${104-growth*8} 156 51 211l25 35 50-49M${216+growth*8} 156l53 55-25 35-50-49" fill="#8d877f" stroke="${ink}" stroke-width="11" stroke-linejoin="round"/>
    <path d="M160 ${87-growth*3} L${221+growth*7} ${141-growth*2} L${244+growth*5} 244 L204 284 L160 260 L116 284 L${76-growth*5} 244 L${99-growth*7} ${141-growth*2}Z" fill="url(#body)" stroke="${ink}" stroke-width="11" stroke-linejoin="round"/>
    <path d="m126 246-24 33M194 246l24 33" stroke="${ink}" stroke-width="22" stroke-linecap="round"/>
    <path d="m160 182 20 29-20 34-20-34Z" fill="#7de3ff" stroke="${ink}" stroke-width="7"/>${highlight(160,211,7)}
    ${face(160,139-growth*2,1,"#172033")}
    <path d="m111 116 22 13M209 116l-22 13" stroke="#f2efe9" stroke-width="8" stroke-linecap="round" opacity=".65"/>`);
}

function spaceBeast(stage) {
  const s = stages.indexOf(stage);
  const colors = ["#e7ddff", "#9e8ae8", "#5548a9"];
  if (s === 0) return svg("Space Beast Egg stage", colors, `
    <ellipse cx="160" cy="270" rx="72" ry="14" fill="${ink}" opacity=".13"/>
    <path d="M160 49c-47 0-77 59-70 133 5 58 29 84 70 84s65-26 70-84c7-74-23-133-70-133Z" fill="url(#body)" stroke="${ink}" stroke-width="10"/>
    <ellipse cx="160" cy="158" rx="45" ry="66" fill="none" stroke="#68e0ee" stroke-width="8" transform="rotate(24 160 158)"/>
    <ellipse cx="160" cy="158" rx="45" ry="66" fill="none" stroke="#f3ce5a" stroke-width="8" transform="rotate(-24 160 158)"/>
    <circle cx="160" cy="158" r="24" fill="#20284a" stroke="${ink}" stroke-width="6"/>${highlight(160,158,8)}`);
  const growth = s - 1;
  const ears = `<path d="M112 ${118-growth*5}Q${72-growth*8} ${75-growth*5} ${62-growth*5} ${112-growth*7}l42 35M208 ${118-growth*5}q${40+growth*8}-${43+growth*5} ${50+growth*5}-${6-growth*7}l-42 35" fill="#f3ce5a" stroke="${ink}" stroke-width="9" stroke-linejoin="round"/>`;
  const ring = s >= 2 ? `<ellipse cx="160" cy="179" rx="${115+growth*6}" ry="37" fill="none" stroke="#68e0ee" stroke-width="10" transform="rotate(-12 160 179)"/><circle cx="${57-growth*4}" cy="194" r="10" fill="#f3ce5a" stroke="${ink}" stroke-width="6"/>` : "";
  const crown = s === 4 ? `<path d="m121 91 12-54 27 31 28-38 13 61" fill="#68e0ee" stroke="${ink}" stroke-width="8" stroke-linejoin="round"/>` : "";
  return svg(`Space Beast ${stage} stage`, colors, `
    <ellipse cx="160" cy="282" rx="88" ry="15" fill="${ink}" opacity=".13"/>${ring}${ears}${crown}
    <path d="M111 174q-42 17-54 59M209 174q42 17 54 59" fill="none" stroke="${ink}" stroke-width="16" stroke-linecap="round"/>
    <path d="M160 ${91-growth*4}c-45 0-73 33-73 91v27c0 43 31 64 73 64s73-21 73-64v-27c0-58-28-91-73-91Z" fill="url(#body)" stroke="${ink}" stroke-width="10"/>
    <path d="M128 254q-14 18-34 24M192 254q14 18 34 24" fill="none" stroke="${ink}" stroke-width="16" stroke-linecap="round"/>
    <ellipse cx="160" cy="148" rx="23" ry="29" fill="#20284a"/><circle cx="160" cy="145" r="9" fill="#68e0ee"/>${highlight(163,141,4)}
    <path d="m160 188 8 15 17 3-12 12 3 17-16-8-16 8 3-17-12-12 17-3Z" fill="#f3ce5a" stroke="${ink}" stroke-width="6"/>
    <path d="M145 243q15 10 30 0" fill="none" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>`);
}

const creatures = {
  blob,
  dragon,
  robot,
  "forest-sprite": forestSprite,
  "rock-golem": rockGolem,
  "space-beast": spaceBeast,
};

mkdirSync(outputDir, { recursive: true });
for (const [creature, render] of Object.entries(creatures)) {
  for (const stage of stages) {
    writeFileSync(join(outputDir, `${creature}-${stage}.svg`), render(stage));
  }
}

console.log(`Generated ${Object.keys(creatures).length * stages.length} creature assets.`);
