import { expect, it } from 'vitest'
import { itemProposeToolSchema } from '../../src/main/item/item-tool-schema.js'
import { emptyItem } from '../../src/main/item/item-intent.js'

it('accepts unspecified optional counterpart on tool wire, but rejects wrong value types and unrelated missing fields', () => {
  const input = { candidate: emptyItem('task', '合成建议'), evidence: '合成证据' }
  for (const counterpart of [null, undefined, '明确对象'])
    expect(
      itemProposeToolSchema.safeParse({ ...input, candidate: { ...input.candidate, counterpart } })
        .success
    ).toBe(true)
  for (const counterpart of [42, {}, [], false])
    expect(
      itemProposeToolSchema.safeParse({ ...input, candidate: { ...input.candidate, counterpart } })
        .success
    ).toBe(false)
  expect(
    itemProposeToolSchema.safeParse({
      ...input,
      candidate: { ...input.candidate, title: undefined }
    }).success
  ).toBe(false)
})
