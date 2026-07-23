const STATUS_KEY = "captureState";
const SETTINGS_KEY = "lastCaptureSettings";
const DEFAULT_SETTINGS = Object.freeze({ width: 1920, height: 1080, zoom: 100 });
const extensionApiAvailable = Boolean(
  globalThis.chrome?.storage?.local && globalThis.chrome?.runtime?.sendMessage,
);

const form = document.querySelector("#capture-form");
const widthInput = document.querySelector("#width");
const heightInput = document.querySelector("#height");
const captureButton = document.querySelector("#capture-button");
const captureButtonLabel = captureButton.querySelector(".button-label");
const stopButton = document.querySelector("#stop-button");
const statusElement = document.querySelector("#status");
const presetButtons = [...document.querySelectorAll(".preset")];

function getSettings() {
  return {
    width: Number(widthInput.value),
    height: Number(heightInput.value),
    zoom: 100,
  };
}

function applySettings(settings = DEFAULT_SETTINGS) {
  widthInput.value = settings.width ?? DEFAULT_SETTINGS.width;
  heightInput.value = settings.height ?? DEFAULT_SETTINGS.height;
  updateSelectedPreset();
}

function updateSelectedPreset() {
  const width = Number(widthInput.value);
  const height = Number(heightInput.value);

  for (const button of presetButtons) {
    const selected =
      Number(button.dataset.width) === width && Number(button.dataset.height) === height;
    button.setAttribute("aria-pressed", String(selected));
  }
}

function renderStatus(state) {
  const working = state?.status === "working";
  const previewActive = Boolean(state?.previewActive);
  form.setAttribute("aria-busy", String(working));
  captureButton.disabled = working;
  stopButton.disabled = working;
  widthInput.disabled = working;
  heightInput.disabled = working;
  for (const button of presetButtons) {
    button.disabled = working;
  }
  stopButton.hidden = !previewActive;
  captureButtonLabel.textContent = previewActive ? "重新保存截图" : "预览并保存截图";

  if (!state || state.status === "idle" || !state.message) {
    statusElement.hidden = true;
    statusElement.textContent = "";
    statusElement.removeAttribute("data-status");
    return;
  }

  statusElement.hidden = false;
  statusElement.dataset.status = state.status;
  statusElement.textContent = state.message;
}

async function initialize() {
  if (!extensionApiAvailable) {
    applySettings(DEFAULT_SETTINGS);
    renderStatus({ status: "idle" });
    return;
  }

  const stored = await chrome.storage.local.get([SETTINGS_KEY, STATUS_KEY]);
  applySettings(stored[SETTINGS_KEY] ?? DEFAULT_SETTINGS);
  renderStatus(stored[STATUS_KEY]);
}

for (const button of presetButtons) {
  button.addEventListener("click", () => {
    widthInput.value = button.dataset.width;
    heightInput.value = button.dataset.height;
    updateSelectedPreset();
  });
}

for (const input of [widthInput, heightInput]) {
  input.addEventListener("input", updateSelectedPreset);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const settings = getSettings();
  renderStatus({ status: "working", message: "正在调整视口…" });

  if (!extensionApiAvailable) {
    const previewScale = Math.min(
      globalThis.screen.availWidth / settings.width,
      globalThis.screen.availHeight / settings.height,
      1,
    );
    const previewPercent = `${Math.round(previewScale * 1000) / 10}%`;
    renderStatus({
      status: "success",
      message: `${settings.width}×${settings.height} · ${previewPercent} 预览 · ${settings.width * 2}×${settings.height * 2} PNG`,
      previewActive: true,
    });
    return;
  }

  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.runtime.sendMessage({
      type: "START_CAPTURE",
      settings,
      tabId: activeTab?.id,
    });

    if (!response?.ok) {
      renderStatus({ status: "error", message: response?.error ?? "无法开始截图" });
    }
  } catch {
    renderStatus({ status: "error", message: "插件后台暂时不可用，请重试" });
  }
});

stopButton.addEventListener("click", async () => {
  renderStatus({
    status: "working",
    message: "正在退出预览…",
    previewActive: true,
  });

  if (!extensionApiAvailable) {
    renderStatus({
      status: "success",
      message: "已退出预览，并恢复原窗口与网页缩放",
      previewActive: false,
    });
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: "STOP_PREVIEW" });
    if (!response?.ok) {
      renderStatus({
        status: "error",
        message: response?.error ?? "无法退出预览",
        previewActive: true,
      });
    }
  } catch {
    renderStatus({
      status: "error",
      message: "插件后台暂时不可用，请重试",
      previewActive: true,
    });
  }
});

if (extensionApiAvailable) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[STATUS_KEY]) {
      renderStatus(changes[STATUS_KEY].newValue);
    }
  });
}

void initialize();
