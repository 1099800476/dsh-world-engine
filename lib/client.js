// DSH「世界引擎」· 网页半边
//
// 只在 DSH 设置左侧栏加一项「世界引擎」，把引擎的状态、演化规则、NPC、审批、事件与备份摆出来。
// 不直连引擎端口，所有读写都走宿主半边的 /dsh-world-engine/* 路由（见 lib/host.js）。
//
// 槽位名 'settings.section' 与 dsh-speak-up / dsh-write 同一套，是本机已跑通的路子。

window.__ModuleLoader__.load({
  id: 'dsh-world-engine',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports

    const React = require('react')
    const inject = ['slots']

    const B = '/dsh-world-engine'
    const get = (p) => fetch(B + p, { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    const post = (p, body) =>
      fetch(B + p, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      }).then((r) => r.json()).catch(() => null)

    const h = React.createElement

    // 样式贴着主题变量走，换皮肤 / 深浅色都跟着变（照 dsh-speak-up 的做法）
    const S = {
      wrap: { padding: '12px 14px 24px', fontSize: 13, lineHeight: 1.7, background: 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,.92))', border: '1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08))', borderRadius: 12 },
      h: { fontSize: 14, fontWeight: 600, margin: '16px 0 8px' },
      dim: { opacity: 0.62, fontSize: 12 },
      card: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, background: 'var(--dsw-alias-bg-layer-1)' },
      row: { display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap' },
      lab: { minWidth: 170, paddingTop: 3, fontSize: 12.5 },
      ctl: { flex: '1 1 240px', minWidth: 200 },
      hint: { opacity: 0.6, fontSize: 11.5, marginTop: 2 },
      input: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '4px 8px', background: 'transparent', color: 'inherit', fontSize: 12.5, width: '100%', boxSizing: 'border-box' },
      area: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '4px 8px', background: 'transparent', color: 'inherit', fontSize: 12.5, width: '100%', boxSizing: 'border-box', minHeight: 54, resize: 'vertical' },
      small: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '4px 8px', background: 'transparent', color: 'inherit', fontSize: 12.5, width: 100, boxSizing: 'border-box' },
      btn: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '5px 12px', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 12.5 },
      btnOn: { border: '1px solid var(--dsw-alias-state-business-primary)', borderRadius: 6, padding: '5px 12px', background: 'var(--dsw-alias-state-business-primary)', color: '#fff', cursor: 'pointer', fontSize: 12.5 },
      btnDanger: { border: '1px solid #c0392b', borderRadius: 6, padding: '5px 12px', background: 'transparent', color: '#c0392b', cursor: 'pointer', fontSize: 12.5 },
      warn: { border: '1px solid #c0392b', borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontSize: 12, lineHeight: 1.7, color: '#c0392b' },
      ok: { color: 'var(--dsw-alias-state-business-primary)', fontSize: 12 },
      tag: { display: 'inline-block', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 4, padding: '0 6px', fontSize: 11, marginRight: 6, opacity: 0.9 },
      logRow: { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11.5, whiteSpace: 'pre-wrap', padding: '3px 0' },
      grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 8 },
      cell: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '8px 10px' },
    }

    const 提示 = (文本) => h('div', { style: S.hint }, 文本)
    const 行 = (标签, 控件, 说明) => h('div', { style: S.row }, h('div', { style: S.lab }, 标签), h('div', { style: S.ctl }, 控件, 说明 ? 提示(说明) : null))
    const 按钮 = (文字, onClick, 亮, 危险, 关) => h('button', { type: 'button', style: 亮 ? S.btnOn : (危险 ? S.btnDanger : S.btn), onClick, disabled: !!关, title: 文字 }, 文字)
    const 勾 = (值, onChange) => h('input', { type: 'checkbox', checked: !!值, onChange: (e) => onChange(e.target.checked) })
    const 数 = (值, onChange, 步) => h('input', { type: 'number', value: 值 === undefined || 值 === null ? '' : 值, step: 步 || 1, min: 0, style: S.small, onChange: (e) => onChange(e.target.value) })
    const 选 = (值, onChange, 选项) => h('select', { style: S.input, value: 值, onChange: (e) => onChange(e.target.value) }, 选项.map((o) => h('option', { key: o.v, value: o.v }, o.t)))
    const 文 = (值, onChange, 占位) => h('textarea', { style: S.area, value: 值 || '', placeholder: 占位 || '', onChange: (e) => onChange(e.target.value) })
    const 标签拆分 = (s) => String(s || '').split(/[、,，/]/).map((x) => x.trim()).filter(Boolean)

    const 密度选项 = [{ v: 'low', t: '稀疏' }, { v: 'normal', t: '正常' }, { v: 'high', t: '密集' }]
    const 频率选项 = [{ v: 'low', t: '低' }, { v: 'normal', t: '正常' }, { v: 'high', t: '高' }]
    const 事件类型 = { major: '重大节点', daily: '日常', npc: 'NPC', system: '系统', memory: '回忆' }

    // 面板功能说明（标题, 说明）
    const 说明条目 = [
      ['世界概览', '只读展示当前世界名、主角与称呼、世界时间（星期 / 时段 / 季节）、所在位置、心情、疲劳与思念、她的思绪，以及时间线条数、记忆条数、待审批数量和 QQ 审批链路状态。'],
      ['演化规则', '控制世界是否自动推进。总开关关掉后只保留状态与接口，不再推进时间线；随机日常事件、NPC 自主行动、主动搭话倾向、共享世界状态可分别开关；每日节拍、事件冷却天数、事件密度控制推进节奏。每次保存前引擎自动打快照。「重大节点必须审批」是法则锁定项，这里不提供开关。'],
      ['重大节点审批', '演化中提出的重大节点预案会推送到你的 QQ 私聊，也会列在这里。同意后自动快照、写入世界线重大条目并回写向量记忆；驳回则不进入世界线。'],
      ['NPC 管理', '自主总开关控制所有 NPC 是否自主行动；逐个 NPC 可启用 / 停用，并调整出现频率（低 / 正常 / 高）。'],
      ['地点管理', '维护世界里可去的地点：名称、氛围描写、地点回忆。「启用」控制地点是否可用；「仅背景」表示只作为回忆 / 场景存在，默认不展开新剧情。可新增或删除地点；删除地点不会清掉时间线里的旧记录。'],
      ['记忆 · 预置共同回忆', '世界开场时写进时间线的共同回忆，可新增、删除，或修改文案、重要程度（1–5）、距今天数、标签。保存后生效，不影响运行中已累积的历史记录。'],
      ['记忆 · 运行时向量记忆', '演化过程中累积进本地向量记忆库的事件记录，只能按关键词检索和一键导出全部；逐条历史记录是只追加的，引擎暂不支持在面板里删除或改写。'],
      ['近期事件', '时间线最近发生的事（日常 / NPC / 回忆 / 重大节点），按时间排列，只读。'],
      ['数据维护', '立即完整备份；选择历史快照回滚；两档重置——「清空演化状态」保留配置与 NPC 设定，只清时间线与动态状态；「全量重置」连配置一起恢复到初始世界。重置前自动快照，操作不可撤销。'],
      ['世界观来源', '世界名、口吻、预置回忆、NPC、地点、事件池都来自世界包模板；首次初始化时复制到数据存档目录，之后面板改动都保存在存档副本，不回写模板。换世界包需要在引擎目录放置新包并切换当前包，面板不提供网页导入。'],
      ['链路与边界', '引擎本体随插件包一起交付，由本插件的宿主半边自动拉起、看门狗托管在本机 127.0.0.1:32100，插件卸载或 DSH 退出时收尾。面板读写都走本插件的宿主代理；法则层字段（时间倍率、数据目录、原作男主策略、审批锁定、羁绊归属）不在面板开放修改。'],
      ['插件更新', '本机开发版：直接改插件目录源码后重启 DSH 生效；上架插件市场后，由市场按版本号检测更新，在插件市场面板里升级。引擎代码随插件包一起更新，不需要单独再装一遍。'],
    ]

    // ---------- 面板 ----------

    function Section() {
      const [聚合, 设聚合] = React.useState(null)
      const [说, 设说] = React.useState('')
      const [忙, 设忙] = React.useState(false)
      const [演化草稿, 设演化草稿] = React.useState(null)
      const [NPC草稿, 设NPC草稿] = React.useState(null)
      const [地点草稿, 设地点草稿] = React.useState(null)
      const [记忆草稿, 设记忆草稿] = React.useState(null)
      const [记忆查询, 设记忆查询] = React.useState('')
      const [记忆命中, 设记忆命中] = React.useState(null)
      const [脏, 设脏] = React.useState(false)
      const [待回滚, 设待回滚] = React.useState('')
      const [重置档, 设重置档] = React.useState(null) // null | 'state' | 'full'（点第二次才真重置）

      const 拉 = React.useCallback(() => {
        get('/state').then((r) => {
          if (r && r.sections) {
            设聚合(r)
            const st = r.sections['/api/status'] || {}
            const cfg = r.sections['/api/admin/config'] || {}
            if (st.evolve) 设演化草稿({ ...st.evolve })
            if (cfg.npcConfig) 设NPC草稿({ ...cfg.npcConfig })
            if (cfg.location) 设地点草稿({ ...cfg.location, locations: (cfg.location.locations || []).map((l) => ({ ...l })) })
            if (cfg.worldRules) 设记忆草稿((cfg.worldRules.presetMemories || []).map((m) => ({ ...m, tags: Array.isArray(m.tags) ? [...m.tags] : [] })))
            设记忆命中(null)
            设脏(false)
          } else {
            设说('读不到宿主那边的状态（世界引擎在跑吗？）')
          }
        })
      }, [])

      React.useEffect(() => { 拉() }, [拉])

      if (!聚合) return h('div', { style: S.wrap }, h('div', { style: S.h }, '世界引擎'), h('div', { style: S.dim }, '读取中…'))

      const sec = 聚合.sections
      const st = sec['/api/status'] || {}
      const now = sec['/api/world/now'] || {}
      const prot = sec['/api/protagonist/status'] || {}
      const npc = sec['/api/npc/list'] || {}
      const ev = sec['/api/latest/events'] || {}
      const pend = sec['/api/event/pending'] || {}
      const appr = sec['/api/approval/status'] || {}
      const cfg = sec['/api/admin/config'] || {}
      const 在线 = !!聚合.online
      const eng = 聚合.engine || {}

      const 审批列表 = (pend.items || []).filter((x) => x.status === 'pending')
      const 审批链路 = appr.approval || {}

      // ---- 写演化规则 ----
      const 存演化 = async () => {
        设忙(true); 设说('')
        const r = await post('/api/admin/config', { evolveRule: 演化草稿 })
        设忙(false)
        if (r && r.ok) { 设说('演化规则已保存（保存前已自动快照）'); 设脏(false); 拉() }
        else 设说('保存失败：' + String((r && r.error) || '未知原因'))
      }

      // ---- 写 NPC 配置 ----
      const 存NPC = async () => {
        设忙(true); 设说('')
        const r = await post('/api/admin/config', { npcConfig: NPC草稿 })
        设忙(false)
        if (r && r.ok) { 设说('NPC 配置已保存（保存前已自动快照）'); 设脏(false); 拉() }
        else 设说('保存失败：' + String((r && r.error) || '未知原因'))
      }

      // ---- 写地点 ----
      const 存地点 = async () => {
        设忙(true); 设说('')
        const r = await post('/api/admin/config', { location: 地点草稿 })
        设忙(false)
        if (r && r.ok) { 设说('地点配置已保存（保存前已自动快照）'); 设脏(false); 拉() }
        else 设说('保存失败：' + String((r && r.error) || '未知原因'))
      }

      // ---- 写预置共同回忆 ----
      const 存记忆 = async () => {
        设忙(true); 设说('')
        const r = await post('/api/admin/config', { worldRules: { presetMemories: 记忆草稿 } })
        设忙(false)
        if (r && r.ok) { 设说('预置共同回忆已保存（保存前已自动快照）'); 设脏(false); 拉() }
        else 设说('保存失败：' + String((r && r.error) || '未知原因'))
      }

      // ---- 运行时向量记忆：检索 / 导出（只读） ----
      const 搜记忆 = async () => {
        const q = 记忆查询.trim()
        设忙(true); 设说('')
        const r = await get('/api/memory/search?q=' + encodeURIComponent(q))
        设忙(false)
        if (r && r.ok) 设记忆命中(r.hits || [])
        else { 设记忆命中([]); 设说('记忆检索失败：' + String((r && r.error) || '未知原因')) }
      }

      const 导出记忆 = async () => {
        设忙(true); 设说('')
        const r = await get('/api/memory/export')
        设忙(false)
        if (r && r.ok) 设说('记忆已导出：' + (r.path || '完成') + '（' + (r.count ?? '—') + ' 条）')
        else 设说('导出失败：' + String((r && r.error) || '未知原因'))
      }

      const 审批 = async (id, 同意) => {
        设忙(true); 设说('')
        const r = await post(同意 ? '/api/event/approve' : '/api/event/reject', { id })
        设忙(false)
        if (r && r.ok) { 设说(同意 ? '已同意，写入世界线' : '已驳回') ; 拉() }
        else 设说('操作失败：' + String((r && r.error) || '未知原因'))
      }

      const 备份 = async () => {
        设忙(true); 设说('')
        const r = await get('/api/backup/full')
        设忙(false)
        if (r && r.ok) 设说('已生成完整备份：' + (r.name || '完成') + '（时间线 ' + (r.entries ?? '—') + ' 条）')
        else 设说('备份失败：' + String((r && r.error) || '未知原因'))
      }

      const 回滚 = async () => {
        if (!待回滚) return
        设忙(true); 设说('')
        const r = await post('/api/backup/rollback', { snapshot: 待回滚 })
        设忙(false)
        if (r && r.ok) { 设说('已回滚到快照：' + 待回滚); 拉() }
        else 设说('回滚失败：' + String((r && r.error) || '未知原因'))
      }

      const 重置 = async (mode) => {
        if (重置档 !== mode) { 设重置档(mode); 设说('再点一次「确认重置」才会真的清空（重置前会自动快照）。'); return }
        设忙(true); 设说('')
        const r = await post('/api/reset', { mode, confirm: 'RESET' })
        设忙(false); 设重置档(null)
        if (r && r.ok) { 设说(r.note || '重置完成'); 拉() }
        else 设说('重置失败：' + String((r && r.error) || '未知原因'))
      }

      const 改演化 = (键, 值) => { 设演化草稿({ ...演化草稿, [键]: 值 }); 设脏(true) }
      const 改NPC全局 = (键, 值) => { 设NPC草稿({ ...NPC草稿, [键]: 值 }); 设脏(true) }
      const 改NPC = (id, 键, 值) => {
        const npcs = (NPC草稿.npcs || []).map((n) => (n.id === id ? { ...n, [键]: 值 } : n))
        设NPC草稿({ ...NPC草稿, npcs }); 设脏(true)
      }

      const 改地点 = (id, 键, 值) => {
        const locations = (地点草稿.locations || []).map((l) => (l.id === id ? { ...l, [键]: 值 } : l))
        设地点草稿({ ...地点草稿, locations }); 设脏(true)
      }
      const 加地点 = () => {
        const id = 'loc_' + Math.random().toString(36).slice(2, 8)
        设地点草稿({ ...地点草稿, locations: [...(地点草稿.locations || []), { id, name: '新地点', enabled: true, backgroundOnly: false, atmosphere: '', memories: '' }] })
        设脏(true)
      }
      const 删地点 = (id) => {
        设地点草稿({ ...地点草稿, locations: (地点草稿.locations || []).filter((l) => l.id !== id) })
        设脏(true)
      }

      const 改记忆 = (id, 键, 值) => {
        const list = (记忆草稿 || []).map((m) => (m.id === id ? { ...m, [键]: 值 } : m))
        设记忆草稿(list); 设脏(true)
      }
      const 加记忆 = () => {
        const id = 'pm_' + Math.random().toString(36).slice(2, 8)
        设记忆草稿([...(记忆草稿 || []), { id, daysAgo: 30, importance: 3, tags: ['共同回忆'], text: '' }])
        设脏(true)
      }
      const 删记忆 = (id) => {
        设记忆草稿((记忆草稿 || []).filter((m) => m.id !== id))
        设脏(true)
      }

      const 快照列表 = cfg.snapshots || []

      return h('div', { style: S.wrap },
        // ---- 标题与在线状态 ----
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
          h('div', { style: { ...S.h, margin: 0 } }, '世界引擎'),
          h('span', { style: { ...S.tag, color: 在线 ? 'var(--dsw-alias-state-business-primary)' : '#c0392b', borderColor: 'currentColor' } }, 在线 ? '● 引擎在线' : '○ 引擎未运行'),
          按钮('刷新', 拉, false, false, 忙),
        ),
        !在线 ? h('div', { style: { ...S.warn, marginTop: 10 } }, '连不上本机世界引擎（127.0.0.1:32100）。请确认引擎进程 / 看门狗已启动；本面板的读写都会在引擎起来后自动恢复。') : null,

        // ---- 世界概览 ----
        h('div', { style: S.card },
          h('div', { style: { ...S.h, margin: '0 0 8px' } }, '世界概览'),
          h('div', { style: S.grid },
            h('div', { style: S.cell }, h('div', { style: S.dim }, '世界'), h('div', null, st.world ? st.world.name : '—'), st.world && st.world.subtitle ? h('div', { style: S.dim }, st.world.subtitle) : null),
            h('div', { style: S.cell }, h('div', { style: S.dim }, '主角 / 称呼'), h('div', null, st.herName || prot.name || '—', '（对', st.userName || '你', '的称呼）')),
            h('div', { style: S.cell }, h('div', { style: S.dim }, '世界时间'), h('div', null, [now.local || now.date || '—', now.weekday ? now.weekday + ' · ' : '', now.partOfDay || now.timeOfDay || '', now.season ? ' · ' + now.season : ''].join(''))),
            h('div', { style: S.cell }, h('div', { style: S.dim }, '当前位置'), h('div', null, (prot.location && prot.location.name) || '—')),
            h('div', { style: S.cell }, h('div', { style: S.dim }, '心情'), h('div', null, prot.mood || '—')),
            h('div', { style: S.cell }, h('div', { style: S.dim }, '疲劳 / 思念'), h('div', null, `疲劳 ${prot.fatigue ?? '—'} / 思念 ${prot.longing ?? '—'}`)),
          ),
          prot.thought ? h('div', { style: { marginTop: 8 } }, h('div', { style: S.dim }, '她的思绪'), h('div', null, prot.thought)) : null,
          h('div', { style: { marginTop: 8, fontSize: 12, opacity: 0.8 } },
            h('span', { style: S.tag }, '时间线 ' + (st.timelineEntries ?? '—') + ' 条'),
            h('span', { style: S.tag }, '记忆 ' + ((st.memory && (st.memory.engineRecords ?? st.memory.count)) ?? '—') + ' 条'),
            h('span', { style: S.tag }, '待审批 ' + (st.pendingApprovals ?? '—') + ' 条'),
            h('span', { style: S.tag }, 'QQ 审批 ' + (审批链路.wsConnected ? '已连接' : '未连接') + (审批链路.ownerQQ ? ' · ' + 审批链路.ownerQQ : '')),
          ),
          eng.managed ? h('div', { style: { marginTop: 8, fontSize: 12, opacity: 0.8 } },
            h('span', { style: S.tag }, '托管 PID ' + (eng.pid || '—')),
            h('span', { style: S.tag }, '重启 ' + (eng.restartCount ?? 0) + ' 次'),
            h('span', { style: S.tag }, '端口 ' + (eng.port || 32100)),
            eng.dataRoot ? h('div', { style: S.dim, marginTop: 4 }, '数据根：' + eng.dataRoot) : null,
          ) : null,
        ),

        // ---- 功能说明 ----
        h('div', { style: S.card },
          h('div', { style: { ...S.h, margin: '0 0 8px' } }, '功能说明'),
          说明条目.map(([标题, 说明]) => h('div', { key: 标题, style: { marginBottom: 8 } },
            h('div', { style: { fontWeight: 600, fontSize: 12.5 } }, 标题),
            h('div', { style: S.dim }, 说明),
          )),
        ),

        // ---- 演化规则 ----
        演化草稿 ? h('div', { style: S.card },
          h('div', { style: { ...S.h, margin: '0 0 8px' } }, '演化规则'),
          行('世界演化总开关', 勾(演化草稿.evolutionEnabled, (v) => 改演化('evolutionEnabled', v)), '关掉后引擎只保留状态与接口，不再自动推进时间线。'),
          行('随机日常事件', 勾(演化草稿.randomEventsEnabled, (v) => 改演化('randomEventsEnabled', v)), '按事件密度从事件池里掷日常小事。'),
          行('NPC 自主行动', 勾(演化草稿.npcAutonomyEnabled, (v) => 改演化('npcAutonomyEnabled', v)), '关掉后 NPC 只做静态背景，不再自主跑事。'),
          行('主动搭话倾向', 勾(演化草稿.proactiveChatEnabled, (v) => 改演化('proactiveChatEnabled', v)), '她在合适的时机主动起话头。'),
          行('共享世界状态', 勾(演化草稿.sharedWorldEnabled, (v) => 改演化('sharedWorldEnabled', v)), '世界状态跨会话共享，换人聊也接着同一条世界线。'),
          行('每日演化节拍', 数(演化草稿.ticksPerDay, (v) => 改演化('ticksPerDay', v), 1), '一天推几轮演化（1–4）。'),
          行('事件冷却（天）', 数(演化草稿.cooldownDays, (v) => 改演化('cooldownDays', v), 1), '同类事件之间最少间隔几天。'),
          行('事件密度', 选(演化草稿.eventDensity, (v) => 改演化('eventDensity', v), 密度选项)),
          h('div', { style: { marginTop: 6 } }, 按钮('保存演化规则', 存演化, true, false, 忙)),
          h('div', { style: S.dim, marginTop: 6 }, '重大节点必须审批：这条是法则锁定项，面板里不提供开关。'),
        ) : null,

        // ---- 重大节点审批 ----
        h('div', { style: S.card },
          h('div', { style: { ...S.h, margin: '0 0 8px' } }, '重大节点审批（' + 审批列表.length + ' 待处理）'),
          审批列表.length === 0
            ? h('div', { style: S.dim }, '没有待审批的重大节点。预案会推送到你的 QQ 私聊，也可以在这儿直接批。')
            : 审批列表.map((项) => h('div', { key: 项.id, style: { ...S.cell, marginBottom: 8 } },
                h('div', null, h('span', { style: S.tag }, '编号 ' + (项.code || String(项.id || '').slice(-4))), h('span', { style: S.dim }, 项.createdAt || '')),
                h('div', { style: { marginTop: 4 } }, 项.text || 项.title || '（无文案）'),
                h('div', { style: { marginTop: 6 } },
                  按钮('同意', () => 审批(项.id, true), true, false, 忙),
                  h('span', { style: S.dim }, '　'),
                  按钮('拒绝', () => 审批(项.id, false), false, true, 忙),
                ),
              )),
        ),

        // ---- NPC 管理 ----
        NPC草稿 ? h('div', { style: S.card },
          h('div', { style: { ...S.h, margin: '0 0 8px' } }, 'NPC 管理'),
          行('NPC 自主总开关', 勾(NPC草稿.autonomyEnabled !== false, (v) => 改NPC全局('autonomyEnabled', v))),
          (NPC草稿.npcs || []).map((n) => h('div', { key: n.id, style: { ...S.cell, marginBottom: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' } },
            h('div', { style: { flex: '1 1 160px' } }, h('div', null, n.name), n.note ? h('div', { style: S.dim }, n.note) : null),
            h('label', { style: { fontSize: 12 } }, 勾(n.enabled !== false, (v) => 改NPC(n.id, 'enabled', v)), ' 启用'),
            选(n.frequency || 'normal', (v) => 改NPC(n.id, 'frequency', v), 频率选项),
          )),
          h('div', { style: { marginTop: 6 } }, 按钮('保存 NPC 配置', 存NPC, true, false, 忙)),
        ) : null,

        // ---- 地点管理 ----
        地点草稿 ? h('div', { style: S.card },
          h('div', { style: { ...S.h, margin: '0 0 8px' } }, '地点管理'),
          (地点草稿.locations || []).map((l) => h('div', { key: l.id, style: { ...S.cell, marginBottom: 10 } },
            h('div', { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 } },
              h('div', { style: { flex: '1 1 160px' } }, h('input', { style: S.input, value: l.name || '', onChange: (e) => 改地点(l.id, 'name', e.target.value) })),
              h('label', { style: { fontSize: 12 } }, 勾(l.enabled !== false, (v) => 改地点(l.id, 'enabled', v)), ' 启用'),
              h('label', { style: { fontSize: 12 } }, 勾(!!l.backgroundOnly, (v) => 改地点(l.id, 'backgroundOnly', v)), ' 仅背景'),
              按钮('删除', () => 删地点(l.id), false, true, 忙),
            ),
            行('氛围 / 描写', 文(l.atmosphere, (v) => 改地点(l.id, 'atmosphere', v), '这个地方平时是什么感觉、有哪些细节…')),
            行('地点回忆', 文(l.memories, (v) => 改地点(l.id, 'memories', v), '和这个地点相关的共同回忆，用分号或逗号隔开')),
          )),
          h('div', { style: { marginTop: 6 } },
            按钮('新增地点', 加地点, false, false, 忙),
            h('span', { style: S.dim }, '　'),
            按钮('保存地点配置', 存地点, true, false, 忙),
          ),
          h('div', { style: S.hint, marginTop: 6 }, '「仅背景」地点作为回忆/场景存在，默认不展开新剧情。删掉地点不会删时间线里的旧记录。'),
        ) : null,

        // ---- 记忆 ----
        记忆草稿 ? h('div', { style: S.card },
          h('div', { style: { ...S.h, margin: '0 0 8px' } }, '记忆'),
          h('div', { style: S.dim, marginBottom: 8 }, '预置共同回忆会在世界开场时写进时间线；日常演化中累积的向量记忆在下方检索，逐条历史记录引擎暂不支持在面板里删除。'),
          (记忆草稿 || []).map((m) => h('div', { key: m.id, style: { ...S.cell, marginBottom: 10 } },
            文(m.text, (v) => 改记忆(m.id, 'text', v), '一段共同回忆的内容…'),
            h('div', { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 } },
              h('label', { style: { fontSize: 12 } }, '重要程度 ', h('input', { type: 'number', min: 1, max: 5, style: S.small, value: m.importance ?? 3, onChange: (e) => 改记忆(m.id, 'importance', Number(e.target.value)) })),
              h('label', { style: { fontSize: 12 } }, '距今（天） ', h('input', { type: 'number', min: 0, style: S.small, value: m.daysAgo ?? 30, onChange: (e) => 改记忆(m.id, 'daysAgo', Number(e.target.value)) })),
              h('div', { style: { flex: '1 1 160px' } }, h('input', { style: S.input, value: (m.tags || []).join('、'), placeholder: '标签，用顿号或逗号隔开', onChange: (e) => 改记忆(m.id, 'tags', 标签拆分(e.target.value)) })),
              按钮('删除', () => 删记忆(m.id), false, true, 忙),
            ),
          )),
          h('div', { style: { marginTop: 6 } },
            按钮('新增回忆', 加记忆, false, false, 忙),
            h('span', { style: S.dim }, '　'),
            按钮('保存预置回忆', 存记忆, true, false, 忙),
          ),

          h('div', { style: { ...S.h, margin: '14px 0 8px' } }, '运行时向量记忆（只读检索）'),
          h('div', { style: S.row },
            h('div', { style: S.ctl },
              h('div', { display: 'flex', gap: 8, flexWrap: 'wrap' },
                h('input', { style: S.input, value: 记忆查询, placeholder: '搜关键词…', onChange: (e) => 设记忆查询(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter') 搜记忆() } }),
                按钮('检索', 搜记忆, true, false, 忙),
                按钮('导出全部记忆', 导出记忆, false, false, 忙),
              ),
            ),
          ),
          记忆命中 === null ? h('div', { style: S.dim, marginTop: 6 }, '输入关键词后检索；留空可列出引擎里的世界事件记忆。')
            : 记忆命中.length === 0 ? h('div', { style: S.dim, marginTop: 6 }, '没有命中的记忆。')
            : h('div', { marginTop: 6 }, 记忆命中.map((r, i) => h('div', { key: r.id || i, style: S.logRow },
                h('span', { style: S.tag }, r.category || '记忆'),
                (r.createdAt || '') + '　' + (r.text || r.title || ''),
              ))),
        ) : null,

        // ---- 近期事件 ----
        h('div', { style: S.card },
          h('div', { style: { ...S.h, margin: '0 0 8px' } }, '近期事件（新的在下面）'),
          (ev.events || []).length === 0
            ? h('div', { style: S.dim }, '还没有事件。')
            : h('div', null, (ev.events || []).slice().reverse().map((e, i) => h('div', { key: i, style: S.logRow },
                h('span', { style: S.tag }, 事件类型[e.type] || e.type || '事件'),
                (e.localAt || e.at || '') + '　' + (e.text || ''),
              ))),
        ),

        // ---- 数据维护 ----
        h('div', { style: S.card },
          h('div', { style: { ...S.h, margin: '0 0 8px' } }, '数据维护'),
          h('div', { style: S.row },
            h('div', { style: S.lab }, '快照 / 备份'),
            h('div', { style: S.ctl },
              按钮('立即完整备份', 备份, false, false, 忙),
              h('span', { style: S.dim }, '　'),
              h('select', { style: S.small, value: 待回滚, onChange: (e) => 设待回滚(e.target.value) },
                h('option', { value: '' }, '选择快照…'),
                快照列表.map((s) => h('option', { key: s.name, value: s.name }, (s.createdAt || s.name) + (s.reason ? ' · ' + s.reason : ''))),
              ),
              h('span', { style: S.dim }, '　'),
              按钮('回滚到该快照', 回滚, false, false, 忙 || !待回滚),
            ),
          ),
          h('div', { style: S.warn, marginTop: 8 },
            '重置不可撤销：操作前引擎会自动打快照。「清空演化状态」保留配置与 NPC 设定，只清时间线与动态状态；「全量重置」连配置一起恢复到初始世界。',
          ),
          h('div', null,
            按钮(重置档 === 'state' ? '确认：清空演化状态' : '清空演化状态', () => 重置('state'), false, true, 忙),
            h('span', { style: S.dim }, '　'),
            按钮(重置档 === 'full' ? '确认：全量重置' : '全量重置', () => 重置('full'), false, true, 忙),
          ),
          说 ? h('div', { style: { ...S.ok, marginTop: 8 } }, 说) : null,
        ),

        h('div', { style: S.dim, marginTop: 8 }, '世界引擎是独立进程：本面板只读写本机引擎接口。世界观来自世界包（当前包 ' + (cfg.worldId || '—') + '）：模板在引擎目录 packs/<包名>/config/，首次初始化时复制到数据存档目录，之后面板改动都保存在存档副本；换世界包需在引擎目录放置新包并切换当前包，引擎暂不提供网页导入。'),
      )
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('settings.section', () =>
        slots.register(
          { name: 'settings.section', id: 'world-engine', order: 54, label: () => '世界引擎' },
          Section,
        ),
      )
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
