import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("..", import.meta.url));
const pageSource = readFileSync(join(root, "app/page.tsx"), "utf8");
const numberPadSource = readFileSync(join(root, "components/NumberPad.tsx"), "utf8");
const loginSource = readFileSync(join(root, "components/ProfileLogin.tsx"), "utf8");
const creatureSource = readFileSync(join(root, "components/CreatureExperience.tsx"), "utf8");
const adminSource = readFileSync(join(root, "components/AdminPanel.tsx"), "utf8");
const dashboardSource = readFileSync(join(root, "components/DashboardView.tsx"), "utf8");
const retentionSource = readFileSync(join(root, "components/RetentionTest.tsx"), "utf8");
const tableSelectorSource = readFileSync(join(root, "components/TableSelector.tsx"), "utf8");
const layoutSource = readFileSync(join(root, "app/layout.tsx"), "utf8");
const manifestSource = readFileSync(join(root, "app/manifest.ts"), "utf8");
const serviceWorkerSource = readFileSync(join(root, "public/sw.js"), "utf8");
const creatureAssets = readdirSync(join(root, "public/assets/creatures")).filter((file) => file.endsWith(".svg"));

test("the application shell delegates major views to focused components", () => {
  assert.match(pageSource, /from "\.\.\/components\/CreatureExperience"/);
  assert.match(pageSource, /from "\.\.\/components\/AdminPanel"/);
  assert.match(pageSource, /from "\.\.\/components\/DashboardView"/);
  assert.ok(pageSource.split("\n").length < 1500, "page.tsx has grown beyond its shell boundary");
});

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
  assert.match(creatureSource, /trying to evolve/);
  assert.match(creatureSource, /EvolutionPage/);
  assert.match(creatureSource, /reached \{event\.toStage\} stage/);
  assert.match(pageSource, /pendingEvolution/);
  assert.match(creatureSource, /evolutionMorph/);
  assert.match(creatureSource, /CREATURE_STAGES\.map/);
  assert.match(creatureSource, /speciesPicker/);
});

test("admin backup and progress export actions are exposed", () => {
  assert.match(adminSource, /Download backup/);
  assert.match(adminSource, /Export progress CSV/);
  assert.ok(adminSource.includes("/backup"));
  assert.ok(adminSource.includes("/progress.csv"));
  assert.match(adminSource, /Export evaluation CSV/);
  assert.ok(adminSource.includes("/evaluation.csv"));
});

test("the installable shell stays accessible and never caches backend responses", () => {
  assert.match(layoutSource, /manifest: "\/manifest\.webmanifest"/);
  assert.match(layoutSource, /ServiceWorkerRegistration/);
  assert.match(manifestSource, /display: "standalone"/);
  assert.match(serviceWorkerSource, /url\.pathname\.startsWith\("\/backend-api\/"\)/);
  assert.match(pageSource, /Skip to main content/);
  assert.match(pageSource, /id="main-content"/);
  assert.match(pageSource, /aria-current/);
});

test("admin-required tables are locked for learners", () => {
  assert.match(adminSource, /required-tables/);
  assert.match(tableSelectorSource, /Required by admin/);
  assert.match(pageSource, /locked=\{activeUser\.required_tables/);
});

test("heat maps use five colour-only levels", () => {
  for (const level of ["heat0", "heat1", "heat2", "heat3", "heat4"]) {
    assert.ok(dashboardSource.includes(level));
  }
  assert.doesNotMatch(dashboardSource, /Show facts in heat map boxes/);
  assert.doesNotMatch(dashboardSource, /speed10/);
  assert.match(dashboardSource, /dashboardViewSelect/);
  assert.match(dashboardSource, /Dashboard view/);
  assert.match(dashboardSource, /heatMapPanel/);
});

test("temporary Mega Form has a visible unlock state", () => {
  assert.match(pageSource, /Mega Form unlocked for 24 hours/);
  assert.match(creatureSource, /mega_evolution_active/);
  assert.match(creatureSource, /mega=\{creature\.mega_evolution_active\}/);
  assert.match(creatureSource, /mega \? "Mega" : stage/);

  for (const type of ["blob", "dragon", "robot", "forest-sprite", "rock-golem", "space-beast"]) {
    const filename = `${type}-mega.svg`;
    assert.ok(creatureAssets.includes(filename), `${filename} missing`);
    const source = readFileSync(join(root, "public/assets/creatures", filename), "utf8");
    assert.match(source, /viewBox="0 0 320 320"/);
    assert.match(source, /aria-label="[^"]+ Mega Form"/);
  }
});

test("long-term recall checks use a distraction-free fixed assessment surface", () => {
  assert.match(pageSource, /<RetentionTest/);
  assert.match(retentionSource, /retention-assessments/);
  assert.match(retentionSource, /Recall check complete/);
  assert.doesNotMatch(retentionSource, /setInterval/);
  assert.match(dashboardSource, /Baseline, 4-week and 8-week checks/);
  assert.match(dashboardSource, /Create baseline test/);
  assert.match(dashboardSource, /Start test/);
  assert.match(pageSource, /aria-expanded=\{settingsOpen\}/);
  assert.match(pageSource, /Memory tests/);
});
