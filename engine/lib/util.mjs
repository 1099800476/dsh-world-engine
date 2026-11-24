import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { logsDir } from './paths.mjs';

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw new Error(`读取失败 ${file}: ${e.message}`);
  }
}

// 写入前自动留 .bak；先写临时文件再原子替换，避免半个文件
export function writeJson(file, data) {
  ensureDir(path.dirname(file));
  const text = JSON.stringify(data, null, 2) + '\n';
  if (fs.existsSync(file)) {
    try {
      const old = fs.readFileSync(file, 'utf8');
      fs.writeFileSync(file + '.bak', old, 'utf8');
    } catch {}
  }
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

export function appendJsonl(file, obj) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(obj) + '\n', 'utf8');
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function stampKey(d = new Date()) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// 带本地时区偏移的 ISO 串，便于各处统一展示
export function localIso(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
}

export function pick(arr, rand = Math.random) {
  return arr[Math.floor(rand() * arr.length)];
}

export function weightedPick(list, weightFn) {
  const weights = list.map((x) => Math.max(0, weightFn(x)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

const LEVEL_LABEL = { info: 'INFO', warn: 'WARN', error: 'ERROR' };

export function log(level, msg, extra) {
  const line = `[${localIso()}] [${LEVEL_LABEL[level] || level}] ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}`;
  if (level === 'error') console.error(line);
  else console.log(line);
  try {
    ensureDir(logsDir());
    const f = path.join(logsDir(), `engine-${dateKey()}.log`);
    fs.appendFileSync(f, line + '\n', 'utf8');
  } catch {}
}

export function safeFileName(name) {
  return String(name).replace(/[\\/:*?"<>|\s]+/g, '_');
}

// 自带递归复制：不用 fs.cpSync（在中文路径的目录递归复制上会触发进程级崩溃）
export function copyDir(src, dst) {
  ensureDir(dst);
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dst, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else if (ent.isFile()) {
      ensureDir(path.dirname(d));
      fs.copyFileSync(s, d);
    }
  }
}

export function copyFileIfMissing(src, dst) {
  if (fs.existsSync(dst)) return false;
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
  return true;
}

