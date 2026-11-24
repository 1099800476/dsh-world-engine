import { bootstrapWorld, getActiveWorldId, loadWorld } from './lib/config.mjs';
import { startServer } from './lib/server.mjs';
import { startScheduler, stopScheduler } from './lib/evolve.mjs';
import { startApprovalWs, resendPending } from './lib/approval-ws.mjs';
import { log } from './lib/util.mjs';

const mode = process.argv[2] || 'serve';

if (mode === '--init' || mode === 'init') {
  const r = bootstrapWorld();
  log('info', `初始化完成：世界包 ${r.worldId}，${r.created ? '新建了缺失文件' : '已有数据，未改动'}`);
  process.exit(0);
}

if (mode === '--selftest' || mode === 'selftest') {
  const { runSelfTest } = await import('./selftest.mjs');
  const code = await runSelfTest();
  process.exit(code);
}

log('info', '========== 世界引擎启动 ==========');
const worldId = getActiveWorldId();
bootstrapWorld();
const world = loadWorld(worldId);
log('info', `已加载世界：${world.rules.name}（${worldId}），她：${world.rules.herName}，称呼你：${world.rules.userName}`);

startServer();
startScheduler();
startApprovalWs(world);
resendPending(world).catch(() => {});

process.on('SIGINT', () => {
  log('info', '收到退出信号，正在关闭');
  stopScheduler();
  process.exit(0);
});
process.on('uncaughtException', (e) => log('error', '未捕获异常', { err: e.message }));
process.on('unhandledRejection', (e) => log('error', '未处理的 Promise 拒绝', { err: String(e) }));
