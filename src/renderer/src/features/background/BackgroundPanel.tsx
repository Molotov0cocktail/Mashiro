import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  BackgroundApi,
  BackgroundChapter,
  BackgroundJob,
  BackgroundSnapshot
} from '../../../../shared/background-contract'
import type { ProviderApi, ProviderConnection } from '../../../../shared/provider-contract'

const protocolVersion = 1 as const

const jobLabels: Record<BackgroundJob['state'], string> = {
  QUEUED: '待处理',
  RUNNING: '运行中',
  BUDGET_PAUSED: '预算暂停',
  CONFIGURATION_BLOCKED: '配置阻止',
  PERMISSION_BLOCKED: '权限阻止',
  FAILED_CONFIRMED: '确认失败',
  REMOTE_UNKNOWN: '远端结果未知',
  CANCELLED: '已取消',
  STALE: '已过期',
  COMPLETED: '已完成'
}

function mergeByVersion<T extends { id: string; version: number }>(
  current: T[],
  incoming: T[]
): T[] {
  const values = new Map(current.map((value) => [value.id, value]))
  for (const value of incoming) {
    const previous = values.get(value.id)
    if (!previous || previous.version <= value.version) values.set(value.id, value)
  }
  return [...values.values()]
}

function chapterBodyKey(chapter: BackgroundChapter): string {
  return [
    chapter.id,
    chapter.version,
    chapter.memoryId,
    chapter.memoryVersion,
    chapter.bodyHash,
    chapter.state
  ].join(':')
}

function localTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

export type ChapterContextSelection = {
  assistantId: string
  chapters: Array<{ id: string; expectedVersion: number }>
}

export function BackgroundPanel({
  assistantId,
  assistantName,
  api,
  providerApi,
  onUseChapters
}: {
  assistantId: string
  assistantName: string
  api: BackgroundApi
  providerApi: ProviderApi
  onUseChapters: (selection: ChapterContextSelection) => void
}): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<BackgroundSnapshot | null>(null)
  const snapshotRef = useRef<BackgroundSnapshot | null>(null)
  const [connections, setConnections] = useState<ProviderConnection[]>([])
  const [enabled, setEnabled] = useState(false)
  const [connectionId, setConnectionId] = useState('')
  const [model, setModel] = useState('')
  const [allowOwnCompletedRounds, setAllowOwnCompletedRounds] = useState(false)
  const [hasBudget, setHasBudget] = useState(false)
  const [calls, setCalls] = useState('')
  const [inputCharacters, setInputCharacters] = useState('')
  const [grantSelectedRecipient, setGrantSelectedRecipient] = useState(false)
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  const draftConfigurationVersion = useRef(0)
  const [selectedChapters, setSelectedChapters] = useState<string[]>([])
  const [chapterBodies, setChapterBodies] = useState<
    Record<string, { key: string; markdown: string }>
  >({})
  const [chapterLoading, setChapterLoading] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const routeRef = useRef('')
  const routeGeneration = useRef(0)
  const chapterReadVersions = useRef(new Map<string, number>())
  const readVersion = useRef(0)
  const operationVersion = useRef(0)
  const pendingCommands = useRef(new Map<string, string>())

  const syncDraft = useCallback((value: BackgroundSnapshot): void => {
    const configuration = value.configuration
    draftConfigurationVersion.current = configuration.version
    setEnabled(configuration.enabled)
    setConnectionId(configuration.connectionId ?? '')
    setModel(configuration.model ?? '')
    setAllowOwnCompletedRounds(configuration.allowOwnCompletedRounds)
    setHasBudget(configuration.budget !== null)
    setCalls(configuration.budget ? String(configuration.budget.calls) : '')
    setInputCharacters(configuration.budget ? String(configuration.budget.inputCharacters) : '')
    setGrantSelectedRecipient(false)
    setDirty(false)
    dirtyRef.current = false
  }, [])

  const acceptSnapshot = useCallback(
    (value: BackgroundSnapshot, append = false, forceDraft = false): void => {
      if (value.configuration.assistantId !== routeRef.current) return
      const current = snapshotRef.current
      if (current && value.configuration.version < current.configuration.version) return
      const next =
        append && current
          ? {
              ...value,
              jobs: mergeByVersion(current.jobs, value.jobs),
              chapters: mergeByVersion(current.chapters, value.chapters)
            }
          : value
      snapshotRef.current = next
      setSnapshot(next)
      setChapterBodies((values) =>
        Object.fromEntries(
          Object.entries(values).filter(([id, body]) =>
            next.chapters.some(
              (chapter) =>
                chapter.id === id &&
                chapter.state === 'AVAILABLE' &&
                chapterBodyKey(chapter) === body.key
            )
          )
        )
      )
      setSelectedChapters((selected) =>
        selected.filter((id) =>
          next.chapters.some((chapter) => chapter.id === id && chapter.state === 'AVAILABLE')
        )
      )
      if (forceDraft || !dirtyRef.current) syncDraft(value)
    },
    [syncDraft]
  )

  const load = useCallback(
    async (targetAssistantId: string, cursor = 0): Promise<void> => {
      const version = ++readVersion.current
      const route = targetAssistantId
      setLoading(true)
      setError('')
      try {
        const result = await api.query({ protocolVersion, assistantId: targetAssistantId, cursor })
        if (version !== readVersion.current || routeRef.current !== route) return
        if (!result.ok) {
          setError(result.error.message)
          return
        }
        acceptSnapshot(result.data, cursor > 0)
      } catch {
        if (version === readVersion.current && routeRef.current === route) {
          setError('章节后台暂时无法读取，已保留当前页面内容。')
        }
      } finally {
        if (version === readVersion.current && routeRef.current === route) setLoading(false)
      }
    },
    [acceptSnapshot, api]
  )

  useEffect(() => {
    routeRef.current = assistantId
    routeGeneration.current += 1
    chapterReadVersions.current.clear()
    readVersion.current += 1
    operationVersion.current += 1
    snapshotRef.current = null
    dirtyRef.current = false
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setSnapshot(null)
      setBusy(false)
      setLoading(false)
      setChapterLoading({})
      setEnabled(false)
      setConnectionId('')
      setModel('')
      setAllowOwnCompletedRounds(false)
      setHasBudget(false)
      setCalls('')
      setInputCharacters('')
      setGrantSelectedRecipient(false)
      setDirty(false)
      setConnections([])
      setSelectedChapters([])
      setChapterBodies({})
      setError('')
      setNotice('')
      if (!assistantId) return
      void load(assistantId)
      void providerApi
        .list()
        .then((result) => {
          if (active && routeRef.current === assistantId && result.ok) {
            setConnections(result.data.connections)
          }
        })
        .catch(() => {
          if (active && routeRef.current === assistantId) {
            setError('Provider 连接列表暂时无法读取；后台配置尚未更改。')
          }
        })
    })
    return () => {
      active = false
      routeGeneration.current += 1
    }
  }, [assistantId, load, providerApi])

  useEffect(() => {
    if (!assistantId) return
    return api.onChanged((event) => {
      if (event.assistantId !== routeRef.current) return
      void load(event.assistantId)
    })
  }, [api, assistantId, load])

  const markDirty = (): void => {
    setDirty(true)
    dirtyRef.current = true
    setNotice('')
  }

  const validBudget =
    !hasBudget ||
    (/^\d+$/.test(calls) &&
      /^\d+$/.test(inputCharacters) &&
      Number(calls) >= 1 &&
      Number(calls) <= 1000 &&
      Number(inputCharacters) >= 1 &&
      Number(inputCharacters) <= 10_000_000)
  const configurationReady =
    !enabled ||
    (Boolean(connectionId) &&
      Boolean(model.trim()) &&
      allowOwnCompletedRounds &&
      hasBudget &&
      validBudget)
  const recipientAuthorized =
    snapshot?.configuration.recipientAuthorized === true &&
    snapshot.configuration.connectionId === connectionId

  async function saveConfiguration(): Promise<void> {
    const current = snapshotRef.current
    if (!current || !configurationReady || !validBudget || busy) return
    const targetAssistantId = assistantId
    const version = ++operationVersion.current
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api.configure({
        protocolVersion,
        assistantId: targetAssistantId,
        expectedVersion: draftConfigurationVersion.current,
        settings: {
          enabled,
          connectionId: connectionId || null,
          model: model.trim() || null,
          allowOwnCompletedRounds,
          budget: hasBudget
            ? {
                window: 'utc-day',
                calls: Number(calls),
                inputCharacters: Number(inputCharacters)
              }
            : null
        },
        grantSelectedRecipient: enabled && grantSelectedRecipient
      })
      if (version !== operationVersion.current || routeRef.current !== targetAssistantId) return
      if (!result.ok) {
        setError(
          result.error.code === 'STALE_WRITE'
            ? '配置版本已变化，当前草稿未丢失。可先核对，再重新载入已保存配置后编辑。'
            : result.error.message
        )
        return
      }
      acceptSnapshot(result.data, false, true)
      setNotice('章节后台配置已保存。')
    } catch {
      if (version !== operationVersion.current || routeRef.current !== targetAssistantId) return
      setError('保存回执未确认，可能已经生效；请核对刷新结果，不会自动重复提交。')
      await load(targetAssistantId)
    } finally {
      if (version === operationVersion.current && routeRef.current === targetAssistantId) {
        setBusy(false)
      }
    }
  }

  async function runNow(): Promise<void> {
    if (!assistantId || busy) return
    const targetAssistantId = assistantId
    const version = ++operationVersion.current
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api.run({ protocolVersion, assistantId: targetAssistantId })
      if (version !== operationVersion.current || routeRef.current !== targetAssistantId) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      acceptSnapshot(result.data)
      setNotice('已检查可整理的正常完整轮次；运行状态见下方。')
    } catch {
      if (version === operationVersion.current && routeRef.current === targetAssistantId) {
        setError('启动回执未确认，可能已经入队；不会自动重试，请先刷新运行状态。')
      }
    } finally {
      if (version === operationVersion.current && routeRef.current === targetAssistantId) {
        setBusy(false)
      }
    }
  }

  async function control(
    job: BackgroundJob,
    action: 'cancel' | 'retry' | 'retry-unknown' | 'inspect'
  ): Promise<void> {
    if (busy) return
    const targetAssistantId = assistantId
    const key = `${targetAssistantId}:${job.id}:${job.version}:${action}`
    const commandId = pendingCommands.current.get(key) ?? crypto.randomUUID()
    pendingCommands.current.set(key, commandId)
    const version = ++operationVersion.current
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api.control({
        protocolVersion,
        assistantId: targetAssistantId,
        jobId: job.id,
        expectedVersion: job.version,
        commandId,
        action
      })
      if (version !== operationVersion.current || routeRef.current !== targetAssistantId) return
      if (!result.ok) {
        setError(
          result.error.code === 'STALE_WRITE'
            ? '作业状态已变化，请刷新后重试。'
            : result.error.message
        )
        return
      }
      pendingCommands.current.delete(key)
      acceptSnapshot(result.data)
      setNotice(action === 'inspect' ? '已核查当前作业状态。' : '作业操作已有明确回执。')
    } catch {
      if (version === operationVersion.current && routeRef.current === targetAssistantId) {
        setError('作业操作回执未确认；再次操作会复用同一命令，不会静默重复执行。')
      }
    } finally {
      if (version === operationVersion.current && routeRef.current === targetAssistantId)
        setBusy(false)
    }
  }

  async function readChapter(chapter: BackgroundChapter): Promise<void> {
    if (chapter.state !== 'AVAILABLE') return
    const targetAssistantId = assistantId
    const generation = routeGeneration.current
    const serial = (chapterReadVersions.current.get(chapter.id) ?? 0) + 1
    chapterReadVersions.current.set(chapter.id, serial)
    const stillCurrent = (): boolean =>
      generation === routeGeneration.current &&
      routeRef.current === targetAssistantId &&
      chapterReadVersions.current.get(chapter.id) === serial
    setChapterLoading((values) => ({ ...values, [chapter.id]: true }))
    setError('')
    try {
      const result = await api.chapter({
        protocolVersion,
        assistantId: targetAssistantId,
        chapterId: chapter.id,
        expectedVersion: chapter.version
      })
      if (!stillCurrent()) return
      const current = snapshotRef.current?.chapters.find((value) => value.id === chapter.id)
      if (
        !current ||
        current.state !== 'AVAILABLE' ||
        chapterBodyKey(current) !== chapterBodyKey(chapter)
      )
        return
      if (!result.ok) {
        setError(
          result.error.code === 'STALE_WRITE'
            ? '章节版本已变化，请刷新后重新读取。'
            : result.error.message
        )
        return
      }
      if (chapterBodyKey(result.data.chapter) !== chapterBodyKey(current)) return
      setChapterBodies((values) => ({
        ...values,
        [chapter.id]: { key: chapterBodyKey(current), markdown: result.data.markdown }
      }))
    } catch {
      if (stillCurrent()) setError('章节正文暂时无法读取。')
    } finally {
      if (stillCurrent()) setChapterLoading((values) => ({ ...values, [chapter.id]: false }))
    }
  }

  async function updateTopic(
    chapter: BackgroundChapter,
    topic: BackgroundChapter['topics'][number],
    state: 'RESOLVED' | 'DISMISSED'
  ): Promise<void> {
    if (busy) return
    const targetAssistantId = assistantId
    const version = ++operationVersion.current
    setBusy(true)
    setError('')
    try {
      const result = await api.topic({
        protocolVersion,
        assistantId: targetAssistantId,
        chapterId: chapter.id,
        expectedChapterVersion: chapter.version,
        topicId: topic.id,
        expectedVersion: topic.version,
        state
      })
      if (version !== operationVersion.current || routeRef.current !== targetAssistantId) return
      if (!result.ok) {
        setError(
          result.error.code === 'STALE_WRITE'
            ? '话题或章节版本已变化，请刷新后重试。'
            : result.error.message
        )
        return
      }
      acceptSnapshot(result.data)
      setNotice(state === 'RESOLVED' ? '未完成话题已标记为解决。' : '未完成话题已忽略。')
    } catch {
      if (version === operationVersion.current && routeRef.current === targetAssistantId) {
        setError('话题操作回执未确认；请先刷新核对，不会自动重复提交。')
      }
    } finally {
      if (version === operationVersion.current && routeRef.current === targetAssistantId)
        setBusy(false)
    }
  }

  const selectedAvailable = useMemo(
    () =>
      (snapshot?.chapters ?? [])
        .filter((chapter) => chapter.state === 'AVAILABLE' && selectedChapters.includes(chapter.id))
        .map((chapter) => ({ id: chapter.id, expectedVersion: chapter.version })),
    [selectedChapters, snapshot?.chapters]
  )

  if (!assistantId) return <p className="panel">请先创建并选择助手，再配置章节后台。</p>

  return (
    <section className="panel background-panel" aria-label="章节后台">
      <header>
        <p className="eyebrow">当前助手 · {assistantName || '未命名助手'}</p>
        <h2>章节后台</h2>
        <p>把已完成的正常对话整理成可核查章节。默认关闭、未授权或未设预算时不会外发。</p>
      </header>

      <section className="background-configuration" aria-label="后台配置">
        <h3>执行与接收配置</h3>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => {
              setEnabled(event.currentTarget.checked)
              markDirty()
            }}
          />
          启用本助手的章节后台
        </label>
        <label>
          后台执行连接
          <select
            value={connectionId}
            onChange={(event) => {
              setConnectionId(event.currentTarget.value)
              setGrantSelectedRecipient(false)
              markDirty()
            }}
          >
            <option value="">未选择（零外发）</option>
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id} disabled={!connection.enabled}>
                {connection.displayName}
                {connection.enabled ? '' : '（已停用）'}
              </option>
            ))}
          </select>
        </label>
        <label>
          后台执行模型
          <input
            aria-label="后台执行模型"
            maxLength={160}
            value={model}
            onChange={(event) => {
              setModel(event.currentTarget.value)
              markDirty()
            }}
          />
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={allowOwnCompletedRounds}
            onChange={(event) => {
              setAllowOwnCompletedRounds(event.currentTarget.checked)
              markDirty()
            }}
          />
          允许读取本助手已完成的正常对话轮次
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={hasBudget}
            onChange={(event) => {
              setHasBudget(event.currentTarget.checked)
              markDirty()
            }}
          />
          设置 UTC 日硬预算
        </label>
        {hasBudget ? (
          <div className="background-budget-grid">
            <label>
              每 UTC 日最多调用次数
              <input
                aria-label="每 UTC 日最多调用次数"
                inputMode="numeric"
                value={calls}
                onChange={(event) => {
                  setCalls(event.currentTarget.value)
                  markDirty()
                }}
              />
            </label>
            <label>
              每 UTC 日最多输入字符数
              <input
                aria-label="每 UTC 日最多输入字符数"
                inputMode="numeric"
                value={inputCharacters}
                onChange={(event) => {
                  setInputCharacters(event.currentTarget.value)
                  markDirty()
                }}
              />
            </label>
          </div>
        ) : null}
        <p className="scope-note">
          硬上限按 UTC 自然日计算调用次数和实际输入字符数；下方 token 仅为 Provider
          返回的用量统计，不是本功能的硬预算。
        </p>
        <label className="inline-check recipient-grant">
          <input
            type="checkbox"
            checked={grantSelectedRecipient}
            disabled={!enabled || !connectionId}
            onChange={(event) => {
              setGrantSelectedRecipient(event.currentTarget.checked)
              markDirty()
            }}
          />
          允许所选连接接收本助手历史与私有记忆
        </label>
        <p className="scope-note">
          {recipientAuthorized
            ? '当前所选连接已获得接收授权。连接地址变化后必须重新明确授权。'
            : '当前所选连接尚无有效接收授权。此勾选只授权本次保存所选的实际接收方接收本助手历史与私有记忆，不会改变聊天绑定，也不会自动打开记忆读写权限；本轮章节整理仍只读取已完成的正常对话轮次。'}
        </p>
        {!validBudget ? (
          <p role="alert">预算必须是范围内的整数：调用 1–1000 次，输入 1–10,000,000 字符。</p>
        ) : null}
        {enabled && !configurationReady ? (
          <p role="alert">启用前请明确选择连接、模型、读取范围和 UTC 日硬预算。</p>
        ) : null}
        <div className="button-row">
          <button
            type="button"
            disabled={!dirty || !snapshot || !configurationReady || !validBudget || busy}
            onClick={() => void saveConfiguration()}
          >
            {busy ? '处理中…' : '保存后台配置'}
          </button>
          <button
            type="button"
            disabled={!dirty || !snapshot || busy}
            onClick={() => {
              if (!snapshotRef.current) return
              syncDraft(snapshotRef.current)
              setError('')
              setNotice('已重新载入已保存配置，未保存草稿已放弃。')
            }}
          >
            重新载入已保存配置
          </button>
          <button type="button" disabled={loading || busy} onClick={() => void load(assistantId)}>
            刷新
          </button>
          <button
            type="button"
            disabled={!snapshot?.configuration.enabled || busy}
            onClick={() => void runNow()}
          >
            立即检查并整理
          </button>
        </div>
      </section>

      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {loading && !snapshot ? <p>正在读取章节后台…</p> : null}

      {snapshot ? (
        <>
          <section className="background-usage" aria-label="UTC 日用量">
            <h3>UTC 日用量 · {snapshot.usage.windowId}</h3>
            <dl>
              <div>
                <dt>调用</dt>
                <dd>
                  {snapshot.usage.calls}
                  {snapshot.configuration.budget
                    ? ` / ${snapshot.configuration.budget.calls}`
                    : ' / 未配置'}
                </dd>
              </div>
              <div>
                <dt>输入字符</dt>
                <dd>
                  {snapshot.usage.inputCharacters}
                  {snapshot.configuration.budget
                    ? ` / ${snapshot.configuration.budget.inputCharacters}`
                    : ' / 未配置'}
                </dd>
              </div>
              <div>
                <dt>已知 token</dt>
                <dd>
                  {snapshot.usage.knownTotalTokens}（输入 {snapshot.usage.knownPromptTokens}，输出{' '}
                  {snapshot.usage.knownCompletionTokens}）
                </dd>
              </div>
              <div>
                <dt>用量未知次数</dt>
                <dd>{snapshot.usage.unknownAttempts}</dd>
              </div>
            </dl>
          </section>

          <section aria-label="后台任务">
            <h3>后台任务</h3>
            {snapshot.jobs.length === 0 ? (
              <p>当前没有后台任务。</p>
            ) : (
              snapshot.jobs.map((job) => (
                <article key={job.id} className={`background-job state-${job.state.toLowerCase()}`}>
                  <div>
                    <strong>{jobLabels[job.state]}</strong>
                    <small>
                      {' '}
                      · 尝试 {job.attempts} 次 · 更新 {localTime(job.updatedAt)}
                    </small>
                  </div>
                  <p>{job.reason || '暂无补充说明'}</p>
                  {job.attempts >= 5 && job.state !== 'COMPLETED' ? (
                    <p className="scope-note">已达到 5 次尝试上限，不再提供重试。</p>
                  ) : null}
                  <details>
                    <summary>查看来源与回执</summary>
                    <p>
                      来源轮次 {job.requestIds.length} 个；配置版本 {job.configurationVersion}
                      ；作业版本 {job.version}。
                    </p>
                    {job.receipt ? (
                      <p>已保存为记忆版本 {job.receipt.memoryVersion}。</p>
                    ) : (
                      <p>尚无已保存回执。</p>
                    )}
                  </details>
                  <div className="button-row">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void control(job, 'inspect')}
                    >
                      检查当前状态
                    </button>
                    {!['COMPLETED', 'CANCELLED'].includes(job.state) ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void control(job, 'cancel')}
                      >
                        取消任务
                      </button>
                    ) : null}
                    {job.attempts < 5 &&
                    [
                      'STALE',
                      'QUEUED',
                      'BUDGET_PAUSED',
                      'CONFIGURATION_BLOCKED',
                      'PERMISSION_BLOCKED',
                      'FAILED_CONFIRMED'
                    ].includes(job.state) ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void control(job, 'retry')}
                      >
                        按当前条件重试
                      </button>
                    ) : null}
                    {job.state === 'REMOTE_UNKNOWN' && job.attempts < 5 ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void control(job, 'retry-unknown')}
                      >
                        先核查远端再重试
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </section>

          <section aria-label="可用章节">
            <div className="background-section-heading">
              <h3>章节与未完成话题</h3>
              <button
                type="button"
                disabled={selectedAvailable.length === 0}
                onClick={() => onUseChapters({ assistantId, chapters: selectedAvailable })}
              >
                在对话中使用已选章节（{selectedAvailable.length}）
              </button>
            </div>
            {snapshot.chapters.length === 0 ? (
              <p>尚无章节。正常完整轮次整理完成后会显示在这里。</p>
            ) : (
              snapshot.chapters.map((chapter) => (
                <article key={chapter.id} className="background-chapter">
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      aria-label={`选择章节：${chapter.title}`}
                      checked={selectedChapters.includes(chapter.id)}
                      disabled={
                        chapter.state !== 'AVAILABLE' ||
                        (!selectedChapters.includes(chapter.id) && selectedChapters.length >= 16)
                      }
                      onChange={() =>
                        setSelectedChapters((values) =>
                          values.includes(chapter.id)
                            ? values.filter((id) => id !== chapter.id)
                            : [...values, chapter.id]
                        )
                      }
                    />
                    <strong>{chapter.title}</strong>
                  </label>
                  <p>
                    {chapter.state === 'AVAILABLE'
                      ? '可读取、可选入正常对话上下文'
                      : '当前不可用，不能选入上下文'}{' '}
                    · 接受版本 {chapter.version} · {localTime(chapter.createdAt)}
                  </p>
                  <details>
                    <summary>展开章节正文</summary>
                    {chapter.state !== 'AVAILABLE' ||
                    chapterBodies[chapter.id]?.key !== chapterBodyKey(chapter) ? (
                      <button
                        type="button"
                        disabled={chapter.state !== 'AVAILABLE' || chapterLoading[chapter.id]}
                        onClick={() => void readChapter(chapter)}
                      >
                        {chapterLoading[chapter.id] ? '正在读取…' : '读取正文'}
                      </button>
                    ) : (
                      <pre className="chapter-markdown">{chapterBodies[chapter.id]?.markdown}</pre>
                    )}
                  </details>
                  <details>
                    <summary>查看原文来源</summary>
                    <p>
                      覆盖 {chapter.requestIds.length} 个正常完整轮次；记忆接受版本{' '}
                      {chapter.memoryVersion}。
                    </p>
                    <ul>
                      {chapter.requestIds.map((requestId) => (
                        <li key={requestId}>
                          <code>{requestId}</code>
                        </li>
                      ))}
                    </ul>
                  </details>
                  <section aria-label={`${chapter.title}的未完成话题`}>
                    <h4>未完成话题</h4>
                    {chapter.topics.filter((topic) => topic.state === 'OPEN').length === 0 ? (
                      <p>当前没有未完成话题。</p>
                    ) : (
                      chapter.topics
                        .filter((topic) => topic.state === 'OPEN')
                        .map((topic) => (
                          <article key={topic.id} className="background-topic">
                            <p>{topic.text}</p>
                            <small>模型建议 · 版本 {topic.version}</small>
                            <div className="button-row">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void updateTopic(chapter, topic, 'RESOLVED')}
                              >
                                标记已解决
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void updateTopic(chapter, topic, 'DISMISSED')}
                              >
                                忽略此话题
                              </button>
                            </div>
                          </article>
                        ))
                    )}
                  </section>
                </article>
              ))
            )}
          </section>

          {snapshot.nextCursor !== null ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => void load(assistantId, snapshot.nextCursor ?? 0)}
            >
              {loading ? '正在加载…' : '加载更多后台记录'}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
