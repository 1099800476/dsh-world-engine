// 路径约定：代码在 SSD（本目录），数据在 E 盘数据根；两者严格分离
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CODE_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const DATA_ROOT = process.env.WORLD_ENGINE_DATA || 'E:\\世界存档';
export const PACKS_ROOT = path.join(CODE_ROOT, 'packs');

export const cfgDir = (worldId) => path.join(DATA_ROOT, 'worlds', worldId, 'config');
export const stateDir = (worldId) => path.join(DATA_ROOT, 'worlds', worldId, 'state');
export const npcStateDir = (worldId) => path.join(stateDir(worldId), 'npc-state');
export const snapshotDir = (worldId) => path.join(DATA_ROOT, 'worlds', worldId, 'snapshots');
export const backupDir = (worldId) => path.join(DATA_ROOT, 'worlds', worldId, 'backups');
export const memoryExportDir = (worldId) => path.join(DATA_ROOT, 'worlds', worldId, 'memory-export');
export const worldDir = (worldId) => path.join(DATA_ROOT, 'worlds', worldId);
export const logsDir = () => path.join(DATA_ROOT, 'logs');
export const activeFile = () => path.join(DATA_ROOT, 'active.json');

export const CONFIG_FILES = ['world-rules.json', 'npc-config.json', 'location.json', 'evolve-rule.json', 'event-pool.json'];
export const STATE_FILES = ['protagonist-state.json', 'world-timeline.json', 'runtime.json', 'pending-approvals.json'];
