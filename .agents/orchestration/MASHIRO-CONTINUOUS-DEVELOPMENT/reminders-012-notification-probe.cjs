'use strict';

/* eslint-disable @typescript-eslint/no-require-imports -- This isolated Electron main probe intentionally runs as CommonJS. */
/* global process, require, setTimeout */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const spikeRoot = process.env.MASHIRO_NOTIFICATION_SPIKE_ROOT;
const appUserModelId = process.env.MASHIRO_NOTIFICATION_SPIKE_AUMID;

if (!spikeRoot || !appUserModelId) {
  process.stderr.write('Missing isolated spike root or AppUserModelID.\n');
  process.exit(64);
}

fs.mkdirSync(spikeRoot, { recursive: true });
const eventPath = path.join(spikeRoot, 'events.jsonl');

function record(event, detail = {}) {
  const entry = {
    at: new Date().toISOString(),
    event,
    pid: process.pid,
    ...detail,
  };
  const line = `${JSON.stringify(entry)}\n`;
  fs.appendFileSync(eventPath, line, 'utf8');
  process.stdout.write(line);
}

process.on('uncaughtException', (error) => {
  record('uncaughtException', {
    name: error?.name ?? null,
    message: error?.message ?? String(error),
  });
  process.exitCode = 70;
});

process.on('unhandledRejection', (reason) => {
  record('unhandledRejection', {
    message: reason instanceof Error ? reason.message : String(reason),
  });
  process.exitCode = 71;
});

record('pre-require', {
  electronRunAsNodePresent: process.env.ELECTRON_RUN_AS_NODE !== undefined,
  electronRunAsNodeIsOne: process.env.ELECTRON_RUN_AS_NODE === '1',
  electronVersionPresent: typeof process.versions.electron === 'string',
  electronVersion: process.versions.electron ?? null,
  processType: process.type ?? null,
  defaultApp: process.defaultApp ?? null,
});

const { app, Notification } = require('electron');

app.setPath('userData', path.join(spikeRoot, 'user-data'));
app.setPath('sessionData', path.join(spikeRoot, 'session-data'));
app.setName('Mashiro Synthetic Notification Experiment');
app.setAppUserModelId(appUserModelId);

let notification = null;
let closeRequested = false;
let quitRequested = false;

function requestQuit(reason, exitCode = 0) {
  if (quitRequested) return;
  quitRequested = true;
  record('quit-requested', { reason, exitCode });
  process.exitCode = exitCode;
  app.quit();
}

app.on('before-quit', () => record('before-quit'));
app.on('will-quit', () => record('will-quit'));
app.on('quit', (_event, exitCode) => record('quit', { exitCode }));

app.whenReady().then(() => {
  record('ready', {
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    appUserModelId,
    userData: app.getPath('userData'),
    sessionData: app.getPath('sessionData'),
    handleActivationAvailable: typeof Notification.handleActivation === 'function',
  });

  if (typeof Notification.handleActivation === 'function') {
    Notification.handleActivation((details) => {
      record('activation', {
        type: details?.type ?? null,
        actionIndex: details?.actionIndex ?? null,
        hasReply: typeof details?.reply === 'string' && details.reply.length > 0,
      });
    });
    record('activation-handler-registered');
  }

  const supported = Notification.isSupported();
  record('is-supported', { supported });
  if (!supported) {
    requestQuit('notification-not-supported', 2);
    return;
  }

  notification = new Notification({
    id: 'mashiro-synthetic-reminder-012-v1',
    groupId: 'mashiro-synthetic-notification-spike-012',
    title: 'Mashiro 合成通知实验（012）',
    body: '这是隔离的本机通知路线验证；不含个人数据。',
    silent: true,
    timeoutType: 'never',
  });

  notification.on('show', () => {
    record('show');
    setTimeout(() => {
      closeRequested = true;
      record('close-requested', { mechanism: 'notification.close()' });
      notification.close();
    }, 1500);
  });

  notification.on('click', () => record('click'));
  notification.on('failed', (_event, error) => {
    record('failed', {
      name: error?.name ?? null,
      message: error?.message ?? String(error ?? ''),
    });
    setTimeout(() => requestQuit('notification-failed', 3), 250);
  });
  notification.on('close', (_event, details) => {
    record('close', {
      reason: details?.reason ?? null,
      closeRequestedByProbe: closeRequested,
    });
    setTimeout(() => requestQuit('close-observed', 0), 250);
  });

  try {
    notification.show();
    record('show-invoked');
  } catch (error) {
    record('show-threw', {
      name: error?.name ?? null,
      message: error?.message ?? String(error),
    });
    requestQuit('show-threw', 4);
    return;
  }

  setTimeout(() => {
    if (!closeRequested) {
      closeRequested = true;
      record('close-requested', { mechanism: 'fallback-notification.close()' });
      notification.close();
    }
  }, 5000);

  setTimeout(() => requestQuit('observation-timeout', 5), 8000);
}).catch((error) => {
  record('ready-rejected', {
    name: error?.name ?? null,
    message: error?.message ?? String(error),
  });
  requestQuit('ready-rejected', 6);
});
