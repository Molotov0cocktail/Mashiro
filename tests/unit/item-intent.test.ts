import { expect, it } from 'vitest'
import {
  canonicalSuggestionEvidence,
  recognizeItemIntent
} from '../../src/main/item/item-intent.js'
it('uses verbatim complete clauses and stable evidence rather than model paraphrase or request IDs', () => {
  const first = '我在考虑学习合成主题'
  const text = first + '，还没有决定要做。请仅提出建议。'
  expect(canonicalSuggestionEvidence(text, first)).toEqual([first])
  expect(canonicalSuggestionEvidence(text, first + '，还没有决定要做。')).toEqual([first])
  expect(canonicalSuggestionEvidence(text + '另外帮我查天气。', first)).toEqual([first])
  expect(canonicalSuggestionEvidence(text, '考虑学习合成主题')).toBeNull()
  expect(canonicalSuggestionEvidence(text, '我想学习合成主题')).toBeNull()
  expect(canonicalSuggestionEvidence(text, '请仅提出建议。')).toBeNull()
  expect(canonicalSuggestionEvidence(first + '，下周开始。', first + '，下周开始。')).toEqual([
    first,
    '下周开始'
  ])
  expect(
    canonicalSuggestionEvidence('我在考虑学习另一个主题。', '我在考虑学习另一个主题。')
  ).not.toEqual([first])
})
it('derives identity from the trusted topic sentence, preserving changed conditions and ignoring model evidence length', () => {
  const topic = '我在考虑修车'
  const old = topic + '，车辆可以正常行驶'
  const changed = topic + '，车辆已经无法启动'
  expect(canonicalSuggestionEvidence(old, old)).not.toEqual(
    canonicalSuggestionEvidence(changed, changed)
  )
  expect(canonicalSuggestionEvidence(topic + '，尚未取得报价', topic)).not.toEqual(
    canonicalSuggestionEvidence(topic + '，尚未找到配件', topic)
  )
  const timed = topic + '，下周开始'
  expect(canonicalSuggestionEvidence(timed, timed)).toEqual(
    canonicalSuggestionEvidence(timed, topic)
  )
  expect(canonicalSuggestionEvidence(timed + '。另外查一下天气。', topic)).toEqual(
    canonicalSuggestionEvidence(timed, timed)
  )
  expect(canonicalSuggestionEvidence(timed, '下周开始')).toBeNull()
})
it('authorizes complete direct Chinese commands for five types', () => {
  for (const [label, kind] of [
    ['目标', 'goal'],
    ['项目', 'project'],
    ['任务', 'task'],
    ['承诺', 'commitment'],
    ['等待事项', 'waiting']
  ])
    expect(recognizeItemIntent(`请帮我新建一个${label}：合成报告`, [])).toMatchObject({
      action: 'create',
      content: { kind, title: '合成报告' }
    })
})
it('does not authorize quoted, negative, hypothetical, question, or partially parsed actions', () => {
  for (const text of [
    '他说“新建任务：报告”',
    '不要新建任务：报告',
    '如果新建任务：报告',
    '新建任务：报告？',
    '新建任务：报告；然后删除全部',
    '新建任务：报告并提醒我',
    '帮我想一想新建任务：报告'
  ])
    expect(recognizeItemIntent(text, [])).toBeNull()
})
