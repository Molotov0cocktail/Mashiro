import type { ItemContent, ItemMutation, ItemRecord } from '../../shared/item-contract.js'

export const emptyItem = (kind: ItemContent['kind'], title: string): ItemContent => ({
  kind,
  title,
  description: '',
  status: 'open',
  dueAt: null,
  timeZone: null,
  parentId: null,
  relatedIds: [],
  counterpart: ''
})
const kinds = {
  目标: 'goal',
  项目: 'project',
  任务: 'task',
  承诺: 'commitment',
  等待事项: 'waiting',
  等待: 'waiting'
} as const
/** This recognizer consumes a complete current-user command. Model claims never authorize it. */
export function recognizeItemIntent(
  text: string,
  items: ItemRecord[],
  selected?: ItemRecord
): ItemMutation | null {
  const sentence = text.trim().replace(/[。！]$/, '')
  if (
    /[“”"「」『』？?\n；;]/.test(sentence) ||
    /(?:不要|别|假如|如果|假设|他说|她说|有人说|能否|是否|不想|并且|然后|以及)/.test(sentence)
  )
    return null
  const create =
    /^(?:请|请你)?(?:帮我|给我)?(?:新建|创建|添加|加)(?:一个|一项|个)?(目标|项目|任务|承诺|等待事项|等待)[：:]\s*([^：:]+)$/.exec(
      sentence
    )
  if (create) {
    const title = create[2]!.trim()
    if (!title || title.length > 160 || /(?:并|同时|再帮|截止|提醒我|完成后)/.test(title))
      return null
    return { action: 'create', content: emptyItem(kinds[create[1] as keyof typeof kinds], title) }
  }
  const transition =
    /^(?:请)?把(.+?)(?:这件事|这个事项)?(?:标为|标记为|设为)(完成|已完成|已达成|已履行|已收到|取消|进行中|待办|重新打开)$/.exec(
      sentence
    )
  if (transition) {
    const name = transition[1]!.trim()
    const found = ['这个', '这项', '当前事项'].includes(name)
      ? selected
        ? [selected]
        : []
      : items.filter((r) => r.content.title === name)
    if (found.length !== 1) return null
    const target = found[0]!
    const status = ['完成', '已完成', '已达成', '已履行', '已收到'].includes(transition[2]!)
      ? 'completed'
      : transition[2] === '取消'
        ? 'cancelled'
        : transition[2] === '进行中'
          ? 'active'
          : 'open'
    return { action: 'transition', id: target.id, expectedVersion: target.version, status }
  }
  const rename = /^(?:请)?把(.+?)的标题改为[：:]?(.+)$/.exec(sentence)
  if (rename) {
    const found =
      rename[1] === '这个事项'
        ? selected
          ? [selected]
          : []
        : items.filter((r) => r.content.title === rename[1])
    if (found.length !== 1 || rename[2]!.length > 160) return null
    const target = found[0]!
    return {
      action: 'update',
      id: target.id,
      expectedVersion: target.version,
      content: { ...target.content, title: rename[2]! }
    }
  }
  return null
}
export function recognizeItemRemoval(text: string, items: ItemRecord[], selected?: ItemRecord) {
  const sentence = text.trim().replace(/[。！]$/, '')
  const deletion = /^(?:请)?(?:永久)?删除(.+)$/.exec(sentence)
  const unlink = /^(?:请)?解除(.+?)的所有关联$/.exec(sentence)
  const name = (deletion?.[1] ?? unlink?.[1])?.trim()
  if (
    !name ||
    /[“”"「」『』？?\n；;]/.test(sentence) ||
    /(?:不要|别|如果|假设|然后|并且)/.test(sentence)
  )
    return null
  const found = ['这个事项', '这项事项', '当前事项'].includes(name)
    ? selected
      ? [selected]
      : []
    : items.filter((item) => item.content.title === name)
  if (found.length !== 1) return null
  const target = found[0]!
  return {
    action: deletion ? ('delete' as const) : ('replace-links' as const),
    targets: [{ id: target.id, expectedVersion: target.version }],
    ...(unlink ? { content: { ...target.content, parentId: null, relatedIds: [] } } : {})
  }
}
export function suggestionAnchors(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[，,。；;\n]|以及|并且|还有|和/u)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  ]
}

/** Canonical source evidence never comes from model wording or an unrelated new request ID. */
export function canonicalSuggestionEvidence(text: string, evidence: string): string[] | null {
  const exact = evidence.trim()
  if (!exact || !text.includes(exact)) return null
  const original = suggestionAnchors(text),
    covered = suggestionAnchors(exact)
  if (!covered.length || covered.some((anchor) => !original.includes(anchor))) return null
  const substantive = (anchor: string) =>
    !/^(?:(?:还没有|尚未|还没|没有)(?:决定|确定)(?:要做|是否要做|要不要做)?|请(?:仅|只)?(?:提出|给出|生成).*(?:建议|提案)|不要(?:创建|建立)(?:任何|新的|一个)?正式事项|先作为(?:建议|提案))$/.test(
      anchor
    )
  const cited = covered.filter(substantive)
  if (!cited.length) return null
  // Evidence identifies a complete topic, never selects which of its conditions count.
  // Read all conditions from the trusted sentence; unrelated later sentences are not identity.
  const sentences = text
    .split(/[。；;\n]/u)
    .map((sentence) => suggestionAnchors(sentence).filter(substantive))
  const matching = sentences.filter(
    (anchors) => anchors[0] === cited[0] && cited.every((anchor) => anchors.includes(anchor))
  )
  if (matching.length !== 1) return null
  return matching[0]!.map((anchor) => anchor.normalize('NFC').replace(/\s+/g, ''))
}
