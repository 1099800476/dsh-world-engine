import fs from 'node:fs';
import path from 'node:path';
import { snapshotDir, backupDir, cfgDir, stateDir, npcStateDir } from './paths.mjs';
import { ensureDir, readJson, writeJson, log, uid, stampKey, copyDir } from './util.mjs';

function copyStateAndConfig(worldId, targetDir) {
  copyDir(cfgDir(worldId), path.join(targetDir, 'config'));
  copyDir(stateDir(worldId), path.join(targetDir, 'state'));
}

// 整包快照：改动前先打包 config + state，可回滚
export function createSnapshot(worldId, reason = 'manual', { milestone = false } = {}) {
  const dir = snapshotDir(worldId);
  ensureDir(dir);
  const name = `snapshot-${stampKey()}-${Math.random().toString(36).slice(2, 6)}`;
  const target = path.join(dir, name);
  ensureDir(target);
  copyStateAndConfig(worldId, target);
  writeJson(path.join(target, 'meta.json'), {
    schemaVersion: 1,
    name,
    reason,
    milestone,
    createdAt: new Date().toISOString(),
    files: { config: true, state: true }
  });
  log('info', `快照已生成：${name}（${reason}）`);
  try { pruneSnapshots(worldId); } catch (e) { log('warn', '快照清理失败', { err: e.message }); }
  return name;
}

export function listSnapshots(worldId) {
  const dir = snapshotDir(worldId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((n) => n.startsWith('snapshot-'))
    .map((n) => {
      const meta = readJson(path.join(dir, n, 'meta.json'), {});
      return { name: n, createdAt: meta.createdAt || null, reason: meta.reason || '', milestone: !!meta.milestone };
    })
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

// 归档策略：近7天全留；7~30天每日一份；30天以上每周一份；超90天清理；里程碑永久保留
export function pruneSnapshots(worldId) {
  const dir = snapshotDir(worldId);
  const now = Date.now();
  const list = listSnapshots(worldId);
  const keep = new Set();
  const dayBuckets = new Map();
  const weekBuckets = new Map();
  for (const s of list) {
    if (s.milestone) { keep.add(s.name); continue; }
    const t = s.createdAt ? new Date(s.createdAt).getTime() : now;
    const ageDays = (now - t) / 86400000;
    if (ageDays <= 7) { keep.add(s.name); continue; }
    if (ageDays <= 30) {
      const key = s.createdAt.slice(0, 10);
      if (!dayBuckets.has(key)) { dayBuckets.set(key, s); keep.add(s.name); }
      continue;
    }
    if (ageDays <= 90) {
      const d = new Date(t);
      const weekKey = `${d.getFullYear()}-${Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 604800000)}`;
      if (!weekBuckets.has(weekKey)) { weekBuckets.set(weekKey, s); keep.add(s.name); }
      continue;
    }
    // 超过 90 天：不保留
  }
  let removed = 0;
  for (const s of list) {
    if (keep.has(s.name)) continue;
    try { fs.rmSync(path.join(dir, s.name), { recursive: true, force: true }); removed++; } catch {}
  }
  if (removed) log('info', `快照归档清理 ${removed} 份`);
  return removed;
}

export function restoreSnapshot(worldId, name) {
  const src = path.join(snapshotDir(worldId), name);
  if (!fs.existsSync(src)) throw new Error(`快照不存在：${name}`);
  // 回滚前先存一份当前状态，防止误回滚
  createSnapshot(worldId, 'before-rollback');
  copyDir(path.join(src, 'config'), cfgDir(worldId));
  copyDir(path.join(src, 'state'), stateDir(worldId));
  log('warn', `已回滚到快照：${name}`);
  return true;
}

// 手动全量备份：整套世界数据打包成 JSON（含时间线、配置、NPC 状态），存 backups/
export function fullBackup(worldId) {
  const dir = backupDir(worldId);
  ensureDir(dir);
  const name = `backup-${stampKey()}.json`;
  const timeline = readJson(path.join(stateDir(worldId), 'world-timeline.json'), { entries: [] });
  const configs = {};
  for (const f of fs.readdirSync(cfgDir(worldId)).filter((n) => n.endsWith('.json') && !n.endsWith('.bak'))) {
    configs[f] = readJson(path.join(cfgDir(worldId), f), null);
  }
  const states = {};
  for (const f of fs.readdirSync(stateDir(worldId)).filter((n) => n.endsWith('.json') && !n.endsWith('.bak'))) {
    states[f] = readJson(path.join(stateDir(worldId), f), null);
  }
  const npcStates = {};
  if (fs.existsSync(npcStateDir(worldId))) {
    for (const f of fs.readdirSync(npcStateDir(worldId)).filter((n) => n.endsWith('.json') && !n.endsWith('.bak'))) {
      npcStates[f] = readJson(path.join(npcStateDir(worldId), f), null);
    }
  }
  const pack = {
    schemaVersion: 1,
    worldId,
    createdAt: new Date().toISOString(),
    configs, states, npcStates,
    timeline
  };
  fs.writeFileSync(path.join(dir, name), JSON.stringify(pack, null, 2), 'utf8');
  log('info', `全量备份完成：${name}`);
  return { name, path: path.join(dir, name), entries: (timeline.entries || []).length };
}

export function listBackups(worldId) {
  const dir = backupDir(worldId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => n.startsWith('backup-')).sort().reverse()
    .map((n) => ({ name: n, size: fs.statSync(path.join(dir, n)).size }));
}
