import {
  buildScreenshotFilename,
  calculatePreviewScale,
  formatPreviewPercent,
  isScriptableUrl,
  normalizeSettings,
  shouldMaximizePreviewWindow,
} from "./capture-core.js";

const STATUS_KEY = "captureState";
const SETTINGS_KEY = "lastCaptureSettings";
const ACTIVE_PREVIEW_KEY = "activePreview";
const DEFAULT_SETTINGS = Object.freeze({ width: 1920, height: 1080, zoom: 100 });
const DEBUG_PROTOCOL_VERSION = "1.3";
const RETINA_DPR = 2;

let captureInFlight = false;
const intentionalDetachTabs = new Set();

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function setCaptureState(state) {
  await chrome.storage.local.set({
    [STATUS_KEY]: {
      updatedAt: Date.now(),
      ...state,
    },
  });
}

async function getActivePreview() {
  const stored = await chrome.storage.session.get(ACTIVE_PREVIEW_KEY);
  return stored[ACTIVE_PREVIEW_KEY] ?? null;
}

async function setActivePreview(preview) {
  await chrome.storage.session.set({ [ACTIVE_PREVIEW_KEY]: preview });
}

async function clearActivePreview() {
  await chrome.storage.session.remove(ACTIVE_PREVIEW_KEY);
}

async function getTargetTab(requestedTabId) {
  const tab = Number.isInteger(requestedTabId)
    ? await chrome.tabs.get(requestedTabId)
    : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

  if (!tab?.id || !tab.windowId) {
    throw new Error("没有找到当前网页");
  }

  if (!isScriptableUrl(tab.url)) {
    throw new Error("此页面受 Chrome 保护，无法模拟视口或截图");
  }

  return tab;
}

async function ensureActiveTab(tabId, windowId) {
  const [activeTab] = await chrome.tabs.query({ active: true, windowId });
  if (activeTab?.id !== tabId) {
    throw new Error("截图前当前标签页已切换，请重新操作");
  }
}

async function sendDebuggerCommand(tabId, method, commandParams = undefined) {
  return chrome.debugger.sendCommand({ tabId }, method, commandParams);
}

async function evaluateOnPage(tabId, expression) {
  const response = await sendDebuggerCommand(tabId, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });

  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || "页面状态读取失败");
  }

  return response.result?.value;
}

function snapshotWindow(windowInfo) {
  return {
    id: windowInfo.id,
    state: windowInfo.state,
    left: windowInfo.left,
    top: windowInfo.top,
    width: windowInfo.width,
    height: windowInfo.height,
  };
}

async function restoreWindow(windowSnapshot) {
  if (!windowSnapshot?.id) {
    return;
  }

  const current = await chrome.windows.get(windowSnapshot.id).catch(() => null);
  if (!current) {
    return;
  }

  if (windowSnapshot.state === "normal") {
    await chrome.windows.update(windowSnapshot.id, {
      state: "normal",
      left: windowSnapshot.left,
      top: windowSnapshot.top,
      width: windowSnapshot.width,
      height: windowSnapshot.height,
    });
    return;
  }

  if (current.state === windowSnapshot.state) {
    return;
  }

  await chrome.windows.update(windowSnapshot.id, { state: windowSnapshot.state });
}

async function restoreBrowserState(preview) {
  if (!preview) {
    return;
  }

  if (Number.isFinite(preview.originalZoom)) {
    await chrome.tabs.setZoom(preview.tabId, preview.originalZoom).catch(() => {});
  }

  await restoreWindow(preview.originalWindow).catch(() => {});
}

async function detachPreview(preview, { restore = true } = {}) {
  if (!preview) {
    return;
  }

  intentionalDetachTabs.add(preview.tabId);
  await sendDebuggerCommand(
    preview.tabId,
    "Emulation.clearDeviceMetricsOverride",
  ).catch(() => {});
  await chrome.debugger.detach({ tabId: preview.tabId }).catch(() => {});
  setTimeout(() => intentionalDetachTabs.delete(preview.tabId), 1_000);

  if (restore) {
    await restoreBrowserState(preview);
  }

  await clearActivePreview();
  await chrome.action.setBadgeText({ tabId: preview.tabId, text: "" }).catch(() => {});
}

async function stopPreview({ updateState = true } = {}) {
  const preview = await getActivePreview();
  await detachPreview(preview);

  if (updateState) {
    await setCaptureState({
      status: "success",
      message: "已退出预览，并恢复原窗口与网页缩放",
      previewActive: false,
    });
  }
}

async function maximizePreviewWindow(windowId) {
  const windowInfo = await chrome.windows.get(windowId);

  if (!shouldMaximizePreviewWindow(windowInfo.state)) {
    return;
  }

  await chrome.windows.update(windowId, { state: "maximized" });
  await sleep(300);
}

async function readAvailableViewport(tabId) {
  return evaluateOnPage(
    tabId,
    `({
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    })`,
  );
}

async function applyF12Viewport(tabId, settings, previewScale) {
  await sendDebuggerCommand(tabId, "Emulation.setDeviceMetricsOverride", {
    width: settings.width,
    height: settings.height,
    deviceScaleFactor: RETINA_DPR,
    mobile: false,
    scale: previewScale,
    screenWidth: settings.width,
    screenHeight: settings.height,
    screenOrientation: {
      type: settings.width >= settings.height ? "landscapePrimary" : "portraitPrimary",
      angle: settings.width >= settings.height ? 0 : 90,
    },
  });

  await sendDebuggerCommand(tabId, "Emulation.setPageScaleFactor", {
    pageScaleFactor: 1,
  });
  await sleep(180);
}

async function verifyEmulatedViewport(tabId, settings) {
  const viewport = await evaluateOnPage(
    tabId,
    `({
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      visualScale: window.visualViewport ? window.visualViewport.scale : 1
    })`,
  );

  if (
    viewport.width !== settings.width ||
    viewport.height !== settings.height ||
    viewport.devicePixelRatio !== RETINA_DPR ||
    Math.abs(viewport.visualScale - 1) > 0.001
  ) {
    throw new Error(
      `视口模拟未生效：当前为 ${viewport.width}×${viewport.height} / DPR ${viewport.devicePixelRatio}`,
    );
  }

  return viewport;
}

async function captureRetinaScreenshot(tabId) {
  const response = await sendDebuggerCommand(tabId, "Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });

  if (!response?.data) {
    throw new Error("Chrome 未返回截图数据");
  }

  return `data:image/png;base64,${response.data}`;
}

function friendlyError(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (/Another debugger|already attached|Cannot attach|target is already being debugged/i.test(message)) {
    return "当前标签页已打开开发者工具，请关闭后重试";
  }

  if (/Cannot access|Missing host permission|not allowed|restricted/i.test(message)) {
    return "此页面受 Chrome 保护，无法模拟视口或截图";
  }

  if (/No tab with id|target_closed|tab was closed/i.test(message)) {
    return "当前标签页已关闭，请重新操作";
  }

  return message || "截图失败，请重试";
}

async function runPreviewAndCapture(rawSettings, requestedTabId) {
  const settings = normalizeSettings(rawSettings);
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  await setCaptureState({
    status: "working",
    message: "正在建立 100% 页面视口…",
    settings,
    previewActive: false,
  });

  const existingPreview = await getActivePreview();
  if (existingPreview) {
    await detachPreview(existingPreview);
  }

  const tab = await getTargetTab(requestedTabId);
  const originalWindow = snapshotWindow(await chrome.windows.get(tab.windowId));
  const originalZoom = await chrome.tabs.getZoom(tab.id);
  const preview = {
    tabId: tab.id,
    windowId: tab.windowId,
    originalWindow,
    originalZoom,
    settings,
  };

  let attached = false;

  try {
    await chrome.debugger.attach({ tabId: tab.id }, DEBUG_PROTOCOL_VERSION);
    attached = true;
    await setActivePreview(preview);

    await chrome.tabs.setZoom(tab.id, 1);
    await maximizePreviewWindow(tab.windowId);
    await sendDebuggerCommand(tab.id, "Page.bringToFront");

    const availableViewport = await readAvailableViewport(tab.id);
    const previewScale = calculatePreviewScale(availableViewport, settings);

    await applyF12Viewport(tab.id, settings, previewScale);
    const viewport = await verifyEmulatedViewport(tab.id, settings);
    await ensureActiveTab(tab.id, tab.windowId);

    await setCaptureState({
      status: "working",
      message: "视口已就绪，正在生成 Retina 截图…",
      settings,
      previewActive: true,
      previewScale,
    });

    const screenshotDataUrl = await captureRetinaScreenshot(tab.id);
    const imageSize = {
      width: settings.width * RETINA_DPR,
      height: settings.height * RETINA_DPR,
    };
    const filename = buildScreenshotFilename(settings);
    const downloadId = await chrome.downloads.download({
      url: screenshotDataUrl,
      filename,
      conflictAction: "uniquify",
      saveAs: false,
    });

    const activePreview = {
      ...preview,
      availableViewport,
      previewScale,
      viewport,
      imageSize,
      filename,
    };
    await setActivePreview(activePreview);
    await chrome.action.setBadgeText({ tabId: tab.id, text: "HD" }).catch(() => {});
    await chrome.action.setBadgeBackgroundColor({
      tabId: tab.id,
      color: "#006EFF",
    }).catch(() => {});

    await setCaptureState({
      status: "success",
      message: `${settings.width}×${settings.height} · ${formatPreviewPercent(previewScale)} 预览 · ${imageSize.width}×${imageSize.height} PNG`,
      settings,
      previewActive: true,
      previewScale,
      viewport,
      imageSize,
      filename,
      downloadId,
      tabId: tab.id,
      windowId: tab.windowId,
    });
  } catch (error) {
    if (attached) {
      await detachPreview(preview);
    }
    throw error;
  }
}

async function startCapture(settings, requestedTabId) {
  try {
    await runPreviewAndCapture(settings, requestedTabId);
  } catch (error) {
    await setCaptureState({
      status: "error",
      message: friendlyError(error),
      settings,
      previewActive: false,
    });
  } finally {
    captureInFlight = false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "START_CAPTURE") {
    if (captureInFlight) {
      sendResponse({ ok: false, error: "已有截图任务正在进行" });
      return false;
    }

    captureInFlight = true;
    void startCapture(message.settings, message.tabId);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "STOP_PREVIEW") {
    void stopPreview().catch(async (error) => {
      await setCaptureState({
        status: "error",
        message: friendlyError(error),
        previewActive: true,
      });
    });
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

chrome.debugger.onDetach.addListener((source) => {
  if (!source.tabId) {
    return;
  }

  if (intentionalDetachTabs.delete(source.tabId)) {
    return;
  }

  void (async () => {
    const preview = await getActivePreview();
    if (preview?.tabId !== source.tabId) {
      return;
    }

    await restoreBrowserState(preview);
    await clearActivePreview();
    await chrome.action.setBadgeText({ tabId: source.tabId, text: "" }).catch(() => {});
    await setCaptureState({ status: "idle", previewActive: false });
  })();
});

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get([SETTINGS_KEY]);
  await clearActivePreview();
  await chrome.storage.local.set({
    [SETTINGS_KEY]: normalizeSettings(stored[SETTINGS_KEY] ?? DEFAULT_SETTINGS),
    [STATUS_KEY]: { status: "idle", previewActive: false, updatedAt: Date.now() },
  });
});

chrome.runtime.onStartup.addListener(async () => {
  await clearActivePreview();
  await setCaptureState({ status: "idle", previewActive: false });
});
