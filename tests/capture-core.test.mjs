import assert from "node:assert/strict";
import test from "node:test";

import {
  buildScreenshotFilename,
  calculatePreviewScale,
  formatPreviewPercent,
  isScriptableUrl,
  normalizeSettings,
  shouldMaximizePreviewWindow,
} from "../capture-core.js";

test("normalizeSettings accepts a valid viewport request", () => {
  assert.deepEqual(normalizeSettings({ width: "1920", height: 1080, zoom: "100" }), {
    width: 1920,
    height: 1080,
    zoom: 100,
  });
});

test("normalizeSettings rejects fractional and out-of-range viewport values", () => {
  assert.throws(
    () => normalizeSettings({ width: 1920.5, height: 1080, zoom: 100 }),
    /宽度必须是整数/,
  );
  assert.throws(
    () => normalizeSettings({ width: 3841, height: 1080, zoom: 100 }),
    /宽度需在 400–3840 之间/,
  );
});

test("normalizeSettings always keeps the page at 100% zoom", () => {
  assert.deepEqual(normalizeSettings({ width: 1920, height: 1080, zoom: 35 }), {
    width: 1920,
    height: 1080,
    zoom: 100,
  });
});

test("isScriptableUrl allows web pages and rejects protected Chrome pages", () => {
  assert.equal(isScriptableUrl("https://cloud.tencent.com/"), true);
  assert.equal(isScriptableUrl("file:///tmp/demo.html"), true);
  assert.equal(isScriptableUrl("chrome://extensions/"), false);
  assert.equal(isScriptableUrl("chrome-extension://abc/popup.html"), false);
});

test("calculatePreviewScale fits a large logical viewport inside the available area", () => {
  assert.equal(
    calculatePreviewScale(
      { width: 1728, height: 1000 },
      { width: 1920, height: 1080 },
    ),
    0.9,
  );
});

test("calculatePreviewScale never enlarges a viewport that already fits", () => {
  assert.equal(
    calculatePreviewScale(
      { width: 2560, height: 1440 },
      { width: 1920, height: 1080 },
    ),
    1,
  );
});

test("calculatePreviewScale validates the available area", () => {
  assert.throws(
    () => calculatePreviewScale({ width: 0, height: 900 }, { width: 1920, height: 1080 }),
    /无法读取当前屏幕的可用区域/,
  );
});

test("formatPreviewPercent uses at most one decimal place", () => {
  assert.equal(formatPreviewPercent(0.9), "90%");
  assert.equal(formatPreviewPercent(0.8333), "83.3%");
});

test("preview keeps native fullscreen windows fullscreen", () => {
  assert.equal(shouldMaximizePreviewWindow("fullscreen"), false);
  assert.equal(shouldMaximizePreviewWindow("locked-fullscreen"), false);
});

test("preview maximizes non-fullscreen windows for the largest work area", () => {
  assert.equal(shouldMaximizePreviewWindow("normal"), true);
  assert.equal(shouldMaximizePreviewWindow("maximized"), true);
  assert.equal(shouldMaximizePreviewWindow("minimized"), true);
});

test("buildScreenshotFilename is stable and filesystem-safe", () => {
  assert.equal(
    buildScreenshotFilename(
      { width: 1920, height: 1080, zoom: 100 },
      new Date("2026-07-22T01:02:03.456Z"),
    ),
    "viewport-1920x1080-100pct-retina-2026-07-22T01-02-03-456Z.png",
  );
});
