import { useCallback, useEffect, useRef, useState } from 'react'
import {
  assistantPersonaLimit,
  avatarKeys,
  type AssistantApi,
  type AssistantDto,
  type AssistantResult,
  type AssistantSnapshot,
  type AvatarKey
} from '../../../../shared/assistant-contract'
import { AssistantAvatar, avatarLabel } from './AssistantAvatar'

const protocolVersion = 1 as const

export type AssistantConfigurationTarget = 'provider' | 'history' | 'memory' | 'items'

type ProfileDraft = {
  displayName: string
  persona: string
  avatarKey: AvatarKey
}

function errorText(result: Extract<AssistantResult, { ok: false }>): string {
  return `${result.error.message} · 关联编号 ${result.error.correlationId}`
}

function draftFor(assistant: AssistantDto): ProfileDraft {
  return {
    displayName: assistant.displayName,
    persona: assistant.persona,
    avatarKey: assistant.avatarKey
  }
}

function personaLength(value: string): number {
  return [...value].length
}

const targetLabels: Record<AssistantConfigurationTarget, string> = {
  provider: 'Provider 与模型',
  history: '对话历史授权',
  memory: '记忆与个人事件授权',
  items: '事项授权'
}

export function AssistantPanel({
  api,
  onSnapshot,
  externalSnapshot,
  onOpenConfiguration
}: {
  api: AssistantApi
  onSnapshot?: (snapshot: AssistantSnapshot) => void
  externalSnapshot?: AssistantSnapshot | null
  onOpenConfiguration?: (
    assistantId: string,
    target: AssistantConfigurationTarget
  ) => Promise<boolean> | boolean
}): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<AssistantSnapshot | null>(externalSnapshot ?? null)
  const [displayName, setDisplayName] = useState('')
  const [profileDrafts, setProfileDrafts] = useState<Record<string, ProfileDraft>>({})
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const snapshotRef = useRef<AssistantSnapshot | null>(externalSnapshot ?? null)
  const requestVersionRef = useRef(0)
  const operationVersionRef = useRef(0)
  const mountedRef = useRef(false)

  const acceptSnapshot = useCallback(
    (
      value: AssistantSnapshot,
      options: { expectedRequestVersion?: number; notify?: boolean } = {}
    ): boolean => {
      if (!mountedRef.current) return false
      if (
        options.expectedRequestVersion !== undefined &&
        options.expectedRequestVersion !== requestVersionRef.current
      ) {
        return false
      }
      if (snapshotRef.current && value.stateRevision < snapshotRef.current.stateRevision) {
        return false
      }

      snapshotRef.current = value
      setSnapshot(value)
      setProfileDrafts((drafts) => {
        const currentIds = new Set(value.assistants.map((assistant) => assistant.id))
        const retained = Object.entries(drafts).filter(([assistantId]) =>
          currentIds.has(assistantId)
        )
        return retained.length === Object.keys(drafts).length
          ? drafts
          : Object.fromEntries(retained)
      })
      if (options.notify !== false) onSnapshot?.(value)
      return true
    },
    [onSnapshot]
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requestVersionRef.current += 1
      operationVersionRef.current += 1
    }
  }, [])

  useEffect(() => {
    if (!externalSnapshot) return
    if (
      snapshotRef.current &&
      externalSnapshot.stateRevision <= snapshotRef.current.stateRevision
    ) {
      return
    }

    const requestVersion = ++requestVersionRef.current
    const operationVersion = ++operationVersionRef.current
    let active = true
    queueMicrotask(() => {
      if (
        !active ||
        requestVersion !== requestVersionRef.current ||
        operationVersion !== operationVersionRef.current
      ) {
        return
      }
      if (
        acceptSnapshot(externalSnapshot, { expectedRequestVersion: requestVersion, notify: false })
      ) {
        setBusy(false)
        setError(null)
      }
    })
    return () => {
      active = false
    }
  }, [acceptSnapshot, externalSnapshot])

  useEffect(() => {
    let active = true
    const requestVersion = requestVersionRef.current
    void api
      .list()
      .then((result) => {
        if (!active || requestVersion !== requestVersionRef.current) return
        if (result.ok) {
          acceptSnapshot(result.data, { expectedRequestVersion: requestVersion })
        } else {
          setError(errorText(result))
        }
      })
      .catch(() => {
        if (active && requestVersion === requestVersionRef.current) {
          setError('助手服务暂时不可用')
        }
      })
    return () => {
      active = false
    }
  }, [api, acceptSnapshot])

  async function apply(operation: () => Promise<AssistantResult>): Promise<void> {
    const requestVersion = requestVersionRef.current
    const operationVersion = ++operationVersionRef.current
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await operation()
      if (
        !mountedRef.current ||
        requestVersion !== requestVersionRef.current ||
        operationVersion !== operationVersionRef.current
      ) {
        return
      }
      if (result.ok) {
        acceptSnapshot(result.data, { expectedRequestVersion: requestVersion })
      } else {
        setError(errorText(result))
      }
    } catch {
      if (
        mountedRef.current &&
        requestVersion === requestVersionRef.current &&
        operationVersion === operationVersionRef.current
      ) {
        setError('助手服务暂时不可用')
      }
    } finally {
      if (
        mountedRef.current &&
        requestVersion === requestVersionRef.current &&
        operationVersion === operationVersionRef.current
      ) {
        setBusy(false)
      }
    }
  }

  async function createAssistant(): Promise<void> {
    if (!snapshot) return
    await apply(() =>
      api.create({
        protocolVersion,
        displayName,
        expectedStateRevision: snapshot.stateRevision
      })
    )
    setDisplayName('')
  }

  async function saveProfile(assistant: AssistantDto): Promise<void> {
    if (!snapshot) return
    const draft = profileDrafts[assistant.id] ?? draftFor(assistant)
    const requestVersion = requestVersionRef.current
    const operationVersion = ++operationVersionRef.current
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await api.rename({
        protocolVersion,
        assistantId: assistant.id,
        displayName: draft.displayName,
        persona: draft.persona,
        avatarKey: draft.avatarKey,
        expectedAssistantVersion: assistant.version,
        expectedStateRevision: snapshot.stateRevision
      })
      if (
        !mountedRef.current ||
        requestVersion !== requestVersionRef.current ||
        operationVersion !== operationVersionRef.current
      ) {
        return
      }
      if (result.ok) {
        if (acceptSnapshot(result.data, { expectedRequestVersion: requestVersion })) {
          const saved = result.data.assistants.find((value) => value.id === assistant.id)
          if (saved) {
            setProfileDrafts((drafts) => ({ ...drafts, [assistant.id]: draftFor(saved) }))
            setNotice(`已保存 ${saved.displayName} 的基础配置（版本 ${saved.version}）`)
          }
        }
        return
      }
      if (result.error.code !== 'STALE_WRITE') {
        setError(errorText(result))
        return
      }

      const refreshed = await api.list({ protocolVersion })
      if (
        !mountedRef.current ||
        requestVersion !== requestVersionRef.current ||
        operationVersion !== operationVersionRef.current
      ) {
        return
      }
      if (refreshed.ok) {
        acceptSnapshot(refreshed.data, { expectedRequestVersion: requestVersion })
        setError('配置已在别处更新。已刷新可信版本并保留你的草稿，请比较后重新保存。')
      } else {
        setError(`${errorText(result)}；可信版本刷新失败，草稿仍已保留。`)
      }
    } catch {
      if (
        mountedRef.current &&
        requestVersion === requestVersionRef.current &&
        operationVersion === operationVersionRef.current
      ) {
        setError('配置保存结果未确认；草稿已保留，请刷新后核对。')
      }
    } finally {
      if (
        mountedRef.current &&
        requestVersion === requestVersionRef.current &&
        operationVersion === operationVersionRef.current
      ) {
        setBusy(false)
      }
    }
  }

  async function openConfiguration(
    assistant: AssistantDto,
    target: AssistantConfigurationTarget
  ): Promise<void> {
    if (!onOpenConfiguration) return
    const operationVersion = ++operationVersionRef.current
    setError(null)
    setNotice(null)
    try {
      const opened = await onOpenConfiguration(assistant.id, target)
      if (!mountedRef.current || operationVersion !== operationVersionRef.current) return
      if (!opened) setError(`未能打开${targetLabels[target]}，当前页面状态已保留。`)
    } catch {
      if (mountedRef.current && operationVersion === operationVersionRef.current) {
        setError(`未能打开${targetLabels[target]}，当前页面状态已保留。`)
      }
    }
  }

  if (!snapshot) {
    return (
      <section aria-labelledby="assistant-heading">
        <h2 id="assistant-heading">助手</h2>
        {error ? <p role="alert">{error}</p> : <p role="status">正在读取助手…</p>}
      </section>
    )
  }

  return (
    <section aria-labelledby="assistant-heading" className="assistant-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">本地身份</p>
          <h2 id="assistant-heading">助手</h2>
        </div>
        <p>{snapshot.assistants.filter((assistant) => !assistant.isArchived).length} 个可用</p>
      </div>

      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}

      <form
        className="create-assistant"
        onSubmit={(event) => {
          event.preventDefault()
          void createAssistant()
        }}
      >
        <label htmlFor="assistant-name">助手名称</label>
        <div>
          <input
            id="assistant-name"
            value={displayName}
            maxLength={80}
            disabled={busy}
            onChange={(event) => setDisplayName(event.currentTarget.value)}
          />
          <button type="submit" disabled={busy || displayName.trim().length === 0}>
            创建助手
          </button>
        </div>
      </form>

      <p className="scope-note">
        名称和人设会随正常及严格临时 Provider
        请求发送给当前实际接收方；历史、记忆和事项仍在各授权区单独控制。
      </p>

      <ul className="assistant-list">
        {snapshot.assistants.map((assistant) => {
          const isCurrent = snapshot.currentAssistantId === assistant.id
          const isPrimary = snapshot.primaryAssistantId === assistant.id
          const draft = profileDrafts[assistant.id] ?? draftFor(assistant)
          const length = personaLength(draft.persona)
          return (
            <li
              key={assistant.id}
              className={assistant.isArchived ? 'archived' : undefined}
              aria-label={`助手配置：${assistant.displayName}`}
            >
              <div className="assistant-summary">
                <AssistantAvatar
                  avatarKey={assistant.avatarKey}
                  label={`${assistant.displayName}的内置形象：${avatarLabel(assistant.avatarKey)}`}
                />
                <div>
                  <strong>{assistant.displayName}</strong>
                  <span>
                    {isPrimary ? '主要助手' : null}
                    {isPrimary && isCurrent ? ' · ' : null}
                    {isCurrent ? '当前助手' : null}
                    {assistant.isArchived ? '已归档' : null}
                  </span>
                </div>
              </div>
              {assistant.isArchived ? (
                <div className="archived-profile">
                  <p>内置形象：{avatarLabel(assistant.avatarKey)}</p>
                  <p>
                    {assistant.persona
                      ? `人设摘要：${assistant.persona.slice(0, 120)}`
                      : '未设置人设'}
                  </p>
                </div>
              ) : (
                <>
                  <details className="assistant-profile">
                    <summary>基础配置</summary>
                    <div className="assistant-profile-fields">
                      <label>
                        名称
                        <input
                          aria-label={`名称 ${assistant.displayName}`}
                          value={draft.displayName}
                          maxLength={80}
                          disabled={busy}
                          onChange={(event) => {
                            const value = event.currentTarget.value
                            setProfileDrafts((drafts) => ({
                              ...drafts,
                              [assistant.id]: { ...draft, displayName: value }
                            }))
                          }}
                        />
                      </label>
                      <label>
                        人设
                        <textarea
                          aria-label={`人设 ${assistant.displayName}`}
                          value={draft.persona}
                          disabled={busy}
                          onChange={(event) => {
                            const value = event.currentTarget.value
                            setProfileDrafts((drafts) => ({
                              ...drafts,
                              [assistant.id]: { ...draft, persona: value }
                            }))
                          }}
                        />
                      </label>
                      <p
                        className={
                          length > assistantPersonaLimit
                            ? 'character-count invalid'
                            : 'character-count'
                        }
                      >
                        {length} / {assistantPersonaLimit} 字符
                      </p>
                      <fieldset className="avatar-picker">
                        <legend>内置形象</legend>
                        {avatarKeys.map((avatarKey) => (
                          <label key={avatarKey}>
                            <input
                              type="radio"
                              name={`avatar-${assistant.id}`}
                              value={avatarKey}
                              aria-label={`选择${avatarLabel(avatarKey)}形象`}
                              checked={draft.avatarKey === avatarKey}
                              disabled={busy}
                              onChange={() =>
                                setProfileDrafts((drafts) => ({
                                  ...drafts,
                                  [assistant.id]: { ...draft, avatarKey }
                                }))
                              }
                            />
                            <AssistantAvatar avatarKey={avatarKey} size="large" />
                            <span>{avatarLabel(avatarKey)}</span>
                          </label>
                        ))}
                      </fieldset>
                      <button
                        type="button"
                        disabled={
                          busy ||
                          draft.displayName.trim().length === 0 ||
                          length > assistantPersonaLimit
                        }
                        onClick={() => void saveProfile(assistant)}
                      >
                        保存基础配置
                      </button>
                    </div>
                  </details>
                  <div className="assistant-actions">
                    <button
                      type="button"
                      disabled={busy || isCurrent}
                      onClick={() =>
                        void apply(() =>
                          api.switch({
                            protocolVersion,
                            assistantId: assistant.id,
                            expectedStateRevision: snapshot.stateRevision
                          })
                        )
                      }
                    >
                      设为当前
                    </button>
                    <button
                      type="button"
                      disabled={busy || isPrimary}
                      onClick={() =>
                        void apply(() =>
                          api.setPrimary({
                            protocolVersion,
                            assistantId: assistant.id,
                            expectedAssistantVersion: assistant.version,
                            expectedStateRevision: snapshot.stateRevision
                          })
                        )
                      }
                    >
                      设为主要
                    </button>
                    <button
                      type="button"
                      disabled={busy || isPrimary}
                      onClick={() =>
                        void apply(() =>
                          api.archive({
                            protocolVersion,
                            assistantId: assistant.id,
                            expectedAssistantVersion: assistant.version,
                            expectedStateRevision: snapshot.stateRevision
                          })
                        )
                      }
                    >
                      归档
                    </button>
                  </div>
                  {onOpenConfiguration ? (
                    <div
                      className="assistant-configuration-links"
                      aria-label={`${assistant.displayName}的真实配置入口`}
                    >
                      {(Object.keys(targetLabels) as AssistantConfigurationTarget[]).map(
                        (target) => (
                          <button
                            key={target}
                            type="button"
                            disabled={busy}
                            onClick={() => void openConfiguration(assistant, target)}
                          >
                            {isCurrent ? '打开' : '设为当前并打开'}
                            {targetLabels[target]}
                          </button>
                        )
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
