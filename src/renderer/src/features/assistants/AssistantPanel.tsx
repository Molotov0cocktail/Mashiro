import { useCallback, useEffect, useState } from 'react'
import type {
  AssistantApi,
  AssistantDto,
  AssistantResult,
  AssistantSnapshot
} from '../../../../shared/assistant-contract'

const protocolVersion = 1 as const

function errorText(result: Extract<AssistantResult, { ok: false }>): string {
  return `${result.error.message} · 关联编号 ${result.error.correlationId}`
}

export function AssistantPanel({
  api,
  onSnapshot
}: {
  api: AssistantApi
  onSnapshot?: (snapshot: AssistantSnapshot) => void
}): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<AssistantSnapshot | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [renameValues, setRenameValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const acceptSnapshot = useCallback(
    (value: AssistantSnapshot): void => {
      setSnapshot(value)
      onSnapshot?.(value)
    },
    [onSnapshot]
  )

  useEffect(() => {
    let active = true
    void api.list().then((result) => {
      if (!active) return
      if (result.ok) acceptSnapshot(result.data)
      else setError(errorText(result))
    })
    return () => {
      active = false
    }
  }, [api, acceptSnapshot])

  async function apply(operation: () => Promise<AssistantResult>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const result = await operation()
      if (result.ok) acceptSnapshot(result.data)
      else setError(errorText(result))
    } catch {
      setError('助手服务暂时不可用')
    } finally {
      setBusy(false)
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

  async function renameAssistant(assistant: AssistantDto): Promise<void> {
    if (!snapshot) return
    await apply(() =>
      api.rename({
        protocolVersion,
        assistantId: assistant.id,
        displayName: renameValues[assistant.id] ?? assistant.displayName,
        expectedAssistantVersion: assistant.version,
        expectedStateRevision: snapshot.stateRevision
      })
    )
  }

  if (!snapshot) {
    return (
      <section aria-labelledby="assistant-heading">
        <h1 id="assistant-heading">助手</h1>
        {error ? <p role="alert">{error}</p> : <p role="status">正在读取助手…</p>}
      </section>
    )
  }

  return (
    <section aria-labelledby="assistant-heading" className="assistant-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">本地身份</p>
          <h1 id="assistant-heading">助手</h1>
        </div>
        <p>{snapshot.assistants.filter((assistant) => !assistant.isArchived).length} 个可用</p>
      </div>

      {error ? <p role="alert">{error}</p> : null}

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

      <ul className="assistant-list">
        {snapshot.assistants.map((assistant) => {
          const isCurrent = snapshot.currentAssistantId === assistant.id
          const isPrimary = snapshot.primaryAssistantId === assistant.id
          return (
            <li key={assistant.id} className={assistant.isArchived ? 'archived' : undefined}>
              <div className="assistant-summary">
                <strong>{assistant.displayName}</strong>
                <span>
                  {isPrimary ? '主要助手' : null}
                  {isPrimary && isCurrent ? ' · ' : null}
                  {isCurrent ? '当前助手' : null}
                  {assistant.isArchived ? '已归档' : null}
                </span>
              </div>
              {!assistant.isArchived ? (
                <div className="assistant-actions">
                  <label>
                    <span className="visually-hidden">重命名 {assistant.displayName}</span>
                    <input
                      aria-label={`重命名 ${assistant.displayName}`}
                      value={renameValues[assistant.id] ?? assistant.displayName}
                      disabled={busy}
                      onChange={(event) =>
                        setRenameValues((values) => ({
                          ...values,
                          [assistant.id]: event.currentTarget.value
                        }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void renameAssistant(assistant)}
                  >
                    保存名称
                  </button>
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
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
