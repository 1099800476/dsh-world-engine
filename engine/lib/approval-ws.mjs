import { getBridgeConfig } from './bridge-config.mjs';
import { getActiveWorldId, loadWorld } from './config.mjs';
import { getPendingApprovals } from './state.mjs';
import { approveMajor, rejectMajor } from './evolve.mjs';
import { pushApproval, reportDecision, approvalCode, sendPrivate } from './notify.mjs';
import { log } from './util.mjs';

let ws = null;
let reconnectTimer = null;
let started = false;

function parseCommand(text) {
  const m = /(?:世界|引擎)?\s*(同意|批准|驳回|拒绝)\s*([0-9a-fA-F]{4})/.exec(String(text || '').trim());
  if (!m) return null;
  const action = /同意|批准/.test(m[1]) ? 'approve' : 'reject';
  return { action, code: m[2].toLowerCase() };
}

function eventText(ev) {
  if (typeof ev.raw_message === 'string' && ev.raw_message.trim()) return ev.raw_message.trim();
  const msg = ev.message;
  if (typeof msg === 'string') return msg.trim();
  if (Array.isArray(msg)) {
    return msg.filter((s) => s?.type === 'text').map((s) => s?.data?.text ?? '').join(' ').trim();
  }
  return '';
}

function handleEvent(raw, world) {
  const ev = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (ev?.post_type !== 'message' || ev?.message_type !== 'private') return;
  const cfg = getBridgeConfig(world);
  if (String(ev.user_id ?? '') !== String(cfg.ownerQQ ?? '')) return;
  const text = eventText(ev);
  if (!text) return;
  const cmd = parseCommand(text);
  if (!cmd) return;

  const worldId = getActiveWorldId();
  const pending = getPendingApprovals(worldId);
  const item = pending.items.find((x) => approvalCode(x).toLowerCase() === cmd.code && x.status === 'pending');
  if (!item) {
    sendPrivate(world, `编号 ${cmd.code} 没有对应的待审批项（可能已处理过）。`).catch(() => {});
    return;
  }
  try {
    if (cmd.action === 'approve') approveMajor(item.id);
    else rejectMajor(item.id);
    reportDecision(world, item, cmd.action === 'approve' ? 'approved' : 'rejected').catch(() => {});
  } catch (e) {
    log('warn', 'QQ 审批指令处理失败', { code: cmd.code, err: e.message });
    sendPrivate(world, `编号 ${cmd.code} 处理失败：${e.message}`).catch(() => {});
  }
}

function connect(world) {
  const cfg = getBridgeConfig(world);
  if (!cfg.enabled) { log('info', 'QQ 审批链路未启用（approval.enabled=false）'); return; }
  if (!cfg.ownerQQ) { log('warn', '未配置 ownerQQ，QQ 审批接收不启动'); return; }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const sep = cfg.wsUrl.includes('?') ? '&' : '?';
  const url = cfg.wsToken ? `${cfg.wsUrl}${sep}access_token=${encodeURIComponent(cfg.wsToken)}` : cfg.wsUrl;
  try {
    ws = new WebSocket(url, { headers: cfg.wsToken ? { authorization: `Bearer ${cfg.wsToken}` } : {} });
  } catch (e) {
    log('warn', '审批 WS 连接创建失败', { err: e.message });
    scheduleReconnect(world);
    return;
  }

  ws.onopen = () => log('info', 'QQ 审批接收 WS 已连接', { url: cfg.wsUrl });
  ws.onmessage = (ev) => { try { handleEvent(ev.data, world); } catch (e) { log('warn', '审批事件解析失败', { err: e.message }); } };
  ws.onerror = (e) => log('warn', '审批 WS 异常', { err: e?.message || String(e) });
  ws.onclose = () => { log('warn', '审批 WS 断开，准备重连'); scheduleReconnect(world); };
}

function scheduleReconnect(world) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect(world);
  }, 10000);
}

export function startApprovalWs(world) {
  if (started) return;
  started = true;
  connect(world);
  // 兜底：每 30 秒检查一次链路，掉线由 onclose 重连
  setInterval(() => { try { connect(loadWorld(getActiveWorldId())); } catch {} }, 30000).unref?.();
}

// 暴露给设置页 / 调试：把积压未推送的预案补发一遍（启动时调用）
export async function resendPending(world) {
  const pending = getPendingApprovals(getActiveWorldId());
  for (const item of pending.items) {
    if (item.status === 'pending') await pushApproval(world, item);
  }
}

export function approvalLinkStatus(world) {
  const cfg = getBridgeConfig(world);
  return {
    enabled: cfg.enabled,
    ownerQQ: cfg.ownerQQ,
    httpUrl: cfg.httpUrl,
    wsUrl: cfg.wsUrl,
    wsConnected: !!(ws && ws.readyState === WebSocket.OPEN)
  };
}
