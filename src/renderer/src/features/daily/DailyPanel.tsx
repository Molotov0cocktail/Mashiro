import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssistantSnapshot } from '../../../../shared/assistant-contract'
import type {
  DailyApi,
  DailyConfiguration,
  DailyDetail,
  DailyFeature,
  DailyJob,
  DailyObservation,
  DailyPreview,
  DailyReport,
  DailySchedule,
  DailySettings
} from '../../../../shared/daily-contract'
import type {
  OperationRow,
  OperationsApi,
  OperationsUsage,
  UsageAttempt,
  UsageFeature
} from '../../../../shared/operations-contract'
import type { ProviderApi, ProviderSnapshot } from '../../../../shared/provider-contract'

const protocolVersion = 1 as const

const featureLabels: Record<DailyFeature, string> = {
  observation: '观察',
  'daily-brief': '每日简报',
  'evening-review': '晚间复盘',
  'weekly-plan': '周规划',
  'deadline-change': '期限与变更'
}

const featureOrder = Object.keys(featureLabels) as DailyFeature[]

function observationNatureLabel(value: DailyObservation['nature']): string {
  if (value === 'user-statement') return '用户陈述'
  return value === 'inference' ? '推测' : '忠实摘要'
}

const usageFeatureOrder: UsageFeature[] = [
  'conversation',
  'tool-chain',
  'connection-test',
  'chapter',
  'shared-candidates',
  'steward',
  ...featureOrder
]

function usageFeatureLabel(value: UsageFeature): string {
  return (
    featureLabels[value as DailyFeature] ??
    (
      {
        conversation: '对话',
        'tool-chain': '工具链',
        'connection-test': '连接测试',
        chapter: '章节',
        'shared-candidates': '共享候选',
        steward: '资料整理'
      } as Record<string, string>
    )[value] ??
    value
  )
}

function actorLabel(value: 'assistant' | 'steward' | 'system'): string {
  return value === 'assistant' ? '助手' : value === 'steward' ? '仓储员' : '系统'
}

function ownerLabel(value: OperationRow['owner']): string {
  return (
    {
      daily: '日常工作',
      background: '章节后台',
      steward: '资料整理',
      item: '事项',
      reminder: '提醒',
      provider: '对话与连接'
    } as const
  )[value.domain]
}
const defaultScope: DailySettings['dataScope'] = {
  ownRounds: true,
  chapters: false,
  privateMemories: false,
  globalMemories: false,
  events: false,
  items: false,
  proposals: false,
  maxSources: 16,
  lookbackDays: 7
}

function defaultSettings(feature: DailyFeature): DailySettings {
  return {
    enabled: false,
    connectionId: null,
    model: null,
    dataScope: defaultScope,
    budget: null,
    schedule: null,
    recovery: { mode: 'UNCONFIGURED' },
    allowSaveObservations: false,
    allowProposals: false,
    deadlineWindowHours: 72,
    changeFields: feature === 'deadline-change' ? ['title', 'status', 'dueAt'] : [],
    mergeChanges: feature === 'deadline-change' ? false : null
  }
}

function uuid(): string {
  return crypto.randomUUID()
}

function displayTime(value: string | null): string {
  return value ? new Date(value).toLocaleString('zh-CN') : '无'
}

function commandKey(action: string, parts: unknown): string {
  return JSON.stringify({ action, parts })
}

function mergeUnique<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const byId = new Map(current.map((value) => [value.id, value]))
  for (const value of incoming) byId.set(value.id, value)
  return [...byId.values()]
}

function editableSettings(
  configuration: DailyConfiguration | undefined,
  feature: DailyFeature
): DailySettings {
  if (!configuration) return defaultSettings(feature)
  return {
    enabled: configuration.enabled,
    connectionId: configuration.connectionId,
    model: configuration.model,
    dataScope: { ...configuration.dataScope },
    budget: configuration.budget ? { ...configuration.budget } : null,
    schedule: configuration.schedule ? { ...configuration.schedule } : null,
    recovery: { ...configuration.recovery },
    allowSaveObservations: configuration.allowSaveObservations,
    allowProposals: configuration.allowProposals,
    deadlineWindowHours: configuration.deadlineWindowHours,
    changeFields: [...configuration.changeFields],
    mergeChanges: configuration.mergeChanges
  }
}
function ConfigEditor({
  feature,
  configuration,
  providers,
  api,
  assistantId,
  onSaved
}: {
  feature: DailyFeature
  configuration: DailyConfiguration | undefined
  providers: ProviderSnapshot | null
  api: DailyApi
  assistantId: string
  onSaved: (value: DailyConfiguration) => void
}): React.JSX.Element {
  const [settings, setSettings] = useState<DailySettings>(() =>
    editableSettings(configuration, feature)
  )
  const [grant, setGrant] = useState(false)
  const [preview, setPreview] = useState<DailyPreview | null>(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [baseVersion, setBaseVersion] = useState(configuration?.version ?? 0)
  const [dirty, setDirty] = useState(false)
  const [stale, setStale] = useState(false)
  const generation = useRef(0)
  const routeRef = useRef(`${assistantId}:${feature}`)
  const baseVersionRef = useRef(configuration?.version ?? 0)
  const dirtyRef = useRef(false)
  const configurationRef = useRef(configuration)
  const configurationVersion = configuration?.version ?? 0

  useEffect(() => {
    configurationRef.current = configuration
  }, [configuration])

  useEffect(() => {
    generation.current += 1
    const route = `${assistantId}:${feature}`
    const incomingVersion = configurationVersion
    const incomingConfiguration = configurationRef.current
    let active = true
    queueMicrotask(() => {
      if (!active) return
      if (
        routeRef.current === route &&
        dirtyRef.current &&
        incomingVersion !== baseVersionRef.current
      ) {
        setStale(true)
        setGrant(false)
        setBusy('')
        setMessage('配置已在别处更新；当前草稿仍绑定旧版本，请重载后再保存。')
        return
      }
      routeRef.current = route
      baseVersionRef.current = incomingVersion
      dirtyRef.current = false
      setBaseVersion(incomingVersion)
      setDirty(false)
      setStale(false)
      setSettings(editableSettings(incomingConfiguration, feature))
      setGrant(false)
      setPreview(null)
      setBusy('')
      setMessage('')
    })
    return () => {
      active = false
      generation.current += 1
    }
  }, [assistantId, configurationVersion, feature])

  function patch(next: Partial<DailySettings>): void {
    dirtyRef.current = true
    setDirty(true)
    setSettings((current) => ({ ...current, ...next }))
  }

  function patchSchedule(next: Partial<DailySchedule>): void {
    const base: DailySchedule = settings.schedule ?? {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
      localTime: '08:00',
      weekday: feature === 'weekly-plan' ? 1 : null,
      weekStartsOn: feature === 'weekly-plan' ? 1 : null,
      fold: null,
      gap: null
    }
    patch({ schedule: { ...base, ...next } })
    setPreview(null)
  }

  async function previewSchedule(): Promise<void> {
    if (!settings.schedule) return
    const token = ++generation.current
    setBusy('preview')
    setMessage('')
    try {
      const result = await api.preview({
        protocolVersion,
        assistantId,
        feature,
        schedule: settings.schedule
      })
      if (token !== generation.current) return
      if (result.ok) setPreview(result.data)
      else setMessage(result.error.message)
    } catch {
      if (token === generation.current) setMessage('下次运行时间暂时无法预览。')
    } finally {
      if (token === generation.current) setBusy('')
    }
  }

  function reloadConfiguration(): void {
    const nextVersion = configuration?.version ?? 0
    routeRef.current = `${assistantId}:${feature}`
    baseVersionRef.current = nextVersion
    dirtyRef.current = false
    setBaseVersion(nextVersion)
    setDirty(false)
    setStale(false)
    setSettings(editableSettings(configuration, feature))
    setGrant(false)
    setPreview(null)
    setMessage('已重载当前配置；原草稿未提交。')
  }

  async function save(): Promise<void> {
    if (stale) return
    const token = ++generation.current
    setBusy('save')
    setMessage('')
    try {
      const result = await api.configure({
        protocolVersion,
        assistantId,
        feature,
        expectedVersion: baseVersion,
        settings,
        grantSelectedRecipient: grant
      })
      if (token !== generation.current) return
      if (result.ok) {
        const nextSettings = editableSettings(result.data, feature)
        routeRef.current = `${assistantId}:${feature}`
        baseVersionRef.current = result.data.version
        dirtyRef.current = false
        setBaseVersion(result.data.version)
        setDirty(false)
        setStale(false)
        setSettings(nextSettings)
        setGrant(false)
        setMessage('配置已保存；自动运行只会按这里明确启用的计划执行。')
        onSaved(result.data)
      } else setMessage(result.error.message)
    } catch {
      if (token === generation.current) setMessage('配置保存结果未确认，请重新读取后再决定。')
    } finally {
      if (token === generation.current) setBusy('')
    }
  }

  const schedule = settings.schedule
  const recovery = settings.recovery.mode === 'EXPLICIT' ? settings.recovery : null
  const selectedConnection = providers?.connections.find(
    (value) => value.id === settings.connectionId
  )
  return (
    <details className="daily-config" open={!configuration}>
      <summary>自动运行配置</summary>
      <p className="scope-note">默认关闭。模型接收授权与资料范围均需在此明确选择。</p>
      <div className="daily-config-grid">
        <label className="inline-check">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => patch({ enabled: event.target.checked })}
          />
          启用此类自动运行
        </label>
        <label>
          模型连接
          <select
            value={settings.connectionId ?? ''}
            onChange={(event) => {
              patch({ connectionId: event.target.value || null })
              setGrant(false)
            }}
          >
            <option value="">未选择</option>
            {providers?.connections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.displayName}
                {connection.enabled ? '' : '（已停用）'}
              </option>
            ))}
          </select>
        </label>
        <label>
          模型名称
          <input
            value={settings.model ?? ''}
            onChange={(event) => {
              patch({ model: event.target.value || null })
              setGrant(false)
            }}
          />
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={grant}
            onChange={(event) => setGrant(event.target.checked)}
          />
          授权当前所选实际接收方读取本次配置允许的资料
        </label>
      </div>
      <fieldset>
        <legend>允许读取的资料</legend>
        <div className="daily-check-grid">
          {(
            [
              ['ownRounds', '本助手对话'],
              ['chapters', '章节'],
              ['privateMemories', '私有记忆'],
              ['globalMemories', '全局记忆'],
              ['events', '事件'],
              ['items', '正式事项'],
              ['proposals', '待确认提案']
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="inline-check">
              <input
                type="checkbox"
                checked={settings.dataScope[key]}
                onChange={(event) =>
                  patch({ dataScope: { ...settings.dataScope, [key]: event.target.checked } })
                }
              />
              {label}
            </label>
          ))}
        </div>
        <label>
          最多来源
          <input
            type="number"
            min={2}
            max={64}
            value={settings.dataScope.maxSources}
            onChange={(event) =>
              patch({
                dataScope: { ...settings.dataScope, maxSources: Number(event.target.value) }
              })
            }
          />
        </label>
        <label>
          回看天数
          <input
            type="number"
            min={1}
            max={366}
            value={settings.dataScope.lookbackDays}
            onChange={(event) =>
              patch({
                dataScope: { ...settings.dataScope, lookbackDays: Number(event.target.value) }
              })
            }
          />
        </label>
      </fieldset>
      <fieldset>
        <legend>计划与错过运行</legend>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={Boolean(schedule)}
            onChange={(event) =>
              patch({
                schedule: event.target.checked
                  ? {
                      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
                      localTime: '08:00',
                      weekday: feature === 'weekly-plan' ? 1 : null,
                      weekStartsOn: feature === 'weekly-plan' ? 1 : null,
                      fold: null,
                      gap: null
                    }
                  : null
              })
            }
          />
          按本地时间自动运行
        </label>
        {schedule ? (
          <div className="daily-config-grid">
            <label>
              时区
              <input
                value={schedule.timeZone}
                onChange={(event) => patchSchedule({ timeZone: event.target.value })}
              />
            </label>
            <label>
              本地时间
              <input
                type="time"
                value={schedule.localTime}
                onChange={(event) => patchSchedule({ localTime: event.target.value })}
              />
            </label>
            {feature === 'weekly-plan' ? (
              <label>
                星期
                <select
                  value={schedule.weekday ?? 1}
                  onChange={(event) =>
                    patchSchedule({
                      weekday: Number(event.target.value),
                      weekStartsOn: Number(event.target.value)
                    })
                  }
                >
                  {['日', '一', '二', '三', '四', '五', '六'].map((label, index) => (
                    <option key={label} value={index}>
                      星期{label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              重复时间
              <select
                value={schedule.fold ?? ''}
                onChange={(event) =>
                  patchSchedule({ fold: (event.target.value || null) as DailySchedule['fold'] })
                }
              >
                <option value="">需要时再选择</option>
                <option value="earlier">较早一次</option>
                <option value="later">较晚一次</option>
              </select>
            </label>
            <label>
              不存在时间
              <select
                value={schedule.gap ?? ''}
                onChange={(event) =>
                  patchSchedule({ gap: (event.target.value || null) as DailySchedule['gap'] })
                }
              >
                <option value="">需要时再选择</option>
                <option value="skip">跳过</option>
                <option value="next-valid">下一个有效时间</option>
              </select>
            </label>
            <button type="button" disabled={Boolean(busy)} onClick={() => void previewSchedule()}>
              预览下次运行
            </button>
          </div>
        ) : null}
        {preview ? (
          <p role="status">
            {preview.reason} · 下次 {displayTime(preview.nextRun)}
            {preview.alternatives.length
              ? ` · 可选 ${preview.alternatives.map(displayTime).join(' / ')}`
              : ''}
          </p>
        ) : null}
        <label>
          错过运行
          <select
            value={settings.recovery.mode}
            onChange={(event) =>
              patch({
                recovery:
                  event.target.value === 'UNCONFIGURED'
                    ? { mode: 'UNCONFIGURED' }
                    : { mode: 'EXPLICIT', catchUpMinutes: 120, merge: false, expire: true }
              })
            }
          >
            <option value="UNCONFIGURED">未配置，不自动补跑</option>
            <option value="EXPLICIT">明确补跑规则</option>
          </select>
        </label>
        {recovery ? (
          <div className="daily-config-grid">
            <label>
              补跑窗口（分钟）
              <input
                type="number"
                min={0}
                max={10080}
                value={recovery.catchUpMinutes}
                onChange={(event) =>
                  patch({ recovery: { ...recovery, catchUpMinutes: Number(event.target.value) } })
                }
              />
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={recovery.merge}
                onChange={(event) =>
                  patch({ recovery: { ...recovery, merge: event.target.checked } })
                }
              />
              合并错过的周期
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={recovery.expire}
                onChange={(event) =>
                  patch({ recovery: { ...recovery, expire: event.target.checked } })
                }
              />
              窗口外过期
            </label>
          </div>
        ) : null}
      </fieldset>
      <fieldset>
        <legend>输出权限与预算</legend>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={settings.allowSaveObservations}
            onChange={(event) => patch({ allowSaveObservations: event.target.checked })}
          />
          允许用户确认后保存观察
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={settings.allowProposals}
            onChange={(event) => patch({ allowProposals: event.target.checked })}
          />
          允许生成待确认提案
        </label>
        {feature === 'deadline-change' ? (
          <div>
            <label>
              期限观察窗口（小时）
              <input
                type="number"
                min={1}
                max={8760}
                value={settings.deadlineWindowHours}
                onChange={(event) => patch({ deadlineWindowHours: Number(event.target.value) })}
              />
            </label>
            <fieldset>
              <legend>检查的变更字段</legend>
              {(
                [
                  ['title', '标题'],
                  ['status', '状态'],
                  ['dueAt', '期限'],
                  ['description', '说明']
                ] as const
              ).map(([field, label]) => (
                <label className="inline-check" key={field}>
                  <input
                    type="checkbox"
                    checked={settings.changeFields.includes(field)}
                    onChange={(event) =>
                      patch({
                        changeFields: event.target.checked
                          ? [...settings.changeFields, field]
                          : settings.changeFields.filter((value) => value !== field)
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={settings.mergeChanges ?? false}
                onChange={(event) => patch({ mergeChanges: event.target.checked })}
              />
              合并同一周期内的多次变更
            </label>
          </div>
        ) : null}
        <label className="inline-check">
          <input
            type="checkbox"
            checked={Boolean(settings.budget)}
            onChange={(event) =>
              patch({
                budget: event.target.checked
                  ? { window: 'utc-day', calls: 5, inputCharacters: 100000, maxOutputTokens: 1200 }
                  : null
              })
            }
          />
          设置每日预算
        </label>
        {settings.budget ? (
          <div className="daily-config-grid">
            <label>
              调用次数
              <input
                type="number"
                min={1}
                max={1000}
                value={settings.budget.calls}
                onChange={(event) =>
                  patch({ budget: { ...settings.budget!, calls: Number(event.target.value) } })
                }
              />
            </label>
            <label>
              输入字符
              <input
                type="number"
                min={100}
                max={10000000}
                value={settings.budget.inputCharacters}
                onChange={(event) =>
                  patch({
                    budget: { ...settings.budget!, inputCharacters: Number(event.target.value) }
                  })
                }
              />
            </label>
            <label>
              最大输出 tokens
              <input
                type="number"
                min={256}
                max={4096}
                value={settings.budget.maxOutputTokens}
                onChange={(event) =>
                  patch({
                    budget: { ...settings.budget!, maxOutputTokens: Number(event.target.value) }
                  })
                }
              />
            </label>
          </div>
        ) : null}
      </fieldset>
      <p className="scope-note">
        实际接收方：{selectedConnection?.displayName ?? '未选择'} · {settings.model ?? '未选择模型'}{' '}
        · 授权状态：{configuration?.authorizedRecipient ? '当前配置已授权' : '未授权或接收方已变化'}
      </p>
      {dirty ? <p className="scope-note">有未保存修改 · 草稿基于配置版本 {baseVersion}</p> : null}
      {stale ? (
        <button type="button" onClick={reloadConfiguration}>
          重载当前配置并放弃草稿
        </button>
      ) : null}
      <button type="button" disabled={Boolean(busy) || stale} onClick={() => void save()}>
        {busy === 'save' ? '保存中…' : '保存配置'}
      </button>
      {message ? <p role={message.includes('已保存') ? 'status' : 'alert'}>{message}</p> : null}
    </details>
  )
}

function OperationsView({
  api,
  assistantSnapshot,
  providers,
  onOpenOwner
}: {
  api: OperationsApi
  assistantSnapshot: AssistantSnapshot
  providers: ProviderSnapshot | null
  onOpenOwner?: (row: OperationRow) => void
}): React.JSX.Element {
  type View = 'current' | 'failures' | 'history' | 'business' | 'usage'
  type Actor = '' | 'assistant' | 'steward' | 'system'
  const currentAssistantId = assistantSnapshot.currentAssistantId ?? ''
  const [view, setView] = useState<View>('current')
  const [assistantFilter, setAssistantFilter] = useState(currentAssistantId)
  const [actor, setActor] = useState<Actor>('')
  const [feature, setFeature] = useState<'' | UsageFeature>('')
  const [connectionId, setConnectionId] = useState('')
  const [model, setModel] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rows, setRows] = useState<OperationRow[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [usage, setUsage] = useState<OperationsUsage | null>(null)
  const [error, setError] = useState('')
  const generation = useRef(0)

  function optionalTime(value: string): string | undefined {
    if (!value) return undefined
    const parsed = new Date(value)
    return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString()
  }

  const loadRows = useCallback(
    async (cursor = 0, append = false) => {
      if (view === 'usage') return
      const token = ++generation.current
      try {
        const result = await api.query({
          protocolVersion,
          view,
          cursor,
          ...(assistantFilter ? { assistantId: assistantFilter } : {}),
          ...(actor ? { actor } : {}),
          ...(feature ? { feature } : {}),
          ...(connectionId ? { connectionId } : {}),
          ...(model.trim() ? { model: model.trim() } : {}),
          ...(optionalTime(from) ? { from: optionalTime(from) } : {}),
          ...(optionalTime(to) ? { to: optionalTime(to) } : {})
        })
        if (token !== generation.current) return
        if (!result.ok) {
          setError(result.error.message)
          return
        }
        setRows((current) => (append ? mergeUnique(current, result.data.rows) : result.data.rows))
        setNextCursor(result.data.nextCursor)
      } catch {
        if (token === generation.current) setError('运行记录暂时无法读取。')
      }
    },
    [api, actor, assistantFilter, connectionId, feature, from, model, to, view]
  )

  const loadUsage = useCallback(
    async (cursor = 0, groupsCursor = 0, mode: 'replace' | 'attempts' | 'groups' = 'replace') => {
      const token = ++generation.current
      try {
        const result = await api.usage({
          protocolVersion,
          cursor,
          groupsCursor,
          ...(assistantFilter ? { assistantId: assistantFilter } : {}),
          ...(actor ? { actor } : {}),
          ...(feature ? { feature } : {}),
          ...(connectionId ? { connectionId } : {}),
          ...(model.trim() ? { model: model.trim() } : {}),
          ...(optionalTime(from) ? { from: optionalTime(from) } : {}),
          ...(optionalTime(to) ? { to: optionalTime(to) } : {})
        })
        if (token !== generation.current) return
        if (!result.ok) {
          setError(result.error.message)
          return
        }
        setUsage((current) => {
          if (mode === 'replace' || !current) return result.data
          if (mode === 'attempts')
            return {
              ...result.data,
              attempts: mergeUnique(current.attempts, result.data.attempts),
              groups: current.groups,
              groupsNextCursor: current.groupsNextCursor
            }
          return {
            ...result.data,
            attempts: current.attempts,
            nextCursor: current.nextCursor,
            groups: [...current.groups, ...result.data.groups]
          }
        })
      } catch {
        if (token === generation.current) setError('分类用量暂时无法读取。')
      }
    },
    [api, actor, assistantFilter, connectionId, feature, from, model, to]
  )

  useEffect(() => {
    generation.current += 1
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setAssistantFilter(currentAssistantId)
      setRows([])
      setUsage(null)
      setError('')
    })
    return () => {
      active = false
      generation.current += 1
    }
  }, [currentAssistantId])

  useEffect(() => {
    generation.current += 1
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setRows([])
      setUsage(null)
      setError('')
      if (view === 'usage') void loadUsage()
      else void loadRows()
    })
    return () => {
      active = false
      generation.current += 1
    }
  }, [loadRows, loadUsage, view])

  useEffect(
    () =>
      api.onChanged(() => {
        generation.current += 1
        setRows([])
        setUsage(null)
        queueMicrotask(() => {
          if (view === 'usage') void loadUsage()
          else void loadRows()
        })
      }),
    [api, loadRows, loadUsage, view]
  )

  return (
    <section className="daily-operations" aria-label="运行状态与分类用量">
      <details className="daily-operation-filters" open>
        <summary>筛选运行与用量</summary>
        <div className="daily-config-grid">
          <label>
            助手筛选
            <select
              value={assistantFilter}
              onChange={(event) => {
                setAssistantFilter(event.target.value)
                setActor(event.target.value ? 'assistant' : '')
              }}
            >
              <option value="">全部助手与内部角色</option>
              {assistantSnapshot.assistants.map((assistant) => (
                <option key={assistant.id} value={assistant.id}>
                  {assistant.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            角色筛选
            <select
              value={actor}
              onChange={(event) => {
                const next = event.target.value as Actor
                setActor(next)
                if (next === 'steward' || next === 'system') setAssistantFilter('')
              }}
            >
              <option value="">全部角色</option>
              <option value="assistant">助手</option>
              <option value="steward">仓储员</option>
              <option value="system">系统</option>
            </select>
          </label>
          <label>
            功能筛选
            <select
              value={feature}
              onChange={(event) => setFeature(event.target.value as '' | UsageFeature)}
            >
              <option value="">全部功能</option>
              {usageFeatureOrder.map((value) => (
                <option key={value} value={value}>
                  {usageFeatureLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            连接筛选
            <select value={connectionId} onChange={(event) => setConnectionId(event.target.value)}>
              <option value="">全部连接</option>
              {providers?.connections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            模型筛选
            <input value={model} onChange={(event) => setModel(event.target.value)} />
          </label>
          <label>
            开始时间
            <input
              type="datetime-local"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            结束时间
            <input
              type="datetime-local"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </div>
        <p className="scope-note">
          筛选变更会重新读取第一页；“全部助手与内部角色”包含仓储员和系统任务。
        </p>
      </details>
      <nav className="daily-subtabs" role="tablist" aria-label="运行状态分类">
        {(
          [
            ['current', '当前运行'],
            ['failures', '当前失败'],
            ['history', '历史记录'],
            ['business', '业务记录'],
            ['usage', '分类用量']
          ] as const
        ).map(([key, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={view === key}
            key={key}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {view === 'usage' && usage ? (
        <>
          <dl className="daily-usage-summary">
            <div>
              <dt>调用</dt>
              <dd>{usage.summary.calls}</dd>
            </div>
            <div>
              <dt>Prompt tokens</dt>
              <dd>{usage.summary.known.promptTokens}</dd>
            </div>
            <div>
              <dt>Completion tokens</dt>
              <dd>{usage.summary.known.completionTokens}</dd>
            </div>
            <div>
              <dt>已知总 tokens</dt>
              <dd>{usage.summary.known.totalTokens}</dd>
            </div>
            <div>
              <dt>处理字符</dt>
              <dd>{usage.summary.inputCharacters}</dd>
            </div>
            <div>
              <dt>未知请求</dt>
              <dd>{usage.summary.unknownRequests}</dd>
            </div>
            <div>
              <dt>发送中</dt>
              <dd>{usage.summary.sendingRequests}</dd>
            </div>
          </dl>
          <p className="scope-note">
            {usage.summary.historicalCoverage}
            {usage.summary.complete ? ' · 统计完整' : ' · 含未知用量，不能当作零消耗'}
          </p>
          <h3>分类汇总</h3>
          {usage.groups.map((group, index) => (
            <article
              className="daily-card"
              key={`${group.actor}:${group.assistantId}:${group.connectionId}:${group.model}:${group.feature}:${index}`}
            >
              <strong>{usageFeatureLabel(group.feature)}</strong>
              <p>
                {actorLabel(group.actor)} · {group.model ?? '无模型'} · {group.calls} 次
              </p>
              <p>
                Prompt {group.known.promptTokens} · Completion {group.known.completionTokens} · 总计{' '}
                {group.known.totalTokens} tokens · {group.inputCharacters} 字符
              </p>
              <p>
                {group.unknownRequests} 个未知 · {group.sendingRequests} 个发送中 ·{' '}
                {group.complete ? '完整' : '不完整'}
              </p>
            </article>
          ))}
          {usage.groupsNextCursor !== null ? (
            <button
              type="button"
              onClick={() => void loadUsage(0, usage.groupsNextCursor!, 'groups')}
            >
              加载更多分类
            </button>
          ) : null}
          <h3>请求明细</h3>
          {usage.attempts.map((attempt: UsageAttempt) => (
            <article className={`daily-card state-${attempt.state.toLowerCase()}`} key={attempt.id}>
              <strong>
                {usageFeatureLabel(attempt.feature)} · {actorLabel(attempt.actor)}
              </strong>
              <p>
                {attempt.state} · {displayTime(attempt.startedAt)} · 输入 {attempt.inputCharacters}{' '}
                字符
              </p>
              {attempt.actual ? (
                <p>
                  Prompt {attempt.actual.promptTokens} · Completion{' '}
                  {attempt.actual.completionTokens} · 总计 {attempt.actual.totalTokens} tokens
                </p>
              ) : attempt.estimatedTokens !== null ? (
                <p>
                  估算 {attempt.estimatedTokens} tokens ·{' '}
                  {attempt.estimationMethod ?? '估算方法未记录'}
                </p>
              ) : (
                <p>
                  {attempt.state === 'UNKNOWN'
                    ? `未知：${attempt.unknownReason ?? '没有最终回执'}`
                    : '尚未结算'}
                </p>
              )}
              <small>
                链 {attempt.chainId} · {attempt.persistent ? '已持久记录' : '仅当前会话'}
              </small>
            </article>
          ))}
          {usage.nextCursor !== null ? (
            <button type="button" onClick={() => void loadUsage(usage.nextCursor!, 0, 'attempts')}>
              加载更多请求
            </button>
          ) : null}
        </>
      ) : (
        <>
          {rows.map((row) => (
            <article className={`daily-card severity-${row.severity.toLowerCase()}`} key={row.id}>
              <strong>{row.summary}</strong>
              <p>
                {row.state} · {row.count} 次 · {displayTime(row.lastAt)}
                {row.current ? ' · 当前仍存在' : ' · 已恢复'}
              </p>
              <small>
                {ownerLabel(row.owner)} · 对象 {row.owner.id}
              </small>
              {onOpenOwner ? (
                <button type="button" onClick={() => onOpenOwner(row)}>
                  打开所属功能或对象
                </button>
              ) : null}
            </article>
          ))}
          {nextCursor !== null ? (
            <button type="button" onClick={() => void loadRows(nextCursor, true)}>
              加载更多记录
            </button>
          ) : null}
        </>
      )}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  )
}
export function DailyPanel({
  assistantSnapshot,
  api,
  operationsApi,
  providerApi,
  onOpenProposal,
  onOpenItem,
  onOpenMemory,
  onOpenOperationOwner,
  onAttentionChange
}: {
  assistantSnapshot: AssistantSnapshot | null
  api: DailyApi
  operationsApi: OperationsApi
  providerApi: ProviderApi
  onOpenProposal?: (value: { assistantId: string; proposalId: string }) => void
  onOpenItem?: (value: { assistantId: string; itemId: string }) => void
  onOpenMemory?: (value: { assistantId: string; memoryId: string; version: number }) => void
  onOpenOperationOwner?: (row: OperationRow) => void
  onAttentionChange?: (value: { unread: number; currentFailures: number }) => void
}): React.JSX.Element {
  const assistantId = assistantSnapshot?.currentAssistantId ?? ''
  const assistantName =
    assistantSnapshot?.assistants.find((value) => value.id === assistantId)?.displayName ??
    '当前助手'
  const [feature, setFeature] = useState<DailyFeature | 'operations'>('observation')
  const [configurations, setConfigurations] = useState<DailyConfiguration[]>([])
  const [jobs, setJobs] = useState<DailyJob[]>([])
  const [jobNext, setJobNext] = useState<number | null>(null)
  const [reports, setReports] = useState<DailyReport[]>([])
  const [reportNext, setReportNext] = useState<number | null>(null)
  const [providers, setProviders] = useState<ProviderSnapshot | null>(null)
  const [detail, setDetail] = useState<DailyDetail | null>(null)
  const [detailNext, setDetailNext] = useState<number | null>(null)
  const [correction, setCorrection] = useState<{
    id: string
    title: string
    markdown: string
  } | null>(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const routeGeneration = useRef(0),
    inspectGeneration = useRef(0),
    commandRegistry = useRef(new Map<string, string>())
  const selectedFeature = feature === 'operations' ? null : feature

  const getCommand = useCallback((action: string, parts: unknown) => {
    const key = commandKey(action, parts)
    const old = commandRegistry.current.get(key)
    if (old) return { key, id: old }
    const id = uuid()
    commandRegistry.current.set(key, id)
    return { key, id }
  }, [])
  const release = useCallback((command: { key: string; id: string }) => {
    if (commandRegistry.current.get(command.key) === command.id)
      commandRegistry.current.delete(command.key)
  }, [])

  const loadView = useCallback(
    async (view: 'configurations' | 'jobs' | 'reports', cursor = 0, append = false) => {
      if (!assistantId || !selectedFeature) return
      const token = routeGeneration.current
      const result = await api.query({
        protocolVersion,
        assistantId,
        view,
        feature: selectedFeature,
        cursor
      })
      if (token !== routeGeneration.current) return
      if (!result.ok) {
        setMessage(result.error.message)
        return
      }
      onAttentionChange?.(result.data.attention)
      if (view === 'configurations') setConfigurations(result.data.configurations)
      if (view === 'jobs') {
        setJobs((current) => (append ? mergeUnique(current, result.data.jobs) : result.data.jobs))
        setJobNext(result.data.nextCursor)
      }
      if (view === 'reports') {
        setReports((current) =>
          append ? mergeUnique(current, result.data.reports) : result.data.reports
        )
        setReportNext(result.data.nextCursor)
      }
    },
    [api, assistantId, onAttentionChange, selectedFeature]
  )

  const refresh = useCallback(() => {
    routeGeneration.current += 1
    inspectGeneration.current += 1
    setDetail(null)
    setDetailNext(null)
    setCorrection(null)
    setJobs([])
    setReports([])
    setMessage('')
    if (!assistantId || !selectedFeature) return
    void Promise.all([loadView('configurations'), loadView('jobs'), loadView('reports')])
  }, [assistantId, loadView, selectedFeature])

  useEffect(() => {
    routeGeneration.current += 1
    inspectGeneration.current += 1
    const token = routeGeneration.current
    let active = true
    queueMicrotask(() => {
      if (!active || token !== routeGeneration.current) return
      setConfigurations([])
      setJobs([])
      setReports([])
      setDetail(null)
      setProviders(null)
      setBusy('')
      setMessage('')
      if (!assistantId) return
      if (selectedFeature)
        void Promise.all([loadView('configurations'), loadView('jobs'), loadView('reports')])
      void providerApi.list().then((result) => {
        if (token === routeGeneration.current && result.ok) setProviders(result.data)
      })
    })
    return () => {
      active = false
      routeGeneration.current += 1
      inspectGeneration.current += 1
    }
  }, [assistantId, loadView, providerApi, selectedFeature])
  useEffect(
    () =>
      api.onChanged((event) => {
        if (event.assistantId && event.assistantId !== assistantId) return
        routeGeneration.current += 1
        inspectGeneration.current += 1
        setDetail(null)
        setDetailNext(null)
        setCorrection(null)
        setMessage('资料权限或版本已变化，已撤下旧报告正文并重新读取。')
        if (selectedFeature)
          queueMicrotask(
            () =>
              void Promise.all([loadView('configurations'), loadView('jobs'), loadView('reports')])
          )
      }),
    [api, assistantId, loadView, selectedFeature]
  )

  async function inspect(report: DailyReport, cursor = 0, append = false): Promise<void> {
    const token = ++inspectGeneration.current,
      route = routeGeneration.current
    if (!append) {
      setDetail(null)
      setDetailNext(null)
      setCorrection(null)
    }
    setBusy('inspect')
    try {
      const result = await api.inspect({
        protocolVersion,
        assistantId,
        id: report.id,
        expectedVersion: report.version,
        governanceVersion: report.governanceVersion,
        cursor
      })
      if (token !== inspectGeneration.current || route !== routeGeneration.current) return
      if (!result.ok) {
        setMessage(result.error.message)
        return
      }
      if (
        result.data.report.version !== report.version ||
        result.data.report.governanceVersion !== report.governanceVersion
      )
        return
      setDetail((current) =>
        append && current
          ? {
              ...result.data,
              providedSources: [...current.providedSources, ...result.data.providedSources],
              citedSources: [...current.citedSources, ...result.data.citedSources]
            }
          : result.data
      )
      setDetailNext(result.data.nextCursor)
    } catch {
      if (token === inspectGeneration.current && route === routeGeneration.current)
        setMessage('报告正文读取失败；旧正文不会继续显示。')
    } finally {
      if (token === inspectGeneration.current) setBusy('')
    }
  }
  async function run(): Promise<void> {
    if (!selectedFeature) return
    const command = getCommand('run', { assistantId, feature: selectedFeature })
    setBusy('run')
    try {
      const result = await api.run({
        protocolVersion,
        assistantId,
        feature: selectedFeature,
        commandId: command.id
      })
      if (!result.ok) setMessage(result.error.message)
      else {
        setJobs((current) => mergeUnique([result.data], current))
        setMessage(
          result.data.state === 'REMOTE_UNKNOWN'
            ? '运行结果未知，可用同一操作重试核查。'
            : '运行已进入队列。'
        )
        if (result.data.state !== 'REMOTE_UNKNOWN') release(command)
      }
    } catch {
      setMessage('运行回执未知；再次点击会沿用同一操作编号核查。')
    } finally {
      setBusy('')
    }
  }
  async function control(
    job: DailyJob,
    action: 'cancel' | 'retry' | 'retry-unknown' | 'skip-recovery' | 'run-recovery'
  ): Promise<void> {
    const command = getCommand(`job-${action}`, { assistantId, id: job.id, version: job.version })
    setBusy(job.id)
    try {
      const result = await api.control({
        protocolVersion,
        assistantId,
        id: job.id,
        expectedVersion: job.version,
        commandId: command.id,
        action
      })
      if (!result.ok) setMessage(result.error.message)
      else {
        setJobs((current) => mergeUnique([result.data], current))
        setMessage(result.data.reason)
        if (result.data.state !== 'REMOTE_UNKNOWN') release(command)
      }
    } catch {
      setMessage('控制操作回执未知；重试会沿用同一操作编号。')
    } finally {
      setBusy('')
    }
  }
  async function decide(
    observation: DailyObservation,
    action: 'accept' | 'correct' | 'reject' | 'dispute' | 'withdraw'
  ): Promise<void> {
    if (!detail) return
    const payload = {
      assistantId,
      reportId: detail.report.id,
      reportVersion: detail.report.version,
      governanceVersion: detail.report.governanceVersion,
      id: observation.id,
      version: observation.version,
      action,
      correction: action === 'correct' ? correction : null
    }
    const command = getCommand(`observation-${action}`, payload)
    setBusy(observation.id)
    try {
      const result = await api.decide({
        protocolVersion,
        assistantId,
        reportId: detail.report.id,
        expectedReportVersion: detail.report.version,
        governanceVersion: detail.report.governanceVersion,
        observationId: observation.id,
        expectedVersion: observation.version,
        commandId: command.id,
        action,
        ...(action === 'correct' && correction
          ? { correction: { title: correction.title, markdown: correction.markdown } }
          : {})
      })
      if (!result.ok) setMessage(result.error.message)
      else {
        setMessage(
          result.data.memory
            ? `${result.data.summary} · 记忆 ${result.data.memory.objectId} · 版本 ${result.data.memory.objectVersion}`
            : result.data.summary
        )
        if (result.data.state !== 'RESULT_UNKNOWN') {
          release(command)
          inspectGeneration.current += 1
          setDetail(null)
          setCorrection(null)
          void loadView('reports')
        }
      }
    } catch {
      setMessage('观察处理回执未知；再次提交会沿用同一操作编号。')
    } finally {
      setBusy('')
    }
  }
  async function acknowledge(report: DailyReport): Promise<void> {
    const command = getCommand('ack', { assistantId, id: report.id, version: report.version })
    setBusy(report.id)
    try {
      const result = await api.ack({
        protocolVersion,
        assistantId,
        id: report.id,
        expectedVersion: report.version,
        commandId: command.id
      })
      if (!result.ok) setMessage(result.error.message)
      else {
        setMessage(result.data.summary)
        if (result.data.state !== 'RESULT_UNKNOWN') {
          release(command)
          void loadView('reports')
        }
      }
    } catch {
      setMessage('已读回执未知；再次点击会沿用同一操作编号。')
    } finally {
      setBusy('')
    }
  }
  if (!assistantId)
    return (
      <section className="daily-panel" aria-label="日常与运行">
        <p>请先选择一个助手。</p>
      </section>
    )
  return (
    <section className="daily-panel" aria-label="日常与运行">
      <div className="daily-heading">
        <div>
          <h2>日常与运行</h2>
          <p className="scope-note">{assistantName} · 自动工作、结果确认与用量都可在这里核对</p>
        </div>
        <button type="button" onClick={refresh}>
          刷新
        </button>
      </div>
      <nav className="daily-tabs" role="tablist" aria-label="日常工作类别">
        {featureOrder.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={feature === value}
            onClick={() => setFeature(value)}
          >
            {featureLabels[value]}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={feature === 'operations'}
          onClick={() => setFeature('operations')}
        >
          运行与用量
        </button>
      </nav>
      {feature === 'operations' ? (
        <OperationsView
          api={operationsApi}
          assistantSnapshot={assistantSnapshot!}
          providers={providers}
          onOpenOwner={(row) => {
            if (
              row.owner.domain === 'daily' &&
              row.feature &&
              featureOrder.includes(row.feature as DailyFeature)
            ) {
              setFeature(row.feature as DailyFeature)
              return
            }
            onOpenOperationOwner?.(row)
          }}
        />
      ) : selectedFeature ? (
        <>
          <ConfigEditor
            feature={selectedFeature}
            configuration={configurations.find((value) => value.feature === selectedFeature)}
            providers={providers}
            api={api}
            assistantId={assistantId}
            onSaved={(value) => setConfigurations((current) => mergeUnique(current, [value]))}
          />
          <section aria-label={`${featureLabels[selectedFeature]}运行`}>
            <div className="daily-heading">
              <div>
                <h3>立即运行</h3>
                <p className="scope-note">立即运行也会检查配置、权限、来源范围与预算。</p>
              </div>
              <button type="button" disabled={Boolean(busy)} onClick={() => void run()}>
                {busy === 'run' ? '启动中…' : '立即运行'}
              </button>
            </div>
            {jobs.map((job) => (
              <article className={`daily-card state-${job.state.toLowerCase()}`} key={job.id}>
                <div className="daily-card-heading">
                  <strong>{job.state}</strong>
                  <small>
                    {displayTime(job.updatedAt)} · 尝试 {job.attempts} 次
                  </small>
                </div>
                <p>{job.reason}</p>
                <p className="scope-note">
                  预算窗口 {job.budget.windowId}：{job.budget.callsUsed} 次 /{' '}
                  {job.budget.inputCharactersUsed} 字符
                </p>
                <div className="button-row">
                  {['QUEUED', 'RUNNING'].includes(job.state) ? (
                    <button
                      disabled={busy === job.id}
                      type="button"
                      onClick={() => void control(job, 'cancel')}
                    >
                      取消
                    </button>
                  ) : null}
                  {['FAILED', 'PARTIAL', 'BUDGET_PAUSED'].includes(job.state) ? (
                    <button
                      disabled={busy === job.id}
                      type="button"
                      onClick={() => void control(job, 'retry')}
                    >
                      重试
                    </button>
                  ) : null}
                  {job.state === 'REMOTE_UNKNOWN' ? (
                    <button
                      disabled={busy === job.id}
                      type="button"
                      onClick={() => void control(job, 'retry-unknown')}
                    >
                      核查并重试未知结果
                    </button>
                  ) : null}
                  {job.state === 'RECOVERY_PENDING' ? (
                    <>
                      <button
                        disabled={busy === job.id}
                        type="button"
                        onClick={() => void control(job, 'run-recovery')}
                      >
                        执行补跑
                      </button>
                      <button
                        disabled={busy === job.id}
                        type="button"
                        onClick={() => void control(job, 'skip-recovery')}
                      >
                        跳过补跑
                      </button>
                    </>
                  ) : null}
                </div>
                <details>
                  <summary>结果槽位</summary>
                  {job.slots.map((slot) => (
                    <p key={slot.id}>
                      {slot.action === 'report' ? '报告' : '提案'} · {slot.state} · 操作{' '}
                      {slot.commandId} · {slot.reason}
                    </p>
                  ))}
                </details>
              </article>
            ))}
            {jobNext !== null ? (
              <button type="button" onClick={() => void loadView('jobs', jobNext, true)}>
                加载更多运行
              </button>
            ) : null}
          </section>
          <section aria-label={`${featureLabels[selectedFeature]}报告`}>
            <h3>结果与来源</h3>
            {reports.map((report) => (
              <article className={`daily-card state-${report.state.toLowerCase()}`} key={report.id}>
                <div className="daily-card-heading">
                  <strong>{report.period.localLabel}</strong>
                  <span>
                    {report.unread ? '未读' : '已读'} · {report.state}
                  </span>
                </div>
                <p>
                  {report.range.description}
                  {report.range.limited
                    ? ` · 仅纳入 ${report.range.included}/${report.range.available}`
                    : ''}
                </p>
                <div className="button-row">
                  <button
                    type="button"
                    disabled={!report.bodyAvailable || Boolean(busy)}
                    onClick={() => void inspect(report)}
                  >
                    {report.bodyAvailable ? '查看报告' : '正文不可用'}
                  </button>
                  {report.unread ? (
                    <button
                      type="button"
                      disabled={busy === report.id}
                      onClick={() => void acknowledge(report)}
                    >
                      标为已读
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
            {reportNext !== null ? (
              <button type="button" onClick={() => void loadView('reports', reportNext, true)}>
                加载更多报告
              </button>
            ) : null}
          </section>
          {detail ? (
            <section className="daily-detail" aria-label="日常报告详情">
              <div className="daily-heading">
                <div>
                  <h3>{detail.report.period.localLabel}</h3>
                  <small>
                    报告版本 {detail.report.version} · 治理版本 {detail.report.governanceVersion}
                  </small>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    inspectGeneration.current += 1
                    setDetail(null)
                    setCorrection(null)
                  }}
                >
                  关闭报告
                </button>
              </div>
              <pre className="daily-markdown">{detail.markdown}</pre>
              {detail.sections.map((section, index) => (
                <article className="daily-section" key={`${section.title}:${index}`}>
                  <h4>{section.title}</h4>
                  <span className="count-badge">
                    {section.nature === 'inference' ? '推测' : '忠实摘要'}
                  </span>
                  <p>{section.markdown}</p>
                  <small>来源标记：{section.sourceHandles.join('、') || '无'}</small>
                </article>
              ))}
              {detail.observations.length ? (
                <section aria-label="观察确认">
                  <h3>待确认观察</h3>
                  {detail.observations.map((observation) => (
                    <article className="daily-card" key={observation.id}>
                      <div className="daily-card-heading">
                        <strong>{observation.title}</strong>
                        <span>
                          {observationNatureLabel(observation.nature)} · {observation.status}
                        </span>
                      </div>
                      <p>{observation.markdown}</p>
                      {observation.memoryId ? (
                        <p className="scope-note">
                          已保存为记忆 {observation.memoryId} · 版本 {observation.memoryVersion}
                          。纠正或撤回需在记忆区完成影响确认。
                        </p>
                      ) : null}
                      {correction?.id === observation.id ? (
                        <>
                          <label>
                            纠正标题
                            <input
                              value={correction.title}
                              onChange={(event) =>
                                setCorrection({ ...correction, title: event.target.value })
                              }
                            />
                          </label>
                          <label>
                            纠正内容
                            <textarea
                              value={correction.markdown}
                              onChange={(event) =>
                                setCorrection({ ...correction, markdown: event.target.value })
                              }
                            />
                          </label>
                        </>
                      ) : null}
                      <div className="button-row">
                        {(observation.status === 'pending-verification' ||
                          observation.status === 'disputed') &&
                        !observation.memoryId ? (
                          <>
                            <button
                              disabled={busy === observation.id}
                              type="button"
                              onClick={() => void decide(observation, 'accept')}
                            >
                              接受并保存
                            </button>
                            <button
                              disabled={busy === observation.id}
                              type="button"
                              onClick={() =>
                                setCorrection({
                                  id: observation.id,
                                  title: observation.title,
                                  markdown: observation.markdown
                                })
                              }
                            >
                              纠正后保存
                            </button>
                            <button
                              disabled={busy === observation.id}
                              type="button"
                              onClick={() => void decide(observation, 'reject')}
                            >
                              拒绝
                            </button>
                            {observation.status === 'pending-verification' ? (
                              <button
                                disabled={busy === observation.id}
                                type="button"
                                onClick={() => void decide(observation, 'dispute')}
                              >
                                标为有争议
                              </button>
                            ) : null}
                          </>
                        ) : observation.memoryId && observation.memoryVersion !== null ? (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenMemory?.({
                                assistantId,
                                memoryId: observation.memoryId!,
                                version: observation.memoryVersion!
                              })
                            }
                          >
                            到记忆区处理
                          </button>
                        ) : null}
                        {correction?.id === observation.id ? (
                          <button
                            disabled={
                              busy === observation.id ||
                              !correction.title.trim() ||
                              !correction.markdown.trim()
                            }
                            type="button"
                            onClick={() => void decide(observation, 'correct')}
                          >
                            提交纠正
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </section>
              ) : null}
              {detail.proposalLinks.length ? (
                <section aria-label="报告提案">
                  <h3>待确认提案</h3>
                  {detail.proposalLinks.map((proposal) => (
                    <article className="daily-card" key={proposal.id}>
                      <strong>{proposal.candidate.title}</strong>
                      <p>建议，尚未成为正式事项 · {proposal.state}</p>
                      <button
                        type="button"
                        onClick={() => onOpenProposal?.({ assistantId, proposalId: proposal.id })}
                      >
                        到事项区查看提案
                      </button>
                      {proposal.acceptedItemId ? (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenItem?.({ assistantId, itemId: proposal.acceptedItemId! })
                          }
                        >
                          查看形成的正式事项
                        </button>
                      ) : null}
                    </article>
                  ))}
                </section>
              ) : null}
              <details>
                <summary>来源与范围</summary>
                <p>{detail.report.range.description}</p>
                <h4>提供给模型的来源</h4>
                {detail.providedSources.map((source) => (
                  <p key={`provided:${source.handle}`}>
                    {source.handle} · {source.title} · {source.source.type}
                  </p>
                ))}
                <h4>模型输出引用的来源</h4>
                {detail.citedSources.map((source) => (
                  <p key={`cited:${source.handle}`}>
                    {source.handle} · {source.title} · {source.source.type}
                  </p>
                ))}
                <p className="scope-note">
                  未被明确引用不表示未影响输出；接受结果仍按全部提供来源保守保留治理关系。
                </p>
                {detailNext !== null ? (
                  <button
                    type="button"
                    disabled={busy === 'inspect'}
                    onClick={() => void inspect(detail.report, detailNext, true)}
                  >
                    加载更多来源
                  </button>
                ) : null}
              </details>
              {detail.checkpoints.length ? (
                <details>
                  <summary>期限与变更检查点</summary>
                  {detail.checkpoints.map((checkpoint) => (
                    <p key={`${checkpoint.itemId}:${checkpoint.toVersion}`}>
                      事项 {checkpoint.itemId} · 版本 {checkpoint.fromVersion ?? '新'} →{' '}
                      {checkpoint.toVersion} · {checkpoint.fields.join('、')} ·{' '}
                      {checkpoint.consumed ? '已纳入' : '未纳入'}
                    </p>
                  ))}
                </details>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
      {message ? <p role={message.includes('已') ? 'status' : 'alert'}>{message}</p> : null}
    </section>
  )
}
