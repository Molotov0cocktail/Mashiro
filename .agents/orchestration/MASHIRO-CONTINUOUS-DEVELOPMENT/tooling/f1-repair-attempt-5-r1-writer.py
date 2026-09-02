import hashlib
import json
import os
import stat
import subprocess
import uuid
from pathlib import Path


PROJECT_ROOT = Path(r"D:\Mashiro")
EXPECTED_HEAD = "62bc84a14f901e5b283e73572a04930abd7188df"
GIT = Path(r"D:\Git\Git\cmd\git.exe")
GIT_PREFIX = [str(GIT), "-c", "safe.directory=D:/Mashiro"]
SCRIPT_RELATIVE = ".agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/tooling/f1-repair-attempt-5-r1-writer.py"

SPECIFICATIONS = [
    {
        "id": "startup-redaction",
        "relative": "src/main/index.ts",
        "prehash": "17f42429edb42474a5eaa08f2fd49d41c6bbb784b1b21fd98279dc968a69bcb7",
        "replacements": [
            (
                """void start().catch((error: unknown) => {
  console.error('Mashiro failed to start', error)
""",
                """void start().catch(() => {
  console.error('MASHIRO_STARTUP_FAILURE')
""",
                1,
            )
        ],
    },
    {
        "id": "strict-output-contract",
        "relative": "src/shared/assistant-contract.ts",
        "prehash": "3b47f40faf70bb7faa768f0c5093b7fac72b5b11586038df28497414c6d13202",
        "replacements": [
            (
                """export type ErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'STALE_WRITE'
  | 'ASSISTANT_ARCHIVED'
  | 'PRIMARY_ARCHIVE_FORBIDDEN'
  | 'STORAGE_UNAVAILABLE'
  | 'STORAGE_INCONSISTENT'
  | 'INTERNAL_ERROR'

export interface AssistantDto {
  id: string
  displayName: string
  isArchived: boolean
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  version: number
}

export interface AssistantSnapshot {
  assistants: AssistantDto[]
  currentAssistantId: string | null
  primaryAssistantId: string | null
  stateRevision: number
}

export type AssistantResult =
  | { ok: true; data: AssistantSnapshot }
  | {
      ok: false
      error: {
        code: ErrorCode
        message: string
        correlationId: string
        retryable: false
      }
    }
""",
                """export const errorCodeSchema = z.enum([
  'INVALID_INPUT',
  'NOT_FOUND',
  'STALE_WRITE',
  'ASSISTANT_ARCHIVED',
  'PRIMARY_ARCHIVE_FORBIDDEN',
  'STORAGE_UNAVAILABLE',
  'STORAGE_INCONSISTENT',
  'INTERNAL_ERROR'
])

const assistantTimestamp = z.iso.datetime({ offset: true })

export const assistantDtoSchema = z.strictObject({
  id: assistantId,
  displayName: z.string(),
  isArchived: z.boolean(),
  createdAt: assistantTimestamp,
  updatedAt: assistantTimestamp,
  archivedAt: assistantTimestamp.nullable(),
  version: assistantVersion
})

export const assistantSnapshotSchema = z.strictObject({
  assistants: z.array(assistantDtoSchema),
  currentAssistantId: assistantId.nullable(),
  primaryAssistantId: assistantId.nullable(),
  stateRevision
})

export const assistantSuccessResultSchema = z.strictObject({
  ok: z.literal(true),
  data: assistantSnapshotSchema
})

export const assistantStableErrorSchema = z.strictObject({
  code: errorCodeSchema,
  message: z.string().min(1).max(160),
  correlationId: assistantId,
  retryable: z.literal(false)
})

export const assistantErrorResultSchema = z.strictObject({
  ok: z.literal(false),
  error: assistantStableErrorSchema
})

export const assistantResultSchema = z.discriminatedUnion('ok', [
  assistantSuccessResultSchema,
  assistantErrorResultSchema
])

export type ErrorCode = z.infer<typeof errorCodeSchema>
export type AssistantDto = z.infer<typeof assistantDtoSchema>
export type AssistantSnapshot = z.infer<typeof assistantSnapshotSchema>
export type AssistantResult = z.infer<typeof assistantResultSchema>
""",
                1,
            )
        ],
    },
    {
        "id": "ipc-output-boundary",
        "relative": "src/main/ipc/register-assistant-ipc.ts",
        "prehash": "fef6d47e1cc721926e2dbde90211288b5a8cfb2db904524826f8952a6fed38a6",
        "replacements": [
            (
                """import type { AssistantService } from '../assistant/assistant-service.js'
import { assistantChannels } from '../../shared/assistant-contract.js'

interface IpcMainLike {
  handle(channel: string, listener: (_event: unknown, input: unknown) => unknown): void
  removeHandler(channel: string): void
}

export function registerAssistantIpc(ipcMain: IpcMainLike, service: AssistantService): () => void {
  const handlers = {
    [assistantChannels.list]: (input: unknown) => service.list(input),
    [assistantChannels.create]: (input: unknown) => service.create(input),
    [assistantChannels.switch]: (input: unknown) => service.switch(input),
    [assistantChannels.rename]: (input: unknown) => service.rename(input),
    [assistantChannels.setPrimary]: (input: unknown) => service.setPrimary(input),
    [assistantChannels.archive]: (input: unknown) => service.archive(input)
  }
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_event, input) => handler(input))
  }
  return () => {
    for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel)
  }
}
""",
                """import { randomUUID } from 'node:crypto'
import type { AssistantService } from '../assistant/assistant-service.js'
import {
  assistantChannels,
  assistantResultSchema,
  type AssistantResult
} from '../../shared/assistant-contract.js'

interface IpcMainLike {
  handle(channel: string, listener: (_event: unknown, input: unknown) => AssistantResult): void
  removeHandler(channel: string): void
}

function internalError(): AssistantResult {
  return assistantResultSchema.parse({
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Assistant service failed',
      correlationId: randomUUID(),
      retryable: false
    }
  })
}

function validateOutput(operation: () => unknown): AssistantResult {
  try {
    const parsed = assistantResultSchema.safeParse(operation())
    if (parsed.success) return parsed.data
  } catch {
    // Trusted implementation details never cross the IPC boundary.
  }
  return internalError()
}

export function registerAssistantIpc(ipcMain: IpcMainLike, service: AssistantService): () => void {
  const handlers = {
    [assistantChannels.list]: (input: unknown) => service.list(input),
    [assistantChannels.create]: (input: unknown) => service.create(input),
    [assistantChannels.switch]: (input: unknown) => service.switch(input),
    [assistantChannels.rename]: (input: unknown) => service.rename(input),
    [assistantChannels.setPrimary]: (input: unknown) => service.setPrimary(input),
    [assistantChannels.archive]: (input: unknown) => service.archive(input)
  }
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_event, input) => validateOutput(() => handler(input)))
  }
  return () => {
    for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel)
  }
}
""",
                1,
            )
        ],
    },
    {
        "id": "ipc-output-tests",
        "relative": "tests/integration/ipc-registration.test.ts",
        "prehash": "8f056c65a01965318837d0fd3fce7701c8c1c67e44d45581aa1602342812a8dc",
        "replacements": [
            (
                """import { describe, expect, it, vi } from 'vitest'
import { registerAssistantIpc } from '../../src/main/ipc/register-assistant-ipc.js'
import { assistantChannels } from '../../src/shared/assistant-channels.js'
import type { AssistantService } from '../../src/main/assistant/assistant-service.js'

describe('assistant IPC registration', () => {
  it('registers, forwards, and removes exactly the six narrow handlers', () => {
    const listeners = new Map<string, (_event: unknown, input: unknown) => unknown>()
    const ipcMain = {
      handle: vi.fn((channel: string, listener: (_event: unknown, input: unknown) => unknown) => {
        listeners.set(channel, listener)
      }),
      removeHandler: vi.fn((channel: string) => listeners.delete(channel))
    }
    const service = {
      list: vi.fn().mockReturnValue({ ok: true }),
      create: vi.fn().mockReturnValue({ ok: true }),
      switch: vi.fn().mockReturnValue({ ok: true }),
      rename: vi.fn().mockReturnValue({ ok: true }),
      setPrimary: vi.fn().mockReturnValue({ ok: true }),
      archive: vi.fn().mockReturnValue({ ok: true })
    } as unknown as AssistantService

    const unregister = registerAssistantIpc(ipcMain, service)
    expect([...listeners.keys()].sort()).toEqual(Object.values(assistantChannels).sort())
    const input = { protocolVersion: 1, unexpected: 'trusted-service-will-reject' }
    expect(listeners.get(assistantChannels.create)?.({}, input)).toEqual({ ok: true })
    expect(service.create).toHaveBeenCalledWith(input)

    unregister()
    expect(listeners.size).toBe(0)
    expect(ipcMain.removeHandler.mock.calls.map(([channel]) => channel).sort()).toEqual(
      Object.values(assistantChannels).sort()
    )
  })
})
""",
                """import { describe, expect, it, vi } from 'vitest'
import { registerAssistantIpc } from '../../src/main/ipc/register-assistant-ipc.js'
import {
  assistantResultSchema,
  type AssistantResult
} from '../../src/shared/assistant-contract.js'
import { assistantChannels } from '../../src/shared/assistant-channels.js'
import type { AssistantService } from '../../src/main/assistant/assistant-service.js'

const emptySuccess: AssistantResult = {
  ok: true,
  data: {
    assistants: [],
    currentAssistantId: null,
    primaryAssistantId: null,
    stateRevision: 0
  }
}

function createIpcHarness(service: AssistantService): {
  listeners: Map<string, (_event: unknown, input: unknown) => AssistantResult>
  ipcMain: {
    handle: ReturnType<typeof vi.fn>
    removeHandler: ReturnType<typeof vi.fn>
  }
} {
  const listeners = new Map<string, (_event: unknown, input: unknown) => AssistantResult>()
  const ipcMain = {
    handle: vi.fn(
      (
        channel: string,
        listener: (_event: unknown, input: unknown) => AssistantResult
      ) => listeners.set(channel, listener)
    ),
    removeHandler: vi.fn((channel: string) => listeners.delete(channel))
  }
  registerAssistantIpc(ipcMain, service)
  return { listeners, ipcMain }
}

describe('assistant IPC registration', () => {
  it('validates and forwards normal results for exactly the six narrow handlers', () => {
    const service = {
      list: vi.fn().mockReturnValue(emptySuccess),
      create: vi.fn().mockReturnValue(emptySuccess),
      switch: vi.fn().mockReturnValue(emptySuccess),
      rename: vi.fn().mockReturnValue(emptySuccess),
      setPrimary: vi.fn().mockReturnValue(emptySuccess),
      archive: vi.fn().mockReturnValue(emptySuccess)
    } as unknown as AssistantService
    const { listeners, ipcMain } = createIpcHarness(service)

    expect([...listeners.keys()].sort()).toEqual(Object.values(assistantChannels).sort())
    const input = { protocolVersion: 1 }
    for (const channel of Object.values(assistantChannels)) {
      expect(listeners.get(channel)?.({}, input)).toEqual(emptySuccess)
    }
    expect(service.list).toHaveBeenCalledWith(input)
    expect(service.create).toHaveBeenCalledWith(input)
    expect(service.switch).toHaveBeenCalledWith(input)
    expect(service.rename).toHaveBeenCalledWith(input)
    expect(service.setPrimary).toHaveBeenCalledWith(input)
    expect(service.archive).toHaveBeenCalledWith(input)

    const unregister = registerAssistantIpc(ipcMain, service)
    unregister()
    expect(ipcMain.removeHandler.mock.calls.map(([channel]) => channel).sort()).toEqual(
      Object.values(assistantChannels).sort()
    )
  })

  it('replaces malformed success and error results with fresh redacted internal errors', () => {
    const malformedSuccess = {
      ok: true,
      data: { internalPath: 'D:\\Mashiro\\node_modules\\secret.js' }
    }
    const malformedError = {
      ok: false,
      error: {
        code: 'SQLITE_ERROR',
        message: 'SELECT secret FROM assistants at file:///D:/Mashiro/out/main/index.js',
        correlationId: 'not-a-uuid',
        retryable: false,
        stack: 'at repository (D:\\Mashiro\\src\\repository.ts:1:1)'
      }
    }
    const service = {
      list: vi.fn().mockReturnValue(emptySuccess),
      create: vi.fn().mockReturnValue(malformedSuccess),
      switch: vi.fn().mockReturnValue(emptySuccess),
      rename: vi.fn().mockReturnValue(malformedError),
      setPrimary: vi.fn().mockReturnValue(emptySuccess),
      archive: vi.fn().mockImplementation(() => {
        throw new Error('D:\\Mashiro\\node_modules\\sqlite stack')
      })
    } as unknown as AssistantService
    const { listeners } = createIpcHarness(service)

    const results = [
      listeners.get(assistantChannels.create)?.({}, { protocolVersion: 1 }),
      listeners.get(assistantChannels.rename)?.({}, { protocolVersion: 1 }),
      listeners.get(assistantChannels.archive)?.({}, { protocolVersion: 1 })
    ]
    for (const result of results) {
      expect(assistantResultSchema.safeParse(result).success).toBe(true)
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Assistant service failed',
          retryable: false
        }
      })
      expect(JSON.stringify(result)).not.toMatch(
        /D:\\\\|file:\\/\\/\\/|node_modules|SQL|SQLite|stack|secret/iu
      )
    }
    const correlationIds = results.map((result) =>
      result && !result.ok ? result.error.correlationId : undefined
    )
    expect(correlationIds.every((value) => /^[0-9a-f-]{36}$/u.test(value ?? ''))).toBe(true)
    expect(new Set(correlationIds).size).toBe(3)
  })
})
""",
                1,
            )
        ],
    },
    {
        "id": "output-schema-tests",
        "relative": "tests/unit/assistant-contract.test.ts",
        "prehash": "d9f78052a610d022cbe8585aca8d706dcc4d1eb9fb532075580b3b18ab188c55",
        "replacements": [
            (
                """import { createInputSchema, renameInputSchema } from '../../src/shared/assistant-contract.js'
""",
                """import {
  assistantResultSchema,
  createInputSchema,
  renameInputSchema
} from '../../src/shared/assistant-contract.js'
""",
                1,
            ),
            (
                """  })
})
""",
                """  })

  it('strictly validates assistant success and stable error output contracts', () => {
    const timestamp = '2026-09-03T00:00:00.000Z'
    const assistant = {
      id: '00000000-0000-4000-8000-000000000001',
      displayName: 'Mashiro',
      isArchived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      version: 1
    }
    const success = {
      ok: true,
      data: {
        assistants: [assistant],
        currentAssistantId: assistant.id,
        primaryAssistantId: assistant.id,
        stateRevision: 1
      }
    }
    expect(assistantResultSchema.safeParse(success).success).toBe(true)
    expect(
      assistantResultSchema.safeParse({
        ...success,
        data: { ...success.data, internalPath: 'D:\\Mashiro', stateRevision: -1 }
      }).success
    ).toBe(false)
    expect(
      assistantResultSchema.safeParse({
        ...success,
        data: {
          ...success.data,
          assistants: [{ ...assistant, id: 'forged', createdAt: 'not-a-time', version: 0 }]
        }
      }).success
    ).toBe(false)

    const stableError = {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Assistant service failed',
        correlationId: '00000000-0000-4000-8000-000000000002',
        retryable: false
      }
    }
    expect(assistantResultSchema.safeParse(stableError).success).toBe(true)
    expect(
      assistantResultSchema.safeParse({
        ...stableError,
        error: { ...stableError.error, code: 'SQLITE_ERROR', stack: 'secret stack' }
      }).success
    ).toBe(false)
  })
})
""",
                1,
            ),
        ],
    },
    {
        "id": "real-electron-startup-redaction",
        "relative": "scripts/electron-f1-harness.mjs",
        "prehash": "0aec147980daf326128bf5867a6824258054a560022cb9158b899cb0c9c70d73",
        "replacements": [
            (
                """mkdirSync(join(testRoot, 'results'), { recursive: false })

async function runPhase(phase) {
""",
                """mkdirSync(join(testRoot, 'results'), { recursive: false })

async function runStartupFailureProbe() {
  const environment = {
    ...process.env,
    MASHIRO_E2E: '1',
    MASHIRO_E2E_ROOT: projectRoot,
    MASHIRO_E2E_RUN_ID: randomUUID(),
    MASHIRO_E2E_PHASE: 'seed'
  }
  delete environment.ELECTRON_RUN_AS_NODE
  const child = spawn(electron, [projectRoot], {
    cwd: projectRoot,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const stdout = []
  const stderr = []
  child.stdout.on('data', (chunk) => stdout.push(chunk.toString()))
  child.stderr.on('data', (chunk) => stderr.push(chunk.toString()))
  const exitCode = await new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
      reject(new Error('Electron startup-failure probe timed out'))
    }, 45_000)
    child.once('error', () => {
      clearTimeout(timer)
      reject(new Error('Electron startup-failure probe could not start'))
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolveExit(code)
    })
  })
  if (exitCode === 0) throw new Error('Electron accepted an invalid trusted E2E root')
  const captured = `${stdout.join('')}\\n${stderr.join('')}`
  if (!stderr.join('').includes('MASHIRO_STARTUP_FAILURE'))
    throw new Error('Electron startup failure did not emit the stable event')
  const forbidden = [
    /D:\\\\/iu,
    /file:\\/\\/\\//iu,
    /node_modules/iu,
    /(?:^|\\r?\\n)\\s*at\\s+/u,
    /\\b(?:SQL|SQLite|SQLITE_[A-Z_]+)\\b/iu
  ]
  if (forbidden.some((pattern) => pattern.test(captured)))
    throw new Error('Electron startup failure exposed internal details')
}

async function runPhase(phase) {
""",
                1,
            ),
            (
                """let summary
try {
  const seed = await runPhase('seed')
""",
                """let summary
try {
  await runStartupFailureProbe()
  const seed = await runPhase('seed')
""",
                1,
            ),
            (
                """  summary = {
    runId,
    pids: [seed.pid, verify.pid],
""",
                """  summary = {
    runId,
    startupFailureSanitized: true,
    pids: [seed.pid, verify.pid],
""",
                1,
            ),
        ],
    },
]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def run_git(*arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        [*GIT_PREFIX, *arguments],
        cwd=PROJECT_ROOT,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    if check and completed.returncode != 0:
        raise RuntimeError(
            f"git command failed: {arguments!r} exit={completed.returncode} stderr={completed.stderr!r}"
        )
    return completed


def profile(data: bytes) -> dict[str, object]:
    body = data[3:] if data.startswith(b"\xef\xbb\xbf") else data
    return {
        "bom": data.startswith(b"\xef\xbb\xbf"),
        "crlf": body.count(b"\r\n"),
        "bare_cr": body.count(b"\r") - body.count(b"\r\n"),
        "lf": body.count(b"\n"),
        "final_newline": body.endswith(b"\n"),
    }


def create_new(path: Path, data: bytes) -> None:
    descriptor = os.open(
        path,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0),
        0o600,
    )
    try:
        offset = 0
        while offset < len(data):
            offset += os.write(descriptor, data[offset:])
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def assert_regular_target(target: Path) -> None:
    canonical_root = PROJECT_ROOT.resolve(strict=True)
    canonical_target = target.resolve(strict=True)
    if canonical_target != target or canonical_root not in canonical_target.parents:
        raise RuntimeError(f"canonical target guard failed: {target}")
    item = target.lstat()
    if stat.S_ISLNK(item.st_mode) or not stat.S_ISREG(item.st_mode):
        raise RuntimeError(f"non-regular target refused: {target}")
    attributes = getattr(item, "st_file_attributes", 0)
    if attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400):
        raise RuntimeError(f"reparse target refused: {target}")


def opening_guards() -> None:
    if PROJECT_ROOT.resolve(strict=True) != PROJECT_ROOT:
        raise RuntimeError("project root canonical guard failed")
    if run_git("branch", "--show-current").stdout.strip() != "main":
        raise RuntimeError("branch guard failed")
    if run_git("rev-parse", "HEAD").stdout.strip() != EXPECTED_HEAD:
        raise RuntimeError("HEAD guard failed")
    if run_git("diff", "--cached", "--quiet", check=False).returncode != 0:
        raise RuntimeError("index is not empty")
    if run_git("diff", "--quiet", check=False).returncode != 0:
        raise RuntimeError("tracked worktree changed before repair writer")
    allowed = {
        SCRIPT_RELATIVE,
        ".agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/tooling/f1-repair-attempt-5-r1-writer-escape-repair.py",
        ".agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/tooling/f1-repair-attempt-5-r1-writer-allowlist-repair.py",
        ".agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/f1-executor-report-attempt-5.md",
        ".agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/f1-candidate-review-attempt-5.md",
    }
    status = run_git("status", "--short", "--untracked-files=all").stdout.splitlines()
    observed = {line[3:].replace("\\", "/") for line in status if len(line) >= 4}
    if not observed.issubset(allowed):
        raise RuntimeError(f"unexpected opening status: {sorted(observed - allowed)}")


def main() -> None:
    opening_guards()
    staged: list[dict[str, object]] = []
    installed: list[dict[str, object]] = []
    token = uuid.uuid4().hex
    try:
        for specification in SPECIFICATIONS:
            relative = str(specification["relative"])
            target = PROJECT_ROOT / relative
            assert_regular_target(target)
            original = target.read_bytes()
            prehash = str(specification["prehash"])
            if sha256(original) != prehash:
                raise RuntimeError(f"preimage hash mismatch: {relative}")
            original_profile = profile(original)
            if original_profile["bom"] or original_profile["crlf"] or original_profile["bare_cr"]:
                raise RuntimeError(f"unexpected encoding/newline profile: {relative}")
            text = original.decode("utf-8")
            match_counts: list[int] = []
            for old, new, expected in specification["replacements"]:
                count = text.count(old)
                match_counts.append(count)
                if count != expected:
                    raise RuntimeError(
                        f"match count mismatch: {relative} expected={expected} observed={count}"
                    )
                text = text.replace(old, new, expected)
            transformed = text.encode("utf-8")
            transformed_profile = profile(transformed)
            if (
                transformed_profile["bom"] != original_profile["bom"]
                or transformed_profile["crlf"] != original_profile["crlf"]
                or transformed_profile["bare_cr"] != original_profile["bare_cr"]
                or transformed_profile["final_newline"] != original_profile["final_newline"]
                or transformed == original
            ):
                raise RuntimeError(f"postimage profile/content guard failed: {relative}")
            posthash = sha256(transformed)
            temp = target.with_name(f".codex-temp-f1-repair-r1-{token}-{target.name}")
            backup = target.with_name(
                f".codex-backup-f1-repair-r1-{prehash}-{token}-{target.name}"
            )
            create_new(temp, transformed)
            create_new(backup, original)
            if temp.read_bytes() != transformed or sha256(backup.read_bytes()) != prehash:
                raise RuntimeError(f"staged content guard failed: {relative}")
            diff = run_git(
                "diff", "--no-index", "--", str(backup), str(temp), check=False
            )
            if diff.returncode != 1 or not diff.stdout:
                raise RuntimeError(f"expected diff guard failed: {relative} exit={diff.returncode}")
            staged.append(
                {
                    "id": specification["id"],
                    "relative": relative,
                    "target": target,
                    "temp": temp,
                    "backup": backup,
                    "prehash": prehash,
                    "posthash": posthash,
                    "profile": transformed_profile,
                    "match_counts": match_counts,
                    "diff": diff.stdout,
                }
            )

        for item in staged:
            target = item["target"]
            temp = item["temp"]
            os.replace(temp, target)
            installed.append(item)
            actual = target.read_bytes()
            if sha256(actual) != item["posthash"] or profile(actual) != item["profile"]:
                raise RuntimeError(f"postcondition failed: {item['relative']}")

        final_diff = run_git(
            "diff",
            "--",
            *[str(item["relative"]) for item in staged],
        ).stdout
        if not final_diff:
            raise RuntimeError("final Git diff is empty")
        result = {
            "head": run_git("rev-parse", "HEAD").stdout.strip(),
            "indexEmpty": run_git("diff", "--cached", "--quiet", check=False).returncode == 0,
            "rollback": "not-required",
            "targets": [
                {
                    "id": item["id"],
                    "path": item["relative"],
                    "prehash": item["prehash"],
                    "posthash": item["posthash"],
                    "matchCounts": item["match_counts"],
                    "profile": item["profile"],
                    "stagedDiff": item["diff"],
                }
                for item in staged
            ],
            "gitDiff": final_diff,
        }
        print(json.dumps(result, indent=2, ensure_ascii=False))
    except Exception:
        for item in reversed(installed):
            backup = item["backup"]
            target = item["target"]
            if backup.exists():
                os.replace(backup, target)
            if sha256(target.read_bytes()) != item["prehash"]:
                raise RuntimeError(f"rollback verification failed: {item['relative']}")
        raise
    finally:
        for item in staged:
            for key in ("temp", "backup"):
                residual = item[key]
                if residual.exists():
                    residual.unlink()
        residuals = list(PROJECT_ROOT.rglob(".codex-*-f1-repair-r1-*"))
        if residuals:
            raise RuntimeError(f"writer residuals remain: {residuals}")


if __name__ == "__main__":
    main()
