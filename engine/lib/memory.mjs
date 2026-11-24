import fs from 'node:fs';
import path from 'node:path';
import { memoryExportDir, worldDir } from './paths.mjs';
import { ensureDir, appendJsonl, readJson, log, uid, dateKey } from './util.mjs';

// 记忆适配器：对外只暴露 append / search / export
// 当前后端接现有本地文件 vector-memory.jsonl；以后换 Qdrant 只替换本文件，引擎其余代码不动
export function createMemoryAdapter(world) {
  const cfg = world.rules.memory || {};
  const backend = cfg.adapter || 'local-jsonl';
  // 未配置 path 时回落到存档目录内的默认记忆文件，保证全新安装开箱可用
  const file = cfg.path || path.join(worldDir(world.worldId), 'memory', `vector-memory-${world.worldId}.jsonl`);
  const partition = cfg.partition || 'world';

  function blocked(text) {
    const words = world.rules.blockedWords || [];
    return words.some((w) => w && String(text).includes(w));
  }

  function append(entry) {
    if (blocked(entry.text)) {
      log('warn', '记忆写入被屏蔽词拦截', { text: String(entry.text).slice(0, 30) });
      return { skipped: true, reason: 'blocked-word' };
    }
    const imp = Math.min(5, Math.max(1, Number(entry.importance || 2)));
    const record = {
      id: uid('vm'),
      text: entry.text,
      title: `${world.rules.herName || '世界'} · ${entry.category || '世界事件'}· ${String(entry.text).slice(0, 36)}`,
      platform: 'world',
      scope: 'shared',
      source: 'world-event',
      sourceId: entry.id || '',
      speaker: world.rules.herName || '',
      senderId: '',
      groupId: '',
      conversationKey: `world:${world.worldId}`,
      isOwner: false,
      isSelf: true,
      private: entry.visibility === 'private',
      important: imp >= 4,
      direct: false,
      importance: imp * 20,
      sensitive: false,
      createdAt: new Date().toISOString(),
      tags: [world.worldId, entry.category || 'world-event'],
      partition,
      category: entry.category || 'world-event',
      worldPackId: world.worldId,
      memoryType: entry.type || 'event'
    };
    ensureDir(path.dirname(file));
    appendJsonl(file, record);
    return { skipped: false, record };
  }

  function search(query, { limit = 10, category = null } = {}) {
    if (!file || !fs.existsSync(file)) return [];
    const q = String(query || '').trim();
    const hits = [];
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (let i = lines.length - 1; i >= 0 && hits.length < limit; i--) {
      const line = lines[i];
      if (!line || !line.includes('"world-event"')) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      if (rec.source !== 'world-event' || rec.worldPackId !== world.worldId) continue;
      if (category && rec.category !== category) continue;
      if (q && !(String(rec.text || '').includes(q) || String(rec.title || '').includes(q))) continue;
      hits.push(rec);
    }
    return hits;
  }

  function exportAll() {
    const dir = memoryExportDir(world.worldId);
    ensureDir(dir);
    const filePath = path.join(dir, `world-memory-${dateKey()}.json`);
    const records = search('', { limit: Number.MAX_SAFE_INTEGER });
    fs.writeFileSync(filePath, JSON.stringify({ worldId: world.worldId, exportedAt: new Date().toISOString(), count: records.length, records }, null, 2), 'utf8');
    return { path: filePath, count: records.length };
  }

  return { backend, file, partition, append, search, exportAll };
}

export function memorySummary(world) {
  const adapt = createMemoryAdapter(world);
  const file = adapt.file;
  if (!file || !fs.existsSync(file)) return { available: false, path: file || null };
  const count = adapt.search('', { limit: 1000 }).length;
  return { available: true, path: file, engineRecords: count };
}
