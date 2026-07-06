import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("..", import.meta.url));
const pageSource = readFileSync(join(root, "app/page.tsx"), "utf8");
const numberPadSource = readFileSync(join(root, "components/NumberPad.tsx"), "utf8");
const loginSource = readFileSync(join(root, "components/ProfileLogin.tsx"), "utf8");
const creatureAssets = readdirSync(join(root, "public/assets/creatures")).filter((file) => file.endsWith(".svg"));

test("all creature types have all evolution stage assets", () => {
  const types = ["blob", "dragon", "robot", "forest-sprite", "rock-golem", "space-beast"];
  const stages = ["egg", "hatchling", "youngling", "explorer", "champion"];
  for (const type of types) {
    for (const stage of stages) {
      assert.ok(creatureAssets.includes(`${type}-${stage}.svg`), `${type}-${stage}.svg missing`);
      const source = readFileSync(join(root, "public/assets/creatures", `${type}-${stage}.svg`), "utf8");
      assert.match(source, /viewBox="0 0 320 320"/);
      assert.match(source, new RegExp(`aria-label="[^"]+ ${stage[0].toUpperCase() + stage.slice(1)} stage"`));
    }
  }
});

test("active maths flows guard against accidental exit", () => {
  assert.match(pageSource, /Leave this practice session and go home/);
  assert.match(pageSource, /Leave this training quest and go home/);
  assert.match(pageSource, /Leave this challenge and go home/);
});

test("practice uses a setup screen before the focused answer surface", () => {
  assert.match(pageSource, /Practice setup/);
  assert.match(pageSource, /Start practice/);
  assert.match(pageSource, /startSession/);
});

test("focused maths runs use a stable timer-free keypad", () => {
  assert.match(numberPadSource, /aria-label="Number pad"/);
  assert.match(numberPadSource, /Clear answer/);
  assert.match(numberPadSource, /Delete last digit/);
  assert.doesNotMatch(pageSource, /countdown/i);
});

test("profile chooser supports passcode login and first-time setup", () => {
  assert.match(loginSource, /Who is practising/);
  assert.match(loginSource, /current-password/);
  assert.match(loginSource, /Create the parent profile/);
  assert.match(pageSource, /\/auth\/login/);
  assert.match(pageSource, /\/auth\/logout/);
});

test("evolution uses a dedicated navigation-gated event screen", () => {
  assert.match(pageSource, /trying to evolve/);
  assert.match(pageSource, /EvolutionPage/);
  assert.match(pageSource, /reached \{event\.toStage\} stage/);
  assert.match(pageSource, /pendingEvolution/);
  assert.match(pageSource, /evolutionMorph/);
  assert.match(pageSource, /CREATURE_STAGES\.map/);
  assert.match(pageSource, /speciesPicker/);
});

test("admin backup and progress export actions are exposed", () => {
  assert.match(pageSource, /Download backup/);
  assert.match(pageSource, /Export progress CSV/);
  assert.ok(pageSource.includes("/backup"));
  assert.ok(pageSource.includes("/progress.csv"));
});
