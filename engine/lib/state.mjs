import fs from 'node:fs';
import path from 'node:path';
import { stateDir, npcStateDir } from './paths.mjs';
import { readJson, writeJson, uid, localIso, log } from './util.mjs';
import { CURRENT_SCHEMA } from './config.mjs';

const p = (worldId, name) => path.join(stateDir(worldId), name);

export function getTimeline(worldId) {
  return readJson(p(worldId, 'world-timeline.json'), { schemaVersion: CURRENT_SCHEMA, entries: [] });
}

export function getProtagonistState(worldId) {
  return readJson(p(worldId, 'protagonist-state.json'), null);
}

export function saveProtagonistState(worldId, state) {
  writeJson(p(worldId, 'protagonist-state.json'), { ...state, schemaVersion: CURRENT_SCHEMA, updatedAt: localIso() });
}

export function getRuntime(worldId) {
  return readJson(p(worldId, 'runtime.json'), { schemaVersion: CURRENT_SCHEMA, dateKey: '', eventsToday: 0, lastTickAt: null, lastCategoryAt: {}, lastNpcEventAt: {}, lastProactiveAt: null });
}

export function saveRuntime(worldId, rt) {
  writeJson(p(worldId, 'runtime.json'), { ...rt, schemaVersion: CURRENT_SCHEMA });
}

export function getNpcStates(worldId, npcConfig) {
  const out = [];
  for (const npc of (npcConfig.npcs || [])) {
    const f = path.join(npcStateDir(worldId), `${npc.id}.json`);
    const st = readJson(f, { id: npc.id, name: npc.name, locationId: 'alo-grove', mood: '平静', lastInteractionAt: null, lastEventAt: null });
    out.push({ ...npc, state: st });
  }
  return out;
}

export function saveNpcState(worldId, id, patch) {
  const f = path.join(npcStateDir(worldId), `${id}.json`);
  const cur = readJson(f, { id });
  writeJson(f, { ...cur, ...patch, schemaVersion: CURRENT_SCHEMA });
}

// 追加时间线：只追加，不覆盖历史
export function appendTimeline(worldId, entry) {
  const tl = getTimeline(worldId);
  const row = {
    id: uid('tl'),
    at: new Date().toISOString(),
    localAt: localIso().replace('T', ' ').slice(0, 19),
    visibility: 'shared',
    importance: 2,
    tags: [],
    ...entry
  };
  tl.entries.push(row);
  tl.updatedAt = new Date().toISOString();
  writeJson(p(worldId, 'world-timeline.json'), tl);
  log('info', `时间线新增：${String(row.text).slice(0, 40)}`);
  return row;
}

export function recentEvents(worldId, limit = 20) {
  const tl = getTimeline(worldId);
  return tl.entries.slice(-limit).reverse();
}

export function eventsToday(worldId) {
  const key = localIso().slice(0, 10);
  return getTimeline(worldId).entries.filter((e) => (e.localAt || '').slice(0, 10) === key && e.type !== 'memory');
}

export function getPendingApprovals(worldId) {
  return readJson(p(worldId, 'pending-approvals.json'), { schemaVersion: CURRENT_SCHEMA, items: [] });
}

export function savePendingApprovals(worldId, obj) {
  writeJson(p(worldId, 'pending-approvals.json'), { ...obj, schemaVersion: CURRENT_SCHEMA });
}

export function clearTimeline(worldId, keepPreset = false) {
  const tl = getTimeline(worldId);
  tl.entries = keepPreset ? tl.entries.filter((e) => e.preset) : [];
  tl.updatedAt = new Date().toISOString();
  writeJson(p(worldId, 'world-timeline.json'), tl);
  return tl.entries.length;
}
