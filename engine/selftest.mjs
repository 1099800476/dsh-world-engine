import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { loadWorld, getActiveWorldId, bootstrapWorld } from './lib/config.mjs';
import { DATA_ROOT } from './lib/paths.mjs';
import { createSnapshot, listSnapshots } from './lib/snapshot.mjs';
import { createMemoryAdapter } from './lib/memory.mjs';
import { getTimeline, getProtagonistState } from './lib/state.mjs';
import { worldNow } from './lib/time.mjs';

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

export async function runSelfTest() {
  const results = [];
  const check = (name, fn) => {
    try {
      const v = fn();
      results.push({ name, ok: v !== false, detail: typeof v === 'string' ? v : '' });
    } catch (e) {
      results.push({ name, ok: false, detail: e.message });
    }
  };

  check('Node 版本 >= 22.13', () => {
    const [maj, min] = process.versions.node.split('.').map(Number);
    return (maj > 22 || (maj === 22 && min >= 13)) ? process.versions.node : false;
  });
  check('数据根可写', () => {
    const f = path.join(DATA_ROOT, '.write-test');
    fs.writeFileSync(f, 'ok');
    fs.unlinkSync(f);
    return DATA_ROOT;
  });
  check('世界包加载', () => {
    const w = loadWorld(getActiveWorldId());
    return `${w.rules.name} / NPC ${w.npcConfig.npcs.length} / 地点 ${w.location.locations.length}`;
  });
  check('时间模块', () => {
    const n = worldNow();
    return `${n.local} ${n.weekday} ${n.partOfDay}`;
  });
  check('时间线可读', () => {
    const tl = getTimeline(getActiveWorldId());
    return `${tl.entries.length} 条`;
  });
  check('主角状态可读', () => {
    const st = getProtagonistState(getActiveWorldId());
    return `${st.name} @ ${st.locationName} / ${st.mood}`;
  });
  check('快照可生成', () => {
    const name = createSnapshot(getActiveWorldId(), 'selftest');
    return name;
  });
  check('记忆适配器', () => {
    const m = createMemoryAdapter(loadWorld(getActiveWorldId()));
    if (!fs.existsSync(m.file)) return `记忆库文件尚未生成（${m.file}），首次写入时自动创建`;
    const hits = m.search('', { limit: 5 });
    return `${m.backend} / 已连 ${m.file} / 引擎记录 ${hits.length}+`;
  });

  const results2 = results.slice();

  const pf = await portFree(Number(process.env.WORLD_ENGINE_PORT || 32100));
  results2.push({ name: '端口状态', ok: true, detail: pf ? '32100 空闲' : '32100 已被占用（引擎正在运行即属正常）' });

  console.log('世界引擎自检');
  console.log('='.repeat(40));
  let fail = 0;
  for (const r of results2) {
    if (!r.ok) fail++;
    console.log(`${r.ok ? '✔' : '✘'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  }
  console.log('='.repeat(40));
  console.log(fail === 0 ? '全部通过' : `${fail} 项未通过`);
  return fail === 0 ? 0 : 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const code = await runSelfTest();
  process.exit(code);
}
