import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssistantSnapshot } from '../../shared/assistant-contract'
import type { ItemApi, ItemPermissions } from '../../shared/item-contract'
import type {
  RetentionChanged,
  RetentionIntent,
  RetentionPreview
} from '../../shared/retention-contract'
import {
  AssistantPanel,
  type AssistantConfigurationTarget
} from './features/assistants/AssistantPanel'
import { ItemPanel } from './features/items/ItemPanel'
import { MemoryPanel } from './features/memory/MemoryPanel'
import { ProviderPanel } from './features/provider/ProviderPanel'
import { ReminderPanel } from './features/reminders/ReminderPanel'
import { RetentionPanel } from './features/retention/RetentionPanel'

type RetentionTarget = RetentionIntent['target']
type DiscussResult = Awaited<ReturnType<ItemApi['proposalAction']>>
type PreparedRetention = {
  assistantId: string
  target: RetentionTarget
  intent?: RetentionPreview['intent']
  nonce: number
}

type ConfigurationFocus = {
  assistantId: string
  target: AssistantConfigurationTarget
  nonce: number
}

export function App(): React.JSX.Element {
  const [assistantSnapshot, setAssistantSnapshot] = useState<AssistantSnapshot | null>(null)
  const [historyTarget, setHistoryTarget] = useState<{
    assistantId: string
    requestId: string
    nonce: number
  } | null>(null)
  const [navigationError, setNavigationError] = useState('')
  const [activeView, setActiveView] = useState<
    'chat' | 'items' | 'reminders' | 'memory' | 'retention'
  >('chat')
  const [configurationFocus, setConfigurationFocus] = useState<ConfigurationFocus | null>(null)
  const [memoryRefreshKey, setMemoryRefreshKey] = useState(0)
  const [itemRefreshKey, setItemRefreshKey] = useState(0)
  const [itemRecoveryTarget, setItemRecoveryTarget] = useState<{
    assistantId: string
    commandId: string
    nonce: number
    confirmationAction?: 'replace-content'
  } | null>(null)
  const [itemConversationTarget, setItemConversationTarget] = useState<{
    assistantId: string
    type: 'item' | 'proposal'
    id: string
    expectedVersion: number
    nonce: number
  } | null>(null)
  const [pendingMemoryCommands] = useState(() => new Map<string, string>())
  const [pendingItemCommands] = useState(() => new Map<string, string>())
  const [pendingReminderCommands] = useState(() => new Map<string, string>())
  const [reminderRefreshKey, setReminderRefreshKey] = useState(0)
  const [reminderOpenTarget, setReminderOpenTarget] = useState<{
    assistantId: string
    itemId: string
    nonce: number
  } | null>(null)
  const [retentionChange, setRetentionChange] = useState<RetentionChanged | null>(null)
  const [retentionTarget, setRetentionTarget] = useState<PreparedRetention | null>(null)
  const [lastGovernanceAssistantId, setLastGovernanceAssistantId] = useState('')
  const governanceEpoch = useRef(0)
  const assistantRequestVersion = useRef(0)
  const reminderListenerVersion = useRef(0)

  const receiveAssistantSnapshot = useCallback((value: AssistantSnapshot) => {
    assistantRequestVersion.current += 1
    setAssistantSnapshot((current) =>
      current && current.stateRevision > value.stateRevision ? current : value
    )
    if (value.currentAssistantId) setLastGovernanceAssistantId(value.currentAssistantId)
  }, [])

  const locateMemorySource = useCallback(
    async (source: { assistantId: string; id: string }): Promise<void> => {
      if (!assistantSnapshot) return
      setNavigationError('')
      const governance = governanceEpoch.current
      const requestVersion = ++assistantRequestVersion.current
      let nextSnapshot = assistantSnapshot
      if (source.assistantId !== assistantSnapshot.currentAssistantId) {
        try {
          const result = await window.mashiro.assistants.switch({
            protocolVersion: 1,
            assistantId: source.assistantId,
            expectedStateRevision: assistantSnapshot.stateRevision
          })
          if (
            governance !== governanceEpoch.current ||
            requestVersion !== assistantRequestVersion.current
          )
            return
          if (!result.ok) {
            setNavigationError(result.error.message)
            return
          }
          nextSnapshot = result.data
          setAssistantSnapshot(result.data)
        } catch {
          setNavigationError('无法切换到来源助手，当前页面状态已保留')
          return
        }
      }
      if (nextSnapshot.currentAssistantId !== source.assistantId) {
        setNavigationError('来源助手状态已变化，请刷新后重试')
        return
      }
      setHistoryTarget((current) => ({
        assistantId: source.assistantId,
        requestId: source.id,
        nonce: (current?.nonce ?? 0) + 1
      }))
      setActiveView('chat')
    },
    [assistantSnapshot]
  )

  const receiveMemoryChange = useCallback(() => {
    setMemoryRefreshKey((value) => value + 1)
  }, [])

  const receiveItemChange = useCallback(() => {
    setItemRefreshKey((value) => value + 1)
    setReminderRefreshKey((value) => value + 1)
  }, [])

  const openReminderItem = useCallback(
    (itemId: string): void => {
      const assistantId = assistantSnapshot?.currentAssistantId
      if (!assistantId) return
      setReminderOpenTarget((current) => ({
        assistantId,
        itemId,
        nonce: (current?.nonce ?? 0) + 1
      }))
      setItemRefreshKey((value) => value + 1)
      setActiveView('items')
    },
    [assistantSnapshot?.currentAssistantId]
  )

  const openItems = useCallback(
    (recovery?: {
      assistantId: string
      commandId: string
      confirmationAction?: 'replace-content'
    }) => {
      if (recovery) {
        setItemRecoveryTarget((current) => ({
          ...recovery,
          nonce: (current?.nonce ?? 0) + 1
        }))
      }
      setItemRefreshKey((value) => value + 1)
      setActiveView('items')
    },
    []
  )

  const openAssistantConfiguration = useCallback(
    async (assistantId: string, target: AssistantConfigurationTarget): Promise<boolean> => {
      if (!assistantSnapshot) return false
      setNavigationError('')
      const governance = governanceEpoch.current
      const requestVersion = ++assistantRequestVersion.current
      let nextSnapshot = assistantSnapshot
      if (assistantSnapshot.currentAssistantId !== assistantId) {
        try {
          const result = await window.mashiro.assistants.switch({
            protocolVersion: 1,
            assistantId,
            expectedStateRevision: assistantSnapshot.stateRevision
          })
          if (
            governance !== governanceEpoch.current ||
            requestVersion !== assistantRequestVersion.current
          ) {
            return true
          }
          if (!result.ok) {
            setNavigationError(result.error.message)
            return false
          }
          nextSnapshot = result.data
          setAssistantSnapshot(result.data)
          if (result.data.currentAssistantId) {
            setLastGovernanceAssistantId(result.data.currentAssistantId)
          }
        } catch {
          if (
            governance !== governanceEpoch.current ||
            requestVersion !== assistantRequestVersion.current
          ) {
            return true
          }
          setNavigationError('无法切换到目标助手，当前页面状态已保留。')
          return false
        }
      }
      if (nextSnapshot.currentAssistantId !== assistantId) {
        setNavigationError('目标助手状态已变化，请刷新后重试。')
        return false
      }

      if (target === 'memory') {
        setMemoryRefreshKey((value) => value + 1)
        setActiveView('memory')
      } else if (target === 'items') {
        setItemRefreshKey((value) => value + 1)
        setActiveView('items')
      } else {
        setActiveView('chat')
      }
      setConfigurationFocus((current) => ({
        assistantId,
        target,
        nonce: (current?.nonce ?? 0) + 1
      }))
      return true
    },
    [assistantSnapshot]
  )

  const openItemConversation = useCallback(
    (value: { assistantId: string; itemId: string; expectedVersion: number }): void => {
      if (!assistantSnapshot || assistantSnapshot.currentAssistantId !== value.assistantId) {
        setNavigationError('当前助手状态已变化，请重新打开事项后再进入对话。')
        return
      }
      setNavigationError('')
      setItemConversationTarget((current) => ({
        assistantId: value.assistantId,
        type: 'item',
        id: value.itemId,
        expectedVersion: value.expectedVersion,
        nonce: (current?.nonce ?? 0) + 1
      }))
      setActiveView('chat')
    },
    [assistantSnapshot]
  )

  const receiveItemVersion = useCallback(
    (value: { assistantId: string; id: string; version: number }): void => {
      setItemConversationTarget((current) =>
        current &&
        current.assistantId === value.assistantId &&
        current.type === 'item' &&
        current.id === value.id
          ? { ...current, expectedVersion: value.version, nonce: current.nonce + 1 }
          : current
      )
    },
    []
  )

  const receiveItemPermissions = useCallback((value: ItemPermissions): void => {
    if (value.read && value.receive) return
    setItemConversationTarget((current) =>
      current && current.assistantId === value.assistantId ? null : current
    )
  }, [])
  const discussItem = useCallback(
    async (value: {
      originAssistantId: string
      proposalId: string
      expectedVersion: number
      commandId: string
      restoreArchived: boolean
    }): Promise<DiscussResult | null> => {
      if (!assistantSnapshot) return null
      setNavigationError('')
      const governance = governanceEpoch.current
      const requestVersion = ++assistantRequestVersion.current
      const origin = assistantSnapshot.assistants.find(
        (assistant) => assistant.id === value.originAssistantId
      )
      if (!origin) {
        setNavigationError('提案的发起助手已删除，不能恢复协商；提案当前状态仍以事项区为准。')
        return null
      }
      let nextSnapshot = assistantSnapshot
      if (value.originAssistantId !== assistantSnapshot.currentAssistantId || origin.isArchived) {
        try {
          const result = await window.mashiro.assistants.switch({
            protocolVersion: 1,
            assistantId: value.originAssistantId,
            expectedStateRevision: assistantSnapshot.stateRevision,
            ...(origin.isArchived ? { restoreArchived: true } : {})
          })
          if (
            governance !== governanceEpoch.current ||
            requestVersion !== assistantRequestVersion.current
          )
            return null
          if (!result.ok) {
            setNavigationError(result.error.message)
            return null
          }
          nextSnapshot = result.data
          setAssistantSnapshot(result.data)
        } catch {
          setNavigationError(
            origin.isArchived
              ? '无法恢复提案的发起助手；提案仍保留在待确认区。'
              : '无法切换到提案的发起助手；提案仍保留在待确认区。'
          )
          return null
        }
      }
      if (nextSnapshot.currentAssistantId !== value.originAssistantId) {
        setNavigationError('发起助手状态已变化，请刷新提案后重试。')
        return null
      }
      let actionResult: DiscussResult
      try {
        actionResult = await window.mashiro.items.proposalAction({
          protocolVersion: 1,
          assistantId: value.originAssistantId,
          commandId: value.commandId,
          id: value.proposalId,
          expectedVersion: value.expectedVersion,
          action: 'discuss'
        })
      } catch {
        if (
          governance === governanceEpoch.current &&
          requestVersion === assistantRequestVersion.current
        )
          setNavigationError('协商操作回执未确认；再次点击会先核查同一操作。')
        return null
      }
      if (
        governance !== governanceEpoch.current ||
        requestVersion !== assistantRequestVersion.current
      )
        return null
      if (!actionResult.ok) {
        setNavigationError(actionResult.error.message)
        return actionResult
      }
      if (actionResult.data.state !== 'SUCCEEDED') {
        setNavigationError(actionResult.data.summary)
        return actionResult
      }
      for (const [key, commandId] of pendingItemCommands) {
        if (commandId === value.commandId) pendingItemCommands.delete(key)
      }
      setItemConversationTarget((current) => ({
        assistantId: value.originAssistantId,
        type: 'proposal',
        id: value.proposalId,
        expectedVersion: actionResult.data.objectVersion,
        nonce: (current?.nonce ?? 0) + 1
      }))
      setItemRefreshKey((current) => current + 1)
      setActiveView('chat')
      return actionResult
    },
    [assistantSnapshot, pendingItemCommands]
  )

  const refreshAssistants = useCallback(async (): Promise<void> => {
    const governance = governanceEpoch.current
    const requestVersion = ++assistantRequestVersion.current
    try {
      const result = await window.mashiro.assistants.list({ protocolVersion: 1 })
      if (
        governance !== governanceEpoch.current ||
        requestVersion !== assistantRequestVersion.current
      )
        return
      if (result.ok) setAssistantSnapshot(result.data)
    } catch {
      setNavigationError('助手列表暂时无法刷新；数据治理状态仍以清理作业为准')
    }
  }, [])

  useEffect(() => {
    const retention = window.mashiro.retention
    if (!retention) return
    return retention.onChanged((event) => {
      governanceEpoch.current = event.epoch
      assistantRequestVersion.current += 1
      setRetentionChange(event)
      if (event.reason === 'job-status') return
      setMemoryRefreshKey((value) => value + 1)
      setItemRefreshKey((value) => value + 1)
      setLastGovernanceAssistantId((value) => event.assistantIds.at(-1) ?? value)
      if (
        historyTarget &&
        (event.assistantIds.includes(historyTarget.assistantId) ||
          event.requestIds.includes(historyTarget.requestId))
      ) {
        setHistoryTarget(null)
      }
      if (event.reason === 'cleanup' || event.reason === 'purge') {
        setItemConversationTarget((current) =>
          current && event.assistantIds.includes(current.assistantId) ? null : current
        )
        for (const key of [...pendingMemoryCommands.keys()]) {
          try {
            const parsed = JSON.parse(key) as { domain?: unknown }
            if (parsed.domain === 'memory-mutation') continue
            pendingMemoryCommands.delete(key)
          } catch {
            pendingMemoryCommands.delete(key)
          }
        }
      }
      void refreshAssistants()
    })
  }, [historyTarget, pendingMemoryCommands, refreshAssistants])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) setReminderOpenTarget(null)
    })
    return () => {
      active = false
    }
  }, [assistantSnapshot?.currentAssistantId])

  useEffect(() => {
    const reminders = window.mashiro.reminders
    const assistantId = assistantSnapshot?.currentAssistantId
    if (!reminders || !assistantId) return
    const listenerVersion = ++reminderListenerVersion.current
    return reminders.onChanged((event) => {
      if (listenerVersion !== reminderListenerVersion.current) return
      if (event.kind === 'changed') {
        setReminderRefreshKey((value) => value + 1)
        return
      }
      if (event.kind === 'open-reminders') {
        setReminderRefreshKey((value) => value + 1)
        setActiveView('reminders')
        return
      }
      const itemId = event.itemId
      if (!itemId) return
      setReminderOpenTarget((current) => ({
        assistantId,
        itemId,
        nonce: (current?.nonce ?? 0) + 1
      }))
      setItemRefreshKey((value) => value + 1)
      setActiveView('items')
    })
  }, [assistantSnapshot?.currentAssistantId])

  const prepareRetention = useCallback(
    (assistantId: string, target: RetentionTarget, intent?: RetentionPreview['intent']): void => {
      setRetentionTarget((value) => ({
        assistantId,
        target,
        intent,
        nonce: (value?.nonce ?? 0) + 1
      }))
      setLastGovernanceAssistantId(assistantId)
      setActiveView('retention')
    },
    []
  )

  const selectPrimaryView = useCallback(
    (view: 'chat' | 'items' | 'reminders' | 'memory' | 'retention'): void => {
      assistantRequestVersion.current += 1
      setConfigurationFocus(null)
      setNavigationError('')
      if (view === 'items') setItemRefreshKey((value) => value + 1)
      if (view === 'reminders') setReminderRefreshKey((value) => value + 1)
      if (view === 'memory') setMemoryRefreshKey((value) => value + 1)
      setActiveView(view)
    },
    []
  )

  return (
    <main>
      <header>
        <p className="eyebrow">本机优先 · 你的日常助手</p>
        <h1>Mashiro</h1>
        <p>在持续对话中处理当下，也可以随时查看和纠正长期记忆。</p>
      </header>

      <nav className="primary-nav" aria-label="主要功能" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'chat'}
          onClick={() => selectPrimaryView('chat')}
        >
          对话
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'items'}
          onClick={() => selectPrimaryView('items')}
        >
          事项
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'reminders'}
          onClick={() => selectPrimaryView('reminders')}
        >
          提醒
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'memory'}
          onClick={() => selectPrimaryView('memory')}
        >
          记忆与事件
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'retention'}
          onClick={() => selectPrimaryView('retention')}
        >
          保留与清理
        </button>
      </nav>

      <details className="assistant-settings">
        <summary>助手管理</summary>
        <AssistantPanel
          api={window.mashiro.assistants}
          onSnapshot={receiveAssistantSnapshot}
          externalSnapshot={assistantSnapshot}
          onOpenConfiguration={openAssistantConfiguration}
        />
      </details>
      {navigationError ? <p role="alert">{navigationError}</p> : null}

      <section hidden={activeView !== 'chat'} aria-label="对话页面">
        <ProviderPanel
          assistantSnapshot={assistantSnapshot}
          api={window.mashiro.provider}
          timelineApi={window.mashiro.timeline}
          memoryApi={window.mashiro.memory}
          itemApi={window.mashiro.items}
          reminderApi={window.mashiro.reminders}
          itemTarget={itemConversationTarget}
          historyTarget={historyTarget}
          onMemoryChanged={receiveMemoryChange}
          onItemChanged={receiveItemChange}
          onReminderChanged={() => setReminderRefreshKey((value) => value + 1)}
          onOpenItems={openItems}
          onLocateMemorySource={locateMemorySource}
          retentionChange={retentionChange}
          onPrepareRetention={prepareRetention}
          configurationFocus={
            configurationFocus &&
            (configurationFocus.target === 'provider' || configurationFocus.target === 'history')
              ? {
                  assistantId: configurationFocus.assistantId,
                  target: configurationFocus.target,
                  nonce: configurationFocus.nonce
                }
              : null
          }
        />
      </section>
      <section hidden={activeView !== 'items'} aria-label="事项页面">
        <ItemPanel
          key={assistantSnapshot?.currentAssistantId ?? ''}
          assistantId={assistantSnapshot?.currentAssistantId ?? ''}
          assistantName={
            assistantSnapshot?.assistants.find(
              (assistant) => assistant.id === assistantSnapshot.currentAssistantId
            )?.displayName ?? ''
          }
          api={window.mashiro.items}
          reminderApi={window.mashiro.reminders}
          refreshKey={itemRefreshKey}
          reminderRefreshKey={reminderRefreshKey}
          pendingCommands={pendingItemCommands}
          pendingReminderCommands={pendingReminderCommands}
          retentionChange={retentionChange}
          recoveryTarget={itemRecoveryTarget}
          archivedAssistantIds={
            assistantSnapshot?.assistants
              .filter((assistant) => assistant.isArchived)
              .map((assistant) => assistant.id) ?? []
          }
          onDiscuss={discussItem}
          onOpenConversation={openItemConversation}
          onPermissionsChanged={receiveItemPermissions}
          onItemVersionChanged={receiveItemVersion}
          configurationFocusNonce={
            configurationFocus?.target === 'items' ? configurationFocus.nonce : null
          }
          openItemTarget={reminderOpenTarget}
        />
      </section>
      <section hidden={activeView !== 'reminders'} aria-label="提醒页面">
        {window.mashiro.reminders ? (
          <ReminderPanel
            key={assistantSnapshot?.currentAssistantId ?? ''}
            assistantId={assistantSnapshot?.currentAssistantId ?? ''}
            assistantName={
              assistantSnapshot?.assistants.find(
                (assistant) => assistant.id === assistantSnapshot.currentAssistantId
              )?.displayName ?? ''
            }
            api={window.mashiro.reminders}
            itemApi={window.mashiro.items}
            refreshKey={reminderRefreshKey}
            pendingCommands={pendingReminderCommands}
            onOpenItem={openReminderItem}
          />
        ) : (
          <p role="alert">本机提醒服务尚未就绪。</p>
        )}
      </section>
      <section hidden={activeView !== 'memory'} aria-label="记忆与事件页面">
        <MemoryPanel
          key={assistantSnapshot?.currentAssistantId ?? ''}
          assistantId={assistantSnapshot?.currentAssistantId ?? ''}
          assistantName={
            assistantSnapshot?.assistants.find(
              (assistant) => assistant.id === assistantSnapshot.currentAssistantId
            )?.displayName ?? ''
          }
          api={window.mashiro.memory}
          onLocateRound={locateMemorySource}
          refreshKey={memoryRefreshKey}
          pendingCommands={pendingMemoryCommands}
          retentionChange={retentionChange}
          onPrepareRetention={prepareRetention}
          configurationFocusNonce={
            configurationFocus?.target === 'memory' ? configurationFocus.nonce : null
          }
        />
      </section>
      <section hidden={activeView !== 'retention'} aria-label="保留与清理页面">
        {window.mashiro.retention ? (
          <RetentionPanel
            api={window.mashiro.retention}
            memoryApi={window.mashiro.memory}
            assistantSnapshot={assistantSnapshot}
            fallbackAssistantId={assistantSnapshot?.currentAssistantId ?? lastGovernanceAssistantId}
            preparedTarget={retentionTarget}
            changed={retentionChange}
            pendingCommands={pendingMemoryCommands}
            onRefreshAssistants={refreshAssistants}
          />
        ) : (
          <p role="alert">本机保留与清理服务尚未就绪。</p>
        )}
      </section>
    </main>
  )
}
