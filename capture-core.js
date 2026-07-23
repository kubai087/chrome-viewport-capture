export const CAPTURE_LIMITS = Object.freeze({
  width: Object.freeze({ min: 400, max: 3840 }),
  height: Object.freeze({ min: 300, max: 2160 }),
});

function parseInteger(value, label, limits) {
  const number = Number(value);

  if (!Number.isFinite(number) || !Number.isInteger(number)) {
    throw new Error(`${label}必须是整数`);
  }

  if (number < limits.min || number > limits.max) {
    throw new Error(`${label}需在 ${limits.min}–${limits.max} 之间`);
  }

  return number;
}

export function normalizeSettings(raw = {}) {
  return {
    width: parseInteger(raw.width, "宽度", CAPTURE_LIMITS.width),
    height: parseInteger(raw.height, "高度", CAPTURE_LIMITS.height),
    zoom: 100,
  };
}

export function isScriptableUrl(rawUrl) {
  try {
    const { protocol } = new URL(rawUrl);
    return protocol === "http:" || protocol === "https:" || protocol === "file:";
  } catch {
    return false;
  }
}

export function calculatePreviewScale(available, target) {
  if (
    !Number.isFinite(available?.width) ||
    !Number.isFinite(available?.height) ||
    available.width <= 0 ||
    available.height <= 0
  ) {
    throw new Error("无法读取当前屏幕的可用区域");
  }

  const rawScale = Math.min(
    available.width / target.width,
    available.height / target.height,
    1,
  );

  if (rawScale < 0.1) {
    throw new Error("目标视口远大于当前屏幕，无法生成可靠预览");
  }

  return Math.floor(rawScale * 10_000) / 10_000;
}

export function formatPreviewPercent(scale) {
  const percentage = Math.round(scale * 1000) / 10;
  return Number.isInteger(percentage) ? `${percentage}%` : `${percentage.toFixed(1)}%`;
}

export function shouldMaximizePreviewWindow(windowState) {
  return windowState !== "fullscreen" && windowState !== "locked-fullscreen";
}

export function buildScreenshotFilename(settings, date = new Date()) {
  const timestamp = date.toISOString().replace(/[.:]/g, "-");
  return `viewport-${settings.width}x${settings.height}-100pct-retina-${timestamp}.png`;
}
