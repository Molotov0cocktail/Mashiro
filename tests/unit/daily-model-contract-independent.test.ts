import { describe, expect, it } from 'vitest'
import {
  dailyOutputSchema,
  dailyPrompt,
  validateDailyOutput
} from '../../src/main/background/daily-model.js'
import type { DailyInputs } from '../../src/main/background/daily-sources.js'

const assistantId = '11111111-1111-4111-8111-111111111111'
const connectionId = '22222222-2222-4222-8222-222222222222'

function inputs(
  feature: DailyInputs['configuration']['feature'],
  allowProposals = false
): DailyInputs {
  return {
    configuration: {
      id: '33333333-3333-4333-8333-333333333333',
      assistantId,
      feature,
      version: 1,
      recipientFingerprint: 'a'.repeat(64),
      authorizedRecipient: true,
      enabled: true,
      connectionId,
      model: 'synthetic-model',
      dataScope: {
        ownRounds: false,
        chapters: false,
        privateMemories: false,
        globalMemories: true,
        events: true,
        items: false,
        proposals: false,
        maxSources: 2,
        lookbackDays: 7
      },
      budget: null,
      schedule: null,
      recovery: { mode: 'EXPLICIT', catchUpMinutes: 120, merge: false, expire: true },
      allowSaveObservations: true,
      allowProposals,
      deadlineWindowHours: 24,
      changeFields: [],
      mergeChanges: null
    },
    recipientIdentity: connectionId + ':synthetic-model:' + 'a'.repeat(64),
    period: {
      start: '2030-01-01T00:00:00.000Z',
      end: '2030-01-02T00:00:00.000Z',
      timeZone: 'UTC',
      localLabel: '2030-01-01'
    },
    entries: [
      {
        evidence: {
          handle: 'source0',
          source: {
            type: 'memory',
            id: '44444444-4444-4444-8444-444444444444',
            assistantId,
            version: 1
          },
          title: '事件甲',
          eventStatus: 'reported-happened',
          occurredAt: '2030-01-01T08:00:00.000Z',
          timeZone: 'UTC'
        },
        content: '事件甲',
        hash: 'hash0',
        independentRoots: ['memory:root0']
      },
      {
        evidence: {
          handle: 'source1',
          source: {
            type: 'memory',
            id: '55555555-5555-4555-8555-555555555555',
            assistantId,
            version: 1
          },
          title: '事件乙',
          eventStatus: 'reported-happened',
          occurredAt: '2030-01-01T09:00:00.000Z',
          timeZone: 'UTC'
        },
        content: '事件乙',
        hash: 'hash1',
        independentRoots: ['memory:root1']
      }
    ],
    range: { included: 2, available: 2, limited: false, description: '完整合成范围' },
    checkpoints: []
  }
}

const section = {
  title: '合成观察',
  markdown: '事件甲',
  nature: 'faithful-summary' as const,
  sourceHandles: ['source0', 'source1']
}

describe('daily model prompt and strict output contract', () => {
  it('states the same reserved observation, feature, proposal, and counterpart rules that trusted validation enforces', () => {
    const brief = inputs('daily-brief')
    const prompt = dailyPrompt(brief)
    expect(prompt).toContain('observations最多7项')
    expect(prompt).toContain('非observation功能的observations必须为空数组')
    expect(prompt).toContain('未允许，proposals必须为空数组')
    expect(prompt).toContain('无相关对象时用空字符串，不可为null')

    expect(() =>
      validateDailyOutput({ sections: [], observations: [section], proposals: [] }, brief)
    ).toThrow('OBSERVATION_FEATURE_REQUIRED')
    expect(() =>
      validateDailyOutput(
        {
          sections: [],
          observations: [],
          proposals: [
            {
              candidate: {
                kind: 'task',
                title: '未授权提案',
                description: '',
                status: 'open',
                dueAt: null,
                timeZone: null,
                parentId: null,
                relatedIds: [],
                counterpart: ''
              },
              sourceHandles: ['source0']
            }
          ]
        },
        brief
      )
    ).toThrow('PROPOSALS_NOT_ALLOWED')
  })

  it('gives each feature one explicit role and repeats its observation boundary at output time', () => {
    const roles = [
      ['observation', '仅根据事件形成多事件观察'],
      ['daily-brief', '仅生成当日资料简报'],
      ['evening-review', '仅生成晚间复盘'],
      ['weekly-plan', '仅生成有来源的每周规划'],
      ['deadline-change', '仅在sections中解释提供的正式事项实际版本变化']
    ] as const

    for (const [feature, instruction] of roles) {
      const prompt = dailyPrompt(inputs(feature))
      expect(prompt).toContain(`当前功能 ${feature}`)
      expect(prompt).toContain(instruction)
      if (feature === 'observation') {
        expect(prompt).toContain('observations只含至少两个独立事件支撑的条目，最多7条')
      } else {
        expect(prompt).toContain(
          'observations必须严格为[]，即使简报或复盘提到事件，也只能放入sections'
        )
      }
    }
  })

  it('rejects a nullable counterpart and an eighth model observation before the trusted objective slot is appended', () => {
    expect(
      dailyOutputSchema.safeParse({
        sections: [],
        observations: [],
        proposals: [
          {
            candidate: {
              kind: 'task',
              title: '错误空对象',
              description: '',
              status: 'open',
              dueAt: null,
              timeZone: null,
              parentId: null,
              relatedIds: [],
              counterpart: null
            },
            sourceHandles: ['source0']
          }
        ]
      }).success
    ).toBe(false)

    expect(() =>
      validateDailyOutput(
        {
          sections: [],
          observations: Array.from({ length: 8 }, () => ({ ...section })),
          proposals: []
        },
        inputs('observation')
      )
    ).toThrow('OBSERVATION_RESERVED_SLOT')
  })
})
