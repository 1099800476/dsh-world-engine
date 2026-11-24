import fs from 'node:fs';
import path from 'node:path';
import {
  DATA_ROOT, PACKS_ROOT, CODE_ROOT, activeFile, cfgDir, stateDir, npcStateDir,
  snapshotDir, backupDir, memoryExportDir, worldDir, CONFIG_FILES
} from './paths.mjs';
import { ensureDir, readJson, writeJson, log, uid, copyFileIfMissing } from './util.mjs';
import { createSnapshot } from './snapshot.mjs';

export const CURRENT_SCHEMA = 1;
const DEFAULT_PACK = 'sao';

export function ensureDataLayout() {
  ensureDir(DATA_ROOT);
  ensureDir(path.join(DATA_ROOT, 'worlds'));
  ensureDir(path.join(DATA_ROOT, 'logs'));
}

export function readActive() {
  const a = readJson(activeFile(), null);
  if (!a || !a.active) return { active: DEFAULT_PACK, schemaVersion: CURRENT_SCHEMA };
  return a;
}

export function getActiveWorldId() {
  return readActive().active;
}

function copyIfMissing(src, dst) {
  return copyFileIfMissing(src, dst);
}

// 只在“数据目录完全不存在”时生成默认世界；已有数据一律跳过，绝不重置
export function bootstrapWorld({ packId = null } = {}) {
  ensureDataLayout();
  let created = false;
  if (!fs.existsSync(activeFile())) {
    const active = { schemaVersion: CURRENT_SCHEMA, active: packId || DEFAULT_PACK };
    writeJson(activeFile(), active);
    created = true;
    log('info', `已创建 active.json，当前世界包：${active.active}`);
  }
  const id = getActiveWorldId();
  const seed = path.join(PACKS_ROOT, id);
  if (!fs.existsSync(seed)) throw new Error(`缺少世界包模板：${seed}`);

  const wdir = worldDir(id);
  if (!fs.existsSync(wdir)) {
    ensureDir(cfgDir(id));
    ensureDir(stateDir(id));
    ensureDir(npcStateDir(id));
    ensureDir(snapshotDir(id));
    ensureDir(backupDir(id));
    ensureDir(memoryExportDir(id));
    for (const f of CONFIG_FILES) copyIfMissing(path.join(seed, 'config', f), path.join(cfgDir(id), f));
    copyIfMissing(path.join(seed, 'state', 'protagonist-state.json'), path.join(stateDir(id), 'protagonist-state.json'));
    log('info', `首次初始化世界包 ${id}：配置与初始状态已写入 ${wdir}`);
    created = true;
  } else {
    for (const f of CONFIG_FILES) copyIfMissing(path.join(seed, 'config', f), path.join(cfgDir(id), f));
    log('info', `世界包 ${id} 已存在，跳过初始化`);
  }

  // 初始时间线：只在没有时间线文件时生成（含预置共同回忆）
  const timelinePath = path.join(stateDir(id), 'world-timeline.json');
  if (!fs.existsSync(timelinePath)) {
    const rules = readJson(path.join(cfgDir(id), 'world-rules.json'), {});
    const entries = buildPresetMemories(rules);
    writeJson(timelinePath, { schemaVersion: CURRENT_SCHEMA, entries, updatedAt: new Date().toISOString() });
    log('info', `初始时间线已生成，预置共同回忆 ${entries.length} 条`);
    created = true;
  }
  if (!fs.existsSync(path.join(stateDir(id), 'runtime.json'))) {
    writeJson(path.join(stateDir(id), 'runtime.json'), { schemaVersion: CURRENT_SCHEMA, dateKey: '', eventsToday: 0, lastTickAt: null, lastCategoryAt: {}, lastNpcEventAt: {}, lastProactiveAt: null });
  }
  if (!fs.existsSync(path.join(stateDir(id), 'pending-approvals.json'))) {
    writeJson(path.join(stateDir(id), 'pending-approvals.json'), { schemaVersion: CURRENT_SCHEMA, items: [] });
  }
  for (const npc of (readJson(path.join(cfgDir(id), 'npc-config.json'), { npcs: [] }).npcs || [])) {
    const f = path.join(npcStateDir(id), `${npc.id}.json`);
    if (!fs.existsSync(f)) {
      writeJson(f, {
        schemaVersion: CURRENT_SCHEMA, id: npc.id, name: npc.name,
        locationId: 'alo-grove', mood: '平静', lastInteractionAt: null, lastEventAt: null
      });
    }
  }
  return { created, worldId: id };
}

function buildPresetMemories(rules) {
  const now = new Date();
  const list = Array.isArray(rules.presetMemories) ? rules.presetMemories : [];
  return list.map((m) => {
    const daysAgo = Number.isFinite(m.daysAgo) ? m.daysAgo : 30;
    const at = new Date(now.getTime() - daysAgo * 86400000);
    return {
      id: m.id || uid('tl'),
      at: at.toISOString(),
      localAt: localOf(at),
      type: 'memory',
      category: 'preset-memory',
      actor: rules.protagonistCharacterId || 'main',
      visibility: 'shared',
      importance: Number(m.importance || 4),
      text: m.text,
      tags: Array.isArray(m.tags) ? m.tags : ['共同回忆'],
      preset: true
    };
  });
}

function localOf(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function migrateConfig(kind, data, file) {
  const v = Number(data.schemaVersion || 0);
  if (v === 0) { data.schemaVersion = CURRENT_SCHEMA; return data; }
  if (v > CURRENT_SCHEMA) {
    throw new Error(`${file} 的 schemaVersion=${v} 高于引擎当前版本 ${CURRENT_SCHEMA}，已停止写入，等待人工处理`);
  }
  if (v < CURRENT_SCHEMA) {
    log('warn', `${file} 版本 ${v} < ${CURRENT_SCHEMA}，执行自动迁移（字段只增不删）`);
    data.schemaVersion = CURRENT_SCHEMA;
  }
  return data;
}

export function loadWorld(worldId = getActiveWorldId()) {
  const cd = cfgDir(worldId);
  const read = (name) => {
    const data = readJson(path.join(cd, name), null);
    if (!data) throw new Error(`缺少配置文件 ${path.join(cd, name)}`);
    return migrateConfig('config', data, name);
  };
  const world = {
    worldId,
    dir: worldDir(worldId),
    rules: read('world-rules.json'),
    npcConfig: read('npc-config.json'),
    location: read('location.json'),
    evolveRule: read('evolve-rule.json'),
    eventPool: read('event-pool.json')
  };
  return world;
}

// 设置页可写的字段白名单（法则层字段永不开放）
const EDITABLE_RULE_FIELDS = ['herName', 'userName', 'subtitle', 'tone', 'presetMemories'];

export function saveConfig(worldId, payload) {
  createSnapshot(worldId, 'config-save');
  const saved = [];
  if (payload.worldRules) {
    const cur = readJson(path.join(cfgDir(worldId), 'world-rules.json'));
    for (const k of EDITABLE_RULE_FIELDS) {
      if (payload.worldRules[k] !== undefined) cur[k] = payload.worldRules[k];
    }
    writeJson(path.join(cfgDir(worldId), 'world-rules.json'), cur);
    saved.push('world-rules.json');
  }
  if (payload.evolveRule) {
    const cur = readJson(path.join(cfgDir(worldId), 'evolve-rule.json'));
    const allowed = ['evolutionEnabled', 'ticksPerDay', 'eventDensity', 'cooldownDays', 'randomEventsEnabled', 'npcAutonomyEnabled', 'proactiveChatEnabled', 'sharedWorldEnabled'];
    for (const k of allowed) if (payload.evolveRule[k] !== undefined) cur[k] = payload.evolveRule[k];
    cur.majorApprovalRequired = true; // 锁定
    writeJson(path.join(cfgDir(worldId), 'evolve-rule.json'), cur);
    saved.push('evolve-rule.json');
  }
  if (payload.npcConfig) {
    writeJson(path.join(cfgDir(worldId), 'npc-config.json'), { ...payload.npcConfig, schemaVersion: CURRENT_SCHEMA });
    saved.push('npc-config.json');
  }
  if (payload.location) {
    writeJson(path.join(cfgDir(worldId), 'location.json'), { ...payload.location, schemaVersion: CURRENT_SCHEMA });
    saved.push('location.json');
  }
  log('info', '设置已保存', { saved });
  return saved;
}

export function runtimePaths() {
  return { DATA_ROOT, PACKS_ROOT, CODE_ROOT };
}
