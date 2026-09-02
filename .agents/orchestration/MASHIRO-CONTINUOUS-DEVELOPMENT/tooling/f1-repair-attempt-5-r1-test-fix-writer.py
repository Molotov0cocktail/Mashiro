import hashlib
import json
import os
import stat
import subprocess
import uuid
from pathlib import Path


ROOT = Path(r"D:\Mashiro")
HEAD = "62bc84a14f901e5b283e73572a04930abd7188df"
GIT_PREFIX = [
    r"D:\Git\Git\cmd\git.exe",
    "-c",
    "safe.directory=D:/Mashiro",
]

INTEGRATION = r"""import { describe, expect, it, vi } from 'vitest'
import { registerAssistantIpc } from '../../src/main/ipc/register-assistant-ipc.js'
import { assistantResultSchema, type AssistantResult } from '../../src/shared/assistant-contract.js'
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

function createIpcHarness(service: AssistantService) {
  const listeners = new Map<string, (_event: unknown, input: unknown) => AssistantResult>()
  const ipcMain = {
    handle: vi.fn(
      (
        channel: string,
        listener: (_event: unknown, input: unknown) => AssistantResult
      ): void => {
        listeners.set(channel, listener)
      }
    ),
    removeHandler: vi.fn((channel: string) => listeners.delete(channel))
  }
  const unregister = registerAssistantIpc(ipcMain, service)
  return { listeners, ipcMain, unregister }
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
    const { listeners, ipcMain, unregister } = createIpcHarness(service)

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
        /D:\\|file:\/\/\/|node_modules|SQL|SQLite|stack|secret/iu
      )
    }
    const correlationIds = results.map((result) =>
      result && !result.ok ? result.error.correlationId : undefined
    )
    expect(correlationIds.every((value) => /^[0-9a-f-]{36}$/u.test(value ?? ''))).toBe(true)
    expect(new Set(correlationIds).size).toBe(3)
  })
})
""".encode("utf-8")

UNIT = r"""import { describe, expect, it } from 'vitest'
import {
  assistantResultSchema,
  createInputSchema,
  renameInputSchema
} from '../../src/shared/assistant-contract.js'

describe('assistant input contracts', () => {
  it('rejects unknown fields and malformed protocol data', () => {
    expect(
      createInputSchema.safeParse({
        protocolVersion: 1,
        displayName: 'A',
        expectedStateRevision: 0,
        isPrimary: true
      }).success
    ).toBe(false)
    expect(
      createInputSchema.safeParse({
        protocolVersion: 2,
        displayName: 'A',
        expectedStateRevision: 0
      }).success
    ).toBe(false)
    expect(
      renameInputSchema.safeParse({
        protocolVersion: 1,
        assistantId: 'forged',
        displayName: 'A',
        expectedAssistantVersion: 1,
        expectedStateRevision: 0
      }).success
    ).toBe(false)
  })

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
""".encode("utf-8")

SPECS = [
    {
        "path": "tests/integration/ipc-registration.test.ts",
        "prehash": "b4857d9272aa8db7fe19d57d3d73830bd0c09564df9115e5fc9cdc23005dcd23",
        "postimage": INTEGRATION,
    },
    {
        "path": "tests/unit/assistant-contract.test.ts",
        "prehash": "610e99981a8fbfc3b74526a13e02e62f9ad8f906a61c6502a85ed42208e470cc",
        "postimage": UNIT,
    },
]


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git(*arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        [*GIT_PREFIX, *arguments],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    if check and completed.returncode != 0:
        raise RuntimeError(f"git failed: {arguments} exit={completed.returncode}")
    return completed


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


if git("rev-parse", "HEAD").stdout.strip() != HEAD:
    raise SystemExit("test-fix HEAD guard failed")
if git("diff", "--cached", "--quiet", check=False).returncode != 0:
    raise SystemExit("test-fix index guard failed")
status = git("status", "--short", "--untracked-files=all").stdout
allowed_paths = {
    "scripts/electron-f1-harness.mjs",
    "src/main/index.ts",
    "src/main/ipc/register-assistant-ipc.ts",
    "src/shared/assistant-contract.ts",
    "tests/integration/ipc-registration.test.ts",
    "tests/unit/assistant-contract.test.ts",
    ".agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/f1-candidate-review-attempt-5.md",
    ".agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/f1-executor-report-attempt-5.md",
    ".agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/tooling/f1-repair-attempt-5-r1-writer.py",
    ".agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/tooling/f1-repair-attempt-5-r1-writer-escape-repair.py",
    ".agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/tooling/f1-repair-attempt-5-r1-writer-allowlist-repair.py",
    ".agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/tooling/f1-repair-attempt-5-r1-test-fix-writer.py",
}
observed_paths = {line[3:].replace("\\", "/") for line in status.splitlines() if len(line) >= 4}
if not observed_paths.issubset(allowed_paths):
    raise SystemExit(f"test-fix status guard failed: {sorted(observed_paths - allowed_paths)}")

token = uuid.uuid4().hex
staged = []
installed = []
try:
    for spec in SPECS:
        target = ROOT / spec["path"]
        canonical = target.resolve(strict=True)
        item = target.lstat()
        if canonical != target or stat.S_ISLNK(item.st_mode) or not stat.S_ISREG(item.st_mode):
            raise RuntimeError(f"test-fix target guard failed: {spec['path']}")
        if getattr(item, "st_file_attributes", 0) & getattr(
            stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400
        ):
            raise RuntimeError(f"test-fix reparse target refused: {spec['path']}")
        original = target.read_bytes()
        postimage = spec["postimage"]
        if digest(original) != spec["prehash"]:
            raise RuntimeError(f"test-fix prehash mismatch: {spec['path']}")
        if (
            original.startswith(b"\xef\xbb\xbf")
            or b"\r" in original
            or not original.endswith(b"\n")
            or postimage.startswith(b"\xef\xbb\xbf")
            or b"\r" in postimage
            or not postimage.endswith(b"\n")
            or postimage == original
        ):
            raise RuntimeError(f"test-fix profile/content guard failed: {spec['path']}")
        temp = target.with_name(f".codex-temp-f1-repair-test-{token}-{target.name}")
        backup = target.with_name(
            f".codex-backup-f1-repair-test-{spec['prehash']}-{token}-{target.name}"
        )
        create_new(temp, postimage)
        create_new(backup, original)
        if temp.read_bytes() != postimage or digest(backup.read_bytes()) != spec["prehash"]:
            raise RuntimeError(f"test-fix staging failed: {spec['path']}")
        diff = git("diff", "--no-index", "--", str(backup), str(temp), check=False)
        if diff.returncode != 1 or not diff.stdout:
            raise RuntimeError(f"test-fix diff guard failed: {spec['path']}")
        staged.append(
            {
                **spec,
                "target": target,
                "temp": temp,
                "backup": backup,
                "posthash": digest(postimage),
                "diff": diff.stdout,
            }
        )
    for item in staged:
        os.replace(item["temp"], item["target"])
        installed.append(item)
        if digest(item["target"].read_bytes()) != item["posthash"]:
            raise RuntimeError(f"test-fix postcondition failed: {item['path']}")
    print(
        json.dumps(
            {
                "head": HEAD,
                "indexEmpty": True,
                "rollback": "not-required",
                "targets": [
                    {
                        "path": item["path"],
                        "prehash": item["prehash"],
                        "posthash": item["posthash"],
                        "matchCount": 1,
                        "diff": item["diff"],
                    }
                    for item in staged
                ],
            },
            indent=2,
        )
    )
except Exception:
    for item in reversed(installed):
        os.replace(item["backup"], item["target"])
        if digest(item["target"].read_bytes()) != item["prehash"]:
            raise RuntimeError(f"test-fix rollback failed: {item['path']}")
    raise
finally:
    for item in staged:
        for key in ("temp", "backup"):
            path = item[key]
            if path.exists():
                path.unlink()
    residuals = list(ROOT.rglob(".codex-*-f1-repair-test-*"))
    if residuals:
        raise RuntimeError(f"test-fix residuals remain: {residuals}")
