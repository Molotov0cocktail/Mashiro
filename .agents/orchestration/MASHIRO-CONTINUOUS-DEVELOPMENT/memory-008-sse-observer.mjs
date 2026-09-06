import { TextDecoder } from 'node:util'
import { setTimeout, clearTimeout } from 'node:timers'
// Diagnostic observer for synthetic fixtures. Never returns body/arguments/reasoning text.
const knownNames = new Set(['get_current_time', 'search_conversation_history', 'search_memory', 'write_memory', 'correct_memory', 'request_memory_removal'])
const knownFields = new Set(['action', 'targetId', 'expectedVersion', 'kind', 'scope', 'title', 'markdown', 'nature', 'event', 'query', 'limit'])
const knownFinishes = new Set(['stop', 'tool_calls', 'length', 'content_filter'])

export async function observeSyntheticToolStream(response, validators, userText) {
  const result = { frames: 0, bytes: 0, reasoningCharacters: 0, contentCharacters: 0, finishes: [], choiceIndices: [], calls: [], usage: null, incomplete: false }
  if (!response.ok || !response.body) return result
  const calls = new Map()
  const decoder = new TextDecoder()
  let pending = ''
  const reader = response.body.getReader()
  const timeout = setTimeout(() => { result.incomplete = true; void reader.cancel().catch(() => {}) }, 120000)
  const line = (value) => {
    if (!value.startsWith('data:')) return
    const data = value.slice(5).trim()
    if (!data || data === '[DONE]') return
    let frame
    try { frame = JSON.parse(data) } catch { result.incomplete = true; return }
    result.frames++
    const usage = frame.usage
    if (usage && ['prompt_tokens', 'completion_tokens', 'total_tokens'].every(key => Number.isInteger(usage[key]) && usage[key] >= 0 && usage[key] <= 1000000000)) result.usage = { input: usage.prompt_tokens, output: usage.completion_tokens, total: usage.total_tokens }
    for (const choice of frame.choices ?? []) {
      const choiceIndex = Number.isInteger(choice.index) && choice.index >= 0 && choice.index <= 3 ? choice.index : '<other>'
      if (!result.choiceIndices.includes(choiceIndex)) result.choiceIndices.push(choiceIndex)
      if (choice.finish_reason != null) result.finishes.push(knownFinishes.has(choice.finish_reason) ? choice.finish_reason : '<other>')
      const delta = choice.delta ?? {}
      if (typeof delta.reasoning_content === 'string') result.reasoningCharacters += delta.reasoning_content.length
      if (typeof delta.content === 'string') result.contentCharacters += delta.content.length
      for (const call of delta.tool_calls ?? []) {
        if (!Number.isInteger(call.index) || call.index < 0 || call.index > 3) { result.incomplete = true; continue }
        const entry = calls.get(call.index) ?? { name: '', arguments: '', idPresent: false, lastId: null, idChanges: 0, nameFragmentLengths: [], emptyIdentityFragments: 0 }
        if (call.id === '' || call.type === '' || call.function?.name === '') entry.emptyIdentityFragments++
        if (typeof call.id === 'string' && call.id.length > 0) { entry.idPresent = true; if (entry.lastId !== null && entry.lastId !== call.id) entry.idChanges++; entry.lastId = call.id }
        if (typeof call.function?.name === 'string') { entry.name += call.function.name; if (entry.nameFragmentLengths.length < 32) entry.nameFragmentLengths.push(call.function.name.length) }
        if (typeof call.function?.arguments === 'string') entry.arguments += call.function.arguments
        if (entry.arguments.length > 32768 || entry.name.length > 200) { result.incomplete = true; continue }
        calls.set(call.index, entry)
      }
    }
  }
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      result.bytes += part.value.byteLength
      if (result.bytes > 524288) { result.incomplete = true; void reader.cancel().catch(() => {}); break }
      pending += decoder.decode(part.value, { stream: true })
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const value of lines) line(value.replace(/\r$/, ''))
    }
    pending += decoder.decode()
    if (pending) line(pending)
  } catch { result.incomplete = true } finally { clearTimeout(timeout); reader.releaseLock() }
  for (const [index, call] of calls) {
    let parsed
    try { parsed = JSON.parse(call.arguments) } catch { /* Only report shape. */ }
    const validator = validators[call.name]
    const validation = validator && parsed ? validator.safeParse(parsed) : null
    result.calls.push({
      index, name: knownNames.has(call.name) ? call.name : '<other>', idPresent: call.idPresent, idChanges: call.idChanges, nameFragmentLengths: call.nameFragmentLengths, emptyIdentityFragments: call.emptyIdentityFragments,
      argumentCharacters: call.arguments.length, validJson: parsed !== undefined,
      knownFields: parsed && typeof parsed === 'object' && parsed !== null ? Object.keys(parsed).filter(key => knownFields.has(key)) : [],
      unknownFieldCount: parsed && typeof parsed === 'object' && parsed !== null ? Object.keys(parsed).filter(key => !knownFields.has(key)).length : 0,
      validSchema: validation?.success ?? null,
      schemaIssues: validation && !validation.success ? validation.error.issues.map(issue => ({ code: issue.code, path: issue.path.map(segment => typeof segment === 'string' && knownFields.has(segment) ? segment : '<nested>') })) : [],
      statementExactSubstring: typeof parsed?.markdown === 'string' ? userText.includes(parsed.markdown) : null,
      hasTargetField: !!parsed && Object.hasOwn(parsed, 'targetId'), hasExpectedVersionField: !!parsed && Object.hasOwn(parsed, 'expectedVersion'),
      hasNullTarget: parsed?.targetId === null, hasNullExpectedVersion: parsed?.expectedVersion === null,
      nature: ['user-statement', 'faithful-summary', 'inference'].includes(parsed?.nature) ? parsed.nature : '<other>'
    })
  }
  return result
}
