import { expect, it } from 'vitest'
import { canonicalSuggestionEvidence } from '../../src/main/item/item-intent.js'
it('independent: materially new non-date evidence is not permanently identical to a rejected source', () => {
  const oldEvidence = '我在考虑修车，车辆可以正常行驶'
  const newEvidence = '我在考虑修车，车辆已经无法启动'
  const oldIdentity = canonicalSuggestionEvidence(oldEvidence, oldEvidence)
  const newIdentity = canonicalSuggestionEvidence(newEvidence, newEvidence)
  expect(oldIdentity).not.toBeNull()
  expect(newIdentity).not.toBeNull()
  expect(newIdentity).not.toEqual(oldIdentity)
})