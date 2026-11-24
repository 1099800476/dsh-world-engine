// DSH「世界引擎」· 宿主半边
//
// 世界引擎本体随插件包一起交付（engine/ 目录，纯 Node 标准库、无第三方依赖）。
// 本半边做三件事：
//   1. 拉起并托管引擎子进程：插件加载时启动，5 秒级健康巡检，崩溃按冷却自动拉起；插件卸载/退出时收尾。
//   2. 把 /dsh-world-engine/api/* 安全地代理到本机引擎端口（回环 / 同源门控，跨站一律 403）。
//   3. 提供聚合路由 /dsh-world-engine/state，一次性把面板要的几份状态拉齐。
//
// 网页半边（lib/client.js）只调本半边路由，不直连引擎端口，避免浏览器跨域与端口写死。

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ENGINE_BASE = (process.env.WORLD_ENGINE_URL || 'http://127.0.0.1:32100').replace(/\/+$/, '')
const PREFIX = '/dsh-world-engine'

const 插件根 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const 引擎目录 = path.join(插件根, 'engine')
const 引擎入口 = path.join(引擎目录, 'index.mjs')
const 引擎端口 = Number(new URL(ENGINE_BASE).port || 32100)

export const name = 'world-engine'
export const inject = ['webServer']

// ---------- 路径 / 运行时解析 ----------

/**
 * 数据根（存档、时间线、快照、记忆导出都在这里，与代码严格分离）。
 * 优先级：环境变量 WORLD_ENGINE_DATA → 本机既有存档（E:\世界存档 且 active.json 存在）→ DSH 数据目录下的 world-engine-data。
 * 已有存档一律沿用，绝不重建；首次全新安装才落到 DSH 数据目录。
 */
function 解析数据根() {
  if (process.env.WORLD_ENGINE_DATA) return process.env.WORLD_ENGINE_DATA
  const 旧根 = 'E:\\世界存档'
  try {
    if (fs.existsSync(path.join(旧根, 'active.json'))) return 旧根
  } catch { /* 读不到就走默认目录 */ }
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'world-engine-data')
}

/**
 * 跑引擎子进程用的 Node：
 * ① 环境变量 WORLD_ENGINE_NODE 显式指定；
 * ② 否则用当前宿主进程的可执行文件——宿主跑在 Electron 里时，子进程带 ELECTRON_RUN_AS_NODE=1 当纯 Node 用。
 */
function 解析Node() {
  return process.env.WORLD_ENGINE_NODE || process.execPath
}

// ---------- 小工具 ----------

function writeJson(res, code, data) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(data))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (c) => { raw += c; if (raw.length > 2 * 1024 * 1024) req.destroy() })
    req.on('end', () => {
      if (!raw) return resolve({})
      try { resolve(JSON.parse(raw)) } catch { reject(new Error('请求体不是合法 JSON')) }
    })
    req.on('error', reject)
  })
}

/**
 * 来源门控（照抄 dsh-speak-up 已跑通的路子）：
 * ① 宿主有 connection.requestRejection 就交给它；
 * ② 没有就自己看来源：跨站一律不认，只放行本机页面、dsh-app: 与没有来源的本地调用。
 */
function makeGate(ctx) {
  const 本机来源 = /^(?:dsh-app:|https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\/?$)/i
  return (req, res) => {
    let 拒
    try {
      const 连接 = ctx.get && ctx.get('connection')
      拒 = 连接 && typeof 连接.requestRejection === 'function' ? 连接.requestRejection(req) : undefined
    } catch { 拒 = undefined }
    if (拒 !== undefined) {
      res.writeHead(拒 || 403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(拒 === 401 ? 'unauthorized' : 'forbidden')
      return true
    }
    const 头 = req.headers || {}
    const 站 = String(头['sec-fetch-site'] || '').toLowerCase()
    const 源 = String(头.origin || '').trim()
    if (站 === 'cross-site' || (源 && !本机来源.test(源))) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('forbidden')
      return true
    }
    return false
  }
}

// ---------- 引擎进程托管（看门狗） ----------

/**
 * 在插件闭包里管一个引擎子进程：
 *   · 启动时拉起；5 秒巡检一次 /api/status；不健康且过了冷却期就杀掉重拉。
 *   · 插件卸载（ctx.effect 清理）或 DSH 退出时收尾：停巡检、杀子进程。
 *   · 引擎是故障隔离的独立进程：它崩了不拖垮宿主；子进程的 stdout/stderr 转发到宿主日志。
 */
function 造托管(ctx) {
  const 数据根 = 解析数据根()
  const nodeExe = 解析Node()
  const 冷却毫秒 = 60_000

  let 子 = null
  let 停止 = false
  let 巡检 = null
  let 上次拉起 = 0
  let 重启次数 = 0

  function 记日志(级别, 文本) {
    const 行 = String(文本).trim()
    if (!行) return
    try {
      if (级别 === 'error') ctx.logger?.warn?.(`world-engine: ${行}`)
      else ctx.logger?.info?.(`world-engine: ${行}`)
    } catch { /* logger 不在就算了 */ }
  }

  function 拉起() {
    if (停止) return
    if (子 && !子.killed) return
    const env = {
      ...process.env,
      WORLD_ENGINE_DATA: 数据根,
      WORLD_ENGINE_PORT: String(引擎端口),
    }
    // 宿主是 Electron 时，让同一个 exe 以纯 Node 方式跑引擎脚本
    if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1'
    let 子进程
    try {
      子进程 = spawn(nodeExe, [引擎入口], {
        cwd: 引擎目录,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        detached: false,
      })
    } catch (error) {
      记日志('error', `引擎拉起失败：${String((error && error.message) || error)}`)
      return
    }
    子 = 子进程
    上次拉起 = Date.now()
    子.stdout?.on('data', (块) => 记日志('info', 块))
    子.stderr?.on('data', (块) => 记日志('error', 块))
    子.on('exit', (code, 信号) => {
      子 = null
      if (!停止) 记日志('warn', `引擎进程退出 code=${code} 信号=${信号}，等巡检自动拉起`)
    })
    记日志('info', `引擎子进程已拉起 PID=${子进程.pid}，端口 ${引擎端口}，数据根 ${数据根}`)
  }

  async function 健康() {
    try {
      const r = await fetch(ENGINE_BASE + '/api/status', { signal: AbortSignal.timeout(3000) })
      return r.ok
    } catch {
      return false
    }
  }

  async function 巡检一轮() {
    if (停止) return
    if (await 健康()) return
    if (Date.now() - 上次拉起 < 冷却毫秒) return
    重启次数 += 1
    记日志('warn', '健康检查失败，准备重启引擎')
    拉起()
  }

  function 启动() {
    拉起()
    巡检 = setInterval(() => {
      void 巡检一轮().catch(() => {})
    }, 5000)
    巡检.unref?.()
  }

  function 停止托管() {
    停止 = true
    if (巡检) { clearInterval(巡检); 巡检 = null }
    if (子) {
      try { 子.kill() } catch { /* 已退出就算了 */ }
      子 = null
    }
  }

  return {
    启动,
    停止托管,
    状态: () => ({
      managed: true,
      pid: 子 && !子.killed ? 子.pid : null,
      restartCount: 重启次数,
      node: nodeExe,
      dataRoot: 数据根,
      engineDir: 引擎目录,
      port: 引擎端口,
    }),
  }
}

// ---------- 代理到引擎 ----------

async function forward(req, res, enginePath, body) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const init = { method: req.method, signal: controller.signal, headers: { 'content-type': 'application/json' } }
    if (req.method !== 'GET' && body !== undefined) init.body = JSON.stringify(body)
    const r = await fetch(ENGINE_BASE + enginePath, init)
    const text = await r.text()
    let data
    try { data = text ? JSON.parse(text) : {} } catch { data = { ok: false, raw: text } }
    writeJson(res, r.status, data)
  } catch (error) {
    const 未运行 = error.code === 'ECONNREFUSED' || /fetch failed|connect ECONNREFUSED/i.test(String(error.message || ''))
    writeJson(res, 200, {
      ok: false,
      online: false,
      error: error.name === 'AbortError' ? '世界引擎响应超时' : 未运行 ? '世界引擎进程未运行（32100 端口无响应）' : String(error.message || error),
    })
  } finally {
    clearTimeout(timer)
  }
}

// 面板首屏要的几份状态，并行拉齐；任一份失败都不拖垮整页，单独记 error。
async function aggregate(_req, res, 托管) {
  const 拉取 = async (path) => {
    try {
      const r = await fetch(ENGINE_BASE + path, { signal: AbortSignal.timeout(6000) })
      const t = await r.text()
      try { return JSON.parse(t) } catch { return { ok: false, raw: t } }
    } catch (error) {
      return { ok: false, error: error.code === 'ECONNREFUSED' ? '引擎未运行' : String(error.message || error) }
    }
  }
  const paths = [
    '/api/status',
    '/api/world/now',
    '/api/protagonist/status',
    '/api/npc/list',
    '/api/latest/events?limit=20',
    '/api/event/pending',
    '/api/approval/status',
    '/api/admin/config',
  ]
  const sections = Object.fromEntries((await Promise.all(paths.map(拉取))).map((v, i) => [paths[i].split('?')[0], v]))
  writeJson(res, 200, {
    ok: true,
    online: !!(sections['/api/status'] && sections['/api/status'].ok),
    engine: 托管.状态(),
    sections,
  })
}

// ---------- 路由注册 ----------

export function apply(ctx) {
  const 拦住 = makeGate(ctx)
  const 托管 = 造托管(ctx)

  // 托管引擎子进程：加载即启动，卸载/退出时收尾
  ctx.effect(() => {
    托管.启动()
    return () => 托管.停止托管()
  }, 'world-engine: 引擎进程托管')

  // 聚合状态（面板首屏一次拉齐）
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${PREFIX}/state`,
    handler: async (req, res) => {
      try {
        if (拦住(req, res)) return
        if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: '这条只接受 GET' })
        await aggregate(req, res, 托管)
      } catch (error) {
        writeJson(res, 500, { ok: false, error: String(error.message || error) })
      }
    },
  }), 'world-engine/state')

  // 引擎 API 透传：/dsh-world-engine/api/... → 引擎 /api/...（保留查询串与方法）
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: `${PREFIX}/api`,
    handler: async (req, res) => {
      try {
        if (拦住(req, res)) return
        const u = new URL(req.url, 'http://127.0.0.1')
        const enginePath = u.pathname.slice(PREFIX.length) + (u.search || '')
        const body = req.method === 'GET' ? undefined : await readBody(req).catch(() => null)
        await forward(req, res, enginePath, body)
      } catch (error) {
        writeJson(res, 500, { ok: false, error: String(error.message || error) })
      }
    },
  }), 'world-engine/api')

  try {
    ctx.logger?.info?.(`world-engine: 插件已加载，引擎目录 ${引擎目录}，数据根 ${托管.状态().dataRoot}`)
  } catch { /* logger 不在就算了 */ }
}
