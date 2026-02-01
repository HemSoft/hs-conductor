import {
  app,
  BrowserWindow,
  Menu,
  MenuItemConstructorOptions,
  dialog,
  Notification,
  ipcMain,
  shell,
} from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { watch, readFile, unlink, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import windowStateKeeper from 'electron-window-state';
import { getAvailableModels } from '../../src/lib/model-selector.js';

// CSS to hide common cookie consent banners without accepting them
const cookieConsentHiderCSS = `
  /* Common cookie consent frameworks */
  #cookie-consent, #cookie-banner, #cookie-notice, #cookie-law-info-bar,
  #cookieConsent, #cookieBanner, #cookieNotice,
  .cookie-consent, .cookie-banner, .cookie-notice, .cookie-popup,
  .cookieConsent, .cookieBanner, .cookieNotice, .cookiePopup,
  .cc-banner, .cc-window, .cc-overlay,
  [class*="cookie-consent"], [class*="cookie-banner"], [class*="cookie-notice"],
  [class*="CookieConsent"], [class*="CookieBanner"],
  [id*="cookie-consent"], [id*="cookie-banner"], [id*="cookie-notice"],
  /* GDPR specific */
  #gdpr-consent, #gdpr-banner, .gdpr-consent, .gdpr-banner,
  [class*="gdpr-consent"], [class*="gdpr-banner"],
  /* Privacy specific */
  #privacy-banner, .privacy-banner, [class*="privacy-banner"],
  /* Consent specific */
  #consent-banner, .consent-banner, [class*="consent-banner"], [class*="consent-popup"],
  /* Popular frameworks */
  .osano-cm-window, .osano-cm-dialog, /* Osano */
  #onetrust-consent-sdk, .onetrust-pc-dark-filter, /* OneTrust */
  .evidon-consent-button, #_evidon_banner, /* Evidon */
  .truste-consent-track, #truste-consent-track, /* TrustArc */
  #CybotCookiebotDialog, #CybotCookiebotDialogBodyUnderlay, /* Cookiebot */
  .fc-consent-root, .fc-dialog-overlay, /* Funding Choices */
  #qc-cmp2-ui, #qc-cmp2-container, /* Quantcast */
  .sp-message-container, /* SourcePoint */
  /* Overlays and backdrops */
  .cookie-overlay, .consent-overlay, .gdpr-overlay,
  [class*="cookie-overlay"], [class*="consent-overlay"],
  /* Meta/Facebook specific */
  [data-testid="cookie-policy-manage-dialog"],
  div[role="dialog"][aria-label*="cookie" i],
  div[role="dialog"][aria-label*="Cookie" i]
  {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  /* Remove any blur/overlay effects on body */
  body.cookie-modal-open, body.modal-open, body.no-scroll {
    overflow: auto !important;
    position: static !important;
  }
`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..');

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

let win: BrowserWindow | null;

// Zoom level persistence
const getZoomConfigPath = () => path.join(app.getPath('userData'), 'zoom-level.json');

function loadZoomLevel(): number {
  try {
    const configPath = getZoomConfigPath();
    if (existsSync(configPath)) {
      const data = JSON.parse(readFileSync(configPath, 'utf-8'));
      return data.zoomFactor || 1.0;
    }
  } catch (err) {
    console.error('[zoom] Failed to load zoom level:', err);
  }
  return 1.0;
}

function saveZoomLevel(zoomFactor: number): void {
  try {
    writeFileSync(getZoomConfigPath(), JSON.stringify({ zoomFactor }));
  } catch (err) {
    console.error('[zoom] Failed to save zoom level:', err);
  }
}

function createMenu() {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'Reload Workloads',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            win?.webContents.send('reload-workloads');
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    // View menu
    {
      label: 'View',
      submenu: [
        {
          label: 'Appearance',
          submenu: [
            {
              label: 'Full Screen',
              accelerator: 'F11',
              click: () => {
                if (win) {
                  win.setFullScreen(!win.isFullScreen());
                }
              },
            },
            {
              label: 'Zen Mode',
              accelerator: 'CmdOrCtrl+K Z',
              enabled: false, // Placeholder for future
            },
            { type: 'separator' },
            {
              label: 'Menu Bar',
              type: 'checkbox',
              checked: true,
              click: (menuItem) => {
                win?.setMenuBarVisibility(menuItem.checked);
                win?.setAutoHideMenuBar(!menuItem.checked);
              },
            },
            { type: 'separator' },
            {
              label: 'Zoom In',
              accelerator: 'CmdOrCtrl+numadd',
              click: () => {
                if (win) {
                  const currentZoom = win.webContents.getZoomFactor();
                  win.webContents.setZoomFactor(Math.min(currentZoom + 0.1, 3.0));
                }
              },
            },
            {
              label: 'Zoom Out',
              accelerator: 'CmdOrCtrl+numsub',
              click: () => {
                if (win) {
                  const currentZoom = win.webContents.getZoomFactor();
                  win.webContents.setZoomFactor(Math.max(currentZoom - 0.1, 0.5));
                }
              },
            },
            {
              label: 'Reset Zoom',
              accelerator: 'CmdOrCtrl+num0',
              click: () => {
                win?.webContents.setZoomFactor(1.0);
              },
            },
          ],
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => {
            win?.webContents.toggleDevTools();
          },
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+numadd',
          click: () => {
            if (win) {
              const currentZoom = win.webContents.getZoomFactor();
              win.webContents.setZoomFactor(Math.min(currentZoom + 0.1, 3.0));
            }
          },
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+numsub',
          click: () => {
            if (win) {
              const currentZoom = win.webContents.getZoomFactor();
              win.webContents.setZoomFactor(Math.max(currentZoom - 0.1, 0.5));
            }
          },
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+num0',
          click: () => {
            win?.webContents.setZoomFactor(1.0);
          },
        },
      ],
    },
    // Help menu
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Conductor',
          click: () => {
            if (win) {
              dialog.showMessageBox(win, {
                type: 'info',
                title: 'About',
                message: 'Conductor',
                detail: 'Event-Driven Multi-Agent Orchestration\nVersion 0.1.0',
              });
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => {
            win?.webContents.toggleDevTools();
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  // Load the previous window state with fallback to defaults
  // Window state includes position (x, y), size (width, height), and maximized state
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1400,
    defaultHeight: 900,
  });

  win = new BrowserWindow({
    title: 'Conductor',
    icon: path.join(process.env.VITE_PUBLIC, 'icon.ico'),
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    fullscreen: false, // Never start in fullscreen mode
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1e1e1e',
      symbolColor: '#cccccc',
      height: 32,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      webviewTag: true, // Enable webview for embedding external content with CSS injection
      // Use isolated partition to prevent zoom level bleeding to other Electron apps
      partition: 'persist:conductor',
      // Set initial zoom from saved config
      zoomFactor: loadZoomLevel(),
    },
  });

  // Let windowStateKeeper manage window state (position, size, maximize)
  // It automatically saves state on resize/move and restores maximized state
  mainWindowState.manage(win);

  createMenu();

  // Handle keyboard shortcuts only when app is focused (not global)
  win.webContents.on('before-input-event', (event, input) => {
    if (!win) return;

    const ctrlOrCmd = input.control || input.meta;

    // Ctrl/Cmd + NumpadAdd: Zoom In
    if (ctrlOrCmd && input.key === '+') {
      const currentZoom = win.webContents.getZoomFactor();
      const newZoom = Math.min(currentZoom + 0.1, 3.0);
      win.webContents.setZoomFactor(newZoom);
      saveZoomLevel(newZoom);
      event.preventDefault();
    }
    // Ctrl/Cmd + NumpadSubtract: Zoom Out
    else if (ctrlOrCmd && input.key === '-') {
      const currentZoom = win.webContents.getZoomFactor();
      const newZoom = Math.max(currentZoom - 0.1, 0.5);
      win.webContents.setZoomFactor(newZoom);
      saveZoomLevel(newZoom);
      event.preventDefault();
    }
    // Ctrl/Cmd + 0: Reset Zoom
    else if (ctrlOrCmd && input.key === '0') {
      win.webContents.setZoomFactor(1.0);
      saveZoomLevel(1.0);
      event.preventDefault();
    }
    // F11: Toggle Fullscreen
    else if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
    // Ctrl/Cmd + Shift + I: Toggle DevTools
    else if (ctrlOrCmd && input.shift && input.key.toLowerCase() === 'i') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

/**
 * Watch the alerts folder and show Windows toast notifications
 */
async function startAlertWatcher() {
  // Path to alerts folder (relative to workspace root)
  const alertsDir = path.join(process.cwd(), '..', 'data', 'alerts');

  // Ensure alerts directory exists
  if (!existsSync(alertsDir)) {
    await mkdir(alertsDir, { recursive: true });
    console.log('[alert-watcher] Created alerts directory:', alertsDir);
  }

  console.log('[alert-watcher] Watching for alerts in:', alertsDir);

  try {
    // Watch for new files in the alerts directory
    const watcher = watch(alertsDir);

    for await (const event of watcher) {
      if (event.eventType === 'rename' && event.filename?.endsWith('.json')) {
        const alertFile = path.join(alertsDir, event.filename);

        // Small delay to ensure file is fully written
        await new Promise((resolve) => setTimeout(resolve, 100));

        try {
          // Read alert data
          const content = await readFile(alertFile, 'utf-8');
          const alert = JSON.parse(content);

          // Show Windows toast notification
          if (Notification.isSupported()) {
            const notification = new Notification({
              title: alert.workloadName || 'Workload Alert',
              body: alert.message || 'Workload completed',
              icon: path.join(__dirname, '../public/icon.ico'),
              silent: false,
            });

            notification.show();
            console.log('[alert-watcher] Notification shown for:', alert.workloadId);
          } else {
            console.warn('[alert-watcher] Notifications not supported on this system');
          }

          // Delete the alert file after processing
          await unlink(alertFile);
        } catch (err) {
          // File might have been deleted already or is still being written
          console.debug('[alert-watcher] Could not process alert file:', event.filename);
        }
      }
    }
  } catch (err) {
    console.error('[alert-watcher] Error watching alerts directory:', err);
  }
}

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers
ipcMain.handle('get-available-models', async () => {
  try {
    const models = await getAvailableModels();
    return { success: true, models };
  } catch (error) {
    console.error('[ipc] Failed to fetch models:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('open-external', async (_event, url: string) => {
  await shell.openExternal(url);
});

app.whenReady().then(() => {
  // Set app name for Windows process identification
  app.setName('Conductor');

  // Inject cookie consent hider CSS into all webContents (including iframes)
  app.on('web-contents-created', (_, contents) => {
    contents.on('did-finish-load', () => {
      contents.insertCSS(cookieConsentHiderCSS).catch(() => {
        // Ignore errors for pages that block CSS injection
      });
    });
  });

  createWindow();

  // Start alert watcher
  startAlertWatcher();
});
