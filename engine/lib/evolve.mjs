import { loadWorld, getActiveWorldId } from './config.mjs';
import { createSnapshot } from './snapshot.mjs';
import { createMemoryAdapter } from './memory.mjs';
import { pushApproval, reportDecision, approvalCode } from './notify.mjs';
import { getRuntime, saveRuntime, getProtagonistState, saveProtagonistState, appendTimeline, saveNpcState, getPendingApprovals, savePendingApprovals } from './state.mjs';
import { dateKey, pick, weightedPick, log, uid } from './util.mjs';
import { worldNow } from './time.mjs';

const DENSITY_P = { low: 0.35, normal: 0.6, high: 0.85 };
const DENSITY_MAX = { low: 1, normal: 2, high: 3 };
const FREQ_WEIGHT = { low: 1, normal: 2, high: 3 };

let timer = null;

function ensureRuntime(worldId, rt) {
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (rt.dateKey !== key) {
    rt.dateKey = key;
    rt.eventsToday = 0;
  }
  rt.lastCategoryAt = rt.lastCategoryAt || {};
  rt.lastNpcEventAt = rt.lastNpcEventAt || {};
  return rt;
}

function cooldownOk(lastAt, days) {
  if (!lastAt) return true;
  return (Date.now() - new Date(lastAt).getTime()) / 86400000 >= Number(days || 1);
}

// 状态缓慢漂移：心情、疲惫、位置、心事，不在一次 tick 内骤变
function driftState(world, state, text) {
  const rules = world.rules;
  const moods = rules.moods || ['平静'];
  const next = { ...state };
  if (Math.random() < 0.35) next.mood = pick(moods);
  const df = (Math.random() - 0.45) * 8;
  next.fatigue = Math.min(100, Math.max(0, Math.round((Number(next.fatigue ?? 40) + df) * 10) / 10));
  if (text && Math.random() < 0.5) next.thought = text;
  if (Math.random() < 0.12) {
    const locs = (world.location.locations || []).filter((l) => l.enabled !== false && !l.backgroundOnly);
    if (locs.length) {
      const loc = pick(locs);
      next.locationId = loc.id;
      next.locationName = loc.name;
    }
  }
  if (typeof next.longing === 'number') {
    next.longing = Math.min(100, Math.max(0, Math.round((next.longing + (Math.random() - 0.5) * 6) * 10) / 10));
  }
  return next;
}

function pickCategory(world, rt) {
  const pool = (world.eventPool.categories || []).filter((c) => c.enabled !== false);
  const ok = pool.filter((c) => cooldownOk(rt.lastCategoryAt[c.id], world.evolveRule.cooldownDays));
  return weightedPick(ok, (c) => c.weight ?? 1);
}

export function runTick({ force = false, source = 'scheduler' } = {}) {
  const worldId = getActiveWorldId();
  const world = loadWorld(worldId);
  const rule = world.evolveRule;
  let rt = ensureRuntime(worldId, getRuntime(worldId));

  if (!rule.evolutionEnabled && !force) {
    return { ok: true, skipped: 'evolution-disabled' };
  }
  const density = rule.eventDensity || 'normal';
  const maxEvents = DENSITY_MAX[density] ?? 2;
  if (!force && rt.eventsToday >= maxEvents) return { ok: true, skipped: 'daily-cap', eventsToday: rt.eventsToday };
  if (!force && Math.random() > (DENSITY_P[density] ?? 0.6)) {
    rt.lastTickAt = new Date().toISOString();
    saveRuntime(worldId, rt);
    return { ok: true, skipped: 'chance', density };
  }

  const produced = [];
  const memory = createMemoryAdapter(world);

  // 1) 日常小事
  if (rule.randomEventsEnabled !== false) {
    const cat = pickCategory(world, rt);
    if (cat) {
      createSnapshot(worldId, 'evolve-tick');
      const now = worldNow();
      const text = pick(cat.texts || ['平常的一天就这样过去']);
      const entry = appendTimeline(worldId, {
        type: 'daily', category: cat.id, actor: world.rules.protagonistCharacterId || 'main',
        visibility: 'shared', importance: cat.importance || 2, tags: [cat.label || cat.id],
        text
      });
      memory.append(entry);
      const st = getProtagonistState(worldId);
      saveProtagonistState(worldId, driftState(world, st, text));
      rt.lastCategoryAt[cat.id] = new Date().toISOString();
      rt.eventsToday += 1;
      produced.push(entry);
      log('info', `演化产出日常事件（${cat.id}）`, { text: text.slice(0, 30) });
    }
  }

  // 2) NPC 自主轻剧情
  if (rule.npcAutonomyEnabled !== false && world.npcConfig.autonomyEnabled !== false) {
    const npcs = (world.npcConfig.npcs || []).filter((n) => n.role !== 'background' && n.enabled !== false);
    const eligible = npcs.filter((n) => cooldownOk(rt.lastNpcEventAt[n.id], world.evolveRule.cooldownDays) && cooldownOk(n.state?.lastEventAt, world.evolveRule.cooldownDays));
    if (eligible.length && Math.random() < 0.45) {
      const npc = weightedPick(eligible, (n) => FREQ_WEIGHT[n.frequency] ?? 2);
      if (npc) {
        if (!produced.length) createSnapshot(worldId, 'evolve-npc');
        const text = pick(npc.templates || ['她发来一条轻轻的问候']);
        const body = String(text).includes(npc.name) ? String(text) : `${npc.name}：${text}`;
        const entry = appendTimeline(worldId, {
          type: 'npc', category: `npc:${npc.id}`, actor: npc.id, visibility: 'shared',
          importance: 2, tags: [npc.name], text: body
        });
        memory.append(entry);
        saveNpcState(worldId, npc.id, { lastEventAt: new Date().toISOString(), lastInteractionAt: new Date().toISOString() });
        rt.lastNpcEventAt[npc.id] = new Date().toISOString();
        rt.eventsToday += 1;
        produced.push(entry);
      }
    }
  }

  rt.lastTickAt = new Date().toISOString();
  saveRuntime(worldId, rt);
  return { ok: true, produced: produced.map((e) => ({ id: e.id, type: e.type, text: e.text, category: e.category })), density, eventsToday: rt.eventsToday };
}

// 重大节点：只生成预案，写入 pending-approvals.json，等用户确认后才进世界线
export function suggestMajor(text) {
  const worldId = getActiveWorldId();
  const world = loadWorld(worldId);
  const obj = getPendingApprovals(worldId);
  const item = { id: uid('ap'), code: uid('').slice(-4), at: new Date().toISOString(), text: String(text || '').trim(), status: 'pending', worldId };
  obj.items.push(item);
  savePendingApprovals(worldId, obj);
  log('info', '重大节点预案已生成，等待审批', { id: item.id, code: item.code });
  pushApproval(world, item).catch(() => {});
  return item;
}

export function approveMajor(id) {
  const worldId = getActiveWorldId();
  const world = loadWorld(worldId);
  const obj = getPendingApprovals(worldId);
  const item = obj.items.find((x) => x.id === id);
  if (!item) throw new Error(`审批项不存在：${id}`);
  if (item.status !== 'pending') throw new Error(`审批项状态为 ${item.status}，不能重复写入`);
  createSnapshot(worldId, 'major-approve');
  item.status = 'approved';
  item.approvedAt = new Date().toISOString();
  savePendingApprovals(worldId, obj);
  const entry = appendTimeline(worldId, {
    type: 'major', category: 'main-line', actor: world.rules.protagonistCharacterId || 'main',
    visibility: 'shared', importance: 5, tags: ['重大节点'], text: item.text
  });
  createMemoryAdapter(world).append(entry);
  reportDecision(world, item, 'approved').catch(() => {});
  return { ok: true, entry };
}

export function rejectMajor(id) {
  const worldId = getActiveWorldId();
  const obj = getPendingApprovals(worldId);
  const item = obj.items.find((x) => x.id === id);
  if (!item) throw new Error(`审批项不存在：${id}`);
  item.status = 'rejected';
  item.rejectedAt = new Date().toISOString();
  savePendingApprovals(worldId, obj);
  const world = loadWorld(worldId);
  reportDecision(world, item, 'rejected').catch(() => {});
  return { ok: true, item };
}

// 每天 ticksPerDay 次评估；间隔按 24h / ticksPerDay，最少 30 分钟
export function startScheduler() {
  if (timer) return;
  try {
    const rule = loadWorld(getActiveWorldId()).evolveRule;
    const ticks = Math.max(1, Math.min(24, Number(rule.ticksPerDay) || 2));
    const interval = Math.max(30 * 60 * 1000, (24 * 60 * 60 * 1000) / ticks);
    timer = setInterval(() => {
      try { runTick({ source: 'scheduler' }); } catch (e) { log('error', '定时演化失败', { err: e.message }); }
    }, interval);
    if (timer.unref) timer.unref();
    log('info', `自演化调度已启动：每天 ${ticks} 次，间隔 ${(interval / 3600000).toFixed(1)} 小时`);
  } catch (e) {
    log('error', '调度启动失败，世界引擎其余功能继续运行', { err: e.message });
  }
}

export function stopScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}
