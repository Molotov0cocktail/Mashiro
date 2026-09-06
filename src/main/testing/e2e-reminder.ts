import type { BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { DataRoot } from '../data/data-root.js'

/** Called only inside the existing canonical OS-temp, marker-validated E2E profile. */
export async function runReminderE2e(
  window: BrowserWindow,
  dataRoot: DataRoot,
  restoreFromTray: () => void
) {
  if (dataRoot.profile !== 'test' || !dataRoot.runId || !dataRoot.resultsDirectory)
    throw Error('reminder-e2e-profile')
  let priorIdentityRestored = false
  if (dataRoot.phase === 'verify') {
    const seed = JSON.parse(readFileSync(join(dataRoot.resultsDirectory, 'seed.json'), 'utf8')) as {
      reminders: { reminderId: string; assistantId: string }
    }
    priorIdentityRestored = (await window.webContents.executeJavaScript(
      `(async () => {
      const result = await window.mashiro.reminders.query({ protocolVersion: 1, assistantId: ${JSON.stringify(seed.reminders.assistantId)} });
      return result.ok && result.data.records.filter(record => record.id === ${JSON.stringify(seed.reminders.reminderId)} && record.state === 'HANDLED').length === 1;
    })()`,
      true
    )) as boolean
    if (!priorIdentityRestored) throw Error('reminder-e2e-restart-identity')
  }
  const result = (await window.webContents.executeJavaScript(
    `(async () => {
    const api = window.mashiro;
    const snapshot = await api.assistants.list();
    if (!snapshot.ok) throw Error('reminder-e2e-assistant');
    const assistantId = snapshot.data.currentAssistantId;
    const base = { protocolVersion: 1, assistantId };
    const list = await api.items.query({ ...base, status: 'open', limit: 100 });
    if (!list.ok || !list.data.items.length) throw Error('reminder-e2e-item');
    const item = list.data.items[0];
    const dueAt = new Date(Date.now() + 3000).toISOString();
    const input = { ...base, commandId: ${JSON.stringify(randomUUID())}, mutation: {
      action: 'create', itemId: item.id, expectedItemVersion: item.version, dueAt, timeZone: 'UTC'
    }};
    const made = await api.reminders.mutate(input);
    const retry = await api.reminders.mutate(input);
    if (!made.ok || JSON.stringify(made) !== JSON.stringify(retry)) throw Error('reminder-e2e-receipt');
    return { assistantId, reminderId: made.data.reminderId, reminderVersion: made.data.reminderVersion, dueAt };
  })()`,
    true
  )) as { assistantId: string; reminderId: string; reminderVersion: number; dueAt: string }
  window.close()
  if (window.isDestroyed() || window.isVisible()) throw Error('reminder-e2e-close-did-not-hide')
  const started = Date.now()
  let state = ''
  while (Date.now() - started < 16000) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    state = (await window.webContents.executeJavaScript(
      `(async () => {
      const result = await window.mashiro.reminders.query({ protocolVersion: 1, assistantId: ${JSON.stringify(result.assistantId)} });
      if (!result.ok) throw Error('reminder-e2e-query');
      return result.data.records.find(record => record.id === ${JSON.stringify(result.reminderId)})?.state;
    })()`,
      true
    )) as string
    if (['DISPLAY_OBSERVED', 'FAILED', 'RESULT_UNKNOWN'].includes(state)) break
  }
  if (state !== 'DISPLAY_OBSERVED') throw Error('reminder-e2e-native-show-' + state)
  if (window.isDestroyed() || window.isVisible()) throw Error('reminder-e2e-background-window')
  restoreFromTray()
  if (!window.isVisible()) throw Error('reminder-e2e-tray-handler')
  await window.webContents.executeJavaScript(
    `(async () => {
      const tab = Array.from(document.querySelectorAll('[role="tab"]')).find(element => element.textContent.trim() === '提醒');
      if (!tab) throw Error('reminder-e2e-tab');
      tab.click();
      const dueAt = ${JSON.stringify(result.dueAt)};
      const card = () => Array.from(document.querySelectorAll('section[aria-label="提醒页面"] .reminder-card')).find(element => element.textContent.includes(dueAt));
      const waitFor = async predicate => {
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
          if (await predicate()) return;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw Error('reminder-e2e-ui-timeout');
      };
      await waitFor(() => card()?.querySelector('.state-display_observed'));
      const button = Array.from(card().querySelectorAll('button')).find(element => element.textContent.trim() === '标为已处理');
      if (!button || button.disabled) throw Error('reminder-e2e-handle-button');
      button.click();
      await waitFor(async () => {
        const snapshot = await window.mashiro.reminders.query({ protocolVersion: 1, assistantId: ${JSON.stringify(result.assistantId)} });
        return card()?.querySelector('.state-handled') && snapshot.ok && snapshot.data.records.some(record => record.id === ${JSON.stringify(result.reminderId)} && record.state === 'HANDLED');
      });
      card().scrollIntoView({ block: 'center' });
    })()`,
    true
  )
  const reminderImage = await window.webContents.capturePage()
  writeFileSync(
    join(dataRoot.resultsDirectory, `${dataRoot.phase}-reminders-ui.png`),
    reminderImage.toPNG(),
    { flag: 'wx' }
  )
  return {
    protocolVersion: 1,
    reminderId: result.reminderId,
    assistantId: result.assistantId,
    priorIdentityRestored,
    phase: dataRoot.phase,
    windowCloseHid: true,
    nativeShowObserved: true,
    trayRestoreHandlerInjected: true,
    windowRestored: true,
    rendererTabAndHandle: true,
    processStillRunning: true,
    userSawNotification: 'NOT_PROVEN',
    osTrayClick: 'NOT_RUN',
    loginRegistration: 'NOT_RUN',
    coldActivation: 'NOT_RUN'
  }
}
