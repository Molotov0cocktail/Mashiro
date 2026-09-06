import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ItemApi, ItemRecord } from '../../../../shared/item-contract'
import type {
  ReminderApi,
  ReminderMutation,
  ReminderPolicy,
  ReminderReceipt,
  ReminderRecord,
  ReminderRuntime
} from '../../../../shared/reminder-contract'

const protocolVersion = 1 as const
type ItemSummary = { title: string; version: number; status: ItemRecord['content']['status'] }
type PendingCommand = { key: string; commandId: string; reused: boolean }
type WallClockCandidate = { dueAt: string; offsetLabel: string }

const stateLabels: Record<ReminderRecord['state'], string> = {
  SCHEDULED: '计划中',
  RECOVERY_PENDING: '恢复待处理',
  DISPATCHING: '正在提交系统通知',
  DISPLAY_OBSERVED: '已观察到展示',
  RESULT_UNKNOWN: '展示结果未知',
  FAILED: '通知失败',
  EXPIRED: '已过期',
  CANCELLED: '已取消',
  HANDLED: '已处理'
}

const receiptLabels: Record<ReminderReceipt['state'], string> = {
  SUCCEEDED: '本地操作已完成',
  RESULT_UNKNOWN: '操作结果待核查',
  CONFIRMED_NOT_APPLIED: '已确认操作未执行'
}

function partsAt(timestamp: number, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    calendar: 'gregory',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(new Date(timestamp))
  return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

function offsetAt(timestamp: number, timeZone: string): number {
  const parts = partsAt(timestamp, timeZone)
  const representedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  )
  return Math.round((representedAsUtc - timestamp) / 60_000)
}

function offsetText(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absolute = Math.abs(offsetMinutes)
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
}

export function resolveWallClock(localValue: string, timeZone: string): WallClockCandidate[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localValue.trim())
  if (!match || !timeZone.trim()) return []
  const year = Number(match[1]!)
  const month = Number(match[2]!)
  const day = Number(match[3]!)
  const hour = Number(match[4]!)
  const minute = Number(match[5]!)
  const second = Number(match[6] ?? '0')
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second)
  if (
    new Date(wallClock).getUTCFullYear() !== year ||
    new Date(wallClock).getUTCMonth() !== month - 1 ||
    new Date(wallClock).getUTCDate() !== day ||
    new Date(wallClock).getUTCHours() !== hour ||
    new Date(wallClock).getUTCMinutes() !== minute
  )
    return []

  try {
    const offsets = new Set<number>()
    for (let deltaHours = -48; deltaHours <= 48; deltaHours += 6)
      offsets.add(offsetAt(wallClock + deltaHours * 3_600_000, timeZone.trim()))
    const candidates = [...offsets]
      .map((offset) => ({ offset, timestamp: wallClock - offset * 60_000 }))
      .filter(({ timestamp }) => {
        const parts = partsAt(timestamp, timeZone.trim())
        return (
          Number(parts.year) === year &&
          Number(parts.month) === month &&
          Number(parts.day) === day &&
          Number(parts.hour) === hour &&
          Number(parts.minute) === minute &&
          Number(parts.second) === second
        )
      })
      .sort((left, right) => left.timestamp - right.timestamp)
    const exactLocal = `${year.toString().padStart(4, '0')}-${month
      .toString()
      .padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour
      .toString()
      .padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second
      .toString()
      .padStart(2, '0')}`
    return candidates.map(({ offset }) => ({
      dueAt: `${exactLocal}${offsetText(offset)}`,
      offsetLabel: `UTC${offsetText(offset)}`
    }))
  } catch {
    return []
  }
}

function localWallClock(dueAt: string, timeZone: string): string {
  try {
    const parts = partsAt(new Date(dueAt).getTime(), timeZone)
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
  } catch {
    return ''
  }
}

function formatReminderTime(record: Pick<ReminderRecord, 'dueAt' | 'timeZone'>): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: record.timeZone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'longOffset',
      hourCycle: 'h23'
    }).format(new Date(record.dueAt))
  } catch {
    return record.dueAt
  }
}

async function payloadDigest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function initialTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

export function ReminderPanel({
  assistantId,
  assistantName,
  api,
  itemApi,
  item = null,
  refreshKey = 0,
  pendingCommands,
  onOpenItem
}: {
  assistantId: string
  assistantName: string
  api: ReminderApi
  itemApi: ItemApi
  item?: ItemRecord | null
  refreshKey?: number
  pendingCommands?: Map<string, string>
  onOpenItem?: (itemId: string) => void
}): React.JSX.Element {
  const [localCommands] = useState(() => new Map<string, string>())
  const commandRegistry = pendingCommands ?? localCommands
  const [records, setRecords] = useState<ReminderRecord[]>([])
  const [runtime, setRuntime] = useState<ReminderRuntime | null>(null)
  const [itemSummaries, setItemSummaries] = useState(() => new Map<string, ItemSummary>())
  const [wallClock, setWallClock] = useState('')
  const [timeZone, setTimeZone] = useState(initialTimeZone)
  const [chosenDueAt, setChosenDueAt] = useState('')
  const [editingId, setEditingId] = useState('')
  const [busy, setBusy] = useState(false)
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [receipt, setReceipt] = useState<ReminderReceipt | null>(null)
  const [unknownCommandId, setUnknownCommandId] = useState('')
  const [policyMode, setPolicyMode] = useState<ReminderPolicy['mode']>('UNCONFIGURED')
  const [catchUpMinutes, setCatchUpMinutes] = useState('')
  const [merge, setMerge] = useState(false)
  const [loginStartup, setLoginStartup] = useState(false)
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [pendingRuntime, setPendingRuntime] = useState<ReminderRuntime | null>(null)
  const generation = useRef(0)
  const queryVersion = useRef(0)
  const runtimeRef = useRef<ReminderRuntime | null>(null)
  const settingsDirtyRef = useRef(false)
  const busyRef = useRef(false)
  const unknownCommandIdRef = useRef('')

  const candidates = useMemo(() => resolveWallClock(wallClock, timeZone), [timeZone, wallClock])
  const dueAt =
    candidates.length === 1
      ? candidates[0]!.dueAt
      : candidates.some((candidate) => candidate.dueAt === chosenDueAt)
        ? chosenDueAt
        : ''
  const selectedRecord = records.find((record) => record.id === editingId) ?? null
  const activeForItem = item
    ? records.find(
        (record) => record.itemId === item.id && !['CANCELLED', 'HANDLED'].includes(record.state)
      )
    : null

  const isCurrent = useCallback((value: number): boolean => value === generation.current, [])

  const applyRuntime = useCallback((value: ReminderRuntime): void => {
    runtimeRef.current = value
    settingsDirtyRef.current = false
    setRuntime(value)
    setPendingRuntime(null)
    setSettingsDirty(false)
    setPolicyMode(value.policy.mode)
    if (value.policy.mode === 'EXPLICIT') {
      setCatchUpMinutes(String(value.policy.catchUpMinutes))
      setMerge(value.policy.merge)
    } else {
      setCatchUpMinutes('')
      setMerge(false)
    }
    setLoginStartup(value.loginStartup)
  }, [])

  const receiveRuntime = useCallback(
    (value: ReminderRuntime): void => {
      const current = runtimeRef.current
      if (current && value.version < current.version) return
      if (settingsDirtyRef.current && current && value.version > current.version) {
        setPendingRuntime(value)
        return
      }
      runtimeRef.current = value
      setRuntime(value)
      if (!settingsDirtyRef.current) applyRuntime(value)
    },
    [applyRuntime]
  )

  function markSettingsDirty(): void {
    settingsDirtyRef.current = true
    setSettingsDirty(true)
  }

  const load = useCallback(async (): Promise<void> => {
    if (!assistantId) return
    const requestVersion = ++queryVersion.current
    const requestAssistantId = assistantId
    try {
      const result = await api.query({
        protocolVersion,
        assistantId: requestAssistantId,
        ...(item ? { itemId: item.id } : {})
      })
      if (requestVersion !== queryVersion.current || requestAssistantId !== assistantId) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setRecords(result.data.records)
      receiveRuntime(result.data.runtime)
      if (item) {
        setItemSummaries(
          new Map([
            [
              item.id,
              { title: item.content.title, version: item.version, status: item.content.status }
            ]
          ])
        )
        return
      }
      const ids = [...new Set(result.data.records.map((record) => record.itemId))]
      const inspected = await Promise.all(
        ids.map(async (id) => {
          try {
            return [
              id,
              await itemApi.inspect({
                protocolVersion,
                assistantId: requestAssistantId,
                id,
                type: 'item'
              })
            ] as const
          } catch {
            return [id, null] as const
          }
        })
      )
      if (requestVersion !== queryVersion.current || requestAssistantId !== assistantId) return
      const summaries = new Map<string, ItemSummary>()
      for (const [id, inspectedResult] of inspected) {
        if (!inspectedResult?.ok || !inspectedResult.data.item) continue
        const current = inspectedResult.data.item
        summaries.set(id, {
          title: current.content.title,
          version: current.version,
          status: current.content.status
        })
      }
      setItemSummaries(summaries)
    } catch {
      if (requestVersion === queryVersion.current && requestAssistantId === assistantId)
        setError('提醒列表暂时无法读取，请稍后重试。')
    }
  }, [api, assistantId, item, itemApi, receiveRuntime])

  useEffect(() => {
    generation.current += 1
    queryVersion.current += 1
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setRecords([])
      setItemSummaries(new Map())
      setEditingId('')
      setWallClock('')
      setTimeZone(initialTimeZone())
      setChosenDueAt('')
      busyRef.current = false
      setBusy(false)
      setSettingsBusy(false)
      setError('')
      setNotice('')
      setReceipt(null)
      let pending = ''
      for (const [key, commandId] of commandRegistry) {
        try {
          const descriptor = JSON.parse(key) as { domain?: unknown; assistantId?: unknown }
          if (descriptor.domain === 'reminder-command' && descriptor.assistantId === assistantId) {
            pending = commandId
            break
          }
        } catch {
          continue
        }
      }
      unknownCommandIdRef.current = pending
      setUnknownCommandId(pending)
    })
    return () => {
      active = false
      generation.current += 1
      queryVersion.current += 1
    }
  }, [assistantId, commandRegistry, item?.id])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void load()
    })
    return () => {
      active = false
      queryVersion.current += 1
    }
  }, [load, refreshKey])

  async function commandFor(action: string, payload: unknown): Promise<PendingCommand> {
    const key = JSON.stringify({
      domain: 'reminder-command',
      assistantId,
      action,
      payloadSha256: await payloadDigest(payload)
    })
    const existing = commandRegistry.get(key)
    if (existing) return { key, commandId: existing, reused: true }
    const commandId = crypto.randomUUID()
    commandRegistry.set(key, commandId)
    return { key, commandId, reused: false }
  }

  function releaseCommand(command: PendingCommand): void {
    if (commandRegistry.get(command.key) === command.commandId) commandRegistry.delete(command.key)
  }

  function applyReceipt(next: ReminderReceipt, command?: PendingCommand): void {
    setReceipt(next)
    const pendingCommandId = next.state === 'RESULT_UNKNOWN' ? next.operationId : ''
    unknownCommandIdRef.current = pendingCommandId
    setUnknownCommandId(pendingCommandId)
    if (command && next.state !== 'RESULT_UNKNOWN') releaseCommand(command)
    if (next.state !== 'RESULT_UNKNOWN') void load()
  }

  async function recover(commandId: string): Promise<boolean> {
    const currentGeneration = generation.current
    try {
      const result = await api.operation({ protocolVersion, assistantId, commandId })
      if (!isCurrent(currentGeneration)) return false
      if (!result.ok) {
        setError(result.error.message)
        return false
      }
      const entry = [...commandRegistry].find(([, value]) => value === commandId)
      const command = entry ? { key: entry[0], commandId, reused: true } : undefined
      applyReceipt(result.data, command)
      if (result.data.state === 'CONFIRMED_NOT_APPLIED')
        setNotice('已确认原操作没有执行。如仍需要，请再次点击相应操作以建立新的操作编号。')
      return false
    } catch {
      if (isCurrent(currentGeneration)) {
        unknownCommandIdRef.current = commandId
        setUnknownCommandId(commandId)
        setError('本地状态仍无法核查；不会自动重放原操作。')
      }
      return false
    }
  }

  async function mutate(mutation: ReminderMutation): Promise<void> {
    if (busyRef.current) return
    if (unknownCommandIdRef.current) {
      setError('原提醒操作的结果尚未确认。请先核查本地状态；得到终态前不会提交新的提醒操作。')
      return
    }
    const currentGeneration = generation.current
    busyRef.current = true
    setBusy(true)
    setError('')
    setNotice('')
    const command = await commandFor(`mutate:${mutation.action}`, mutation)
    try {
      if (!isCurrent(currentGeneration)) return
      if (command.reused) {
        await recover(command.commandId)
        return
      }
      const result = await api.mutate({
        protocolVersion,
        assistantId,
        commandId: command.commandId,
        mutation
      })
      if (!isCurrent(currentGeneration)) return
      if (!result.ok) {
        if (result.error.code === 'STORAGE_UNAVAILABLE') {
          unknownCommandIdRef.current = command.commandId
          setUnknownCommandId(command.commandId)
          setError(
            result.error.message +
              '；操作结果尚未确认，请先核查本地状态，期间不会提交新的提醒操作。'
          )
        } else {
          setError(result.error.message)
          releaseCommand(command)
        }
        if (result.error.code === 'STALE_WRITE') void load()
        return
      }
      applyReceipt(result.data, command)
      if (result.data.state === 'SUCCEEDED') {
        setEditingId('')
        setWallClock('')
        setChosenDueAt('')
      }
    } catch {
      if (!isCurrent(currentGeneration)) return
      unknownCommandIdRef.current = command.commandId
      setUnknownCommandId(command.commandId)
      setError('操作回执未确认；请先核查原操作。得到终态前不会提交任何新的提醒操作。')
    } finally {
      if (isCurrent(currentGeneration)) {
        busyRef.current = false
        setBusy(false)
      }
    }
  }

  async function recoverUnknown(): Promise<void> {
    const commandId = unknownCommandIdRef.current
    if (!commandId || busyRef.current) return
    const currentGeneration = generation.current
    busyRef.current = true
    setBusy(true)
    try {
      await recover(commandId)
    } finally {
      if (isCurrent(currentGeneration)) {
        busyRef.current = false
        setBusy(false)
      }
    }
  }

  function beginReschedule(record: ReminderRecord): void {
    setEditingId(record.id)
    setWallClock(localWallClock(record.dueAt, record.timeZone))
    setTimeZone(record.timeZone)
    setChosenDueAt(record.dueAt)
    setError('')
  }

  function submitTime(): void {
    if (!dueAt || !timeZone.trim()) {
      setError(
        candidates.length > 1
          ? '这个本地时间有两个可能时刻，请明确选择一个偏移。'
          : '请输入有效的未来本地时间与 IANA 时区；不存在的夏令时墙钟时间不能使用。'
      )
      return
    }
    if (selectedRecord) {
      const summary = itemSummaries.get(selectedRecord.itemId)
      if (!summary) {
        setError('关联正式事项当前不可读取，不能用旧事项版本改期。')
        return
      }
      void mutate({
        action: 'reschedule',
        id: selectedRecord.id,
        expectedVersion: selectedRecord.version,
        expectedItemVersion: summary.version,
        dueAt,
        timeZone: timeZone.trim()
      })
      return
    }
    if (!item) return
    void mutate({
      action: 'create',
      itemId: item.id,
      expectedItemVersion: item.version,
      dueAt,
      timeZone: timeZone.trim()
    })
  }

  async function saveSettings(): Promise<void> {
    if (!runtime || settingsBusy || pendingRuntime) return
    const numericMinutes = Number(catchUpMinutes)
    if (
      policyMode === 'EXPLICIT' &&
      (catchUpMinutes.trim() === '' ||
        !Number.isInteger(numericMinutes) ||
        numericMinutes < 0 ||
        numericMinutes > 10_080)
    ) {
      setError('补发窗口须为 0 到 10080 分钟的整数。')
      return
    }
    const currentGeneration = generation.current
    setSettingsBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api.configure({
        protocolVersion,
        expectedVersion: runtime.version,
        policy:
          policyMode === 'UNCONFIGURED'
            ? { mode: 'UNCONFIGURED' }
            : { mode: 'EXPLICIT', catchUpMinutes: numericMinutes, merge },
        loginStartup: runtime.loginStartupSupported ? loginStartup : runtime.loginStartup
      })
      if (!isCurrent(currentGeneration)) return
      if (!result.ok) {
        setError(result.error.message)
        if (result.error.code === 'STALE_WRITE') void load()
        return
      }
      applyRuntime(result.data)
      setNotice('提醒运行设置已由本机服务确认。')
    } catch {
      if (!isCurrent(currentGeneration)) return
      setError('设置回执未确认，正在重新读取本机实际状态。')
      try {
        const result = await api.runtime({ protocolVersion })
        if (!isCurrent(currentGeneration)) return
        if (result.ok) applyRuntime(result.data)
      } catch {
        // Keep the last confirmed runtime visible.
      }
    } finally {
      if (isCurrent(currentGeneration)) setSettingsBusy(false)
    }
  }

  const canCreate =
    item &&
    item.content.status !== 'completed' &&
    item.content.status !== 'cancelled' &&
    !activeForItem

  return (
    <section
      className={`reminder-panel ${item ? 'reminder-item-panel' : ''}`}
      aria-label={item ? '当前事项提醒' : '提醒'}
    >
      <div className="reminder-heading">
        <div>
          <h2>{item ? '提醒' : '提醒中心'}</h2>
          <p className="scope-note">
            {item
              ? `仅管理正式事项“${item.content.title}”的提醒；事项期限不会自动成为提醒。`
              : `${assistantName || '当前助手'} · 提醒由本机确定性运行，不依赖 Provider 在线。`}
          </p>
        </div>
        <button type="button" onClick={() => void load()}>
          刷新
        </button>
      </div>

      {!item && runtime ? (
        <section className="reminder-runtime" aria-label="提醒运行与补发设置">
          <h3>运行与补发</h3>
          <p>
            关闭主窗口后 Mashiro
            会驻留托盘并继续检查已保存提醒；这表示运行承诺，不表示窗口此刻已隐藏。明确退出 Mashiro
            后不再承诺提醒。
          </p>
          <p>
            系统通知：{runtime.notificationSupported ? '当前可用' : '当前不可用'} · 登录启动：
            {runtime.loginStartupSupported
              ? runtime.loginStartup
                ? '已由系统确认开启'
                : '已由系统确认关闭'
              : '此运行环境不支持'}
          </p>
          <fieldset>
            <legend>错过提醒的处理</legend>
            <label className="inline-check">
              <input
                type="radio"
                name="reminder-policy"
                checked={policyMode === 'UNCONFIGURED'}
                onChange={() => {
                  markSettingsDirty()
                  setPolicyMode('UNCONFIGURED')
                }}
              />
              保持待配置：错过后进入“恢复待处理”，不自动补发
            </label>
            <label className="inline-check">
              <input
                type="radio"
                name="reminder-policy"
                checked={policyMode === 'EXPLICIT'}
                onChange={() => {
                  markSettingsDirty()
                  setPolicyMode('EXPLICIT')
                }}
              />
              使用我明确设置的补发规则
            </label>
            {policyMode === 'EXPLICIT' ? (
              <div className="reminder-settings-grid">
                <label>
                  允许补发的时间窗口（分钟）
                  <input
                    aria-label="补发窗口（分钟）"
                    type="number"
                    min="0"
                    max="10080"
                    step="1"
                    value={catchUpMinutes}
                    onChange={(event) => {
                      markSettingsDirty()
                      setCatchUpMinutes(event.target.value)
                    }}
                  />
                </label>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={merge}
                    onChange={(event) => {
                      markSettingsDirty()
                      setMerge(event.target.checked)
                    }}
                  />
                  同次恢复时合并可补发提醒
                </label>
              </div>
            ) : null}
          </fieldset>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={loginStartup}
              disabled={!runtime.loginStartupSupported}
              onChange={(event) => {
                markSettingsDirty()
                setLoginStartup(event.target.checked)
              }}
            />
            登录 Windows 后启动 Mashiro
          </label>
          {!runtime.loginStartupSupported ? (
            <p className="scope-note">开发运行不会注册源代码路径；安装版支持时才可更改此项。</p>
          ) : null}
          {settingsDirty ? <p role="status">运行设置有尚未保存的修改。</p> : null}
          {pendingRuntime ? (
            <section className="reminder-settings-conflict" role="alert">
              <p>
                本机运行设置已更新到版本 {pendingRuntime.version}；当前草稿仍基于版本{' '}
                {runtime.version}，没有被后台刷新覆盖。
              </p>
              <button type="button" onClick={() => applyRuntime(pendingRuntime)}>
                加载本机最新设置
              </button>
            </section>
          ) : null}
          <button
            type="button"
            disabled={settingsBusy || Boolean(pendingRuntime)}
            onClick={() => void saveSettings()}
          >
            保存运行设置
          </button>
        </section>
      ) : null}

      {item && canCreate ? (
        <section className="reminder-editor" aria-label="设置当前事项提醒">
          <h3>设置一次提醒</h3>
          <p className="scope-note">请选择墙钟时间并确认命名时区；这里不会读取或复制事项期限。</p>
          <TimeEditor
            wallClock={wallClock}
            timeZone={timeZone}
            candidates={candidates}
            chosenDueAt={chosenDueAt}
            onWallClock={(value) => {
              setWallClock(value)
              setChosenDueAt('')
            }}
            onTimeZone={(value) => {
              setTimeZone(value)
              setChosenDueAt('')
            }}
            onChoose={setChosenDueAt}
          />
          <button
            type="button"
            disabled={busy || Boolean(unknownCommandId) || !dueAt}
            onClick={submitTime}
          >
            保存提醒
          </button>
        </section>
      ) : item && !activeForItem ? (
        <p className="scope-note">已完成或已取消的事项不能新建提醒。</p>
      ) : null}

      {records.length === 0 ? <p>当前没有已保存提醒。</p> : null}
      <div className="reminder-list">
        {records.map((record) => {
          const summary = itemSummaries.get(record.itemId)
          const terminal = record.state === 'CANCELLED' || record.state === 'HANDLED'
          return (
            <article
              key={`${record.id}:${record.version}`}
              className="reminder-card"
              aria-label={`提醒：${summary?.title ?? record.itemId}`}
            >
              <div className="reminder-heading">
                <div>
                  <small>{summary?.title ?? '关联事项当前不可读取'}</small>
                  <h3>{formatReminderTime(record)}</h3>
                </div>
                <span className={`reminder-state state-${record.state.toLowerCase()}`}>
                  {stateLabels[record.state]}
                </span>
              </div>
              <small>
                时区 {record.timeZone} · 精确时刻 {record.dueAt} · 提醒版本 {record.version}
              </small>
              {record.state === 'DISPLAY_OBSERVED' ? (
                <p className="scope-note">系统仅报告已展示；这不代表你已阅读或处理。</p>
              ) : null}
              {record.state === 'RESULT_UNKNOWN' || record.state === 'DISPATCHING' ? (
                <p className="scope-note">系统是否实际展示无法确认，不会自动盲目重发。</p>
              ) : null}
              {record.state === 'RECOVERY_PENDING' ? (
                <p className="scope-note">该提醒等待你处理；未配置规则时不会自动补发。</p>
              ) : null}
              <div className="button-row">
                {!item && summary ? (
                  <button type="button" onClick={() => onOpenItem?.(record.itemId)}>
                    打开当前事项
                  </button>
                ) : null}
                {!terminal && summary ? (
                  <button type="button" disabled={busy} onClick={() => beginReschedule(record)}>
                    改期
                  </button>
                ) : null}
                {!terminal ? (
                  <button
                    type="button"
                    disabled={busy || Boolean(unknownCommandId)}
                    onClick={() =>
                      void mutate({
                        action: 'cancel',
                        id: record.id,
                        expectedVersion: record.version
                      })
                    }
                  >
                    取消提醒
                  </button>
                ) : null}
                {!terminal ? (
                  <button
                    type="button"
                    disabled={busy || Boolean(unknownCommandId)}
                    onClick={() =>
                      void mutate({
                        action: 'handle',
                        id: record.id,
                        expectedVersion: record.version
                      })
                    }
                  >
                    标为已处理
                  </button>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>

      {selectedRecord ? (
        <section className="reminder-editor" aria-label="提醒改期">
          <div className="reminder-heading">
            <h3>修改提醒时间</h3>
            <button
              type="button"
              onClick={() => {
                setEditingId('')
                setWallClock('')
                setChosenDueAt('')
              }}
            >
              关闭
            </button>
          </div>
          <TimeEditor
            wallClock={wallClock}
            timeZone={timeZone}
            candidates={candidates}
            chosenDueAt={chosenDueAt}
            onWallClock={(value) => {
              setWallClock(value)
              setChosenDueAt('')
            }}
            onTimeZone={(value) => {
              setTimeZone(value)
              setChosenDueAt('')
            }}
            onChoose={setChosenDueAt}
          />
          <button
            type="button"
            disabled={busy || Boolean(unknownCommandId) || !dueAt}
            onClick={submitTime}
          >
            确认改期
          </button>
        </section>
      ) : null}

      {receipt ? (
        <section
          className={`reminder-receipt state-${receipt.state.toLowerCase()}`}
          aria-label="提醒操作回执"
        >
          <strong>{receiptLabels[receipt.state]}</strong>
          <p>{receipt.summary}</p>
          <small>
            操作编号：{receipt.operationId}
            {receipt.reminderId
              ? ` · 提醒 ${receipt.reminderId} · 版本 ${receipt.reminderVersion}`
              : ''}
          </small>
        </section>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {unknownCommandId ? (
        <button type="button" disabled={busy} onClick={() => void recoverUnknown()}>
          核查本地提醒状态
        </button>
      ) : null}
    </section>
  )
}

function TimeEditor({
  wallClock,
  timeZone,
  candidates,
  chosenDueAt,
  onWallClock,
  onTimeZone,
  onChoose
}: {
  wallClock: string
  timeZone: string
  candidates: WallClockCandidate[]
  chosenDueAt: string
  onWallClock: (value: string) => void
  onTimeZone: (value: string) => void
  onChoose: (value: string) => void
}): React.JSX.Element {
  return (
    <div className="reminder-time-grid">
      <label>
        本地日期和时间
        <input
          aria-label="提醒本地日期和时间"
          type="datetime-local"
          step="1"
          value={wallClock}
          onChange={(event) => onWallClock(event.target.value)}
        />
      </label>
      <label>
        IANA 时区
        <input
          aria-label="提醒时区"
          list="mashiro-time-zones"
          placeholder="Asia/Shanghai"
          value={timeZone}
          onChange={(event) => onTimeZone(event.target.value)}
        />
      </label>
      <datalist id="mashiro-time-zones">
        <option value="Asia/Shanghai" />
        <option value="Asia/Tokyo" />
        <option value="Europe/London" />
        <option value="America/New_York" />
        <option value="America/Los_Angeles" />
      </datalist>
      {wallClock && timeZone && candidates.length === 0 ? (
        <p role="alert">该时区中不存在这个墙钟时间，或时区名称无效。</p>
      ) : null}
      {candidates.length > 1 ? (
        <fieldset className="reminder-candidates">
          <legend>这个时间出现两次，请明确选择</legend>
          {candidates.map((candidate) => (
            <label key={candidate.dueAt} className="inline-check">
              <input
                type="radio"
                name={`reminder-offset-${wallClock}-${timeZone}`}
                checked={chosenDueAt === candidate.dueAt}
                onChange={() => onChoose(candidate.dueAt)}
              />
              {candidate.offsetLabel}（精确时刻 {candidate.dueAt}）
            </label>
          ))}
        </fieldset>
      ) : candidates.length === 1 ? (
        <p className="scope-note">
          将保存为 {candidates[0]!.dueAt}（{timeZone}）
        </p>
      ) : null}
    </div>
  )
}
