import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './util.mjs';

// 桥接配置路径允许用环境变量覆盖；缺省沿用本机既有位置。读不到就走回退值，不报错。
const SURFCORE_CONFIG = process.env.WORLD_ENGINE_SURFCORE_CONFIG || 'F:\\DSH-Data\\surfcore\\config.json';
const DEFAULT_SNOWLUMA_HOME = process.env.WORLD_ENGINE_SNOWLUMA_HOME || 'F:\\SnowLuma';

// 从现有 SurfCore 配置 + SnowLuma per-account 文件里读 OneBot 端点与 token，
// 引擎世界包的 approval 段可覆盖。引擎不写回这些配置。
export function getBridgeConfig(world) {
  const cfg = readJson(SURFCORE_CONFIG, {}) || {};
  const sl = cfg.snowluma || {};
  const approval = world?.rules?.approval || {};

  const ownerQQ = approval.ownerQQ || cfg.ownerQQ || null;
  const httpUrl = String(approval.httpUrl || sl.httpUrl || 'http://127.0.0.1:3000').replace(/\/+$/, '');
  const accessToken = approval.accessToken || sl.accessToken || '';

  let wsUrl = String(approval.wsUrl || sl.wsUrl || 'ws://127.0.0.1:3001').replace(/\/+$/, '');
  let wsToken = approval.wsToken || sl.accessToken || '';

  try {
    const home = sl.homeDir || approval.homeDir || DEFAULT_SNOWLUMA_HOME;
    const dir = path.join(home, 'config');
    const files = fs.readdirSync(dir).filter((n) => /^onebot_\d+\.json$/i.test(n));
    for (const f of files) {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const ws = j?.networks?.wsServers?.[0];
      if (ws) {
        wsUrl = `ws://${ws.host || '127.0.0.1'}:${ws.port || 3001}`;
        wsToken = String(ws.accessToken || wsToken);
        break;
      }
    }
  } catch { /* 读不到就用回退值 */ }

  return {
    enabled: approval.enabled !== false,
    ownerQQ: ownerQQ ? String(ownerQQ) : null,
    httpUrl, accessToken, wsUrl, wsToken,
    surfcoreConfig: SURFCORE_CONFIG
  };
}
