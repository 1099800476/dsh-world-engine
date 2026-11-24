// 把本地仓库目录同步到 GitHub（走 GitHub REST API，不走 git smart-HTTP）。
//
// 为什么不用 git push：本机到 github.com 的 git 传输（smart HTTP）会被重置，
// 而 api.github.com 可达，所以用 Git Data API 建 blob → tree → commit → 更新 ref。
// 效果等同一次普通提交：一个 commit，包含目录内全部文件。
//
// 用法（GitHub CLI 已登录即可，token 从 `gh auth token` 自动取）：
//   node publish-to-github.mjs --dir "E:\世界引擎开发日志文件包\repo\dsh-world-engine" --repo 1099800476/dsh-world-engine --branch main --message "feat: ..."
//
// 注意：
//   · 目录内的 .git 与 .publish-meta.json 会被忽略。
//   · 空仓库会自动先建一个占位提交，保证 Git Data API 可用。

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}

const DIR = arg('dir', 'E:/世界引擎开发日志文件包/repo/dsh-world-engine')
const FULL = arg('repo', '1099800476/dsh-world-engine')
const BRANCH = arg('branch', 'main')
const MESSAGE = arg('message', `chore: 同步 ${new Date().toISOString()}`)
const [OWNER, REPO] = FULL.split('/')
const API = 'https://api.github.com'

if (!OWNER || !REPO) throw new Error('--repo 需要 owner/repo 形式')

const token = execSync('gh auth token', { encoding: 'utf8' }).trim()
if (!token) throw new Error('拿不到 gh token，请先 gh auth login')

async function call(method, p, body) {
  const res = await fetch(API + p, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'dsh-world-engine-publisher',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${text.slice(0, 300)}`)
  return data
}

const SKIP = new Set(['.git', '.publish-meta.json'])

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) walk(abs, base, out)
    else out.push({ abs, rel: path.relative(base, abs).split(path.sep).join('/') })
  }
  return out
}

const files = walk(DIR)
console.log(`目录: ${DIR}`)
console.log(`文件数: ${files.length}`)

// 取当前 HEAD；空仓库先建占位提交
let baseSha = null
try {
  const ref = await call('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`)
  baseSha = ref.object.sha
  console.log(`当前 HEAD: ${baseSha}`)
} catch {
  console.log('远端为空仓库，先创建占位提交')
  await call('PUT', `/repos/${OWNER}/${REPO}/contents/README.md`, {
    message: 'chore: 初始化仓库',
    content: Buffer.from('# 初始化占位\n').toString('base64'),
    branch: BRANCH,
  })
  const ref = await call('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`)
  baseSha = ref.object.sha
  console.log(`基底 commit: ${baseSha}`)
}

const entries = []
for (const f of files) {
  const content = fs.readFileSync(f.abs).toString('base64')
  const blob = await call('POST', `/repos/${OWNER}/${REPO}/git/blobs`, { content, encoding: 'base64' })
  entries.push({ path: f.rel, mode: '100644', type: 'blob', sha: blob.sha })
  console.log(`blob: ${f.rel}`)
}

const tree = await call('POST', `/repos/${OWNER}/${REPO}/git/trees`, { tree: entries })
console.log(`tree: ${tree.sha}`)

const commit = await call('POST', `/repos/${OWNER}/${REPO}/git/commits`, { message: MESSAGE, tree: tree.sha, parents: [baseSha] })
console.log(`commit: ${commit.sha}`)

await call('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: true })
console.log(`已更新 ${BRANCH} -> ${commit.sha}`)
console.log(`完成: https://github.com/${OWNER}/${REPO}`)
