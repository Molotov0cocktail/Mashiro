import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssistantSnapshot } from '../../shared/assistant-contract'
import type { ItemApi, ItemPermissions } from '../../shared/item-contract'
import type { ReminderApi, ReminderNavigationDelivery } from '../../shared/reminder-contract'
import type {
  RetentionChanged,
  RetentionIntent,
  RetentionPreview
} from '../../shared/retention-contract'
import {
  AssistantPanel,
  type AssistantConfigurationTarget
} from './features/assistants/AssistantPanel'
import {
  BackgroundPanel,
  type ChapterContextSelection
} from './features/background/BackgroundPanel'
import { DailyPanel } from './features/daily/DailyPanel'
import { ItemPanel } from './features/items/ItemPanel'
import { MemoryPanel } from './features/memory/MemoryPanel'
import { ProviderPanel } from './features/provider/ProviderPanel'
import { ReminderPanel } from './features/reminders/ReminderPanel'
import { RetentionPanel } from './features/retention/RetentionPanel'
import { AppShell, type ShellArea } from './features/shell/AppShell'
import { StewardPanel } from './features/steward/StewardPanel'

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

type ActiveView =
  | 'chat'
  | 'items'
  | 'reminders'
  | 'memory'
  | 'background'
  | 'steward'
  | 'daily'
  | 'retention'
  | 'settings-assistants'
  | 'settings-provider'

type DailyShellSection = 'automation' | 'operations'

export function App(): React.JSX.Element {
  const [assistantSnapshot, setAssistantSnapshot] = useState<AssistantSnapshot | null>(null)
  const [historyTarget, setHistoryTarget] = useState<{
    assistantId: string
    requestId: string
    nonce: number
  } | null>(null)
  const [navigationError, setNavigationError] = useState('')
  const [activeView, setActiveView] = useState<ActiveView>('chat')
  const [configurationFocus, setConfigurationFocus] = useState<ConfigurationFocus | null>(null)
  const [chapterContextTarget, setChapterContextTarget] = useState<{
    assistantId: string
    chapters: ChapterContextSelection['chapters']
    nonce: number
  } | null>(null)
  const [memoryRefreshKey, setMemoryRefreshKey] = useState(0)
  const [memoryPermissionEpoch, setMemoryPermissionEpoch] = useState(0)
  const [memoryOpenTarget, setMemoryOpenTarget] = useState<{
    assistantId: string
    id: string
    nonce: number
    snapshotRevision: number
  } | null>(null)
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
  const [itemOpenTarget, setItemOpenTarget] = useState<{
    assistantId: string
    type: 'item' | 'proposal'
    id: string
    nonce: number
  } | null>(null)
  const [reminderNavigationAck, setReminderNavigationAck] =
    useState<ReminderNavigationDelivery | null>(null)
  const [retentionChange, setRetentionChange] = useState<RetentionChanged | null>(null)
  const [retentionTarget, setRetentionTarget] = useState<PreparedRetention | null>(null)
  const [lastGovernanceAssistantId, setLastGovernanceAssistantId] = useState('')
  const [switchingAssistant, setSwitchingAssistant] = useState(false)
  const [dailyShellSection, setDailyShellSection] = useState<DailyShellSection>('automation')
  const [dailyNavigationTarget, setDailyNavigationTarget] = useState<{
    section: DailyShellSection
    nonce: number
  }>({ section: 'automation', nonce: 0 })
  const governanceEpoch = useRef(0)
  const assistantRequestVersion = useRef(0)
  const navigationRequestVersion = useRef(0)
  const reminderListenerVersion = useRef(0)
  const deliveredReminderNavigationIds = useRef(new Set<string>())
  const focusedReminderNavigationIds = useRef(new Set<string>())

  const receiveAssistantSnapshot = useCallback((value: AssistantSnapshot) => {
    assistantRequestVersion.current += 1
    setAssistantSnapshot((current) =>
      current && current.stateRevision > value.stateRevision ? current : value
    )
    if (value.currentAssistantId) setLastGovernanceAssistantId(value.currentAssistantId)
  }, [])

  const switchCurrentAssistant = useCallback(
    async (assistantId: string): Promise<void> => {
      const current = assistantSnapshot
      if (!current || !assistantId || current.currentAssistantId === assistantId) return
      setNavigationError('')
      setSwitchingAssistant(true)
      const governance = governanceEpoch.current
      const requestVersion = ++assistantRequestVersion.current
      try {
        const result = await window.mashiro.assistants.switch({
          protocolVersion: 1,
          assistantId,
          expectedStateRevision: current.stateRevision
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
        setAssistantSnapshot(result.data)
        setConfigurationFocus(null)
        if (result.data.currentAssistantId) {
          setLastGovernanceAssistantId(result.data.currentAssistantId)
        }
      } catch {
        if (
          governance === governanceEpoch.current &&
          requestVersion === assistantRequestVersion.current
        ) {
          setNavigationError('无法切换助手，当前页面状态已保留。')
        }
      } finally {
        setSwitchingAssistant(false)
      }
    },
    [assistantSnapshot]
  )

  const locateMemorySource = useCallback(
    async (source: { assistantId: string; id: string }): Promise<void> => {
      if (!assistantSnapshot) return
      setNavigationError('')
      const governance = governanceEpoch.current
      const requestVersion = ++assistantRequestVersion.current
      const navigationVersion = ++navigationRequestVersion.current
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
            requestVersion !== assistantRequestVersion.current ||
            navigationVersion !== navigationRequestVersion.current
          )
            return
          if (!result.ok) {
            setNavigationError(result.error.message)
            return
          }
          nextSnapshot = result.data
          setAssistantSnapshot(result.data)
        } catch {
          if (
            governance !== governanceEpoch.current ||
            requestVersion !== assistantRequestVersion.current ||
            navigationVersion !== navigationRequestVersion.current
          )
            return
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

  const receiveMemoryPermissionChange = useCallback(() => {
    setMemoryOpenTarget(null)
    setMemoryPermissionEpoch((value) => value + 1)
    setMemoryRefreshKey((value) => value + 1)
  }, [])

  const openMemory = useCallback(
    (target: { assistantId: string; id: string }): void => {
      if (!assistantSnapshot || assistantSnapshot.currentAssistantId !== target.assistantId) {
        setNavigationError('本轮记忆归属已变化，请在当前回答中重新打开。')
        return
      }
      setNavigationError('')
      setMemoryOpenTarget((current) => ({
        ...target,
        nonce: (current?.nonce ?? 0) + 1,
        snapshotRevision: assistantSnapshot.stateRevision
      }))
      setMemoryRefreshKey((value) => value + 1)
      setActiveView('memory')
    },
    [assistantSnapshot]
  )

  const receiveItemChange = useCallback(() => {
    setItemRefreshKey((value) => value + 1)
    setReminderRefreshKey((value) => value + 1)
  }, [])

  const openReminderItem = useCallback(
    (itemId: string): void => {
      const assistantId = assistantSnapshot?.currentAssistantId
      if (!assistantId) return
      setItemOpenTarget((current) => ({
        assistantId,
        type: 'item',
        id: itemId,
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
      const navigationVersion = ++navigationRequestVersion.current
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
            requestVersion !== assistantRequestVersion.current ||
            navigationVersion !== navigationRequestVersion.current
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
            requestVersion !== assistantRequestVersion.current ||
            navigationVersion !== navigationRequestVersion.current
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
      } else if (target === 'provider' || target === 'history') {
        setActiveView('settings-provider')
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
      const navigationVersion = ++navigationRequestVersion.current
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
            requestVersion !== assistantRequestVersion.current ||
            navigationVersion !== navigationRequestVersion.current
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
          requestVersion === assistantRequestVersion.current &&
          navigationVersion === navigationRequestVersion.current
        )
          setNavigationError('协商操作回执未确认；再次点击会先核查同一操作。')
        return null
      }
      if (
        governance !== governanceEpoch.current ||
        requestVersion !== assistantRequestVersion.current ||
        navigationVersion !== navigationRequestVersion.current
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
      setRetentionChange(event)
      if (event.reason === 'job-status' || event.reason === 'policy-status') return
      governanceEpoch.current = event.epoch
      assistantRequestVersion.current += 1
      navigationRequestVersion.current += 1
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
      if (active) setItemOpenTarget(null)
    })
    return () => {
      active = false
    }
  }, [assistantSnapshot?.currentAssistantId])

  useEffect(() => {
    const reminders = window.mashiro.reminders
    const assistantId = assistantSnapshot?.currentAssistantId
    const assistantRevision = assistantSnapshot?.stateRevision
    if (!reminders || !assistantId || assistantRevision === undefined) return
    const listenerVersion = ++reminderListenerVersion.current
    let active = true
    let liveNavigationVersion = 0
    const receive = (
      event: Parameters<ReminderApi['onChanged']>[0] extends (value: infer Value) => void
        ? Value
        : never,
      origin: 'live' | 'pull'
    ): void => {
      if (!active || listenerVersion !== reminderListenerVersion.current) return
      if (event.kind === 'changed') {
        setReminderRefreshKey((value) => value + 1)
        return
      }
      if (
        !event.deliveryId ||
        !event.assistantId ||
        event.assistantRevision === undefined ||
        event.assistantId !== assistantId ||
        event.assistantRevision !== assistantRevision
      )
        return
      if (origin === 'live') liveNavigationVersion += 1
      if (deliveredReminderNavigationIds.current.has(event.deliveryId)) return
      deliveredReminderNavigationIds.current.add(event.deliveryId)
      if (deliveredReminderNavigationIds.current.size > 64) {
        const oldest = deliveredReminderNavigationIds.current.values().next().value
        if (oldest) deliveredReminderNavigationIds.current.delete(oldest)
      }
      if (event.kind === 'open-reminders') {
        setReminderRefreshKey((value) => value + 1)
        setActiveView('reminders')
        setReminderNavigationAck({
          deliveryId: event.deliveryId,
          assistantId: event.assistantId,
          assistantRevision: event.assistantRevision,
          kind: 'open-reminders',
          itemId: null
        })
        return
      }
      const itemId = event.itemId
      if (!itemId) return
      setItemOpenTarget((current) => ({
        assistantId,
        type: 'item',
        id: itemId,
        nonce: (current?.nonce ?? 0) + 1
      }))
      setItemRefreshKey((value) => value + 1)
      setActiveView('items')
      setReminderNavigationAck({
        deliveryId: event.deliveryId,
        assistantId: event.assistantId,
        assistantRevision: event.assistantRevision,
        kind: 'open-item',
        itemId
      })
    }
    const unsubscribe = reminders.onChanged((event) => receive(event, 'live'))
    const pendingNavigationVersion = liveNavigationVersion
    void reminders
      .pendingNavigation({ protocolVersion: 1, assistantId, assistantRevision })
      .then((result) => {
        if (
          !active ||
          listenerVersion !== reminderListenerVersion.current ||
          liveNavigationVersion !== pendingNavigationVersion
        )
          return
        if (result.ok) {
          if (result.data) receive(result.data, 'pull')
        } else setNavigationError(result.error.message)
      })
      .catch(() => {
        if (active && listenerVersion === reminderListenerVersion.current)
          setNavigationError('提醒跳转状态暂不可用；可再次点击原通知，或从提醒列表打开事项。')
      })
    return () => {
      active = false
      unsubscribe()
    }
  }, [assistantSnapshot?.currentAssistantId, assistantSnapshot?.stateRevision])

  useEffect(() => {
    const delivery = reminderNavigationAck
    const assistantId = assistantSnapshot?.currentAssistantId
    const assistantRevision = assistantSnapshot?.stateRevision
    if (!delivery || !assistantId || assistantRevision === undefined) return
    if (delivery.assistantId !== assistantId || delivery.assistantRevision !== assistantRevision) {
      deliveredReminderNavigationIds.current.delete(delivery.deliveryId)
      focusedReminderNavigationIds.current.delete(delivery.deliveryId)
      queueMicrotask(() =>
        setReminderNavigationAck((current) =>
          current?.deliveryId === delivery.deliveryId ? null : current
        )
      )
      return
    }
    const routeReady =
      delivery.kind === 'open-reminders'
        ? activeView === 'reminders'
        : activeView === 'items' &&
          itemOpenTarget?.assistantId === assistantId &&
          itemOpenTarget.id === delivery.itemId
    if (!routeReady) return
    if (
      delivery.kind === 'open-reminders' &&
      !focusedReminderNavigationIds.current.has(delivery.deliveryId)
    ) {
      const element = document.getElementById('reminders-page')
      if (element) {
        focusedReminderNavigationIds.current.add(delivery.deliveryId)
        element.focus()
        element.scrollIntoView?.({ block: 'start' })
      }
    }
    let active = true
    void window.mashiro.reminders
      .ackNavigation({
        protocolVersion: 1,
        assistantId,
        assistantRevision,
        deliveryId: delivery.deliveryId
      })
      .then((result) => {
        if (!active) return
        if (result.ok && result.data.acknowledged) {
          setReminderNavigationAck((current) =>
            current?.deliveryId === delivery.deliveryId ? null : current
          )
          return
        }
        deliveredReminderNavigationIds.current.delete(delivery.deliveryId)
        focusedReminderNavigationIds.current.delete(delivery.deliveryId)
        setReminderNavigationAck((current) =>
          current?.deliveryId === delivery.deliveryId ? null : current
        )
        setNavigationError(
          result.ok ? '提醒目标已变化，请从当前提醒列表重新打开。' : result.error.message
        )
      })
      .catch(() => {
        if (active)
          setNavigationError(
            '提醒跳转已打开，但消费回执未确认；可再次点击原通知，或从提醒列表打开事项。'
          )
      })
    return () => {
      active = false
    }
  }, [
    activeView,
    assistantSnapshot?.currentAssistantId,
    assistantSnapshot?.stateRevision,
    itemOpenTarget,
    reminderNavigationAck
  ])

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

  const useChapterContext = useCallback((selection: ChapterContextSelection): void => {
    setChapterContextTarget((current) => ({
      ...selection,
      nonce: (current?.nonce ?? 0) + 1
    }))
    setNavigationError('')
    setActiveView('chat')
  }, [])

  const selectPrimaryView = useCallback((view: ActiveView): void => {
    navigationRequestVersion.current += 1
    setConfigurationFocus(null)
    setNavigationError('')
    if (view === 'items') setItemRefreshKey((value) => value + 1)
    if (view === 'reminders') setReminderRefreshKey((value) => value + 1)
    if (view === 'memory') setMemoryRefreshKey((value) => value + 1)
    setActiveView(view)
  }, [])

  const openDailySection = useCallback((section: DailyShellSection): void => {
    setDailyShellSection(section)
    setDailyNavigationTarget((current) => ({ section, nonce: current.nonce + 1 }))
    setActiveView('daily')
    setNavigationError('')
  }, [])

  const activeArea: ShellArea =
    activeView === 'background' || activeView === 'steward'
      ? 'automation'
      : activeView === 'daily'
        ? dailyShellSection
        : activeView === 'settings-assistants' ||
            activeView === 'settings-provider' ||
            activeView === 'retention'
          ? 'settings'
          : activeView

  const shellCopy: Record<ShellArea, { title: string; description: string }> = {
    chat: { title: '对话', description: '围绕当前助手持续交流，或切换到严格临时模式。' },
    items: { title: '事项', description: '处理计划、承诺和需要你确认的建议。' },
    reminders: { title: '提醒', description: '查看时间安排、改期和待处理提醒。' },
    memory: { title: '记忆', description: '查看、纠正和管理长期信息与个人事件。' },
    automation: { title: '自动工作', description: '按你的授权整理对话、记忆并生成日常回顾。' },
    operations: { title: '运行记录', description: '核对当前运行、真实故障、恢复记录和分类用量。' },
    settings: { title: '设置', description: '管理助手、模型连接、资料范围与本机数据。' }
  }

  const contextNavigation =
    activeArea === 'automation' || activeArea === 'operations' ? (
      <nav className="workspace-subnav" aria-label="自动工作与运行">
        <button
          type="button"
          aria-current={activeView === 'background' ? 'page' : undefined}
          onClick={() => selectPrimaryView('background')}
        >
          对话整理
        </button>
        <button
          type="button"
          aria-current={activeView === 'steward' ? 'page' : undefined}
          onClick={() => selectPrimaryView('steward')}
        >
          记忆整理
        </button>
        <button
          type="button"
          aria-current={
            activeView === 'daily' && dailyShellSection === 'automation' ? 'page' : undefined
          }
          onClick={() => openDailySection('automation')}
        >
          日常计划
        </button>
        <button
          type="button"
          aria-current={
            activeView === 'daily' && dailyShellSection === 'operations' ? 'page' : undefined
          }
          onClick={() => openDailySection('operations')}
        >
          运行记录
        </button>
      </nav>
    ) : activeArea === 'settings' ? (
      <nav className="workspace-subnav" aria-label="设置类别">
        <button
          type="button"
          aria-current={activeView === 'settings-assistants' ? 'page' : undefined}
          onClick={() => selectPrimaryView('settings-assistants')}
        >
          助手与人设
        </button>
        <button
          type="button"
          aria-current={activeView === 'settings-provider' ? 'page' : undefined}
          onClick={() => selectPrimaryView('settings-provider')}
        >
          模型连接
        </button>
        <button
          type="button"
          aria-current={activeView === 'retention' ? 'page' : undefined}
          onClick={() => selectPrimaryView('retention')}
        >
          数据与存储
        </button>
      </nav>
    ) : null

  const navigateShell = useCallback(
    (area: ShellArea): void => {
      if (area === 'automation') {
        if (activeView === 'background' || activeView === 'steward') return
        openDailySection('automation')
        return
      }
      if (area === 'operations') {
        openDailySection('operations')
        return
      }
      if (area === 'settings') {
        if (
          activeView === 'settings-assistants' ||
          activeView === 'settings-provider' ||
          activeView === 'retention'
        )
          return
        selectPrimaryView('settings-assistants')
        return
      }
      selectPrimaryView(area)
    },
    [activeView, openDailySection, selectPrimaryView]
  )

  return (
    <AppShell
      activeArea={activeArea}
      title={shellCopy[activeArea].title}
      description={shellCopy[activeArea].description}
      assistants={assistantSnapshot?.assistants ?? []}
      currentAssistantId={assistantSnapshot?.currentAssistantId ?? ''}
      switchingAssistant={switchingAssistant}
      onSwitchAssistant={(assistantId) => void switchCurrentAssistant(assistantId)}
      onNavigate={navigateShell}
      contextNavigation={contextNavigation}
    >
      <section hidden={activeView !== 'settings-assistants'} aria-label="助手与人设设置">
        <AssistantPanel
          api={window.mashiro.assistants}
          onSnapshot={receiveAssistantSnapshot}
          externalSnapshot={assistantSnapshot}
          onOpenConfiguration={openAssistantConfiguration}
        />
      </section>
      {navigationError ? <p role="alert">{navigationError}</p> : null}

      <section
        hidden={activeView !== 'chat' && activeView !== 'settings-provider'}
        aria-label="对话与模型连接页面"
      >
        <ProviderPanel
          assistantSnapshot={assistantSnapshot}
          surface={activeView === 'settings-provider' ? 'settings' : 'chat'}
          onOpenSettings={(target) =>
            selectPrimaryView(
              target === 'assistants'
                ? 'settings-assistants'
                : target === 'provider'
                  ? 'settings-provider'
                  : 'chat'
            )
          }
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
          onOpenMemory={openMemory}
          memoryEvidenceRefreshKey={memoryRefreshKey}
          retentionChange={retentionChange}
          onPrepareRetention={prepareRetention}
          chapterContextTarget={chapterContextTarget}
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
          openItemTarget={itemOpenTarget}
        />
      </section>
      <section
        id="reminders-page"
        hidden={activeView !== 'reminders'}
        aria-label="提醒页面"
        tabIndex={-1}
      >
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
          key={`${assistantSnapshot?.currentAssistantId ?? ''}:${memoryPermissionEpoch}`}
          assistantId={assistantSnapshot?.currentAssistantId ?? ''}
          assistantName={
            assistantSnapshot?.assistants.find(
              (assistant) => assistant.id === assistantSnapshot.currentAssistantId
            )?.displayName ?? ''
          }
          api={window.mashiro.memory}
          onLocateRound={locateMemorySource}
          refreshKey={memoryRefreshKey}
          openTarget={
            memoryOpenTarget &&
            memoryOpenTarget.assistantId === assistantSnapshot?.currentAssistantId &&
            memoryOpenTarget.snapshotRevision === assistantSnapshot.stateRevision
              ? memoryOpenTarget
              : null
          }
          onPermissionsChanged={receiveMemoryPermissionChange}
          onMemoryChanged={receiveMemoryChange}
          pendingCommands={pendingMemoryCommands}
          retentionChange={retentionChange}
          onPrepareRetention={prepareRetention}
          configurationFocusNonce={
            configurationFocus?.target === 'memory' ? configurationFocus.nonce : null
          }
        />
      </section>
      <section hidden={activeView !== 'background'} aria-label="对话整理页面">
        {window.mashiro.background ? (
          <BackgroundPanel
            assistantId={assistantSnapshot?.currentAssistantId ?? ''}
            assistantName={
              assistantSnapshot?.assistants.find(
                (assistant) => assistant.id === assistantSnapshot.currentAssistantId
              )?.displayName ?? ''
            }
            api={window.mashiro.background}
            providerApi={window.mashiro.provider}
            onUseChapters={useChapterContext}
          />
        ) : (
          <p role="alert">本机对话整理服务尚未就绪。</p>
        )}
      </section>
      <section hidden={activeView !== 'steward'} aria-label="记忆整理页面">
        {window.mashiro.steward ? (
          <StewardPanel
            assistantSnapshot={assistantSnapshot}
            api={window.mashiro.steward}
            memoryApi={window.mashiro.memory}
            providerApi={window.mashiro.provider}
            onMemoryChanged={receiveMemoryChange}
          />
        ) : (
          <p role="alert">本机记忆整理服务尚未就绪。</p>
        )}
      </section>
      <section hidden={activeView !== 'daily'} aria-label="日常计划与运行记录页面">
        {window.mashiro.daily && window.mashiro.operations ? (
          <DailyPanel
            assistantSnapshot={assistantSnapshot}
            api={window.mashiro.daily}
            operationsApi={window.mashiro.operations}
            providerApi={window.mashiro.provider}
            navigationTarget={dailyNavigationTarget}
            onSectionChange={setDailyShellSection}
            onOpenProposal={({ assistantId, proposalId }) => {
              setItemOpenTarget((current) => ({
                assistantId,
                type: 'proposal',
                id: proposalId,
                nonce: (current?.nonce ?? 0) + 1
              }))
              setItemRefreshKey((value) => value + 1)
              setActiveView('items')
            }}
            onOpenItem={({ assistantId, itemId }) => {
              setItemOpenTarget((current) => ({
                assistantId,
                type: 'item',
                id: itemId,
                nonce: (current?.nonce ?? 0) + 1
              }))
              setItemRefreshKey((value) => value + 1)
              setActiveView('items')
            }}
            onOpenMemory={() => {
              setMemoryRefreshKey((value) => value + 1)
              setNavigationError('已打开记忆区；请按报告所示的记忆对象与版本完成纠正或撤回确认。')
              setActiveView('memory')
            }}
            onOpenOperationOwner={async (row) => {
              const targetAssistantId = row.owner.assistantId
              if (
                targetAssistantId &&
                targetAssistantId !== assistantSnapshot?.currentAssistantId
              ) {
                const opened = await openAssistantConfiguration(
                  targetAssistantId,
                  row.owner.domain === 'item' ? 'items' : 'provider'
                )
                if (!opened) return
              }
              if (row.owner.domain === 'item') {
                if (!targetAssistantId) {
                  setNavigationError('这条事项记录没有可定位的助手。')
                  return
                }
                setItemOpenTarget((current) => ({
                  assistantId: targetAssistantId,
                  type: 'item',
                  id: row.owner.id,
                  nonce: (current?.nonce ?? 0) + 1
                }))
                setItemRefreshKey((value) => value + 1)
                setActiveView('items')
                return
              }
              if (row.owner.domain === 'reminder') {
                setReminderRefreshKey((value) => value + 1)
                setActiveView('reminders')
              } else if (row.owner.domain === 'background') setActiveView('background')
              else if (row.owner.domain === 'steward') setActiveView('steward')
              else if (row.owner.domain === 'provider') setActiveView('chat')
              else {
                setNavigationError('这条日常记录没有可识别的功能入口，请刷新后重试。')
                setActiveView('daily')
              }
            }}
          />
        ) : (
          <p role="alert">本机日常运行服务尚未就绪。</p>
        )}
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
    </AppShell>
  )
}
