import { getBridgeConfig } from './bridge-config.mjs';
import { log } from './util.mjs';

async function httpAction(cfg, action, params) {
  const res = await fetch(`${cfg.httpUrl}/${action}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cfg.accessToken ? { authorization: `Bearer ${cfg.accessToken}` } : {})
    },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(15000)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status !== 'ok' || body.retcode !== 0) {
    throw new Error(`OneBot ${action} 失败: ${body.wording || body.retcode || res.status}`);
  }
  return body.data;
}

export async function sendPrivate(world, text) {
  const cfg = getBridgeConfig(world);
  if (!cfg.enabled) return { skipped: 'approval-disabled' };
  if (!cfg.ownerQQ) {
    log('warn', '未配置 ownerQQ，跳过 QQ 推送');
    return { skipped: 'no-owner' };
  }
  const message = [{ type: 'text', data: { text: String(text) } }];
  await httpAction(cfg, 'send_private_msg', { user_id: Number(cfg.ownerQQ), message });
  log('info', 'QQ 私聊已推送', { qq: cfg.ownerQQ, text: String(text).slice(0, 30) });
  return { ok: true, qq: cfg.ownerQQ };
}

export function approvalCode(item) {
  return item.code || String(item.id || '').slice(-4);
}

export function approvalMessage(item) {
  const code = approvalCode(item);
  return [
    '【世界引擎 · 待审批】',
    `编号：${code}`,
    String(item.text || ''),
    '',
    `回复「同意 ${code}」或「拒绝 ${code}」；也可以在引擎设置页「数据维护 → 待审批」处理。`
  ].join('\n');
}

export async function pushApproval(world, item) {
  try {
    return await sendPrivate(world, approvalMessage(item));
  } catch (e) {
    log('warn', '审批推送失败', { err: e.message });
    return { ok: false, error: e.message };
  }
}

export async function reportDecision(world, item, action) {
  const verb = action === 'approved' ? '已同意，写入世界线' : '已驳回，不写入世界线';
  try {
    return await sendPrivate(world, `【世界引擎】编号 ${approvalCode(item)}：${verb}。`);
  } catch (e) {
    log('warn', '结果回执发送失败', { err: e.message });
    return { ok: false, error: e.message };
  }
}
