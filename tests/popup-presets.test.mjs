import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const popupHtml = await readFile(new URL("../popup.html", import.meta.url), "utf8");

function hasPreset(width, height) {
  return new RegExp(
    `data-width="${width}"[\\s\\S]*?data-height="${height}"`,
  ).test(popupHtml);
}

test("popup exposes the Mac 16-inch viewport preset", () => {
  assert.equal(hasPreset(1728, 1117), true);
  assert.match(popupHtml, /Mac 16 英寸/);
});

test("popup exposes the Mac 14-inch viewport preset", () => {
  assert.equal(hasPreset(1512, 982), true);
  assert.match(popupHtml, /Mac 14 英寸/);
});

test("popup keeps all viewport presets unique", () => {
  const matches = [...popupHtml.matchAll(/data-width="(\d+)"[\s\S]*?data-height="(\d+)"/g)];
  const sizes = matches.map((match) => `${match[1]}×${match[2]}`);

  assert.equal(sizes.length, 5);
  assert.equal(new Set(sizes).size, sizes.length);
});
