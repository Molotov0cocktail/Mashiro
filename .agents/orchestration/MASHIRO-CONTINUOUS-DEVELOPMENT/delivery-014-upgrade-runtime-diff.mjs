import { createHash } from "node:crypto";
import console from "node:console";
import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import process from "node:process";
import { URL } from "node:url";

const scene =
  "C:/Users/30910/AppData/Local/Temp/mashiro-install-full-Zbzmgp";
const prePath = `${scene}/完整备份-升级前全域-v5-03/payload/mashiro.sqlite`;
const currentPath = `${scene}/全域 合成数据/mashiro.sqlite`;
const outputPath = new URL(
  "./delivery-014-upgrade-runtime-diff.json",
  import.meta.url,
);

function digest(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function read(path) {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const daily = database
      .prepare(
        "SELECT id, assistant_id, feature, record_json, next_run, last_tick FROM daily_configs ORDER BY id",
      )
      .all()
      .map((row) => ({
        id: row.id,
        assistantId: row.assistant_id,
        feature: row.feature,
        recordSha256: digest(row.record_json),
        nextRun: row.next_run,
        lastTick: row.last_tick,
      }));
    const reminderSettings = database
      .prepare("SELECT version, policy_json FROM reminder_settings")
      .all()
      .map((row) => ({
        version: row.version,
        policySha256: digest(row.policy_json),
      }));
    return { daily, reminderSettings };
  } finally {
    database.close();
  }
}

const before = read(prePath);
const current = read(currentPath);
const result = {
  scope: "schema-15 backup versus current schema-18 synthetic data; no body or credential content",
  observedAt: new Date().toISOString(),
  before,
  current,
  comparison: {
    dailyRecordUnchanged:
      before.daily.length === current.daily.length &&
      before.daily.every((row, index) => {
        const other = current.daily[index];
        return (
          row.id === other.id &&
          row.assistantId === other.assistantId &&
          row.feature === other.feature &&
          row.recordSha256 === other.recordSha256
        );
      }),
    dailyOnlyLastTickChanged:
      before.daily.length === current.daily.length &&
      before.daily.every((row, index) => {
        const other = current.daily[index];
        return (
          row.id === other.id &&
          row.assistantId === other.assistantId &&
          row.feature === other.feature &&
          row.recordSha256 === other.recordSha256 &&
          row.nextRun === other.nextRun &&
          row.lastTick !== other.lastTick
        );
      }),
    reminderSettingsChanged:
      JSON.stringify(before.reminderSettings) !== JSON.stringify(current.reminderSettings),
  },
  externalCalls: 0,
  credentialContentRead: false,
  personalDataAccessed: false,
};

writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify({
    output: outputPath.pathname,
    comparison: result.comparison,
  }),
);
process.exitCode = result.comparison.dailyOnlyLastTickChanged ? 0 : 1;
