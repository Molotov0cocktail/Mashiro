import { z } from 'zod'
import { itemSourceSchema } from '../../shared/item-contract.js'
import { reminderStateSchema } from '../../shared/reminder-contract.js'

const id = z.uuid()
const version = z.number().int().nonnegative()
const boolean = z.number().int().min(0).max(1)
const scope = z.enum(['global', 'assistant'])
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/)
const field = (column: string, schema: z.ZodType, json?: string) => ({ column, schema, json })
const encoded = (schema: z.ZodType) =>
  z
    .string()
    .max(65536)
    .superRefine((value, ctx) => {
      try {
        schema.parse(JSON.parse(value))
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Invalid governance metadata' })
      }
    })
const recipients = encoded(z.array(z.tuple([id, fingerprint])).max(4096))
const identifier = (column: string) => field(column, id)
const flag = (column: string) => field(column, boolean)
const revision = (column = 'version') => field(column, version)
const jsonField = (path: string, schema: z.ZodType) => field('record_json', schema, path)
export const governanceCatalog = {
  reminders: {
    keys: [identifier('id')],
    values: [
      identifier('item_id'),
      revision(),
      field('state', reminderStateSchema),
      field('due_at', z.iso.datetime({ offset: true })),
      jsonField('itemVersion', version),
      jsonField('timeZone', z.string().max(100))
    ]
  },
  reminder_occurrences: {
    keys: [identifier('reminder_id'), revision()],
    values: [field('state', reminderStateSchema)]
  },
  retained_source_edges: {
    keys: [
      identifier('object_id'),
      revision('object_version'),
      field('source_type', z.enum(['round', 'user-round', 'memory', 'manual', 'item', 'proposal'])),
      identifier('source_id'),
      revision('source_version')
    ],
    values: [identifier('source_assistant'), field('recipients_json', recipients)]
  },
  item_retained_edges: {
    keys: [
      identifier('item_id'),
      revision('item_version'),
      field('source_json', encoded(itemSourceSchema))
    ],
    values: [field('recipients_json', recipients)]
  },
  content_tombstones: {
    keys: [field('kind', z.enum(['round', 'memory'])), identifier('id'), revision()],
    values: []
  },
  assistant_tombstones: { keys: [identifier('id')], values: [] },
  memory_suppressions: {
    keys: [
      field('source_type', z.enum(['round', 'user-round', 'memory', 'manual', 'item', 'proposal'])),
      identifier('source_id'),
      revision('source_version'),
      field('kind', z.enum(['withdrawal', 'representation'])),
      identifier('object_id')
    ],
    values: []
  },
  item_tombstones: {
    keys: [field('kind', z.enum(['item', 'proposal'])), identifier('id')],
    values: []
  },
  retention_original_trash: {
    keys: [identifier('request_id')],
    values: [identifier('assistant_id')]
  },
  retention_policy: {
    keys: [field('singleton', z.literal(1))],
    values: [
      revision('revision'),
      flag('capacity_enabled'),
      field('capacity_bytes', z.number().int().min(1).max(1_099_511_627_776)),
      flag('staging_enabled'),
      field('staging_days', z.number().int().min(1).max(36500)),
      flag('restored_paused'),
      revision('scheduler_generation')
    ]
  },
  memory_objects: {
    keys: [identifier('id')],
    values: [
      revision(),
      jsonField('scope', scope),
      jsonField('ownerAssistantId', id),
      jsonField('state', z.enum(['active', 'pending', 'suppressed', 'integrity-blocked'])),
      jsonField('retention', z.enum(['persistent', 'staging', 'trash']))
    ]
  },
  items: { keys: [identifier('id')], values: [revision(), jsonField('originAssistantId', id)] },
  item_proposals: {
    keys: [identifier('id')],
    values: [
      revision(),
      identifier('origin_assistant_id'),
      field(
        'state',
        z.enum(['DRAFT_PROPOSAL', 'DISCUSSING', 'DEFERRED', 'ACCEPTED', 'REJECTED', 'STALE'])
      ),
      jsonField('acceptedItemId', id.nullable())
    ]
  },
  history_permissions: {
    keys: [identifier('assistant_id')],
    values: [revision(), flag('read_history')]
  },
  history_recipient_grants: {
    keys: [identifier('assistant_id'), field('endpoint_fingerprint', fingerprint)],
    values: [flag('send_history')]
  },
  memory_permissions: {
    keys: [identifier('assistant_id'), field('scope', scope)],
    values: [revision(), flag('read_allowed'), flag('write_allowed'), flag('inferences_allowed')]
  },
  memory_recipients: {
    keys: [identifier('assistant_id'), field('scope', scope), field('fingerprint', fingerprint)],
    values: [flag('allowed')]
  },
  item_permissions: {
    keys: [identifier('assistant_id')],
    values: [revision(), flag('read_allowed'), flag('write_allowed'), flag('propose_allowed')]
  },
  item_recipients: {
    keys: [identifier('assistant_id'), field('fingerprint', fingerprint)],
    values: [flag('allowed')]
  },
  provider_connections: {
    keys: [identifier('id')],
    values: [revision(), flag('enabled'), flag('has_persistent_credential')]
  },
  assistant_provider_bindings: {
    keys: [identifier('assistant_id')],
    values: [revision(), identifier('connection_id')]
  }
} as const

export type GovernanceTable = keyof typeof governanceCatalog
export interface GovernanceProjection {
  table: GovernanceTable
  keys: (string | number | null)[]
  values: (string | number | null)[]
  deleted: boolean
}
const envelope = z.strictObject({
  table: z.string(),
  keys: z.array(z.union([z.string(), z.number(), z.null()])),
  values: z.array(z.union([z.string(), z.number(), z.null()])),
  deleted: z.boolean()
})
export function parseGovernanceProjection(value: unknown): GovernanceProjection {
  const parsed = envelope.parse(value)
  if (!Object.hasOwn(governanceCatalog, parsed.table)) throw Error('GOVERNANCE_UNKNOWN_TABLE')
  const table = parsed.table as GovernanceTable,
    definition = governanceCatalog[table]
  if (
    parsed.keys.length !== definition.keys.length ||
    parsed.values.length !== definition.values.length
  )
    throw Error('GOVERNANCE_PROJECTION_LENGTH')
  definition.keys.forEach((key, index) => key.schema.parse(parsed.keys[index]))
  definition.values.forEach((item, index) => item.schema.parse(parsed.values[index]))
  return { ...parsed, table }
}

export function governanceExpression(
  value: { column: string; json?: string },
  prefix = ''
): string {
  return value.json
    ? `json_extract(${prefix}${value.column},'$.${value.json}')`
    : prefix + value.column
}

export const governanceKey = (value: GovernanceProjection): string =>
  JSON.stringify([value.table, value.keys])
