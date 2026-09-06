import type { TimelineMessage, TimelineSnapshot } from '../../shared/timeline-contract.js'
import { ProviderDomainError } from './provider-repository.js'
import type { SqliteStore } from '../data/sqlite.js'

type Row = Omit<TimelineMessage, 'requestId' | 'createdAt' | 'saved'> & {
  request_id: string
  created_at: string
}

export class TimelineRepository {
  constructor(private readonly store: SqliteStore) {}

  query(
    assistantId: string,
    query: string,
    before?: number,
    requestId?: string
  ): import('../../shared/timeline-contract.js').TimelinePageResult {
    if (requestId && (query !== '' || before !== undefined))
      throw new ProviderDomainError('INVALID_INPUT')
    const rows = this.store.database
      .prepare(
        'SELECT sequence,id,request_id,role,content,status,created_at FROM readable_timeline_messages WHERE assistant_id=? AND sequence < ? AND instr(content,?)>0 AND (? IS NULL OR request_id=?) ORDER BY sequence DESC LIMIT 101'
      )
      .all(
        assistantId,
        before ?? Number.MAX_SAFE_INTEGER,
        query,
        requestId ?? null,
        requestId ?? null
      ) as unknown as (Row & {
      sequence: number
    })[]
    const page = rows.slice(0, 100)
    return {
      ok: true,
      data: {
        assistantId,
        messages: page.reverse().map((row) => ({
          id: row.id,
          requestId: row.request_id,
          role: row.role,
          content: row.content,
          status: row.status,
          createdAt: row.created_at,
          saved: true
        })),
        nextCursor: rows.length > 100 ? rows[99]!.sequence : null
      }
    }
  }
  contextRequestIds(assistantId: string, inputLength: number, selected?: string[]): string[] {
    const filter = selected
      ? ' AND u.request_id IN (' + selected.map(() => '?').join(',') + ')'
      : ''
    const rows = this.store.database
      .prepare(
        "SELECT u.request_id,length(u.content)+length(a.content) AS chars,u.content AS utext,a.content AS atext FROM readable_timeline_messages u JOIN readable_timeline_messages a ON a.assistant_id=u.assistant_id AND a.request_id=u.request_id AND a.role='assistant' WHERE u.assistant_id=? AND u.role='user' AND u.status='completed' AND a.status='completed'" +
          filter +
          ' ORDER BY a.sequence DESC LIMIT 16'
      )
      .all(assistantId, ...(selected ?? [])) as unknown as {
      request_id: string
      utext: string
      atext: string
    }[]
    let remaining = 64000 - inputLength
    const ids: string[] = []
    for (const row of rows) {
      const length = row.utext.length + row.atext.length
      if (length > remaining) break
      remaining -= length
      ids.push(row.request_id)
    }
    return ids.reverse()
  }
  searchHistory(
    assistantId: string,
    query: string,
    limit: number,
    selected?: string[]
  ): { matches: import('../../shared/tool-contract.js').HistoryCitation[]; truncated: boolean } {
    const filter = selected
      ? ' AND u.request_id IN (' + selected.map(() => '?').join(',') + ')'
      : ''
    const rows = this.store.database
      .prepare(
        "SELECT u.request_id,u.created_at,u.content AS user_text,a.content AS assistant_text FROM readable_timeline_messages u JOIN readable_timeline_messages a ON a.assistant_id=u.assistant_id AND a.request_id=u.request_id AND a.role='assistant' WHERE u.assistant_id=? AND u.role='user' AND u.status='completed' AND a.status='completed' AND (instr(u.content,?)>0 OR instr(a.content,?)>0)" +
          filter +
          ' ORDER BY a.sequence DESC LIMIT ?'
      )
      .all(assistantId, query, query, ...(selected ?? []), limit + 1) as unknown as {
      request_id: string
      created_at: string
      user_text: string
      assistant_text: string
    }[]
    const matches = rows.slice(0, limit).map((row) => {
      const matched = row.user_text.includes(query) ? row.user_text : row.assistant_text
      const start = Math.max(0, matched.indexOf(query) - 200)
      const excerpt = matched.slice(start, start + 1000)
      return {
        requestId: row.request_id,
        createdAt: row.created_at,
        excerpt,
        truncated: start > 0 || start + 1000 < matched.length
      }
    })
    return { matches, truncated: rows.length > limit || matches.some((match) => match.truncated) }
  }
  selectedContext(
    assistantId: string,
    requestIds: string[],
    inputLength: number
  ): { role: 'user' | 'assistant'; content: string }[] {
    if (new Set(requestIds).size !== requestIds.length)
      throw new ProviderDomainError('INVALID_INPUT')
    const placeholders = requestIds.map(() => '?').join(',')
    const rows = this.store.database
      .prepare(
        `SELECT u.request_id,u.content AS user_text,a.content AS assistant_text FROM readable_timeline_messages u JOIN readable_timeline_messages a ON a.assistant_id=u.assistant_id AND a.request_id=u.request_id AND a.role='assistant' WHERE u.assistant_id=? AND u.role='user' AND u.status='completed' AND a.status='completed' AND u.request_id IN (${placeholders}) ORDER BY a.sequence`
      )
      .all(assistantId, ...requestIds) as unknown as {
      request_id: string
      user_text: string
      assistant_text: string
    }[]
    if (rows.length !== requestIds.length) throw new ProviderDomainError('INVALID_INPUT')
    if (
      rows.reduce(
        (total, row) => total + row.user_text.length + row.assistant_text.length,
        inputLength
      ) > 64000
    )
      throw new ProviderDomainError('LIMIT')
    return rows.flatMap((row) => [
      { role: 'user' as const, content: row.user_text },
      { role: 'assistant' as const, content: row.assistant_text }
    ])
  }
  recover(): void {
    this.store.database
      .prepare("UPDATE timeline_messages SET status = 'interrupted' WHERE status = 'pending'")
      .run()
  }

  read(assistantId: string): TimelineSnapshot {
    const rows = this.store.database
      .prepare(
        'SELECT id, request_id, role, content, status, created_at FROM readable_timeline_messages WHERE assistant_id = ? ORDER BY sequence DESC LIMIT 101'
      )
      .all(assistantId) as unknown as Row[]
    return {
      assistantId,
      mode: 'normal',
      hasMore: rows.length > 100,
      messages: rows
        .slice(0, 100)
        .reverse()
        .map((row) => ({
          id: row.id,
          requestId: row.request_id,
          role: row.role,
          content: row.content,
          status: row.status,
          createdAt: row.created_at,
          saved: true
        }))
    }
  }

  // Only complete pairs are eligible. Stop at the first oversized pair; never
  // trim or delete local history. Limits: 16 recent pairs / 64,000 UTF-16 units.
  context(
    assistantId: string,
    inputLength: number
  ): { role: 'user' | 'assistant'; content: string }[] {
    const rows = this.store.database
      .prepare(
        "SELECT u.content AS user_text, a.content AS assistant_text FROM readable_timeline_messages u JOIN readable_timeline_messages a ON a.assistant_id = u.assistant_id AND a.request_id = u.request_id AND a.role = 'assistant' WHERE u.assistant_id = ? AND u.role = 'user' AND u.status = 'completed' AND a.status = 'completed' ORDER BY a.sequence DESC LIMIT 16"
      )
      .all(assistantId) as unknown as { user_text: string; assistant_text: string }[]
    let remaining = 64000 - inputLength
    const pairs: { role: 'user' | 'assistant'; content: string }[][] = []
    for (const row of rows) {
      const length = row.user_text.length + row.assistant_text.length
      if (length > remaining) break
      remaining -= length
      pairs.push([
        { role: 'user', content: row.user_text },
        { role: 'assistant', content: row.assistant_text }
      ])
    }
    return pairs.reverse().flat()
  }

  insert(assistantId: string, messages: TimelineMessage[], sessionId: string | null = null): void {
    this.store.transaction(() => {
      const statement = this.store.database.prepare(
        'INSERT INTO timeline_messages(id, assistant_id, request_id, role, content, status, created_at, source_session_id, source_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(assistant_id, source_session_id, source_message_id) DO NOTHING'
      )
      for (const message of messages) {
        if (
          this.store.database
            .prepare(
              'SELECT 1 FROM timeline_messages WHERE request_id=? AND assistant_id<>? LIMIT 1'
            )
            .get(message.requestId, assistantId)
        )
          throw new ProviderDomainError('INVALID_INPUT')
        statement.run(
          message.id,
          assistantId,
          message.requestId,
          message.role,
          message.content,
          message.status,
          message.createdAt,
          sessionId,
          sessionId ? message.id : null
        )
      }
    })
  }

  finish(assistantId: string, message: TimelineMessage): void {
    this.store.database
      .prepare(
        "UPDATE timeline_messages SET content = ?, status = ? WHERE assistant_id = ? AND id = ? AND status = 'pending'"
      )
      .run(message.content, message.status, assistantId, message.id)
  }
}
