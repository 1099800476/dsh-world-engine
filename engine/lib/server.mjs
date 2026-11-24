import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { loadWorld, getActiveWorldId, saveConfig, bootstrapWorld, ensureDataLayout } from './config.mjs';
import { createSnapshot, listSnapshots, restoreSnapshot, fullBackup, listBackups, pruneSnapshots } from './snapshot.mjs';
import { getProtagonistState, saveProtagonistState, recentEvents, getNpcStates, getPendingApprovals, clearTimeline, getTimeline, appendTimeline } from './state.mjs';
import { createMemoryAdapter, memorySummary } from './memory.mjs';
import { approvalLinkStatus } from './approval-ws.mjs';
import { runTick, suggestMajor, approveMajor, rejectMajor } from './evolve.mjs';
import { worldNow } from './time.mjs';
import { readJson, log, ensureDir, localIso } from './util.mjs';
import { cfgDir, stateDir, npcStateDir, PACKS_ROOT } from './paths.mjs';
import { settingsPage } from './settings-page.mjs';

function sendJson(res, code, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function sendHtml(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 2 * 1024 * 1024) req.destroy(); });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

function statusPayload() {
  const worldId = getActiveWorldId();
  const world = loadWorld(worldId);
  const st = getProtagonistState(worldId);
  const timeline = getTimeline(worldId);
  const pending = getPendingApprovals(worldId).items.filter((x) => x.status === 'pending');
  const summary = memorySummary(world);
  return {
    ok: true,
    world: { id: worldId, name: world.rules.name, subtitle: world.rules.subtitle || '', tone: world.rules.tone || '' },
    herName: world.rules.herName,
    userName: world.rules.userName,
    now: worldNow(),
    protagonist: st,
    timelineEntries: timeline.entries.length,
    memory: summary,
    pendingApprovals: pending.length,
    evolve: {
      evolutionEnabled: world.evolveRule.evolutionEnabled,
      ticksPerDay: world.evolveRule.ticksPerDay,
      eventDensity: world.evolveRule.eventDensity,
      cooldownDays: world.evolveRule.cooldownDays,
      npcAutonomyEnabled: world.evolveRule.npcAutonomyEnabled,
      proactiveChatEnabled: world.evolveRule.proactiveChatEnabled,
      sharedWorldEnabled: world.evolveRule.sharedWorldEnabled,
      majorApprovalRequired: true
    }
  };
}

function adminConfigPayload() {
  const worldId = getActiveWorldId();
  const world = loadWorld(worldId);
  return {
    ok: true,
    worldId,
    worldRules: {
      herName: world.rules.herName,
      userName: world.rules.userName,
      subtitle: world.rules.subtitle || '',
      tone: world.rules.tone || '',
      presetMemories: world.rules.presetMemories || []
    },
    evolveRule: world.evolveRule,
    npcConfig: world.npcConfig,
    location: world.location,
    eventPool: world.eventPool,
    locked: {
      timeRatio: 1,
      dataRoot: 'E:\\世界存档',
      originalMaleLead: 'none',
      originalLeadPolicy: '原作男主不存在，其位置、戏份、羁绊由用户承接',
      majorApprovalRequired: true,
      bondOwner: 'user'
    },
    snapshots: listSnapshots(worldId).slice(0, 30),
    backups: listBackups(worldId).slice(0, 20)
  };
}

function doReset(worldId, mode) {
  createSnapshot(worldId, `reset-before-${mode}`);
  const state = stateDir(worldId);
  if (mode === 'full') {
    // 全量重置：先清掉配置与状态，再用世界包模板重建（含预置共同回忆）
    fs.rmSync(cfgDir(worldId), { recursive: true, force: true });
    fs.rmSync(state, { recursive: true, force: true });
    fs.rmSync(npcStateDir(worldId), { recursive: true, force: true });
    bootstrapWorld();
    return { ok: true, mode, resetAt: localIso(), note: '配置与状态已恢复到初始世界' };
  }
  // 仅清空演化状态：保留配置、地点、NPC 设置
  clearTimeline(worldId, false);
    const seedState = readJson(path.join(PACKS_ROOT, worldId, 'state', 'protagonist-state.json'), {});
  const world = loadWorld(worldId);
  saveProtagonistState(worldId, {
    ...seedState,
    characterId: world.rules.protagonistCharacterId || 'asuna',
    name: world.rules.herName,
    locationId: (world.location.locations || []).find((l) => l.enabled !== false && !l.backgroundOnly)?.id || seedState.locationId,
    locationName: (world.location.locations || []).find((l) => l.enabled !== false && !l.backgroundOnly)?.name || seedState.locationName,
    mood: '平静', thought: '', fatigue: 40, longing: 50, recentConcerns: []
  });
  fs.writeFileSync(path.join(stateDir(worldId), 'pending-approvals.json'), JSON.stringify({ schemaVersion: 1, items: [] }, null, 2));
  return { ok: true, mode, resetAt: localIso(), note: '时间线与动态状态已清空，配置与设定保留' };
}

export function createServer() {
  const port = Number(process.env.WORLD_ENGINE_PORT || 32100);
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, `http://127.0.0.1:${port}`);
    const p = u.pathname;
    try {
      if (req.method === 'GET' && (p === '/settings' || p === '/admin' || p === '/')) {
        return sendHtml(res, settingsPage());
      }
      if (req.method === 'GET' && p === '/api/status') return sendJson(res, 200, statusPayload());
      if (req.method === 'GET' && p === '/api/world/now') {
        const world = loadWorld(getActiveWorldId());
        return sendJson(res, 200, { ok: true, ...worldNow(), herName: world.rules.herName, userName: world.rules.userName });
      }
      if (req.method === 'GET' && p === '/api/protagonist/status') {
        const worldId = getActiveWorldId();
        const world = loadWorld(worldId);
        const st = getProtagonistState(worldId);
        const recent = recentEvents(worldId, 3).map((e) => ({ at: e.localAt, text: e.text, type: e.type }));
        return sendJson(res, 200, {
          ok: true, characterId: st.characterId, name: world.rules.herName, userName: world.rules.userName,
          location: { id: st.locationId, name: st.locationName },
          mood: st.mood, thought: st.thought, fatigue: st.fatigue, longing: st.longing,
          recentEvents: recent, updatedAt: st.updatedAt,
          proactiveChatEnabled: world.evolveRule.proactiveChatEnabled
        });
      }
      if (req.method === 'GET' && p === '/api/npc/list') {
        const worldId = getActiveWorldId();
        const world = loadWorld(worldId);
        const list = getNpcStates(worldId, world.npcConfig).map((n) => ({
          id: n.id, name: n.name, role: n.role || 'autonomous', enabled: n.enabled !== false,
          frequency: n.frequency || 'normal', note: n.note || '',
          state: n.state
        }));
        return sendJson(res, 200, { ok: true, autonomyEnabled: world.npcConfig.autonomyEnabled !== false, npcs: list });
      }
      if (req.method === 'GET' && p === '/api/latest/events') {
        const limit = Math.max(1, Math.min(100, Number(u.searchParams.get('limit') || 20)));
        const worldId = getActiveWorldId();
        return sendJson(res, 200, { ok: true, count: limit, events: recentEvents(worldId, limit) });
      }
      if (req.method === 'GET' && p === '/api/location/info') {
        const worldId = getActiveWorldId();
        const world = loadWorld(worldId);
        const name = u.searchParams.get('name') || '';
        const id = u.searchParams.get('id') || '';
        const locs = world.location.locations || [];
        let loc = locs.find((l) => l.id === id) || locs.find((l) => l.name === name) || locs.find((l) => name && l.name.includes(name));
        if (!loc) return sendJson(res, 404, { ok: false, error: `未找到地点：${name || id}`, locations: locs.map((l) => l.name) });
        return sendJson(res, 200, { ok: true, ...loc });
      }
      if (p === '/api/backup/full') {
        const r = fullBackup(getActiveWorldId());
        return sendJson(res, 200, { ok: true, ...r });
      }
      if (req.method === 'GET' && p === '/api/backup/list') {
        const worldId = getActiveWorldId();
        return sendJson(res, 200, { ok: true, snapshots: listSnapshots(worldId), backups: listBackups(worldId) });
      }
      if (req.method === 'GET' && p === '/api/admin/config') return sendJson(res, 200, adminConfigPayload());

      if (req.method === 'POST' && p === '/api/admin/config') {
        const body = await readBody(req);
        const saved = saveConfig(getActiveWorldId(), body);
        return sendJson(res, 200, { ok: true, saved, message: '已保存，保存前已自动生成快照', config: adminConfigPayload() });
      }
      if (req.method === 'POST' && p === '/api/evolve/tick') {
        const body = await readBody(req);
        const r = runTick({ force: !!body.force, source: 'api' });
        return sendJson(res, 200, r);
      }
      if (req.method === 'POST' && p === '/api/event/suggest') {
        const body = await readBody(req);
        if (!body.text) return sendJson(res, 400, { ok: false, error: '缺少 text' });
        return sendJson(res, 200, { ok: true, item: suggestMajor(body.text) });
      }
      // 对话摘要回写：二代桥接在自然收尾时把聊天摘要写成一条「共同回忆」进时间线与记忆库。
      // 与重大节点审批不同：这是日常回忆，不进待审批队列；文本由桥接侧脱敏后传入。
      if (req.method === 'POST' && p === '/api/chat/record') {
        const body = await readBody(req);
        const text = String(body.text || '').trim();
        if (!text) return sendJson(res, 400, { ok: false, error: '缺少 text' });
        const worldId = getActiveWorldId();
        const world = loadWorld(worldId);
        const tags = Array.isArray(body.tags) ? body.tags.map(String).filter(Boolean).slice(0, 5) : [];
        const entry = appendTimeline(worldId, {
          type: 'memory',
          category: 'chat',
          actor: world.rules.protagonistCharacterId || 'main',
          visibility: 'shared',
          importance: Math.min(5, Math.max(1, Number(body.importance) || 3)),
          tags: tags.length ? tags : ['聊天回忆'],
          text: text.slice(0, 300)
        });
        createMemoryAdapter(world).append(entry);
        return sendJson(res, 200, { ok: true, entry });
      }
      if (req.method === 'GET' && p === '/api/event/pending') {
        const world = loadWorld(getActiveWorldId());
        return sendJson(res, 200, { ok: true, approval: approvalLinkStatus(world), ...getPendingApprovals(getActiveWorldId()) });
      }
      if (req.method === 'GET' && p === '/api/approval/status') {
        const world = loadWorld(getActiveWorldId());
        return sendJson(res, 200, { ok: true, approval: approvalLinkStatus(world) });
      }
      if (req.method === 'POST' && (p === '/api/event/approve' || p === '/api/event/reject')) {
        const body = await readBody(req);
        if (!body.id) return sendJson(res, 400, { ok: false, error: '缺少 id' });
        const r = p.endsWith('approve') ? approveMajor(body.id) : rejectMajor(body.id);
        return sendJson(res, 200, r);
      }
      if (req.method === 'POST' && p === '/api/backup/rollback') {
        const body = await readBody(req);
        if (!body.snapshot) return sendJson(res, 400, { ok: false, error: '缺少 snapshot' });
        restoreSnapshot(getActiveWorldId(), body.snapshot);
        return sendJson(res, 200, { ok: true, restored: body.snapshot });
      }
      if (req.method === 'POST' && p === '/api/reset') {
        const body = await readBody(req);
        if (body.confirm !== 'RESET') return sendJson(res, 400, { ok: false, error: '需要二次确认：confirm 必须为 RESET' });
        if (!['state', 'full'].includes(body.mode)) return sendJson(res, 400, { ok: false, error: 'mode 必须是 state 或 full' });
        return sendJson(res, 200, doReset(getActiveWorldId(), body.mode));
      }
      if (req.method === 'GET' && p === '/api/memory/search') {
        const world = loadWorld(getActiveWorldId());
        const hits = createMemoryAdapter(world).search(u.searchParams.get('q') || '', { limit: Number(u.searchParams.get('limit') || 10) });
        return sendJson(res, 200, { ok: true, count: hits.length, hits });
      }
      if (req.method === 'GET' && p === '/api/memory/export') {
        const world = loadWorld(getActiveWorldId());
        return sendJson(res, 200, { ok: true, ...createMemoryAdapter(world).exportAll() });
      }
      if (req.method === 'GET' && p === '/api/snapshot/prune') {
        const removed = pruneSnapshots(getActiveWorldId());
        return sendJson(res, 200, { ok: true, removed });
      }
      return sendJson(res, 404, { ok: false, error: `未知路径 ${p}` });
    } catch (e) {
      log('error', `请求处理失败 ${p}`, { err: e.message });
      return sendJson(res, 500, { ok: false, error: e.message });
    }
  });
  return { server, port };
}

export function startServer() {
  ensureDataLayout();
  const { server, port } = createServer();
  server.listen(port, '127.0.0.1', () => {
    log('info', `HTTP 服务已启动：http://127.0.0.1:${port}`);
    log('info', `设置页：http://127.0.0.1:${port}/settings`);
  });
  server.on('error', (e) => {
    log('error', `HTTP 服务异常：${e.message}`, { code: e.code });
    if (e.code === 'EADDRINUSE') log('error', `端口 ${port} 已被占用，请改 WORLD_ENGINE_PORT 或释放端口`);
  });
  return server;
}
