import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("..", import.meta.url));
const pageSource = readFileSync(join(root, "app/page.tsx"), "utf8");
const creatureAssets = readdirSync(join(root, "public/assets/creatures")).filter((file) => file.endsWith(".svg"));

test("all creature types have all evolution stage assets", () => {
  const types = ["blob", "dragon", "robot", "forest-sprite", "rock-golem", "space-beast"];
  const stages = ["egg", "hatchling", "youngling", "explorer", "champion"];
  for (const type of types) {
    for (const stage of stages) {
      assert.ok(creatureAssets.includes(`${type}-${stage}.svg`), `${type}-${stage}.svg missing`);
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

test("admin backup and progress export actions are exposed", () => {
  assert.match(pageSource, /Download backup/);
  assert.match(pageSource, /Export progress CSV/);
  assert.ok(pageSource.includes("/backup"));
  assert.ok(pageSource.includes("/progress.csv"));
});
