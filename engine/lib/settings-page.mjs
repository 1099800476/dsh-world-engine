// 设置页：引擎自带静态面板（深色、折叠分组、数据驱动）
export function settingsPage() {
  return HTML;
}

const HTML = String.raw`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>世界引擎 · 设置</title>
<style>
  :root{--bg:#16181d;--panel:#1f232b;--panel2:#232833;--line:#2e3440;--text:#e6e9ef;--muted:#8f98a8;--blue:#3b82f6;--danger:#f97316;--ok:#22c55e}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 "Microsoft YaHei",system-ui,sans-serif}
  .wrap{max-width:920px;margin:0 auto;padding:28px 20px 80px}
  header{display:flex;align-items:baseline;gap:12px;margin-bottom:6px}
  h1{font-size:20px;margin:0}
  .sub{color:var(--muted);font-size:12px}
  .status{margin:14px 0 22px;padding:12px 14px;background:var(--panel);border:1px solid var(--line);border-radius:10px;font-size:13px}
  .status b{color:#fff}
  section{border:1px solid var(--line);border-radius:10px;margin-bottom:12px;overflow:hidden;background:var(--panel)}
  .head{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;cursor:pointer;user-select:none}
  .head h2{margin:0;font-size:15px}
  .head .arrow{color:var(--muted);transition:transform .15s}
  .body{padding:6px 16px 18px;border-top:1px solid var(--line);display:none}
  section.open .body{display:block}
  section.open .arrow{transform:rotate(180deg)}
  .row{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;padding:10px 0;border-bottom:1px dashed rgba(255,255,255,.06)}
  .row:last-child{border-bottom:0}
  .row .label{flex:1}
  .row .label small{display:block;color:var(--muted);font-size:12px;margin-top:2px}
  input[type=text],textarea,select,number,input[type=number]{background:var(--panel2);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:7px 9px;font:13px/1.5 inherit;outline:none}
  input[type=text]{min-width:240px}
  textarea{width:100%;min-height:64px;resize:vertical}
  input[type=number]{width:80px}
  .switch{position:relative;width:44px;height:24px;flex:0 0 auto}
  .switch input{opacity:0;width:0;height:0}
  .slider{position:absolute;inset:0;background:#3a4050;border-radius:24px;transition:.2s;cursor:pointer}
  .slider:before{content:"";position:absolute;width:18px;height:18px;left:3px;top:3px;background:#cfd6e2;border-radius:50%;transition:.2s}
  .switch input:checked + .slider{background:var(--blue)}
  .switch input:checked + .slider:before{transform:translateX(20px);background:#fff}
  .card{background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:10px 12px;margin:8px 0}
  .card .grid{display:grid;grid-template-columns:120px 1fr;gap:8px 10px;align-items:center}
  .card .grid span{color:var(--muted);font-size:12px}
  .card .ops{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}
  button{border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:8px;padding:7px 12px;cursor:pointer;font:13px/1 inherit}
  button:hover{border-color:#465066}
  button.primary{background:var(--blue);border-color:var(--blue);color:#fff}
  button.danger{background:transparent;border-color:#7a3b22;color:#fb923c}
  .footer{position:sticky;bottom:0;margin-top:18px;padding:12px 0;background:linear-gradient(180deg,rgba(22,24,29,0),var(--bg) 40%);display:flex;gap:10px;align-items:center}
  .toast{position:fixed;right:22px;bottom:22px;background:#1e2a3a;border:1px solid #33507a;color:#dbeafe;padding:10px 14px;border-radius:9px;opacity:0;transition:.25s;pointer-events:none}
  .toast.show{opacity:1}
  .locked{color:var(--muted);font-size:12px}
  .tag{display:inline-block;padding:1px 7px;border-radius:6px;background:#2b3242;color:#aebbcf;font-size:11px;margin-left:6px}
  .list{max-height:340px;overflow:auto}
  .ev{font-size:12px;color:var(--muted);padding:5px 0;border-bottom:1px dashed rgba(255,255,255,.06)}
  .ev b{color:#dbe4f0;font-weight:500}
  .hint{color:var(--muted);font-size:12px;margin:6px 0 10px}
</style>
</head>
<body>
<div class="wrap">
  <header><h1>世界引擎</h1><span class="sub">通用世界模拟器 · 数据与代码分离 · 时间与现实 1:1</span></header>
  <div class="status" id="status">读取中…</div>

  <section id="sec-base" class="open">
    <div class="head" data-sec="1"><h2>基础信息</h2><span class="arrow">▾</span></div>
    <div class="body">
      <div class="row"><div class="label">她的名字<small>世界内的显示名，默认沿用现有角色卡</small></div><input type="text" id="herName" /></div>
      <div class="row"><div class="label">对你的称呼<small>沿用现有人设里的叫法</small></div><input type="text" id="userName" /></div>
      <div class="row"><div class="label">世界基调 / 副标题</div><textarea id="subtitle"></textarea></div>
      <div class="row"><div class="label">基调说明</div><textarea id="tone"></textarea></div>
      <div class="hint">预置共同回忆：开局那段“已经一起经历过”的往事，写入初始时间线。</div>
      <div id="memList"></div>
      <div style="margin-top:8px"><button onclick="addMemory()">＋ 添加回忆</button></div>
    </div>
  </section>

  <section id="sec-loc">
    <div class="head" data-sec="1"><h2>地点管理</h2><span class="arrow">▾</span></div>
    <div class="body">
      <div class="hint">地点名、氛围、关联回忆都可改；UW 人界等回忆背景不参与自动切换。</div>
      <div id="locList"></div>
    </div>
  </section>

  <section id="sec-npc">
    <div class="head" data-sec="1"><h2>NPC 管理</h2><span class="arrow">▾</span></div>
    <div class="body">
      <div class="row"><div class="label">NPC 自主总开关<small>关闭后所有 NPC 停止自主发起剧情</small></div>
        <div class="switch"><input type="checkbox" id="npcAll" /><span class="slider" onclick="document.getElementById('npcAll').click()"></span></div></div>
      <div class="hint">六位自主 NPC 可单独启停、单独调频；背景角色只作为回忆背景。</div>
      <div id="npcList"></div>
    </div>
  </section>

  <section id="sec-evo">
    <div class="head" data-sec="1"><h2>演化规则</h2><span class="arrow">▾</span></div>
    <div class="body">
      <div class="row"><div class="label">自演化总开关<small>关闭后世界停止自动演化，只保留读取与现有存档</small></div>
        <div class="switch"><input type="checkbox" id="evolutionEnabled" /><span class="slider" onclick="document.getElementById('evolutionEnabled').click()"></span></div></div>
      <div class="row"><div class="label">每天评估次数</div><input type="number" id="ticksPerDay" min="1" max="24" step="1" /></div>
      <div class="row"><div class="label">事件密度</div><select id="eventDensity"><option value="low">低（多数日子无事）</option><option value="normal">正常（稀疏）</option><option value="high">高（更活跃）</option></select></div>
      <div class="row"><div class="label">同类事件冷却天数</div><input type="number" id="cooldownDays" min="1" max="30" step="1" /></div>
      <div class="row"><div class="label">随机小事<small>日常偶遇、天气、独处心绪等</small></div>
        <div class="switch"><input type="checkbox" id="randomEventsEnabled" /><span class="slider" onclick="document.getElementById('randomEventsEnabled').click()"></span></div></div>
      <div class="row"><div class="label">NPC 自主剧情<small>覆盖总开关，仍受单 NPC 设置约束</small></div>
        <div class="switch"><input type="checkbox" id="npcAutonomyEnabled" /><span class="slider" onclick="document.getElementById('npcAutonomyEnabled').click()"></span></div></div>
      <div class="row"><div class="label">主动搭话<small>她可以主动找你说话；对外发言仍受现有额度与沉默开关约束</small></div>
        <div class="switch"><input type="checkbox" id="proactiveChatEnabled" /><span class="slider" onclick="document.getElementById('proactiveChatEnabled').click()"></span></div></div>
      <div class="row"><div class="label">多角色共用世界线<small>关闭后新角色使用独立存档</small></div>
        <div class="switch"><input type="checkbox" id="sharedWorldEnabled" /><span class="slider" onclick="document.getElementById('sharedWorldEnabled').click()"></span></div></div>
      <div class="row"><div class="label">重大节点审批<span class="tag">锁定</span><small>只生成预案，经确认后才写入世界线，不可关闭</small></div>
        <div class="locked">锁定，不可关闭</div></div>
    </div>
  </section>

  <section id="sec-data">
    <div class="head" data-sec="1"><h2>数据维护</h2><span class="arrow">▾</span></div>
    <div class="body">
      <div class="row"><div class="label">数据目录<small>世界存档路径，只读</small></div><div class="locked" id="dataRoot">—</div></div>
      <div class="row"><div class="label">手动全量备份<small>整包导出到 backups/</small></div><div><button onclick="fullBackup()">立即备份</button></div></div>
      <div class="row"><div class="label">快照回滚<small>回滚前会自动再存一份当前状态</small></div>
        <div><select id="snapSelect" style="min-width:260px"></select> <button class="danger" onclick="rollback()">回滚</button></div></div>
      <div class="row"><div class="label">近期事件</div><div><button onclick="loadEvents()">刷新查看</button></div></div>
      <div id="eventList" class="list"></div>
      <div class="row"><div class="label">待审批（重大节点）<small>预案只生成不落地；同意后才写入世界线，可在 QQ 里回复「同意 编号」</small></div><div><button onclick="loadPending()">刷新</button></div></div>
      <div id="pendingList" class="list"></div>
      <div class="row"><div class="label">重置世界<small>两档：仅清空演化状态 / 全量恢复初始世界</small></div>
        <div><button class="danger" onclick="resetWorld('state')">清空演化状态</button> <button class="danger" onclick="resetWorld('full')">全量重置</button></div></div>
    </div>
  </section>

  <div class="footer">
    <button class="primary" onclick="saveAll()">保存</button>
    <button onclick="reload()">重新读取</button>
    <span class="sub" id="saveHint"></span>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
let cfg = null;
function el(id){return document.getElementById(id);}
function toast(msg){const t=el('toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),2200);}
async function api(path,opt){const r=await fetch(path,opt||{});return r.json();}
async function reload(){
  cfg = await api('/api/admin/config');
  renderBase(); renderLoc(); renderNpc(); renderEvo(); renderData();
  const s = await api('/api/status');
  el('status').innerHTML = '<b>'+s.world.name+'</b> · 世界ID '+s.world.id+' · '+s.now.local+' '+s.now.weekday+' '+s.now.partOfDay+' / '+s.now.season+'天<br>'
    + '时间线 '+s.timelineEntries+' 条 · 待审批 '+s.pendingApprovals+' 项 · 记忆库 '+(s.memory.available?('已连接（引擎记录 '+s.memory.engineRecords+' 条）'):'未连接')
    + (s.memory.path?('<br><span class="sub">'+s.memory.path+'</span>'):'');
  el('dataRoot').textContent = cfg.locked.dataRoot;
  loadPending();
}
function renderBase(){
  el('herName').value = cfg.worldRules.herName || '';
  el('userName').value = cfg.worldRules.userName || '';
  el('subtitle').value = cfg.worldRules.subtitle || '';
  el('tone').value = cfg.worldRules.tone || '';
  const box = el('memList'); box.innerHTML='';
  (cfg.worldRules.presetMemories||[]).forEach((m,i)=>{
    const d=document.createElement('div'); d.className='card';
    d.innerHTML='<div class="grid"><span>共同回忆</span><textarea data-mem="'+i+'" style="min-height:56px">'+esc(m.text)+'</textarea></div>'
      +'<div class="ops"><button onclick="delMemory('+i+')">删除</button></div>';
    box.appendChild(d);
  });
}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function addMemory(){
  cfg.worldRules.presetMemories = cfg.worldRules.presetMemories || [];
  cfg.worldRules.presetMemories.push({id:'pm_'+Date.now(), daysAgo:30, text:'', tags:['共同回忆'], importance:4});
  renderBase();
}
function delMemory(i){ cfg.worldRules.presetMemories.splice(i,1); renderBase(); }
function renderLoc(){
  const box=el('locList'); box.innerHTML='';
  (cfg.location.locations||[]).forEach((l,i)=>{
    const d=document.createElement('div'); d.className='card';
    d.innerHTML='<div class="grid"><span>名称</span><input type="text" data-loc="'+i+'" data-f="name" value="'+esc(l.name)+'" />'
      +'<span>氛围</span><textarea data-loc="'+i+'" data-f="atmosphere">'+esc(l.atmosphere)+'</textarea>'
      +'<span>关联回忆</span><textarea data-loc="'+i+'" data-f="memories">'+esc(l.memories)+'</textarea>'
      +'<span>启用</span><div class="switch"><input type="checkbox" data-loc="'+i+'" data-f="enabled" '+(l.enabled!==false?'checked':'')+' /><span class="slider" onclick="this.previousElementSibling.click()"></span></div></div>'
      +'<div class="ops">'+(l.backgroundOnly?'<span class="tag">回忆背景</span>':'')+'<button onclick="delLoc('+i+')">删除</button></div>';
    box.appendChild(d);
  });
  const add=document.createElement('div'); add.style.marginTop='8px';
  add.innerHTML='<button onclick="addLoc()">＋ 新增地点</button>'; box.appendChild(add);
}
function addLoc(){
  cfg.location.locations = cfg.location.locations||[];
  cfg.location.locations.push({id:'loc_'+Date.now(),name:'',atmosphere:'',memories:'',enabled:true});
  renderLoc();
}
function delLoc(i){ cfg.location.locations.splice(i,1); renderLoc(); }
function renderNpc(){
  el('npcAll').checked = cfg.npcConfig.autonomyEnabled !== false;
  const box=el('npcList'); box.innerHTML='';
  (cfg.npcConfig.npcs||[]).forEach((n,i)=>{
    const d=document.createElement('div'); d.className='card';
    d.innerHTML='<div class="grid"><span>显示名</span><input type="text" data-npc="'+i+'" data-f="name" value="'+esc(n.name)+'" />'
      +'<span>备注</span><input type="text" data-npc="'+i+'" data-f="note" value="'+esc(n.note||'')+'" />'
      +'<span>触发频率</span><select data-npc="'+i+'" data-f="frequency">'
      + ['low','normal','high'].map(function(f){return '<option value="'+f+'" '+(n.frequency===f?'selected':'')+'>'+({low:'低',normal:'正常',high:'高'}[f])+'</option>';}).join('')
      +'</select><span>启用</span><div class="switch"><input type="checkbox" data-npc="'+i+'" data-f="enabled" '+(n.enabled!==false?'checked':'')+' /><span class="slider" onclick="this.previousElementSibling.click()"></span></div></div>'
      +'<div class="ops">'+(n.role==='background'?'<span class="tag">背景 / 回忆角色</span>':'')+'</div>';
    box.appendChild(d);
  });
}
function renderEvo(){
  const r=cfg.evolveRule;
  el('evolutionEnabled').checked=!!r.evolutionEnabled;
  el('ticksPerDay').value=r.ticksPerDay||2;
  el('eventDensity').value=r.eventDensity||'normal';
  el('cooldownDays').value=r.cooldownDays||2;
  el('randomEventsEnabled').checked=r.randomEventsEnabled!==false;
  el('npcAutonomyEnabled').checked=r.npcAutonomyEnabled!==false;
  el('proactiveChatEnabled').checked=r.proactiveChatEnabled!==false;
  el('sharedWorldEnabled').checked=r.sharedWorldEnabled!==false;
}
function renderData(){
  const sel=el('snapSelect'); sel.innerHTML='';
  (cfg.snapshots||[]).forEach(function(s){
    var o=document.createElement('option'); o.value=s.name; o.textContent=(s.createdAt||'').replace('T',' ').slice(0,19)+' · '+s.reason;
    sel.appendChild(o);
  });
}
function collect(){
  const payload={worldRules:{},evolveRule:{},npcConfig:cfg.npcConfig,location:cfg.location};
  payload.worldRules.herName=el('herName').value.trim();
  payload.worldRules.userName=el('userName').value.trim();
  payload.worldRules.subtitle=el('subtitle').value;
  payload.worldRules.tone=el('tone').value;
  payload.worldRules.presetMemories=(cfg.worldRules.presetMemories||[]).map(function(m,i){
    var ta=document.querySelector('textarea[data-mem="'+i+'"]');
    return Object.assign({},m,{text:ta?ta.value:m.text});
  }).filter(function(m){return String(m.text||'').trim();});
  payload.evolveRule={
    evolutionEnabled:el('evolutionEnabled').checked,
    ticksPerDay:Number(el('ticksPerDay').value)||2,
    eventDensity:el('eventDensity').value,
    cooldownDays:Number(el('cooldownDays').value)||2,
    randomEventsEnabled:el('randomEventsEnabled').checked,
    npcAutonomyEnabled:el('npcAutonomyEnabled').checked,
    proactiveChatEnabled:el('proactiveChatEnabled').checked,
    sharedWorldEnabled:el('sharedWorldEnabled').checked
  };
  payload.npcConfig.autonomyEnabled=el('npcAll').checked;
  document.querySelectorAll('[data-loc]').forEach(function(inp){
    var i=Number(inp.dataset.loc), f=inp.dataset.f, loc=cfg.location.locations[i];
    if(!loc) return;
    loc[f]=inp.type==='checkbox'?inp.checked:inp.value;
  });
  document.querySelectorAll('[data-npc]').forEach(function(inp){
    var i=Number(inp.dataset.npc), f=inp.dataset.f, n=cfg.npcConfig.npcs[i];
    if(!n) return;
    n[f]=inp.type==='checkbox'?inp.checked:inp.value;
  });
  return payload;
}
async function saveAll(){
  const payload=collect();
  const r=await api('/api/admin/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(r.ok){toast('已保存，保存前已自动生成快照');el('saveHint').textContent='已保存 '+new Date().toLocaleTimeString();await reload();}
  else toast('保存失败：'+(r.error||'未知错误'));
}
async function fullBackup(){const r=await api('/api/backup/full');toast(r.ok?('备份完成：'+r.name):('失败：'+r.error));await reload();}
async function rollback(){
  const name=el('snapSelect').value; if(!name) return toast('没有可用快照');
  if(!confirm('确定回滚到快照 '+name+' ？当前状态会先自动备份一份。')) return;
  const r=await api('/api/backup/rollback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({snapshot:name})});
  toast(r.ok?'已回滚':'失败：'+r.error); await reload();
}
async function resetWorld(mode){
  const tip=mode==='full'?'全量重置：配置与状态全部回到初始世界（会先快照）':'清空演化状态：删时间线与动态状态，保留配置与设定（会先快照）';
  if(!confirm(tip+'，确定继续？')) return;
  if(!confirm('二次确认：真的要执行吗？此操作会覆盖当前世界状态。')) return;
  const r=await api('/api/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:mode,confirm:'RESET'})});
  toast(r.ok?'已重置':('失败：'+r.error)); await reload();
}
async function loadEvents(){
  const r=await api('/api/latest/events?limit=30');
  const box=el('eventList'); box.innerHTML='';
  (r.events||[]).forEach(function(e){
    var d=document.createElement('div'); d.className='ev';
    d.innerHTML='<b>'+(e.localAt||'')+'</b> · '+esc(e.type||'')+' · '+esc(e.text||'');
    box.appendChild(d);
  });
}
async function loadPending(){
  const r=await api('/api/event/pending');
  const box=el('pendingList'); box.innerHTML='';
  var link=r.approval||{};
  var note=document.createElement('div'); note.className='ev';
  note.textContent='QQ 链路：'+(link.enabled?('已连接 '+link.wsUrl+'（QQ '+link.ownerQQ+'）'):'未启用');
  box.appendChild(note);
  var pending=(r.items||[]).filter(function(x){return x.status==='pending';});
  if(!pending.length){ var e0=document.createElement('div'); e0.className='ev'; e0.textContent='没有待审批的重大节点。'; box.appendChild(e0); return; }
  pending.forEach(function(it){
    var code=it.code||String(it.id||'').slice(-4);
    var d=document.createElement('div'); d.className='card';
    d.innerHTML='<div class="grid"><span>编号</span><b>'+esc(code)+'</b><span>预案</span><span>'+esc(it.text||'')+'</span></div>'
      +'<div class="ops"><button class="primary" onclick="decidePending(\''+it.id+'\',\'approve\')">同意</button><button class="danger" onclick="decidePending(\''+it.id+'\',\'reject\')">拒绝</button></div>';
    box.appendChild(d);
  });
}
async function decidePending(id,act){
  var path=act==='approve'?'/api/event/approve':'/api/event/reject';
  var r=await api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id})});
  if(r.ok){toast(act==='approve'?'已同意并写入世界线':'已驳回');await loadPending();await reload();}
  else toast('处理失败：'+(r.error||'未知错误'));
}
document.querySelectorAll('.head').forEach(function(h){
  h.onclick=function(){h.parentElement.classList.toggle('open');};
});
reload();
</script>
</body>
</html>`;
