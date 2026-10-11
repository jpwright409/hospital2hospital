import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { seed } from "../src/lib/data.ts";

// Run the real demo repository in connected mode with isolated browser storage.
// Transpile its TS module to preserve production's extensionless imports while
// resolving those two imports to file URLs for Node's test runner.
process.env.NEXT_PUBLIC_APP_MODE = "connected";
const store = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
} });
const original = JSON.stringify({ ...seed, listings: seed.listings.map(l => ({ ...l, quantity: 999 })) });
store.set("hospital2hospital.demo.v1", original);
store.set("hospital2hospital.connected-demo-bookmarks.v1", JSON.stringify({ ...seed,
  listings: seed.listings.map(l => ({ ...l, quantity: 777 })), saved: ["demo-1", "missing-listing"] }));
let source = await readFile(new URL("../src/lib/repository.ts", import.meta.url), "utf8");
source = source.replace('"./data"', JSON.stringify(new URL("../src/lib/data.ts", import.meta.url).href))
  .replace('"./app-mode"', JSON.stringify(new URL("../src/lib/app-mode.ts", import.meta.url).href));
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { repository } = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);

test("connected mode cannot read fictional snapshots or write demo storage", () => {
  assert.throws(() => repository.getSnapshot(), /unavailable in connected mode/);
  for (const mutate of [
    () => repository.saveListing(seed.products[0],seed.listings[0]),
    () => repository.setStatus("demo-1","inactive"),
    () => repository.addInquiry("demo-1","attack"),
    () => repository.toggleSaved("demo-1"),
    () => repository.reset(),
  ]) assert.throws(mutate, /disabled in connected mode/);
  assert.equal(store.get("hospital2hospital.demo.v1"),original);
});
test("explicit demo mode preserves local inventory and saved workflows", () => {
  process.env.NEXT_PUBLIC_APP_MODE="demo";
  repository.toggleSaved("demo-2");
  assert.ok(repository.getSnapshot().saved.includes("demo-2"));
  repository.setStatus("demo-1","inactive");
  assert.equal(repository.getSnapshot().listings.find(l=>l.id==="demo-1").status,"inactive");
});
