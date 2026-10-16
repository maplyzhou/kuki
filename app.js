/* =========================================================================
   我的工作台 · 主程序
   数据全部存在浏览器本地（localStorage），不上传、不联网。
   ========================================================================= */

/* ---------------------------------------------------------------- 常量 */
var STORE_KEY = 'wb.v1.data';       // 正式数据
var SNAP_KEY  = 'wb.v1.snapshot';   // 导入前的旧数据，用于"撤销导入"

/* 分类各占一个色相（hue），要紧程度靠同一色系的深浅表示 */
var CATS = [
  {id:'stock', name:'股票', hue:205},   // 灰蓝
  {id:'work',  name:'工作', hue:258},   // 灰紫
  {id:'home',  name:'家庭', hue:28},    // 灰杏
  {id:'kid',   name:'孩子', hue:152}    // 灰绿
];

function catHue(id){
  for (var i=0;i<CATS.length;i++){ if (CATS[i].id === id) return CATS[i].hue; }
  return 210;
}

var LEVELS = [
  {id:1, name:'今天必须做'},
  {id:2, name:'这周做'},
  {id:3, name:'有空做'}
];

/* 页面清单：ready 表示做好了，step 表示排在第几步做 */
var PAGES = [
  {id:'dashboard', name:'今日看板', ic:'今', group:'工作台', sub:'打开第一眼要看的东西', ready:true},
  {id:'todo',      name:'待办事项', ic:'办', group:'工作台', sub:'四类 · 截止日期 · 轻重缓急', ready:true},

  {id:'market',    name:'行情看板', ic:'市', group:'市场', sub:'A股大盘 · 隔夜外盘 · 商品汇率，自动刷新', ready:true},
  {id:'news',      name:'财经快讯', ic:'讯', group:'市场', sub:'国内外快讯 + 你的关注词筛选', ready:true},
  {id:'watch',     name:'自选股',   ic:'股', group:'市场', sub:'几十支一屏看完，自动刷新', ready:true},
  {id:'review',    name:'复盘笔记', ic:'记', group:'市场', sub:'每日复盘 · 每周总结', ready:true},

  {id:'homework',  name:'孩子作业', ic:'业', group:'生活', sub:'点「添加作业」粘消息或传图 → 自动拆条 → 打钩', ready:true},
  {id:'reading',   name:'书单和阅读', ic:'书', group:'生活', sub:'书单 · 读到哪了 · 零碎笔记', ready:true},
  {id:'vault',     name:'密码本',   ic:'密', group:'生活', sub:'存在本机 · 一键复制', ready:true},

  {id:'parcel',    name:'待取快递', ic:'递', group:'生活', sub:'粘贴取件短信 → 自动摘出取件码', ready:true},

  {id:'fitness',   name:'健身',     ic:'健', group:'生活', sub:'40 个动作循环动画 + 身体数据曲线', ready:true},

  {id:'minutes',   name:'会议录音转纪要', ic:'录', group:'效率', sub:'本地转写 → AI 整理要点和待办', ready:true}
  ,{id:'ai',       name:'AI 助手',  ic:'AI', group:'效率', sub:'接入大模型：AI 读图 · 以后的股票分析', ready:true}
];

/* ---------------------------------------------------------------- 小工具 */
function $(id){ return document.getElementById(id); }

function esc(s){
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function uid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}

/* 日期工具：全部用 'YYYY-MM-DD' 字符串，避免时区坑 */
function dateStr(d){
  d = d || new Date();
  var m = d.getMonth()+1, day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0'+m : m) + '-' + (day < 10 ? '0'+day : day);
}
function todayStr(){ return dateStr(new Date()); }

/* 两个日期相差几天（b - a） */
function dayDiff(aStr, bStr){
  var a = new Date(aStr + 'T00:00:00'), b = new Date(bStr + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

function cnMonthDay(s){
  var p = String(s).split('-');
  return Number(p[1]) + '月' + Number(p[2]) + '日';
}

var WEEK_CN = ['日','一','二','三','四','五','六'];

function cnFullDate(d){
  d = d || new Date();
  return d.getFullYear() + '年' + (d.getMonth()+1) + '月' + d.getDate() + '日 星期' + WEEK_CN[d.getDay()];
}

/* 本周一 0 点的时间戳 */
function weekStartMs(){
  var d = new Date();
  var off = (d.getDay() + 6) % 7;          // 周一 = 0
  var m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - off, 0, 0, 0, 0);
  return m.getTime();
}

function catName(id){
  for (var i=0;i<CATS.length;i++){ if (CATS[i].id === id) return CATS[i].name; }
  return '未分类';
}
function levelName(id){
  for (var i=0;i<LEVELS.length;i++){ if (LEVELS[i].id === id) return LEVELS[i].name; }
  return '有空做';
}

/* ---------------------------------------------------------------- 数据层 */
var db = { todos: [], meta: {} };

function emptyDb(){
  return { todos: [], watch: [], notes: [], homework: [], books: [], vault: [], parcels: [], hwFixed: [],
           meta: { version:1, lastBackupAt:null, snoozeUntil:0, keywords:'',
                   hwCollapsed:{}, createdAt:Date.now() } };
}

function load(){
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (!raw) { db = emptyDb(); return; }
    db = normalizeDb(JSON.parse(raw));
  } catch(e){
    db = emptyDb();
    alert('读取本地数据失败，已从空白开始。\n（原来的数据可能还在，先别慌，导出前先告诉我）');
  }
}

/* 把数据补齐。老备份、手改过的数据都可能缺字段，缺了就补空的，免得页面崩掉 */
function normalizeDb(obj){
  if (!obj || typeof obj !== 'object') obj = {};
  ['todos','watch','notes','homework','books','vault','parcels'].forEach(function(k){
    if (!(obj[k] instanceof Array)) obj[k] = [];
  });
  if (!(obj.hwFixed instanceof Array)) obj.hwFixed = [];
  if (!(obj.bodyLog instanceof Array)) obj.bodyLog = [];
  if (!(obj.minutes instanceof Array)) obj.minutes = [];
  if (!obj.meta || typeof obj.meta !== 'object') obj.meta = {};
  if (typeof obj.meta.keywords !== 'string') obj.meta.keywords = '';
  if (typeof obj.meta.vaultPass !== 'string') obj.meta.vaultPass = '';
  if (!obj.meta.ai || typeof obj.meta.ai !== 'object') obj.meta.ai = { base:'', model:'', key:'' };
  if (!obj.meta.hwCollapsed || typeof obj.meta.hwCollapsed !== 'object') obj.meta.hwCollapsed = {};
  obj.books.forEach(function(b){ if (!(b.notes instanceof Array)) b.notes = []; });
  return obj;
}

function save(){
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
  catch(e){ alert('保存失败：' + e.message + '\n可能是浏览器存储空间满了，或者禁止了本地存储。'); }
}

/* ---------------------------------------------------------------- 待办逻辑 */
var ui = {
  page:'dashboard', filter:'today', editingId:null,
  onlyKw:false,          // 快讯：只看命中关注词
  onlyHigh:false,        // 快讯：只看重要的
  newsOpen:{},           // 快讯：哪几条展开看了全文
  fxMode:'usd',          // 行情：黄金/比特币按美元还是人民币显示
  bondIdx:2,             // 国债收益率：默认看 10 年期（0=2年 1=5年 2=10年 3=30年）
  bulkOpen:false,        // 自选股：批量添加面板
  watchSort:'pct',       // 自选股排序：pct 按涨幅 / code 按代码 / add 按加入顺序
  noteKind:'day',        // 复盘：day 每日 / week 每周
  noteQuery:'',          // 复盘：搜索词
  noteOpen:null,         // 复盘：哪一篇展开了
  hwDate:'',             // 作业：在看哪一天
  kidMode:false,         // 作业：孩子模式
  bkQuery:'', bkOpen:null, bkAdd:false, bkEdit:null,          // 书单
  vbQuery:'', vbAdd:false, vbEdit:null, vaultUnlocked:false,  // 密码本
  pcPaste:false, pcDraft:null,                                // 待取快递
  wText:false, wTextHits:null,                                // 自选股：从一段文字里认股票
  aiStock:null,                                               // 自选股：AI 分析结果
  mn:{}, mnOpen:null,                                         // 会议录音转纪要
  fitPart:'全部', fitOpen:false, bodyEditId:null               // 健身
};

function openTodos(){ return db.todos.filter(function(t){ return !t.done; }); }

/* 今天的清单 = 没做完 且（没定日期 或 日期到了/过了） */
function todayTodos(){
  var t = todayStr();
  return openTodos().filter(function(x){ return !x.due || x.due <= t; });
}

function sortTodos(list){
  return list.slice().sort(function(a, b){
    if (a.done !== b.done) return a.done ? 1 : -1;         // 打完钩的沉到最下面
    if (a.done) return (b.doneAt||0) - (a.doneAt||0);      // 已完成的按完成时间倒序
    if (a.level !== b.level) return a.level - b.level;     // 越要紧越靠上
    var ad = a.due || '9999-99-99', bd = b.due || '9999-99-99';
    if (ad !== bd) return ad < bd ? -1 : 1;                // 日期越近越靠上
    return (a.createdAt||0) - (b.createdAt||0);
  });
}

function filterTodos(){
  var f = ui.filter, t = todayStr();
  if (f === 'today'){
    /* 今天的清单里，「已完成」只显示今天打完钩的，不然时间长了会越堆越多 */
    return sortTodos(db.todos.filter(function(x){
      if (!x.done) return !x.due || x.due <= t;
      return !!x.doneAt && dateStr(new Date(x.doneAt)) === t;
    }));
  }
  if (f === 'all')   return sortTodos(db.todos);
  if (f === 'late')      return sortTodos(db.todos.filter(function(x){ return !x.done && x.due && x.due < t; }));
  if (f === 'donetoday') return sortTodos(db.todos.filter(function(x){
                           return x.done && x.doneAt && dateStr(new Date(x.doneAt)) === t; }));
  if (f === 'weekdone')  return sortTodos(db.todos.filter(function(x){
                           return x.done && x.doneAt && x.doneAt >= weekStartMs(); }));
  return sortTodos(db.todos.filter(function(x){ return x.cat === f; }));
}

function stats(){
  return { today: todayTodos().length, late: lateCount(), open: openTodos().length,
           doneToday: doneTodayCount(), doneWeek: doneWeekCount() };
}

/* 下面三个是给"点数字跳转"用的计数 */
function lateCount(){
  var t = todayStr();
  return openTodos().filter(function(x){ return x.due && x.due < t; }).length;
}
function doneTodayCount(){
  var t = todayStr();
  return db.todos.filter(function(x){ return x.done && x.doneAt && dateStr(new Date(x.doneAt)) === t; }).length;
}
function doneWeekCount(){
  var w = weekStartMs();
  return db.todos.filter(function(x){ return x.done && x.doneAt && x.doneAt >= w; }).length;
}

function addTodo(){
  var el = $('inText');
  var text = (el.value || '').trim();
  if (!text){
    el.focus();
    el.style.borderColor = 'rgba(196,103,95,.6)';
    setTimeout(function(){ el.style.borderColor = ''; }, 1200);
    return;
  }
  db.todos.push({
    id: uid(),
    text: text,
    cat: $('inCat').value,
    due: $('inDue').value || '',
    level: Number($('inLevel').value),
    done: false,
    doneAt: null,
    createdAt: Date.now()
  });
  save();
  el.value = '';
  var dEl = $('inDue');
  if (dEl) dEl.value = '';                 // 日期用完就清掉，避免下一条被误加上日期
  /* 如果这条在当前筛选里看不到（比如日期定在未来），自动切到「全部」，不然会以为没加上 */
  var added = db.todos[db.todos.length - 1];
  if (ui.filter === 'today' && added.due && added.due > todayStr()) ui.filter = 'all';
  if (CATS.some(function(c){ return c.id === ui.filter; }) && added.cat !== ui.filter) ui.filter = 'all';
  render();
  var again = $('inText');
  if (again) again.focus();
}

function findTodo(id){
  for (var i=0;i<db.todos.length;i++){ if (db.todos[i].id === id) return db.todos[i]; }
  return null;
}

function toggleTodo(id){
  var t = findTodo(id);
  if (!t) return;
  t.done = !t.done;
  t.doneAt = t.done ? Date.now() : null;
  save();
  render();
}

function deleteTodo(id){
  var t = findTodo(id);
  if (!t) return;
  if (!confirm('确定删除这一条吗？\n\n「' + t.text + '」\n\n删了就找不回来了（除非你之前导出过备份）。')) return;
  db.todos = db.todos.filter(function(x){ return x.id !== id; });
  save();
  render();
}

function saveEdit(id){
  var t = findTodo(id);
  if (!t) return;
  var txt = ($('edText').value || '').trim();
  if (!txt){ alert('内容不能是空的。'); return; }
  t.text = txt;
  t.cat = $('edCat').value;
  t.due = $('edDue').value || '';
  t.level = Number($('edLevel').value);
  ui.editingId = null;
  save();
  render();
}

/* ---------------------------------------------------------------- 渲染：待办行 */
function duePill(t){
  if (!t.due) return '<span class="pill due">没定日期</span>';
  var d = dayDiff(todayStr(), t.due);
  if (d < 0)  return '<span class="pill late">逾期 ' + (-d) + ' 天</span>';
  if (d === 0) return '<span class="pill today">今天到期</span>';
  if (d === 1) return '<span class="pill due">明天到期</span>';
  return '<span class="pill due">' + cnMonthDay(t.due) + ' 到期</span>';
}

function todoRow(t){
  if (ui.editingId === t.id){
    var catOpts = CATS.map(function(c){
      return '<option value="' + c.id + '"' + (c.id===t.cat?' selected':'') + '>' + c.name + '</option>';
    }).join('');
    var lvOpts = LEVELS.map(function(l){
      return '<option value="' + l.id + '"' + (l.id===t.level?' selected':'') + '>' + l.name + '</option>';
    }).join('');
    return '<div class="td editing" style="--h:' + catHue(t.cat) + '">' +
      '<input class="inp grow" id="edText" value="' + esc(t.text) + '">' +
      '<select class="inp sel" id="edCat">' + catOpts + '</select>' +
      '<input type="date" class="inp date" id="edDue" value="' + esc(t.due||'') + '">' +
      '<select class="inp sel" id="edLevel">' + lvOpts + '</select>' +
      '<button class="btn primary sm" data-act="saveEdit" data-id="' + t.id + '">保存</button>' +
      '<button class="btn ghost sm" data-act="cancelEdit">取消</button>' +
    '</div>';
  }
  return '<div class="td' + (t.done ? ' done' : '') + '" data-id="' + t.id + '" style="--h:' + catHue(t.cat) + '">' +
      '<div class="bar lv' + t.level + '"></div>' +
      '<button class="chk' + (t.done ? ' on' : '') + '" data-act="toggle" data-id="' + t.id + '" ' +
        'title="' + (t.done ? '点一下撤销打钩' : '点一下打钩') + '"><span>✓</span></button>' +
      '<div class="body">' +
        '<div class="tx">' + esc(t.text) + '</div>' +
        '<div class="meta">' +
          '<span class="pill cat">' + esc(catName(t.cat)) + '</span>' +
          (!t.done ? '<span class="pill lv' + t.level + '">' + esc(levelName(t.level)) + '</span>' : '') +
          duePill(t) +
        '</div>' +
      '</div>' +
      '<div class="ops">' +
        '<button class="btn ghost tiny" data-act="edit" data-id="' + t.id + '">编辑</button>' +
        '<button class="btn ghost tiny danger" data-act="del" data-id="' + t.id + '">删除</button>' +
      '</div>' +
    '</div>';
}

function todoListHtml(list, showDone){
  var open = list.filter(function(x){ return !x.done; });
  var done = list.filter(function(x){ return x.done; });
  var html = '';
  if (!open.length && !done.length){
    return '<div class="empty"><div class="e1">这里还是空的</div>' +
           '上面输入框里写一件事，选好分类和要紧程度，按「添加」或者直接回车。</div>';
  }
  html += open.map(todoRow).join('');
  if (showDone && done.length){
    html += '<div class="done-hd"><span>已完成 ' + done.length + ' 件</span><span class="ln"></span></div>';
    html += done.map(todoRow).join('');
  }
  return html;
}

/* ---------------------------------------------------------------- 渲染：待办页 */
function chipsHtml(){
  var defs = [
    {id:'today',     name:'今天',     n:todayTodos().length},
    {id:'all',       name:'全部',     n:openTodos().length},
    {id:'late',      name:'逾期',     n:lateCount(),  warn:true},
    {id:'donetoday', name:'今天完成', n:doneTodayCount()},
    {id:'weekdone',  name:'本周完成', n:doneWeekCount()}
  ].concat(
    CATS.map(function(c){
      return {id:c.id, name:c.name, hue:c.hue,
              n: openTodos().filter(function(x){ return x.cat === c.id; }).length};
    })
  );
  return defs.map(function(d){
    var tint = '';
    /* 选中的分类按钮染上本类的颜色，一眼知道现在在看哪一类 */
    if (d.hue && ui.filter === d.id){
      tint = ' style="background:hsl(' + d.hue + ',30%,93%);border-color:hsl(' + d.hue + ',28%,85%);' +
             'color:hsl(' + d.hue + ',32%,38%)"';
    }
    return '<button class="chip' + (ui.filter===d.id?' on':'') + (d.warn && d.n ? ' warn' : '') +
             '" data-act="chip" data-f="' + d.id + '"' + tint + '>' +
             esc(d.name) + (d.n ? '<span class="c">' + d.n + '</span>' : '') +
           '</button>';
  }).join('');
}

/* 颜色对照说明，省得你猜哪个颜色是什么 */
function legendHtml(){
  var h = '<div class="legend">';
  CATS.forEach(function(c){
    h += '<span class="li"><span class="sw" style="background:hsl(' + c.hue + ',32%,55%)"></span>' +
         esc(c.name) + '</span>';
  });
  h += '<span class="li" style="margin-left:6px"><span class="note">分类看颜色，要紧程度看深浅：</span></span>';
  h += '<span class="li"><span class="sw" style="background:hsl(210,38%,45%)"></span>今天必须做</span>';
  h += '<span class="li"><span class="sw" style="background:hsl(210,30%,62%)"></span>这周做</span>';
  h += '<span class="li"><span class="sw" style="background:hsl(210,22%,79%)"></span>有空做</span>';
  h += '</div>';
  return h;
}

function addRowHtml(){
  var catOpts = CATS.map(function(c){ return '<option value="' + c.id + '">' + c.name + '</option>'; }).join('');
  var lvOpts = LEVELS.map(function(l){ return '<option value="' + l.id + '"' + (l.id===1?' selected':'') + '>' + l.name + '</option>'; }).join('');
  return '<div class="addrow">' +
      '<input class="inp grow" id="inText" placeholder="要做什么？写完按回车就行">' +
      '<select class="inp sel" id="inCat">' + catOpts + '</select>' +
      '<input type="date" class="inp date" id="inDue" title="截止日期（可以空着）">' +
      '<select class="inp sel" id="inLevel">' + lvOpts + '</select>' +
      '<button class="btn primary" data-act="add">添加</button>' +
    '</div>';
}

function renderTodoPage(){
  var s = stats();
  return '<div class="card glass">' +
      '<div class="card-hd"><div class="t">我的待办</div>' +
        '<div class="r">' +
          '<button class="hnum" data-act="chip" data-f="today">今天要做 <b>' + s.today + '</b> 件</button>' +
          '<button class="hnum" data-act="chip" data-f="donetoday">今天完成 <b>' + s.doneToday + '</b> 件</button>' +
          (s.late ? '<button class="hnum warn" data-act="chip" data-f="late">逾期 <b>' + s.late + '</b> 件</button>' : '') +
        '</div></div>' +
      '<div class="chips">' + chipsHtml() + '</div>' +
      addRowHtml() +
      legendHtml() +
      '<div>' + todoListHtml(filterTodos(), true) + '</div>' +
    '</div>';
}

/* ---------------------------------------------------------------- 渲染：今日看板 */
function renderDashboard(){
  var s = stats();
  var list = todayTodos();
  var html = '';

  html += '<div class="card glass hero">' +
      '<div>' +
        '<div class="big">今天是 <b>' + cnFullDate() + '</b></div>' +
        '<div class="hint">' + (s.today
            ? '今天要做 ' + s.today + ' 件事，' + (s.late ? '其中 ' + s.late + ' 件已经逾期。' : '加油。')
            : '今天没有待办，清清爽爽。') + '</div>' +
      '</div>' +
      '<div class="stats">' +
        '<button class="stat" data-act="gotoFilter" data-page="todo" data-f="today" title="点一下去看今天要做的事">' +
          '<span class="n">' + s.today + '</span><span class="l">今天要做</span></button>' +
        '<button class="stat" data-act="gotoFilter" data-page="todo" data-f="donetoday" title="点一下看今天做完了哪些">' +
          '<span class="n">' + s.doneToday + '</span><span class="l">今天已完成</span></button>' +
        '<button class="stat" data-act="gotoFilter" data-page="todo" data-f="weekdone" title="点一下看这周做完了哪些">' +
          '<span class="n">' + s.doneWeek + '</span><span class="l">本周已完成</span></button>' +
      '</div>' +
    '</div>';

  html += '<div class="card glass">' +
      '<div class="card-hd"><div class="t">市场速览</div>' +
        '<div class="r" style="display:flex;align-items:center;gap:12px">' +
          '<span class="status" id="qStatus">' + boardStatusHtml() + '</span>' +
          '<button class="btn ghost sm" data-act="goto" data-page="market">完整行情 →</button>' +
        '</div></div>' +
      '<div class="strip">' +
        DASH_IDS.map(function(id){
          var it = marketById(id);
          if (!it) return '';
          var inner = boardCellHtml(it, true);
          return it.page
            ? '<a class="mini-q" href="' + it.page + '" target="_blank" rel="noreferrer" ' +
                'id="q-' + it.id + '" data-mini="1">' + inner + '</a>'
            : '<div class="mini-q" id="q-' + it.id + '" data-mini="1">' + inner + '</div>';
        }).join('') +
      '</div>' +
      '<div class="hintline">交易时段每 5 秒自动刷新。完整行情去「行情看板」。</div>' +
    '</div>';

  html += '<div class="card glass">' +
      '<div class="card-hd"><div class="t">今日待办</div>' +
        '<div class="r"><button class="btn ghost sm" data-act="goto" data-page="todo">管理待办 →</button></div></div>' +
      '<div>' + (list.length
        ? list.map(todoRow).join('')
        : '<div class="empty"><div class="e1">今天没有待办</div>' +
          '昨天没做完的会自动滚到今天的清单里，不用你操心。' +
          '<br>想加事项，去「待办事项」页面。</div>') + '</div>' +
    '</div>';

  return html;
}

/* ---------------------------------------------------------------- 渲染：未做模块 */
function renderPlaceholder(p){
  return '<div class="card glass placeholder">' +
      '<div class="ph1">「' + esc(p.name) + '」还没做</div>' +
      '<div class="ph2">这个模块计划在<b>第 ' + p.step + ' 步</b>做。<br>' +
      '它的内容是：' + esc(p.sub) + '</div>' +
      '<div class="ph3">我做好一步就告诉你一次，不用你自己盯着。<br>' +
      '现在能用的只有「今日看板」和「待办事项」。</div>' +
    '</div>';
}

/* ---------------------------------------------------------------- 导航与路由 */
function renderNav(){
  var html = '', lastGroup = '';
  PAGES.forEach(function(p){
    if (p.group !== lastGroup){
      lastGroup = p.group;
      html += '<div class="nav-group">' + esc(p.group) + '</div>';
    }
    html += '<button class="nav-item' + (ui.page===p.id?' active':'') + (p.ready?'':' dim') +
              '" data-act="goto" data-page="' + p.id + '">' +
              '<span class="ic">' + esc(p.ic) + '</span>' +
              '<span>' + esc(p.name) + '</span>' +
              (p.ready ? '' : '<span class="tag">待做</span>') +
            '</button>';
  });
  $('nav').innerHTML = html;
}

function currentPage(){
  for (var i=0;i<PAGES.length;i++){ if (PAGES[i].id === ui.page) return PAGES[i]; }
  return PAGES[0];
}

function render(){
  var p = currentPage();
  syncNoteDraft();     // 先把正在写的笔记从输入框收进内存，免得切页面把字弄丢
  hwSyncDraft();       // 作业预览里改过的字也一样，先收回来再重画
  $('pageTitle').textContent = p.name;
  $('pageSub').textContent = p.ready ? p.sub : (p.sub + '（计划第 ' + p.step + ' 步做）');
  renderNav();

  var html = '';
  if (p.id === 'dashboard')   html = renderDashboard();
  else if (p.id === 'todo')   html = renderTodoPage();
  else if (p.id === 'market') html = renderMarket();
  else if (p.id === 'news')   html = renderNewsPage();
  else if (p.id === 'watch')  html = renderWatchPage();
  else if (p.id === 'review') html = renderReviewPage();
  else if (p.id === 'homework') html = renderHomeworkPage();
  else if (p.id === 'reading')  html = renderReadingPage();
  else if (p.id === 'vault')    html = renderVaultPage();
  else if (p.id === 'parcel')   html = renderParcelPage();
  else if (p.id === 'ai')       html = renderAiPage();
  else if (p.id === 'fitness')  html = renderFitnessPage();
  else if (p.id === 'minutes')  html = renderMinutesPage();
  else                        html = renderPlaceholder(p);
  var view = $('view');
  var pageChanged = (render._last !== p.id);
  render._last = p.id;
  view.innerHTML = html;
  /* 只有在"换页"的时候才放入场动画：不然点个勾也整页重放一遍，反而晃眼 */
  if (pageChanged){
    view.classList.remove('enter');
    void view.offsetWidth;
    view.classList.add('enter');
    clearTimeout(render._t);
    render._t = setTimeout(function(){ view.classList.remove('enter'); }, 1100);
  }

  /* 孩子模式是盖在最上面的全屏层，放在 #kidHost 里，打印时只印它 */
  var host = $('kidHost');
  if (host) host.innerHTML = ui.kidMode ? kidModeHtml() : '';

  /* 编辑状态下把光标放回输入框，不用再点一下 */
  if (ui.editingId){
    var el = $('edText');
    if (el){ el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }
  if (ui.hwEditId){
    var hEl = $('hwEd');
    if (hEl){ hEl.focus(); hEl.setSelectionRange(hEl.value.length, hEl.value.length); }
  }
  kickData();
  if (ui.page === 'fitness') fitAnimStart();     // 动作动画：进入这一页才开始放
}

/* 把正在写的笔记从输入框同步回内存 */
function syncNoteDraft(){
  if (!noteDraft) return;
  var b = $('ndBody'), t = $('ndTitle'), d = $('ndDate');
  if (b) noteDraft.body = b.value;
  if (t) noteDraft.title = t.value;
  if (d) noteDraft.date = d.value;
}

/* 页面刚打开时，如果手上的数据是旧的，就去取一次 */
function kickData(){
  if (needQuotes() && (Date.now() - Q.at > 3000)) refreshQuotes();
  if (ui.page === 'news' && (Date.now() - NEWS.at > 55000)) fetchNews();
}

/* ---------------------------------------------------------------- 备份与恢复 */
function fmtTime(ts){
  if (!ts) return '';
  var d = new Date(ts);
  function p(n){ return n < 10 ? '0'+n : n; }
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function renderBackupInfo(){
  var t = db.meta.lastBackupAt;
  $('lastBak').textContent = t ? ('上次备份：' + fmtTime(t)) : '还没备份过';
}

function exportBackup(){
  /* 备份里不带密钥 —— 免得你哪天把备份文件发给别人，把钱包一起送出去 */
  var copy = JSON.parse(JSON.stringify(db));
  if (copy.meta && copy.meta.ai) copy.meta.ai.key = '';
  var payload = {
    名称:'我的工作台数据备份',
    版本:1,
    导出时间:new Date().toISOString(),
    说明:'为了安全，备份文件里不含 AI 密钥，换电脑后需要重新填一次。',
    数据:copy
  };
  var text = JSON.stringify(payload, null, 2);
  var blob = new Blob([text], {type:'application/json'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = '工作台备份-' + todayStr() + '.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 2000);

  db.meta.lastBackupAt = Date.now();
  save();
  renderBackupInfo();
  hideBanner();
}

function importBackup(file){
  var reader = new FileReader();
  reader.onload = function(){
    var obj;
    try { obj = JSON.parse(reader.result); }
    catch(e){ alert('这个文件读不出来，可能不是备份文件，或者文件坏了。'); return; }
    var data = obj && obj.数据 ? obj.数据 : (obj && obj.data ? obj.data : null);
    if (!data || !(data.todos instanceof Array)){
      alert('这个文件里没有找到工作台数据。\n请确认你选的是「工作台备份-日期.json」这种文件。');
      return;
    }
    var n = data.todos.length;
    if (!confirm('即将用备份里的数据覆盖现在的内容。\n\n备份里有 ' + n + ' 条待办。\n当前有 ' +
                 db.todos.length + ' 条。\n\n覆盖后，如果发现不对，可以点一次「撤销导入」退回来。\n\n继续吗？')) return;
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(db)); } catch(e){}
    var keepKey = (db.meta && db.meta.ai && db.meta.ai.key) ? db.meta.ai.key : '';
    db = normalizeDb(data);          // 老备份缺字段也不怕，这里补齐
    /* 备份里没有密钥，所以保留你本机原来那个，不用重填 */
    if (!db.meta.ai.key) db.meta.ai.key = keepKey;
    save();
    renderBackupInfo();
    /* 换了整套数据，视角也回到首页，不然可能停在某个筛选下看不见东西、以为导入失败 */
    ui.page = 'dashboard'; ui.filter = 'today'; ui.editingId = null;
    render();
    showBanner('导入完成', '已经换成备份里的数据（' + n + ' 条待办）。如果这不是你要的，点右边「撤销导入」退回去。',
               '撤销导入', undoImport);
  };
  reader.onerror = function(){ alert('读取文件失败，换一个文件试试。'); };
  reader.readAsText(file, 'utf-8');
}

function undoImport(){
  var raw = null;
  try { raw = localStorage.getItem(SNAP_KEY); } catch(e){}
  if (!raw){ alert('没有可以退回的数据了。'); hideBanner(); return; }
  try {
    db = JSON.parse(raw);
    db = normalizeDb(db);
  } catch(e){ alert('退回失败，数据可能已经损坏。'); return; }
  save();
  try { localStorage.removeItem(SNAP_KEY); } catch(e){}
  renderBackupInfo();
  ui.page = 'dashboard'; ui.filter = 'today'; ui.editingId = null;
  render();
  showBanner('已退回', '已经回到导入之前的那份数据。', '知道了', hideBanner);
}

/* 备份提醒条 */
var bannerAction = null;
function showBanner(title, desc, actText, act){
  $('bannerTitle').textContent = title;
  $('bannerDesc').textContent = desc;
  $('bannerAct').textContent = actText || '知道了';
  bannerAction = act || hideBanner;
  $('banner').style.display = 'flex';
}
function hideBanner(){ $('banner').style.display = 'none'; }

function maybeWarnBackup(){
  if (!db.todos.length) return;                       // 没数据就不用提醒
  if (Date.now() < (db.meta.snoozeUntil || 0)) return; // 刚提醒过，先不烦你
  var last = db.meta.lastBackupAt;
  var days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  if (last && days < 7) return;
  showBanner(
    last ? ('已经 ' + days + ' 天没备份了') : '还没备份过',
    '数据只存在这台电脑的浏览器里。点左下角「导出备份」存一份 json 文件到硬盘，' +
    '万一以后清缓存或者换电脑，就能用「导入恢复」找回来。',
    '知道了（过 24 小时再说）',
    function(){
      db.meta.snoozeUntil = Date.now() + 24*3600*1000;
      save();
      hideBanner();
    }
  );
}

/* ---------------------------------------------------------------- 时钟 */
function tickClock(){
  var d = new Date();
  function p(n){ return n < 10 ? '0'+n : n; }
  $('clock').textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  $('todayText').textContent = cnFullDate(d);
  $('brandDate').textContent = d.getFullYear() + '.' + p(d.getMonth()+1) + '.' + p(d.getDate()) +
                               ' 星期' + WEEK_CN[d.getDay()];
  /* 跨天了就自动重画一次，昨天的待办会马上滚到今天 */
  if (tickClock.lastDay !== todayStr()){
    if (tickClock.lastDay !== undefined){
      /* 但如果你正在写东西，就先不打扰你 */
      var ta = document.querySelector('textarea');
      if (!ta || !String(ta.value || '').trim()) render();
    }
    tickClock.lastDay = todayStr();
  }
}

/* ---------------------------------------------------------------- 数据定时器 */
var nextQuoteAt = 0, nextNewsAt = 0;

function dataTick(){
  if (document.hidden) return;
  if (needQuotes() && !Q.busy && Date.now() >= nextQuoteAt){
    nextQuoteAt = Date.now() + quoteGap();
    refreshQuotes();
  }
  if (ui.page === 'news' && !NEWS.busy && Date.now() >= nextNewsAt){
    nextNewsAt = Date.now() + 60000;
    fetchNews();
  }
}

/* =========================================================================
   行情数据层（行情看板 / 自选股 / 今日看板速览 三处共用）
   主通道：东方财富   备用：腾讯财经（主通道不通时自动切）
   ========================================================================= */
var EM_URL = {
  https:'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f4,f5,f6,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f23&cb={cb}&secids=',
  http :'http://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f4,f5,f6,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f23&cb={cb}&secids='
};
/* 日K线（东财历史行情，也支持回调） */
var EM_KLINE = {
  https:'https://push2his.eastmoney.com/api/qt/stock/kline/get?fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56,f57&klt=101&fqt=1&end=20500101&cb={cb}&lmt={n}&secid=',
  http :'http://push2his.eastmoney.com/api/qt/stock/kline/get?fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56,f57&klt=101&fqt=1&end=20500101&cb={cb}&lmt={n}&secid='
};
var TX_URL = { https:'https://qt.gtimg.cn/q=', http:'http://qt.gtimg.cn/q=' };
var SN_URL = {
  https:'https://zhibo.sina.com.cn/api/zhibo/feed?page=1&page_size=30&zhibo_id=152&tag_id=0&dire=f&dpc=1&callback={cb}',
  http :'http://zhibo.sina.com.cn/api/zhibo/feed?page=1&page_size=30&zhibo_id=152&tag_id=0&dire=f&dpc=1&callback={cb}'
};
var JIN10 = 'https://www.jin10.com/';
var EASTMONEY = 'https://quote.eastmoney.com/';

/* 股票搜索（东方财富的公开搜索口，支持中文名、拼音首字母、代码） */
var SEARCH_TOKEN = 'D43BF722C8E33BDC906FB84D85E326E8';
var SEARCH_TPL = {
  https:'https://searchapi.eastmoney.com/api/suggest/get?type=14&count=12&token=' + SEARCH_TOKEN + '&cb={cb}&input={q}',
  http :'http://searchapi.eastmoney.com/api/suggest/get?type=14&count=12&token=' + SEARCH_TOKEN + '&cb={cb}&input={q}'
};

/* 行情看板上的固定标的。每个代码都在你这台机器上实测过：
   tx    = 腾讯财经代码（主力通道：东方财富的行情主机在你这网络里连不上，腾讯稳）
   em    = 东方财富代码（备用通道，能通的时候用来补上腾讯没有的）
   huobi = 火币代码（比特币走这条路）
   cny   = 支持"人民币计价"换算：per-gram 按克折算（黄金），usd 直接乘汇率（比特币）
   page  = 点这一格去看详情的网址 */
var MARKET = [
  {id:'sse',     name:'上证指数',     grp:'A股大盘',   tx:'s_sh000001', em:'1.000001',   page:'https://gu.qq.com/sh000001'},
  {id:'szse',    name:'深证成指',     grp:'A股大盘',   tx:'s_sz399001', em:'0.399001',   page:'https://gu.qq.com/sz399001'},
  {id:'chinext', name:'创业板指',     grp:'A股大盘',   tx:'s_sz399006', em:'0.399006',   page:'https://gu.qq.com/sz399006'},
  {id:'star50',  name:'科创50',       grp:'A股大盘',   tx:'s_sh000688', em:'1.000688',   page:'https://gu.qq.com/sh000688'},

  {id:'dji',     name:'道琼斯',       grp:'隔夜外盘',  tx:'usDJI',      em:'100.DJIA',   page:'https://gu.qq.com/usDJI'},
  {id:'spx',     name:'标普500',      grp:'隔夜外盘',  tx:'usINX',      em:'100.SPX',    page:'https://gu.qq.com/usINX'},
  {id:'ixic',    name:'纳斯达克',     grp:'隔夜外盘',  tx:'usIXIC',     em:'100.NDX',    page:'https://gu.qq.com/usIXIC'},
  {id:'hsi',     name:'恒生指数',     grp:'隔夜外盘',  tx:'hkHSI',      em:'100.HSI',    page:'https://gu.qq.com/hkHSI'},
  {id:'hstech',  name:'恒生科技指数', grp:'隔夜外盘',  tx:'hkHSTECH',   em:'124.HSTECH', page:'https://gu.qq.com/hkHSTECH'},
  {id:'n225',    name:'日经225',      grp:'隔夜外盘',                   em:'100.N225', cnbc:'.N225'},
  {id:'kospi',   name:'韩国KOSPI',    grp:'隔夜外盘',                   em:'100.KS11', cnbc:'.KS11'},

  {id:'udi',     name:'美元指数',     grp:'商品与汇率',                 em:'100.UDI',  cnbc:'.DXY'},
  {id:'xau',     name:'黄金 · 伦敦金', grp:'商品与汇率', tx:'hf_XAU', em:'122.XAU',   unit:'美元/盎司', cny:'per-gram'},
  {id:'gc',      name:'COMEX黄金',    grp:'商品与汇率', tx:'hf_GC',  em:'101.GC00Y', unit:'美元/盎司', cny:'per-gram'},
  {id:'cl',      name:'NYMEX原油',    grp:'商品与汇率', tx:'hf_CL',  em:'102.CL00Y', unit:'美元/桶'},
  {id:'oil',     name:'布伦特原油',   grp:'商品与汇率', tx:'hf_OIL', em:'112.B00Y',  unit:'美元/桶'},
  {id:'btc',     name:'比特币',       grp:'商品与汇率', huobi:'btcusdt', unit:'美元',  cny:'usd'}
];
function marketById(id){
  for (var i = 0; i < MARKET.length; i++){ if (MARKET[i].id === id) return MARKET[i]; }
  return null;
}
/* 今日看板上的速览（挑每天必看的几个） */
var DASH_IDS = ['sse','dji','ixic','xau','cl','btc'];

/* 自选股里存的是东方财富代码，这里翻译成腾讯代码：
   A 股 s_sh / s_sz，港股 hk+代码，美股 us+代码，外盘商品查表 */
var TX_EXTRA = {
  '100.DJIA':'usDJI', '100.SPX':'usINX', '100.NDX':'usIXIC', '100.HSI':'hkHSI',
  '101.GC00Y':'hf_GC', '102.CL00Y':'hf_CL', '112.B00Y':'hf_OIL'
};
function txIdOf(secid){
  var p = String(secid).split('.');
  var code = p[1] || '';
  if (p[0] === '1') return 's_sh' + code;
  if (p[0] === '0') return 's_sz' + code;
  if (p[0] === '116') return 'hk' + code;
  if (p[0] === '105' || p[0] === '106' || p[0] === '107') return 'us' + code;
  return TX_EXTRA[secid] || null;
}
function digitsOf(secid){ return 2; }

/* ---------------------------------------------------------------- 通用小工具 */
function stripTags(s){ return String(s || '').replace(/<[^>]*>/g, ''); }
function isNum(x){ return x !== undefined && x !== null && x !== '' && isFinite(Number(x)); }
function fmtNum(n, digits){
  if (!isNum(n)) return '—';
  var d = isFinite(Number(digits)) ? Number(digits) : 2;
  return Number(n).toLocaleString('zh-CN', {minimumFractionDigits:d, maximumFractionDigits:d});
}
function sign(n){ return Number(n) > 0 ? '+' : ''; }
function dirOf(n){ return Number(n) > 0 ? 'up' : (Number(n) < 0 ? 'down' : 'flat'); }
function arrowOf(n){ return Number(n) > 0 ? '▲' : (Number(n) < 0 ? '▼' : '—'); }

/* JSONP：把返回的数据通过回调函数交给我们，带超时保护 */
function jsonpUrl(url, timeout){
  timeout = timeout || 9000;
  return new Promise(function(resolve, reject){
    var name = 'wb_cb_' + Math.random().toString(36).slice(2);
    var s = document.createElement('script');
    var done = false;
    var timer = setTimeout(function(){ fail(new Error('超时')); }, timeout);
    function clean(){
      clearTimeout(timer);
      if (s.parentNode) s.parentNode.removeChild(s);
      try { delete window[name]; } catch(e){ window[name] = undefined; }
    }
    function fail(err){ if (done) return; done = true; clean(); reject(err); }
    window[name] = function(data){ if (done) return; done = true; clean(); resolve(data); };
    s.src = url.replace('{cb}', name);
    s.onerror = function(){ fail(new Error('网络请求失败')); };
    document.head.appendChild(s);
  });
}
/* 先 HTTPS，失败自动换 HTTP；两条都试过才算不通 */
function jsonpBoth(httpsUrl, httpUrl, timeout){
  return jsonpUrl(httpsUrl, timeout).catch(function(){ return jsonpUrl(httpUrl, timeout); });
}
/* 腾讯是"返回一段 JS 变量"，没有回调函数，只能整体加载后读全局变量 */
function loadOneScript(url){
  return new Promise(function(resolve, reject){
    var s = document.createElement('script');
    s.charset = 'gbk';
    var done = false;
    var timer = setTimeout(function(){ fail(new Error('超时')); }, 8000);
    function clean(){ clearTimeout(timer); if (s.parentNode) s.parentNode.removeChild(s); }
    function fail(err){ if (done) return; done = true; clean(); reject(err); }
    s.onload = function(){ if (done) return; done = true; clean(); resolve(); };
    s.onerror = function(){ fail(new Error('加载失败')); };
    s.src = url;
    document.head.appendChild(s);
  });
}
function loadScriptBoth(httpsUrl, httpUrl){
  return loadOneScript(httpsUrl).catch(function(){ return loadOneScript(httpUrl); });
}

/* 解析腾讯的三种返回格式（靠代码前缀区分，不靠猜） */
function parseTx(raw, txId){
  if (typeof raw !== 'string' || !raw) return null;
  txId = String(txId);
  if (txId.indexOf('hf_') === 0){                       // 外盘商品：逗号分隔
    var c = raw.split(',');
    var v0 = Number(c[0]);
    if (!isFinite(v0)) return null;
    var prev = Number(c[7]);
    return {name:c[c.length-1], val:v0, pct:Number(c[1]), amt:isFinite(prev) ? (v0-prev) : null, src:'腾讯'};
  }
  var a = raw.split('~');
  var val = Number(a[3]), name = a[1];
  if (!isFinite(val)) return null;
  if (txId.indexOf('s_') === 0){                        // A 股简版
    return {name:name, val:val, pct:Number(a[5]), amt:Number(a[4]), src:'腾讯'};
  }
  for (var i = 4; i < a.length; i++){                   // 美股：找到"日期 时间"那格，后两格是涨跌额和涨跌幅
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(a[i])){
      return {name:name, val:val, pct:Number(a[i+2]), amt:Number(a[i+1]), src:'腾讯'};
    }
  }
  /* 港股（恒生、恒生科技这些）没有那格日期，就拿第 4 格当昨收自己算涨跌 */
  var prev = Number(a[4]);
  if (isFinite(prev) && prev > 0){
    var chg = val - prev;
    return {name:name, val:val, pct:chg / prev * 100, amt:chg,
            prev:prev, open:isNum(a[5]) ? Number(a[5]) : null, src:'腾讯'};
  }
  return {name:name, val:val, pct:null, amt:null, src:'腾讯'};
}

/* 取行情：先东财，不行自动切腾讯 */
function mapEastmoney(list, secids){
  var map = {};
  secids.forEach(function(sid){
    var code = String(sid).split('.')[1];
    for (var i = 0; i < list.length; i++){
      if (String(list[i].f12) === code){
        var d = list[i];
        map[sid] = {name:d.f14, val:d.f2, pct:d.f3, amt:d.f4,
                    open:d.f17, high:d.f15, low:d.f16, prev:d.f18,
                    vol:d.f5, amount:d.f6, turnover:d.f8, pe:d.f9,
                    volRatio:d.f10, mktCap:d.f20, floatCap:d.f21, pb:d.f23, src:''};
        break;
      }
    }
  });
  if (!Object.keys(map).length) throw new Error('返回内容对不上');
  return map;
}

/* 日K线：返回最近的 N 根，按时间从早到晚 */
function fetchKline(secid, n){
  n = n || 30;
  var h = EM_KLINE.https.replace('{n}', n) + encodeURIComponent(secid);
  var p = EM_KLINE.http.replace('{n}', n) + encodeURIComponent(secid);
  function once(){
    return jsonpBoth(h, p, 9000).then(function(res){
      var k = res && res.data && res.data.klines;
      if (!k || !k.length) throw new Error('没取到K线');
      return k.map(function(s){
        var a = String(s).split(',');
        return {date:a[0], open:Number(a[1]), close:Number(a[2]),
                high:Number(a[3]), low:Number(a[4]), vol:Number(a[5]), amt:Number(a[6])};
      });
    });
  }
  /* 失败隔 1 秒再试一次：网络抖一下、或者刚好被限流，第二次常常就好了 */
  return once().catch(function(){
    return new Promise(function(r){ setTimeout(r, 1000); }).then(once);
  });
}
function fetchQuotesFromTencent(secids){
  var ids = [], back = {};
  secids.forEach(function(sid){
    var t = txIdOf(sid);
    if (t){ ids.push(t); back[t] = sid; }
  });
  if (!ids.length) return Promise.reject(new Error('这些标的没有备用代码'));
  var q = 'q=' + ids.join(',') + '&_=' + Date.now();
  return loadScriptBoth(TX_URL.https + q, TX_URL.http + q).then(function(){
    var map = {};
    Object.keys(back).forEach(function(t){
      var d = parseTx(window['v_' + t], t);
      if (d) map[back[t]] = d;
    });
    if (!Object.keys(map).length) throw new Error('备用通道没读到数据');
    return map;
  });
}
/* 东方财富这条路：连着失败几次就先歇 30 分钟（有些网络把东财的行情主机挡了，别每次都白等） */
var EM = { fails:0, skipUntil:0 };
function fetchQuotesFromEastmoney(secids){
  if (!secids.length) return Promise.resolve({});
  if (Date.now() < EM.skipUntil) return Promise.resolve({});
  var q = secids.join(',');
  function once(){
    return jsonpBoth(EM_URL.https + q, EM_URL.http + q, 8000).then(function(res){
      var list = res && res.data && res.data.diff;
      if (!list || !list.length) throw new Error('东财没返回内容');
      var m = mapEastmoney(list, secids);
      Object.keys(m).forEach(function(k){ m[k].src = '东方财富'; });
      EM.fails = 0;
      return m;
    });
  }
  /* 失败隔 1.2 秒再试一次：网络抖一下或者刚好被限流，第二次常常就好了 */
  return once().catch(function(){
    return new Promise(function(r){ setTimeout(r, 1200); }).then(once);
  }).catch(function(){
    EM.fails++;
    if (EM.fails >= 3) EM.skipUntil = Date.now() + 30*60*1000;
    return {};
  });
}
/* 取行情：先腾讯（实测最稳），缺的再问东财 */
function fetchQuotes(secids){
  if (!secids.length) return Promise.resolve({map:{}, src:'—'});
  var byTx = secids.filter(function(s){ return !!txIdOf(s); });
  var pTx = byTx.length ? fetchQuotesFromTencent(byTx).catch(function(){ return {}; })
                        : Promise.resolve({});
  return pTx.then(function(map){
    var left = secids.filter(function(s){ return !map[s]; });
    if (!left.length){
      return {map: map, src:'腾讯'};
    }
    return fetchQuotesFromEastmoney(left).then(function(em){
      var emN = 0;
      Object.keys(em).forEach(function(k){ if (!map[k]){ map[k] = em[k]; emN++; } });
      var missing = secids.filter(function(s){ return !map[s]; });
      var srcs = [];
      if (Object.keys(map).length - emN > 0) srcs.push('腾讯');
      if (emN > 0) srcs.push('东方财富');
      if (!srcs.length) srcs.push('东方财富');
      return {map: map, src: srcs.join(' + '), partial: missing.length > 0};
    });
  });
}

/* 当前这一屏的行情快照 */
var Q  = { map:{}, at:0, src:'', state:'idle', err:'', fails:0, busy:false, last:{} };
/* 行情看板单独一份状态：看板用标的 id（sse/xau/btc…），自选股用东财代码，互不干扰 */
var MB = { map:{}, at:0, src:'', state:'idle', err:'', missing:[], busy:false, last:{} };

/* 人民币计价换算用的汇率（10 分钟更新一次，够用） */
var FX = { cny:null, at:0, busy:false };
var OZ_TO_GRAM = 31.1034768;      // 1 金衡盎司 = 31.1034768 克

function needQuotes(){ return ui.page === 'market' || ui.page === 'watch' || ui.page === 'dashboard'; }
function secidsForPage(){ return db.watch.map(function(w){ return w.secid; }); }
function marketState(){
  var d = new Date(), w = d.getDay();
  if (w === 0 || w === 6) return '周末休市';
  var m = d.getHours()*60 + d.getMinutes();
  if (m < 9*60+15) return '尚未开盘';
  if (m <= 11*60+30) return '交易中';
  if (m < 13*60) return '午间休市';
  if (m <= 15*60) return '交易中';
  return '已收盘';
}
function quoteGap(){
  var g = (marketState() === '交易中') ? 5000 : 30000;
  if (Q.fails >= 2 || MB.state === 'fail') g = 20000;
  return g;
}
function timeHms(t){
  if (!t) return '—';
  return ('0'+t.getHours()).slice(-2) + ':' + ('0'+t.getMinutes()).slice(-2) + ':' + ('0'+t.getSeconds()).slice(-2);
}

function refreshQuotes(){
  if (!needQuotes() || document.hidden) return;
  if (ui.page === 'watch'){ refreshWatchQuotes(); return; }
  refreshBoard();
}

/* ---------------- 自选股：走东财代码（认不出东财的自动转腾讯） ---------------- */
function refreshWatchQuotes(){
  if (Q.busy) return;
  var ids = secidsForPage();
  if (!ids.length){ Q.map = {}; Q.at = Date.now(); Q.state = 'ok'; paintQuotes(); return; }
  Q.busy = true;
  fetchQuotes(ids).then(function(r){
    Q.map = r.map; Q.src = r.src; Q.partial = !!r.partial;
    Q.at = Date.now(); Q.state = 'ok'; Q.fails = 0; Q.err = '';
  }).catch(function(e){
    Q.state = 'fail'; Q.fails++; Q.err = e.message;
  }).then(function(){ Q.busy = false; paintQuotes(); });
}

/* 只替换数字，不重画整页 —— 否则你在输入框里打字会被打断 */
function paintQuotes(){
  if (ui.page !== 'watch') return;
  secidsForPage().forEach(function(sid){
    var el = $('q-' + sid);
    if (!el) return;
    var nv = Q.map[sid] ? Q.map[sid].val : null;
    var changed = (Q.last[sid] !== undefined && Q.last[sid] !== nv);
    Q.last[sid] = nv;
    el.innerHTML = cellHtml(sid, el.getAttribute('data-mini') === '1', el.getAttribute('data-name') || '');
    if (changed) flashEl(el);
  });
  var st = $('qStatus');
  if (st) st.innerHTML = statusHtml();
}
function flashEl(el){
  el.classList.remove('flash');
  void el.offsetWidth;                  // 强制浏览器重算，动画才会重新播
  el.classList.add('flash');
  setTimeout(function(){ el.classList.remove('flash'); }, 900);
}
function statusHtml(){
  var st = marketState();
  var t = Q.at ? new Date(Q.at) : null;
  if (Q.state === 'fail'){
    return '<span class="dot warn"></span>行情没取到 · ' + esc(Q.err) + ' · 会自动重试';
  }
  if (!Q.at) return '<span class="dot warn"></span>正在取行情…';
  return '<span class="dot ok"></span>' + esc(st) + ' · 更新于 ' + timeHms(t) +
         ' · 来源：' + esc(Q.src || '—') + (Q.partial ? '（部分数据缺失）' : '');
}

function cellHtml(sid, mini, fixedName){
  var d = Q.map[sid];
  var nm = fixedName || (d && d.name) || sid;
  if (!d){
    return '<div class="' + (mini ? 'a' : 'nm') + '">' + esc(nm) + '</div>' +
           '<div class="' + (mini ? 'b' : 'vv') + ' flat">—</div>' +
           '<div class="' + (mini ? 'c' : 'cc') + '"><span class="flat">暂无数据</span></div>';
  }
  var hasPct = isNum(d.pct), hasAmt = isNum(d.amt);
  var base = hasPct ? Number(d.pct) : (hasAmt ? Number(d.amt) : 0);
  var dir = dirOf(base), arrow = arrowOf(base), dg = digitsOf(sid);
  var pctTxt = hasPct ? (arrow + ' ' + sign(d.pct) + fmtNum(d.pct, 2) + '%') : '';
  if (mini){
    return '<div class="a">' + esc(nm) + '</div>' +
           '<div class="b ' + dir + '">' + fmtNum(d.val, dg) + '</div>' +
           '<div class="c ' + dir + '">' + (pctTxt || '—') + '</div>';
  }
  var h = '<div class="nm">' + esc(nm) + (d.src ? '<span class="src">' + esc(d.src) + '</span>' : '') + '</div>' +
          '<div class="vv ' + dir + '">' + fmtNum(d.val, dg) + '</div>' +
          '<div class="cc">' +
            (hasPct ? '<span class="' + dir + '">' + pctTxt + '</span>' : '') +
            (hasAmt ? '<span class="' + dir + '">' + sign(d.amt) + fmtNum(d.amt, dg) + '</span>' : '') +
          '</div>';
  if (isNum(d.open) || isNum(d.high) || isNum(d.low) || isNum(d.prev)){
    h += '<div class="mini">' +
      (isNum(d.open) ? '<span>开 ' + fmtNum(d.open, dg) + '</span>' : '') +
      (isNum(d.high) ? '<span>高 ' + fmtNum(d.high, dg) + '</span>' : '') +
      (isNum(d.low)  ? '<span>低 ' + fmtNum(d.low, dg) + '</span>' : '') +
      (isNum(d.prev) ? '<span>昨收 ' + fmtNum(d.prev, dg) + '</span>' : '') +
      '</div>';
  }
  return h;
}

/* =========================================================================
   行情看板：三个通道自动接力
   ① 腾讯财经（主力，实测最稳）  ② 火币（比特币）  ③ 东方财富（能通就补数据）
   ========================================================================= */
function boardItems(){
  if (ui.page === 'dashboard') return MARKET.filter(function(m){ return DASH_IDS.indexOf(m.id) >= 0; });
  return MARKET.slice();
}
/* 不管在哪个页面，取数都取整张表：这样从看板切到行情页不会出现"还没来得及取"的空格 */
function boardFetchItems(){ return MARKET.slice(); }

/* 人民币汇率：页面上黄金/比特币要按人民币显示时才真去取 */
function fxCny(){
  if (FX.cny && Date.now() - FX.at < 10*60*1000) return FX.cny;
  if (!FX.busy){
    FX.busy = true;
    fetch('https://open.er-api.com/v6/latest/USD', { mode:'cors' })
      .then(function(r){ return r.json(); })
      .then(function(j){
        var v = j && j.rates && Number(j.rates.CNY);
        if (isNum(v)){ FX.cny = v; FX.at = Date.now(); }
      })
      .catch(function(){})
      .then(function(){ FX.busy = false; });
  }
  return FX.cny;
}

/* 一次把能交给腾讯的标的全查了 */
function fetchBoardFromTencent(items){
  var pairs = items.filter(function(it){ return it.tx; })
                   .map(function(it){ return {id:it.id, tx:it.tx}; });
  if (!pairs.length) return Promise.resolve({});
  var q = 'q=' + pairs.map(function(p){ return p.tx; }).join(',') + '&_=' + Date.now();
  return loadScriptBoth(TX_URL.https + q, TX_URL.http + q).then(function(){
    var map = {};
    pairs.forEach(function(p){
      var d = parseTx(window['v_' + p.tx], p.tx);
      if (d) map[p.id] = d;
    });
    return map;
  });
}
/* 比特币：火币 + 币安两家互相备份（这两个口浏览器都能直接读，实测都通） */
function btcFromHuobi(it){
  return fetch('https://api.huobi.pro/market/detail/merged?symbol=' + it.huobi, { mode:'cors' })
    .then(function(r){ return r.json(); })
    .then(function(j){
      var t = j && j.tick;
      if (!t || !isNum(t.close)) throw new Error('火币没返回');
      var close = Number(t.close), open = Number(t.open);
      return { name:it.name, val:close, open:open, high:Number(t.high), low:Number(t.low), prev:open,
               amt: isNum(open) ? (close - open) : null,
               pct: (isNum(open) && open) ? (close - open) / open * 100 : null, src:'火币' };
    });
}
function btcFromBinance(it){
  return fetch('https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT', { mode:'cors' })
    .then(function(r){ return r.json(); })
    .then(function(j){
      var close = Number(j && j.lastPrice);
      if (!isNum(close)) throw new Error('币安没返回');
      var prev = Number(j.prevClosePrice), pct = Number(j.priceChangePercent);
      return { name:it.name, val:close, open:Number(j.openPrice), high:Number(j.highPrice),
               low:Number(j.lowPrice), prev:isFinite(prev) ? prev : null,
               amt: isNum(j.priceChange) ? Number(j.priceChange) : null,
               pct: isFinite(pct) ? pct : null, src:'币安' };
    });
}
/* 一家不行就换另一家，再不行隔一会儿重试；都失败才留空（下一轮会自动补回来） */
function fetchBoardFromBitcoin(it){
  function waitRetry(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  return btcFromHuobi(it)
    .catch(function(){ return waitRetry(600).then(function(){ return btcFromBinance(it); }); })
    .catch(function(){ return waitRetry(1500).then(function(){ return btcFromHuobi(it); }); })
    .catch(function(){ return null; })
    .then(function(d){ return d ? { id: it.id, d: d } : null; });
}
/* CNBC：日经、韩国、美元指数这几个腾讯没有的，从它这儿取（实测能读、还在实时更新） */
function fetchBoardFromCNBC(items){
  var pairs = items.filter(function(it){ return it.cnbc; })
                   .map(function(it){ return {id:it.id, s:it.cnbc}; });
  if (!pairs.length) return Promise.resolve({});
  return fetchCNBC(pairs.map(function(p){ return p.s; })).then(function(m){
    var out = {};
    pairs.forEach(function(p){ if (m[p.s]) out[p.id] = m[p.s]; });
    return out;
  }).catch(function(){ return {}; });
}
/* 东方财富：只用来补腾讯没有的那几个（日经、韩国、美元指数…） */
function fetchBoardFromEastmoney(items){
  var left = items.filter(function(it){ return it.em; });
  if (!left.length) return Promise.resolve({});
  var secids = left.map(function(it){ return it.em; });
  return fetchQuotesFromEastmoney(secids).then(function(em){
    var out = {};
    left.forEach(function(it){
      var d = em[it.em];
      if (d){ d.name = d.name || it.name; out[it.id] = d; }
    });
    return out;
  });
}

function refreshBoard(){
  if (MB.busy) return;
  var items = boardFetchItems();
  if (!items.length) return;
  MB.busy = true;
  refreshBonds();                    // 国债收益率：顺手一起更新（十分钟内不会重复拉）
  fetchBoardFromTencent(items).catch(function(){ return {}; }).then(function(map){
    var rest   = items.filter(function(it){ return !map[it.id]; });
    var huobiP = rest.filter(function(it){ return it.huobi; }).map(fetchBoardFromBitcoin);
    var cnbcP  = fetchBoardFromCNBC(rest);
    var emP    = fetchBoardFromEastmoney(rest);
    return Promise.all([Promise.all(huobiP), cnbcP, emP]).then(function(res){
      res[0].forEach(function(x){ if (x && !map[x.id]) map[x.id] = x.d; });
      Object.keys(res[1] || {}).forEach(function(k){
        if (!map[k]) map[k] = res[1][k];
      });
      Object.keys(res[2] || {}).forEach(function(k){
        if (!map[k]) map[k] = res[2][k];
      });
      var srcs = [];
      Object.keys(map).forEach(function(k){
        var s = map[k].src || '';
        if (s && srcs.indexOf(s) < 0) srcs.push(s);
      });
      /* 这一轮没取到的，先把上一轮的值留着（行情偶尔抖一下不该让格子变空），
         下一轮取到就自动覆盖 */
      var merged = {};
      Object.keys(MB.map).forEach(function(k){ merged[k] = MB.map[k]; });
      Object.keys(map).forEach(function(k){ merged[k] = map[k]; });
      MB.map = merged;
      MB.src = srcs.join(' + ');
      MB.fetched = items.map(function(it){ return it.id; });
      MB.missingIds = items.filter(function(it){ return !merged[it.id]; }).map(function(it){ return it.id; });
      MB.missing = items.filter(function(it){ return !merged[it.id]; }).map(function(it){ return it.name; });
      MB.at = Date.now();
      MB.state = Object.keys(merged).length ? 'ok' : 'fail';
      if (MB.state === 'fail') MB.err = '所有通道都没取到';
    });
  }).catch(function(e){
    MB.state = 'fail'; MB.err = e.message;
  }).then(function(){ MB.busy = false; paintBoard(); });
}

function paintBoard(){
  if (ui.page !== 'market' && ui.page !== 'dashboard') return;
  boardItems().forEach(function(it){
    var el = $('q-' + it.id);
    if (!el) return;
    var nv = MB.map[it.id] ? MB.map[it.id].val : null;
    var changed = (MB.last[it.id] !== undefined && MB.last[it.id] !== nv);
    MB.last[it.id] = nv;
    el.innerHTML = boardCellHtml(it, el.getAttribute('data-mini') === '1');
    if (changed) flashEl(el);
  });
  var st = $('qStatus');
  if (st) st.innerHTML = boardStatusHtml();
  var miss = $('qMissing');
  if (miss) miss.innerHTML = boardMissingHtml();
}

function boardStatusHtml(){
  if (MB.state === 'fail') return '<span class="dot warn"></span>行情没取到 · ' + esc(MB.err || '') + ' · 会自动重试';
  if (!MB.at) return '<span class="dot warn"></span>正在取行情…';
  return '<span class="dot ok"></span>' + esc(marketState()) + ' · 更新于 ' + timeHms(new Date(MB.at)) +
         ' · 来源：' + esc(MB.src || '—');
}
/* 缺的那几项单独说清楚，不跟"来源"混在一起 */
function boardMissingHtml(){
  if (!MB.at) return '';
  var vis = boardItems().map(function(it){ return it.id; });
  var hard = [], soft = [];
  MARKET.forEach(function(it){
    if (MB.map[it.id] || vis.indexOf(it.id) < 0) return;
    if (it.tx || it.huobi) soft.push(it.name); else hard.push(it.name);
  });
  if (!hard.length && !soft.length) return '这一屏 ' + vis.length + ' 项都有数据。';
  var parts = [];
  if (hard.length){
    parts.push('这 ' + hard.length + ' 项取不到：<b>' + esc(hard.join('、')) +
      '</b>（它们只有东方财富一条路，而东财的行情主机在你这网络里连不上，程序隔一会儿会自动重试）');
  }
  if (soft.length){
    parts.push('这 ' + soft.length + ' 项刚才没取到：<b>' + esc(soft.join('、')) + '</b>（会自动重试）');
  }
  return parts.join('；');
}

/* 一格行情长什么样。mini=true 是今日看板上的小条 */
function boardCellHtml(it, mini){
  var d = MB.map[it.id];
  var nm = it.name;
  if (!d){
    var why;
    if (!MB.at) why = '正在取…';
    else if (!it.tx && !it.huobi) why = '当前网络取不到';
    else why = (MB.missingIds || []).indexOf(it.id) >= 0 ? '没取到，会自动重试' : '正在取…';
    return '<div class="' + (mini ? 'a' : 'nm') + '">' + esc(nm) + '</div>' +
           '<div class="' + (mini ? 'b' : 'vv') + ' flat">—</div>' +
           '<div class="' + (mini ? 'c' : 'cc') + '"><span class="flat">' + why + '</span></div>';
  }
  var hasPct = isNum(d.pct), hasAmt = isNum(d.amt);
  var base = hasPct ? Number(d.pct) : (hasAmt ? Number(d.amt) : 0);
  var dir = dirOf(base), arrow = arrowOf(base), dg = 2;
  var pctTxt = hasPct ? (arrow + ' ' + sign(d.pct) + fmtNum(d.pct, 2) + '%') : '';

  var showCny = (ui.fxMode === 'cny') && !!it.cny;
  var rate = (it.cny || showCny) ? fxCny() : null;      // 需要换算时才去取汇率
  var unit = it.unit || '';
  var note = '';
  function conv(x){                                     // 把美元价折成人民币
    if (!showCny || !isNum(x) || !isNum(rate)) return x;
    return (it.cny === 'per-gram') ? (Number(x) * rate / OZ_TO_GRAM) : (Number(x) * rate);
  }
  if (showCny){
    if (!isNum(rate)){
      return '<div class="' + (mini ? 'a' : 'nm') + '">' + esc(nm) + ' · 人民币</div>' +
             '<div class="' + (mini ? 'b' : 'vv') + ' flat">—</div>' +
             '<div class="' + (mini ? 'c' : 'cc') + '"><span class="flat">汇率没取到，稍后自动重试</span></div>';
    }
    unit = (it.cny === 'per-gram') ? '元/克' : '元';
    note = '按 1 美元≈' + fmtNum(rate, 2) + ' 元折算';
  } else if (it.cny === 'per-gram' && isNum(rate) && isNum(d.val)){
    note = '≈ ' + fmtNum(Number(d.val) * rate / OZ_TO_GRAM, 0) + ' 元/克';
  } else if (it.cny === 'usd' && isNum(rate) && isNum(d.val)){
    note = '≈ ' + fmtNum(Number(d.val) * rate, 0) + ' 元';
  }

  var val = conv(d.val);
  var amt = isNum(d.amt) ? conv(d.amt) : null;
  var unitTxt = unit ? '<span class="unit">' + esc(unit) + '</span>' : '';
  if (mini){
    return '<div class="a">' + esc(nm) + unitTxt + '</div>' +
           '<div class="b ' + dir + '">' + fmtNum(val, dg) + '</div>' +
           '<div class="c ' + dir + '">' + (pctTxt || '—') + '</div>';
  }
  var h = '<div class="nm">' + esc(nm) + unitTxt +
            (d.src ? '<span class="src">' + esc(d.src) + '</span>' : '') + '</div>' +
          '<div class="vv ' + dir + '">' + fmtNum(val, dg) + '</div>' +
          '<div class="cc">' +
            (hasPct ? '<span class="' + dir + '">' + pctTxt + '</span>' : '') +
            (isNum(amt) ? '<span class="' + dir + '">' + sign(amt) + fmtNum(amt, dg) + '</span>' : '') +
          '</div>';
  var bits = [];
  if (isNum(d.open)) bits.push('开 ' + fmtNum(conv(d.open), dg));
  if (isNum(d.high)) bits.push('高 ' + fmtNum(conv(d.high), dg));
  if (isNum(d.low))  bits.push('低 ' + fmtNum(conv(d.low), dg));
  if (isNum(d.prev)) bits.push('昨收 ' + fmtNum(conv(d.prev), dg));
  if (bits.length || note){
    h += '<div class="mini">' + bits.map(function(s){ return '<span>' + esc(s) + '</span>'; }).join('') +
         (note ? '<span class="note">' + esc(note) + '</span>' : '') + '</div>';
  }
  return h;
}

/* =========================================================================
   国债收益率（中国 / 美国，按期限左右滑动切换）
   美国：财政部官方公布的每日国债收益率曲线（官方、权威、跨域可读）
   中国：东方财富的中债收益率（能连上东财的网络才取得到）
   ========================================================================= */
var BOND_TENORS = [
  {key:'2y',  label:'2 年',  us:'2 Yr',  cn:'171.CN2Y',  cnbcUs:'US2Y',  cnbcCn:'CN2Y'},
  {key:'5y',  label:'5 年',  us:'5 Yr',  cn:'171.CN5Y',  cnbcUs:'US5Y'},
  {key:'10y', label:'10 年', us:'10 Yr', cn:'171.CN10Y', cnbcUs:'US10Y', cnbcCn:'CN10Y'},
  {key:'30y', label:'30 年', us:'30 Yr', cn:'171.CN30Y', cnbcUs:'US30Y'}
];
var BOND = { us:{}, cn:{}, usDate:'', usSrc:'', cnSrc:'', at:0, busy:false, err:'', cnErr:'', usErr:'' };

/* =========================================================================
   CNBC 的公开行情口：日经、韩国、美元指数、中美国债收益率都能一次取到
   （实测浏览器可直接读，比东财那条路在你这网络里稳得多）
   ========================================================================= */
var CNBC_URL = 'https://quote.cnbc.com/quote-html-webservice/quote.htm' +
               '?symbols={syms}&requestMethod=quick&noform=1&partnerId=2&output=json';
function fetchCNBC(symbols){
  if (!symbols || !symbols.length) return Promise.resolve({});
  var url = CNBC_URL.replace('{syms}', symbols.join('%7C'));
  return fetch(url, { mode:'cors' }).then(function(r){
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function(j){
    var arr = (j && j.QuickQuoteResult && j.QuickQuoteResult.QuickQuote) || [];
    var map = {};
    arr.forEach(function(q){
      var v = Number(q.last);
      if (!isFinite(v)) return;                      // 这个符号没数据，跳过
      var chg = Number(q.change);
      map[q.symbol] = { val:v,
                        amt: isFinite(chg) ? chg : null,
                        pct: isNum(q.change_pct) ? Number(q.change_pct) : null,
                        open: Number(q.open), high: Number(q.high), low: Number(q.low),
                        prev: isFinite(chg) ? (v - chg) : null,
                        src:'CNBC' };
    });
    if (!Object.keys(map).length) throw new Error('CNBC 没返回可用数据');
    return map;
  });
}

/* 美国财政部：今年的每日收益率曲线 CSV（一行一天，列是各期限）
   CNBC 取不到时用它兜底 —— 官方权威，只是每天更新一次 */
function fetchBondUS(){
  var y = new Date().getFullYear();
  var url = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/' +
            'daily-treasury-rates.csv/' + y + '/all?type=daily_treasury_yield_curve' +
            '&field_tdr_date_value=' + y + '&page&_format=csv';
  return fetch(url, { mode:'cors' }).then(function(r){
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }).then(function(txt){
    var lines = String(txt).replace(/\r/g, '').trim().split('\n');
    if (lines.length < 2) throw new Error('返回内容不对');
    var head = lines[0].split(',').map(function(h){ return h.replace(/"/g, '').trim(); });
    var rows = lines.slice(1).filter(function(l){ return l.trim(); }).map(function(l){ return l.split(','); });
    function dkey(r){
      var p = String(r[0]).replace(/"/g, '').split('/');
      return Number(p[2]) * 10000 + Number(p[0]) * 100 + Number(p[1]);
    }
    rows.sort(function(a, b){ return dkey(b) - dkey(a); });      // 新的排前面
    var now = rows[0], prev = rows[1] || rows[0];
    BOND.usDate = String(now[0]).replace(/"/g, '');
    head.forEach(function(name, i){
      if (i === 0) return;
      var v = Number(now[i]), p = Number(prev[i]);
      if (!isFinite(v)) return;
      /* 只有 CNBC 没给的期限才用它补，别把实时的盖掉 */
      if (!BOND.us[name] || !BOND.us[name].live){
        BOND.us[name] = { v:v, prev:isFinite(p) ? p : v, live:0,
                          chgBp: isFinite(p) ? (v - p) * 100 : null, src:'美国财政部官方' };
      }
    });
    BOND.usSrc = '美国财政部官方';
  });
}
/* 中国国债收益率：先问 CNBC，缺的再问东财（网络能通的时候才有值） */
function fetchBondCN(){
  var need = BOND_TENORS.filter(function(t){ return !BOND.cn[t.key]; });
  if (!need.length){ return Promise.resolve(); }
  if (Date.now() < EM.skipUntil){ BOND.cnErr = '东方财富这条线在你这网络里连不上'; return Promise.resolve(); }
  var secids = need.map(function(t){ return t.cn; });
  return fetchQuotesFromEastmoney(secids).then(function(m){
    var got = 0;
    need.forEach(function(t){
      var q = m[t.cn];
      if (q && isNum(q.val)){
        BOND.cn[t.key] = { v:Number(q.val), live:0, chgBp: isNum(q.amt) ? Number(q.amt) * 100 : null,
                           src:'东方财富' };
        BOND.cnSrc = '东方财富';
        got++;
      }
    });
    BOND.cnErr = got ? '' : '这个期限暂时没有能用的数据源';
  }).catch(function(){ BOND.cnErr = '这个期限暂时没有能用的数据源'; });
}
function refreshBonds(){
  if (BOND.busy) return Promise.resolve();
  if (BOND.at && Date.now() - BOND.at < 5*60*1000) return Promise.resolve();
  BOND.busy = true;
  var usSyms = BOND_TENORS.map(function(t){ return t.cnbcUs; });
  var cnSyms = BOND_TENORS.filter(function(t){ return t.cnbcCn; }).map(function(t){ return t.cnbcCn; });
  return fetchCNBC(usSyms.concat(cnSyms)).then(function(m){
    var gotUs = 0, gotCn = 0;
    BOND_TENORS.forEach(function(t){
      var du = m[t.cnbcUs];
      if (du && isNum(du.val)){
        BOND.us[t.us] = { v:du.val, prev:du.prev, live:1,
                          chgBp: isNum(du.amt) ? du.amt * 100 : null, src:'CNBC' };
        gotUs++;
      }
      var dc = t.cnbcCn ? m[t.cnbcCn] : null;
      if (dc && isNum(dc.val)){
        BOND.cn[t.key] = { v:dc.val, prev:dc.prev, live:1,
                           chgBp: isNum(dc.amt) ? dc.amt * 100 : null, src:'CNBC' };
        gotCn++;
      }
    });
    if (gotUs) BOND.usSrc = 'CNBC';
    if (gotCn) BOND.cnSrc = 'CNBC';
    BOND.usErr = '';
    /* 美国还缺期限 → 用财政部官方曲线补；中国还缺 → 问东财 */
    return Promise.all([
      (gotUs < BOND_TENORS.length) ? fetchBondUS().catch(function(e){ BOND.usErr = e.message; }) : null,
      (gotCn < cnSyms.length) ? fetchBondCN() : null
    ]);
  }).catch(function(e){
    BOND.usErr = e.message;
    /* CNBC 整个不通：至少把美国那份官方曲线取回来 */
    return fetchBondUS().catch(function(e2){ BOND.usErr = e2.message; });
  }).then(function(){
    BOND.at = Date.now(); BOND.busy = false; paintBonds();
  });
}

function bondSpread(t){
  var us = BOND.us[t.us], cn = BOND.cn[t.key];
  if (!us || !cn) return null;
  return cn.v - us.v;
}
function bondPaneHtml(t){
  function side(kind){
    var isUs = (kind === 'us');
    var d = isUs ? BOND.us[t.us] : BOND.cn[t.key];
    var tags = '<span class="btag ' + (isUs ? 'us' : 'cn') + '">' + (isUs ? '美国' : '中国') + '</span>';
    if (!d){
      var note = isUs ? (BOND.usErr || '还没取到') : '这个期限暂时没有能用的数据源';
      return '<div class="bside">' + tags +
          '<div class="bval empty">—</div>' +
          '<div class="bnote">' + esc(note) + '</div></div>';
    }
    var srcTxt = (d.src || '') + (d.live ? '' : '（日频）');
    var chg = '<div class="bchg flat"><span class="bmini">来源：' + esc(srcTxt) + '</span></div>';
    if (isNum(d.chgBp)){
      var bp = Number(d.chgBp);
      chg = '<div class="bchg ' + (bp > 0 ? 'up' : (bp < 0 ? 'down' : 'flat')) + '">' +
            (bp > 0 ? '+' : '') + fmtNum(bp, 1) + ' BP' +
            (isNum(d.prev) ? '<span class="bmini">前值 ' + fmtNum(d.prev, 3) + '%</span>' : '') +
            '<span class="bmini">' + esc(srcTxt) + '</span></div>';
    }
    return '<div class="bside">' + tags +
        '<div class="bval">' + fmtNum(d.v, 3) + '<span class="bunit">%</span></div>' + chg + '</div>';
  }
  var sp = bondSpread(t);
  return '<div class="bpane">' +
      '<div class="brow">' + side('cn') + side('us') + '</div>' +
      '<div class="bspread">' + t.label + '期中美国债利差（中国 − 美国）：' +
        (sp === null ? '<b>—</b>' : '<b>' + (sp > 0 ? '+' : '') + fmtNum(sp, 3) + '%</b>') +
      '</div></div>';
}
function bondCardHtml(){
  var idx = ui.bondIdx || 0;
  var n = BOND_TENORS.length;
  var tabs = BOND_TENORS.map(function(t, i){
    return '<button class="chip' + (i === idx ? ' on' : '') + '" data-act="bondTab" data-i="' + i + '">' +
           esc(t.label) + '</button>';
  }).join('');
  var dots = BOND_TENORS.map(function(t, i){
    return '<button class="bonddot' + (i === idx ? ' on' : '') + '" data-act="bondTab" data-i="' + i + '" ' +
           'title="' + esc(t.label) + '期"></button>';
  }).join('');
  return '<div class="card glass bondcard">' +
      '<div class="card-hd"><div class="t">国债收益率</div>' +
        '<div class="r" style="display:flex;align-items:center;gap:8px">' +
          '<button class="btn ghost tiny" data-act="bondPrev">◀</button>' +
          '<span class="bondnow">' + esc(BOND_TENORS[idx].label) + '</span>' +
          '<button class="btn ghost tiny" data-act="bondNext">▶</button>' +
        '</div></div>' +
      '<div class="bondview">' +
        '<div class="bondtrack" style="transform:translateX(-' + (idx * 100) + '%)">' +
          BOND_TENORS.map(bondPaneHtml).join('') +
        '</div>' +
      '</div>' +
      '<div class="bondfoot">' +
        '<div class="bondtabs">' + tabs + '</div>' +
        '<div class="bonddots">' + dots + '</div>' +
      '</div>' +
      '<div class="hintline">左右滑动卡片（也可以点 ◀ ▶、点上面的期限、或者按键盘 ← →）切换期限。<br>' +
      '美国国债来自 <b>CNBC</b>，取不到时自动用<b>美国财政部官方每日曲线</b>兜底' +
        (BOND.usDate ? '（官方那份数据日期 ' + esc(BOND.usDate) + '）' : '') + '；' +
      '中国国债来自 <b>CNBC</b>' + (BOND.cnErr ? '（' + esc(BOND.cnErr) + '）' : '') +
        '，能取到的是 <b>2 年和 10 年</b>这两个期限，其余期限暂时没有能用的公开数据源。</div>' +
    '</div>';
}
function paintBonds(){
  var host = $('bondHost');
  if (host) host.innerHTML = bondCardHtml();
}
/* 切换期限：滑轨 + 小圆点 + 上面的期限按钮一起动 */
function bondGo(i){
  var n = BOND_TENORS.length;
  if (i < 0) i = 0;
  if (i > n - 1) i = n - 1;
  ui.bondIdx = i;
  var track = document.querySelector('.bondtrack');
  if (track){
    track.classList.add('sliding');
    track.style.transform = 'translateX(-' + (i * 100) + '%)';
  }
  var now = document.querySelector('.bondnow');
  if (now) now.textContent = BOND_TENORS[i].label;
  var dots = document.querySelectorAll('.bonddot');
  for (var k = 0; k < dots.length; k++){ dots[k].className = 'bonddot' + (k === i ? ' on' : ''); }
  var tabs = document.querySelectorAll('.bondtabs [data-act="bondTab"]');
  for (var j = 0; j < tabs.length; j++){ tabs[j].className = 'chip' + (j === i ? ' on' : ''); }
}

function emLink(secid){ return 'https://quote.eastmoney.com/unify/r/' + secid; }
/* 点一格去看详情：能对上腾讯页面的就用腾讯（东财的行情页在你这网络里打不开）
   hf_ 开头的是外盘商品，腾讯没有对应网页，就退回东财 */
function quotePage(txId){
  if (!txId) return '';
  if (String(txId).indexOf('hf_') === 0) return '';
  return 'https://gu.qq.com/' + String(txId).replace(/^s_/, '');
}

/* =========================================================================
   行情看板
   ========================================================================= */
function renderMarket(){
  var groups = [];
  MARKET.forEach(function(m){ if (groups.indexOf(m.grp) < 0) groups.push(m.grp); });

  var html = '<div class="card glass">' +
      '<div class="card-hd"><div class="t">行情看板</div>' +
        '<div class="r" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
          '<button class="chip' + (ui.fxMode === 'cny' ? ' on' : '') + '" data-act="fxMode">' +
            '黄金/比特币：' + (ui.fxMode === 'cny' ? '人民币' : '美元') + '</button>' +
          '<span class="status" id="qStatus">' + boardStatusHtml() + '</span>' +
        '</div></div>' +
      '<div class="hintline">交易时段每 5 秒自动刷新，收盘后 30 秒一次；数字变了会闪一下。<br>' +
      '数据自动在几家之间接力：<b>腾讯财经 → CNBC → 火币／币安（比特币）→ 东方财富</b>，每个格子上会写清楚这条是从哪来的。<br>' +
      '点「黄金/比特币」那个按钮，可以在<b>美元</b>和<b>人民币</b>之间切换（人民币按实时汇率折算）。<br>' +
      '<span id="qMissing">' + boardMissingHtml() + '</span></div>' +
    '</div>';

  groups.forEach(function(g){
    var items = MARKET.filter(function(m){ return m.grp === g; });
    var cols = items.length <= 4 ? ('c' + items.length) : (items.length <= 6 ? 'c3' : 'c4');
    html += '<div class="card glass">' +
        '<div class="card-hd"><div class="t">' + esc(g) + '</div>' +
          '<div class="r">' + items.length + ' 项</div></div>' +
        '<div class="qgrid ' + cols + '">' +
          items.map(function(m){
            var cell = boardCellHtml(m, false);
            if (!m.page) return '<div class="qcell" id="q-' + m.id + '">' + cell + '</div>';
            return '<a class="qcell" href="' + m.page + '" target="_blank" rel="noreferrer" ' +
                     'id="q-' + m.id + '">' + cell + '</a>';
          }).join('') +
        '</div></div>';
    if (g === '商品与汇率') html += '<div id="bondHost">' + bondCardHtml() + '</div>';
  });
  return html;
}

/* =========================================================================
   财经快讯
   ========================================================================= */
var NEWS = { list:[], at:0, lastId:null, state:'idle', err:'', busy:false };

function fetchNews(){
  if (NEWS.busy) return Promise.resolve();
  NEWS.busy = true;
  return jsonpBoth(SN_URL.https, SN_URL.http, 9000).then(function(res){
    var list = res && res.result && res.result.data && res.result.data.feed && res.result.data.feed.list;
    if (!list || !list.length) throw new Error('快讯为空');
    NEWS.list = list.map(function(it){
      return { id:Number(it.id),
               time:String(it.create_time || '').slice(11,16),
               text:stripTags(it.rich_text),
               tag:(it.tag && it.tag[0] && it.tag[0].name) || '',
               focus:(Number(it.is_focus) === 1 || Number(it.top_value) > 0) ? 1 : 0,
               url:it.docurl || '' };
    });
    NEWS.at = Date.now(); NEWS.state = 'ok'; NEWS.err = '';
  }).catch(function(e){
    NEWS.state = 'fail'; NEWS.err = e.message;
  }).then(function(){ NEWS.busy = false; paintNews(); });
}

function keywords(){
  return String(db.meta.keywords || '').split(/[,，、;；\s]+/).filter(function(s){ return s.length > 0; });
}

/* ---------------------------------------------------------------------------
   快讯"重不重要"怎么判断（照着金十数据的思路：会影响大盘的才算重要）
   ① 新浪自己标了置顶/加精的 → 重要
   ② 命中"大事"关键词的 → 重要（红色标出来）
   ③ 又长又是公司公告的 → 噪音，只留一行简介
   --------------------------------------------------------------------------- */
var NEWS_HIGH = [
  /美联储|加息|降息|降准|缩表|央行|货币政策|流动性|逆回购|MLF|LPR|公开市场/,
  /国常会|政治局|国务院|发改委|证监会|财政部|商务部|工信部|住建部|金融监管|监管层|两会/,
  /关税|制裁|出口管制|禁运|贸易战|反倾销|谈判|协议|峰会|白宫|欧盟|北约|OPEC/,
  /非农|CPI|PPI|GDP|PMI|失业率|通胀|通缩|零售销售|EIA|初请|超预期|不及预期/,
  /暴跌|暴涨|熔断|崩盘|闪崩|跌停潮|涨停潮|狂飙|重挫|跳水|大涨|大跌|创新高|创新低/,
  /战争|冲突|袭击|空袭|停火|军事|地缘|霍尔木兹|红海|台海|朝鲜/,
  /重磅|突发|紧急|刚刚|历史性|首次|立案|退市|停牌|暂停|破产|违约|爆雷|违规|处罚|下调|上调/
];
function newsLevel(n){
  if (n && n.focus) return 'high';
  var t = (n && n.text) || '';
  for (var i = 0; i < NEWS_HIGH.length; i++){ if (NEWS_HIGH[i].test(t)) return 'high'; }
  if (n && n.tag === '公司' && t.length > 46) return 'low';
  if (t.length > 90) return 'low';
  return 'mid';
}
/* 只留第一句（最多 46 个字），长的公司公告就缩成这一行 */
function newsBrief(t){
  var s = String(t || '');
  var m = s.match(/^([^。；;]{1,46}[。；;])/);
  if (m) return m[1];
  return s.length > 46 ? (s.slice(0, 46) + '…') : s;
}

function hitWords(text){
  var hit = [];
  keywords().forEach(function(k){ if (String(text).indexOf(k) >= 0) hit.push(k); });
  return hit;
}
function newsListHtml(){
  var showAll = NEWS.list;
  var list = ui.onlyKw ? showAll.filter(function(n){ return hitWords(n.text).length > 0; }) : showAll;
  if (ui.onlyHigh) list = list.filter(function(n){ return newsLevel(n) === 'high'; });
  if (!list.length){
    if (NEWS.state === 'fail')  return '<div class="empty">快讯没取到：' + esc(NEWS.err) + '<br>页面会自动重试。</div>';
    if (!NEWS.list.length)      return '<div class="empty">正在取快讯…</div>';
    if (ui.onlyHigh)            return '<div class="empty">这会儿没有"重要"级别的快讯。<br>把「只看重要」关掉就能看到全部。</div>';
    return '<div class="empty">没有命中关注词的快讯。<br>把「只看关注」关掉就能看到全部。</div>';
  }
  var firstLoad = (NEWS.lastId === null);
  return list.slice(0, 60).map(function(n){
    var fresh = (!firstLoad && n.id > NEWS.lastId) ? ' fresh' : '';
    var hits = hitWords(n.text);
    var high = (newsLevel(n) === 'high');
    var open = high || !!ui.newsOpen[n.id];
    var brief = newsBrief(n.text);
    var cut = brief.length < String(n.text || '').length;
    return '<div class="nitem ' + (high ? 'high' : 'norm') + fresh + (hits.length ? ' hit' : '') + '">' +
        '<div class="tm">' + esc(n.time) + '</div>' +
        '<div class="tx">' + (high ? '<span class="lvtag">重要</span>' : '') + esc(open ? n.text : brief) +
          (hits.length ? '<span class="hitmark">关注：' + esc(hits.join('·')) + '</span>' : '') + '</div>' +
        (n.tag ? '<div class="tg">' + esc(n.tag) + '</div>' : '') +
        '<div class="nact">' +
          (cut ? '<button class="btn ghost tiny" data-act="' + (open ? 'newsFold' : 'newsOpen') +
                 '" data-id="' + n.id + '">' + (open ? '收起' : '展开') + '</button>' : '') +
          (n.url ? '<a class="btn ghost tiny" href="' + esc(n.url) + '" target="_blank" ' +
                   'rel="noreferrer">原文</a>' : '') +
        '</div>' +
      '</div>';
  }).join('');
}
function paintNews(){
  var el = $('newsList');
  if (el) el.innerHTML = newsListHtml();
  var st = $('newsTime');
  if (st){
    if (NEWS.state === 'fail')      st.innerHTML = '<span class="dot warn"></span>没取到 · ' + esc(NEWS.err);
    else if (!NEWS.at)              st.innerHTML = '<span class="dot warn"></span>正在取…';
    else st.innerHTML = '更新于 ' + new Date(NEWS.at).toLocaleTimeString('zh-CN', {hour12:false});
  }
  if (NEWS.list.length && NEWS.list[0].id) NEWS.lastId = NEWS.list[0].id;
}
function renderNewsPage(){
  return '<div class="card glass">' +
      '<div class="card-hd"><div class="t">财经快讯</div>' +
        '<div class="r" id="newsTime" style="font-size:12px;color:var(--ink-3)">正在取…</div></div>' +
      '<div class="toolbar">' +
        '<input class="inp grow" id="kwInput" placeholder="关注词，多个用逗号隔开，例如：半导体,降息,汇率" value="' +
          esc(db.meta.keywords || '') + '">' +
        '<button class="btn ghost" data-act="kwSave">保存关注词</button>' +
        '<button class="chip' + (ui.onlyKw ? ' on' : '') + '" data-act="onlyKw">只看关注</button>' +
        '<button class="chip' + (ui.onlyHigh ? ' on' : '') + '" data-act="onlyHigh">只看重要</button>' +
        '<a class="btn ghost" href="' + JIN10 + '" target="_blank" rel="noreferrer">打开金十</a>' +
        '<a class="btn ghost" href="' + EASTMONEY + '" target="_blank" rel="noreferrer">打开东方财富</a>' +
      '</div>' +
      '<div id="newsList">' + newsListHtml() + '</div>' +
      '<div class="hintline">每 60 秒自动拉一次；新出现的会闪一下，命中关注词的会变浅黄并标出命中了哪个词。<br>' +
      '<b>红色的「重要」</b>是照着金十数据的思路挑的：美联储／央行政策、关税制裁、重磅数据、暴涨暴跌、突发事件这类会影响大盘的；' +
      '公司公告这种又长又琐碎的只留一行简介，想细看就点「展开」。<br>' +
      '金十数据自己的网站抓不到（它要求特殊身份标识），所以内容来自新浪财经 7×24 全球快讯，覆盖国内外消息。</div>' +
    '</div>';
}

/* 保存关注词。silent=true 时只存不弹提示（比如顺手点「只看关注」的时候） */
function saveKeywords(silent){
  var el = $('kwInput');
  if (el) db.meta.keywords = String(el.value || '').trim();
  save();
  paintNews();
  if (silent) return;
  var ks = keywords();
  alert(ks.length ? ('已保存 ' + ks.length + ' 个关注词：\n' + ks.join('、') +
                     '\n\n以后快讯里命中这些词的会变成浅黄色，并标出命中了哪个词。')
                  : '关注词已清空。');
}

function sortedWatch(){
  var arr = db.watch.slice();
  if (ui.watchSort === 'pct'){
    arr.sort(function(a, b){
      var pa = Q.map[a.secid] ? Number(Q.map[a.secid].pct) : NaN;
      var pb = Q.map[b.secid] ? Number(Q.map[b.secid].pct) : NaN;
      if (!isFinite(pa)) pa = -99999;
      if (!isFinite(pb)) pb = -99999;
      return pb - pa;
    });
  } else if (ui.watchSort === 'code'){
    arr.sort(function(a, b){ return a.code < b.code ? -1 : (a.code > b.code ? 1 : 0); });
  }
  return arr;
}
function watchCardHtml(w){
  var pg = quotePage(txIdOf(w.secid)) || emLink(w.secid);
  return '<div class="wcard">' +
      '<a class="qcell" href="' + pg + '" target="_blank" rel="noreferrer" ' +
        'id="q-' + w.secid + '" data-sid="' + w.secid + '">' + cellHtml(w.secid, false, w.name) + '</a>' +
      '<div class="wfoot">' +
        '<button class="btn ghost tiny" data-act="aiStock" data-secid="' + w.secid + '" ' +
          'data-code="' + esc(w.code) + '" data-name="' + esc(w.name) + '">AI 分析</button>' +
        '<button class="btn ghost tiny" data-act="unwatch" data-secid="' + w.secid + '">移除</button>' +
      '</div>' +
    '</div>';
}
function bulkHtml(){
  return '<div class="writepad">' +
      '<div style="font-size:13px;font-weight:500">批量添加：一行一个代码就行</div>' +
      '<div style="font-size:12px;color:var(--ink-3);line-height:1.9">' +
        '600519　　← 只写代码也可以<br>000001 平安银行　　← 后面带名字也行（名字我会自己查，你不用写）</div>' +
      '<textarea id="bulkText" placeholder="在这里粘贴，一行一个"></textarea>' +
      '<div class="wrow">' +
        '<button class="btn primary" data-act="bulkAdd">开始添加</button>' +
        '<button class="btn ghost" data-act="bulkToggle">取消</button>' +
        '<span style="font-size:12px;color:var(--ink-3)">重复的会自动跳过。</span>' +
      '</div></div>';
}
function renderWatchPage(){
  var list = sortedWatch();
  return '<div class="card glass">' +
      '<div class="card-hd"><div class="t">自选股</div>' +
        '<div class="r status" id="qStatus">' + statusHtml() + '</div></div>' +
      aiStockPanelHtml() +
      '<div class="toolbar">' +
        '<span class="wsearch">' +
          '<input class="inp" id="wCode" autocomplete="off" ' +
            'placeholder="搜股票：名字、拼音首字母或代码" oninput="watchSearchDebounced(this.value)">' +
          '<div class="hits" id="wHits"></div>' +
        '</span>' +
        '<button class="btn primary" data-act="watchAdd">添加</button>' +
        '<button class="btn ghost" data-act="bulkToggle">' + (ui.bulkOpen ? '收起批量添加' : '批量添加') + '</button>' +
        '<button class="btn ghost" data-act="wTextToggle">' + (ui.wText ? '收起文字识别' : '从文字里认股票') + '</button>' +
        '<span style="flex:1 1 20px"></span>' +
        '<span style="font-size:12px;color:var(--ink-3)">排序</span>' +
        '<button class="chip' + (ui.watchSort === 'pct'  ? ' on' : '') + '" data-act="watchSort" data-v="pct">按涨幅</button>' +
        '<button class="chip' + (ui.watchSort === 'code' ? ' on' : '') + '" data-act="watchSort" data-v="code">按代码</button>' +
        '<button class="chip' + (ui.watchSort === 'add'  ? ' on' : '') + '" data-act="watchSort" data-v="add">按加入顺序</button>' +
      '</div>' +
      (ui.bulkOpen ? bulkHtml() : '') +
      (ui.wText ? wTextPanel() : '') +
      (list.length
        ? '<div class="wgrid">' + list.map(watchCardHtml).join('') + '</div>'
        : '<div class="empty"><div class="e1">自选股还是空的</div>' +
          '在上面输入 6 位股票代码就能加进来，加过一次就记住了。<br>' +
          '几十支的话用「批量添加」，粘贴一列代码一次搞定。</div>') +
      '<div class="hintline">当前共 ' + db.watch.length + ' 支。交易时段每 5 秒自动刷新；点卡片跳东方财富看详情。</div>' +
    '</div>';
}

/* ---------------------------------------------------------------- 股票搜索 */
var wSearchTimer = null, wLastHits = [], wSearchSeq = 0;

function watchSearchDebounced(v){
  if (wSearchTimer) clearTimeout(wSearchTimer);
  if (!String(v || '').trim()){ showHits([]); return; }
  wSearchTimer = setTimeout(function(){ watchSearch(String(v)); }, 220);
}

function watchSearch(q){
  q = String(q || '').trim();
  if (!q){ showHits([]); return; }
  var seq = ++wSearchSeq;
  var enc = encodeURIComponent(q);
  jsonpBoth(SEARCH_TPL.https.replace('{q}', enc), SEARCH_TPL.http.replace('{q}', enc), 8000)
    .then(function(res){
      if (seq !== wSearchSeq) return;                 // 又敲了新字，旧结果丢掉
      var list = (res && res.QuotationCodeTable && res.QuotationCodeTable.Data) || [];
      var hits = [];
      list.forEach(function(d){
        var sid = String(d.QuoteID || '');
        if (!/^[01]\./.test(sid)) return;             // 只要沪深两市（A股、基金、指数），不要港美股期货
        hits.push({secid:sid, code:String(d.Code || ''), name:String(d.Name || ''),
                   py:String(d.PinYin || ''), type:String(d.SecurityTypeName || '')});
      });
      wLastHits = hits.slice(0, 10);
      showHits(wLastHits, q);
    })
    .catch(function(){
      if (seq !== wSearchSeq) return;
      wLastHits = [];
      showHits(null, q);
    });
}

/* hits === null 表示搜索服务连不上 */
function showHits(hits, q){
  var el = $('wHits');
  if (!el) return;
  if (hits === null){
    el.className = 'hits on';
    el.innerHTML = '<div class="hit tip"><span class="hc">搜索服务暂时连不上。可以直接输 6 位代码' +
                   '（例如 600519）再点「添加」，或者用「批量添加」。</span></div>';
    return;
  }
  if (!hits.length){
    if (q){
      el.className = 'hits on';
      el.innerHTML = '<div class="hit tip"><span class="hc">没搜到「' + esc(q) + '」。试试：' +
                     '拼音首字母（gzmt）、名字（茅台）、6 位代码（600519）。</span></div>';
    } else {
      el.className = 'hits';
      el.innerHTML = '';
    }
    return;
  }
  el.className = 'hits on';
  el.innerHTML = hits.map(function(h, i){
    var has = db.watch.some(function(w){ return w.secid === h.secid; });
    return '<div class="hit' + (has ? ' added' : '') + '" data-act="watchPick" data-i="' + i + '">' +
        '<span class="hn">' + esc(h.name) + '</span>' +
        '<span class="hc">' + esc(h.code) + (h.py ? ' · ' + esc(h.py) : '') + '</span>' +
        '<span class="ht">' + esc(h.type || '') + (has ? ' · 已在自选' : '') + '</span>' +
      '</div>';
  }).join('');
}

/* 从搜索结果里直接加，市场号是接口给的，不用猜 */
function addWatchBySecid(secid, code, name){
  if (db.watch.some(function(w){ return w.secid === secid; })){
    alert('「' + name + '」已经在自选股里了。');
    return;
  }
  if (db.watch.length >= 120){ alert('自选股最多 120 支。'); return; }
  db.watch.push({secid:secid, code:code, name:name, addedAt:Date.now()});
  save();
  var inp = $('wCode');
  if (inp) inp.value = '';
  wLastHits = [];
  render();
  refreshQuotes();
}

/* 一行一个代码；也允许后面跟名字，反正名字我们会重新查 */
/* =========================================================================
   从一段文字里认股票（配合"识别图片文字"小工具用）
   ========================================================================= */
var WT_CN = /[\u4e00-\u9fa5]/;

/* 一行一支地找：行首的中文名 + 行里的 6 位代码 */
function watchTextExtract(raw){
  var seen = {}, out = [];
  String(raw || '').replace(/\r/g, '').split('\n').forEach(function(line){
    line = String(line).trim();
    if (!line) return;
    /* 6 位代码，前面可能带 SH / SZ / BJ */
    var codes = [];
    var cre = /\b(?:SH|SZ|BJ)?(\d{6})\b/gi, cm;
    while ((cm = cre.exec(line)) !== null){ if (codes.indexOf(cm[1]) < 0) codes.push(cm[1]); }
    var nm = line.match(/^[\s*·\-•>]+/);
    if (nm) line = line.slice(nm[0].length);
    var name = '';
    var m1 = line.match(/^([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9*]{1,11})/);
    if (m1 && WT_CN.test(m1[1])) name = m1[1];
    if (!name){
      var m2 = line.match(/([\u4e00-\u9fa5]{2,10})/);
      if (m2) name = m2[1];
    }
    /* 光有数字、没有中文的，忽略掉（多半是价格） */
    if (!name && !codes.length) return;
    var key = name + '|' + codes.join(',');
    if (seen[key]) return;
    seen[key] = 1;
    out.push({name:name, codes:codes});
  });
  return out.slice(0, 40);
}

/* 有代码的直接查行情拿名字，最准 */
function wtResolveCodes(codes){
  if (!codes.length) return Promise.resolve([]);
  var probe = [];
  codes.forEach(function(c){ guessSecids(c).forEach(function(sid){ if (probe.indexOf(sid) < 0) probe.push(sid); }); });
  return fetchQuotes(probe).then(function(r){
    var out = [];
    codes.forEach(function(c){
      var cands = guessSecids(c), hit = null;
      for (var i = 0; i < cands.length; i++){ if (r.map[cands[i]]){ hit = cands[i]; break; } }
      if (hit) out.push({secid:hit, code:c, name:r.map[hit].name || c});
    });
    return out;
  });
}

/* 只有名字的，用搜索接口认 */
function wtResolveName(name){
  var enc = encodeURIComponent(name);
  return jsonpBoth(SEARCH_TPL.https.replace('{q}', enc), SEARCH_TPL.http.replace('{q}', enc), 8000)
    .then(function(res){
      var list = (res && res.QuotationCodeTable && res.QuotationCodeTable.Data) || [];
      for (var i = 0; i < list.length; i++){
        var d = list[i], sid = String(d.QuoteID || '');
        if (!/^[01]\./.test(sid)) continue;
        var nm = String(d.Name || '');
        if (nm === name || nm.indexOf(name) >= 0 || name.indexOf(nm) >= 0){
          return {secid:sid, code:String(d.Code || ''), name:nm};
        }
      }
      return null;
    })
    .catch(function(){ return null; });
}

function wTextPanel(){
  var h = '<div class="writepad">' +
      '<div style="font-size:13px;font-weight:500">从一段文字里认股票</div>' +
      '<div style="font-size:12px;color:var(--ink-3);line-height:1.9">' +
        '把截图识别出来的文字、或者群里/研报里的一段话整段粘进来。<b>一行一支最准。</b><br>' +
        '认得出这些写法：' +
        '<span style="color:var(--ink-2)">贵州茅台 600519</span>、' +
        '<span style="color:var(--ink-2)">宁德时代</span>、' +
        '<span style="color:var(--ink-2)">603259</span>、' +
        '<span style="color:var(--ink-2)">SZ300750 +2.3%</span></div>' +
      '<textarea id="wTextRaw" placeholder="粘在这里"></textarea>' +
      '<div class="wrow">' +
        '<button class="btn primary" data-act="wTextRun">开始辨认</button>' +
        '<button class="btn ghost" data-act="wTextToggle">收起</button>' +
        '<button class="btn" data-act="aiRead" data-target="watch">AI 读图（手写也行）</button>' +
      '</div>';
  if (ui.wTextBusy) h += '<div style="font-size:12px;color:var(--ink-3);margin-top:9px">正在辨认…</div>';
  if (ui.wTextHits){
    if (ui.wTextHits.length){
      h += '<div style="margin-top:12px">' +
          '<div style="font-size:12.5px;color:var(--ink-3);margin-bottom:8px">认出 ' +
            ui.wTextHits.length + ' 支，勾掉不要的，然后点加入：</div>' +
          ui.wTextHits.map(function(x, i){
            var has = db.watch.some(function(w){ return w.secid === x.secid; });
            return '<div class="pick">' +
                '<input type="checkbox" class="wchk" data-i="' + i + '"' +
                  (has ? ' disabled' : ' checked') + '>' +
                '<span class="pn">' + esc(x.name) + '</span>' +
                '<span class="pc">' + esc(x.code) + '</span>' +
                '<span class="pt">' + (has ? '已在自选' : '') + '</span>' +
              '</div>';
          }).join('') +
          '<div class="wrow" style="margin-top:8px">' +
            '<button class="btn primary" data-act="wTextAdd">加入选中的</button>' +
            '<span style="font-size:12px;color:var(--ink-3)">认错的没在这上面？用上面的搜索框单独加。</span>' +
          '</div></div>';
    } else if (!ui.wTextBusy){
      h += '<div style="font-size:12.5px;color:var(--ink-3);margin-top:10px">' +
           '没认出股票。换个写法试试：一行一支，带上 6 位代码最准。</div>';
    }
  }
  h += '</div>';
  return h;
}

function wTextRun(){
  var el = $('wTextRaw');
  var raw = el ? el.value : '';
  if (!String(raw).trim()){ alert('先把文字粘进去。'); if (el) el.focus(); return; }
  var cands = watchTextExtract(raw);
  if (!cands.length){
    alert('没从这段文字里认出股票。\n一行一支试试，例如：\n贵州茅台 600519\n宁德时代\n603259');
    return;
  }
  var allCodes = [], allNames = [];
  cands.forEach(function(c){
    c.codes.forEach(function(x){ if (allCodes.indexOf(x) < 0) allCodes.push(x); });
    if (!c.codes.length && c.name && allNames.indexOf(c.name) < 0) allNames.push(c.name);
  });
  ui.wTextHits = null;
  ui.wTextBusy = true;
  render();
  var out = [];
  wtResolveCodes(allCodes.slice(0, 40)).then(function(list){
    out = out.concat(list);
    var chain = Promise.resolve();
    /* 只有名字的一条条问，中间留点间隔，别把人家接口问烦 */
    allNames.slice(0, 10).forEach(function(nm){
      chain = chain.then(function(){
        return new Promise(function(r){ setTimeout(r, 180); })
          .then(function(){ return wtResolveName(nm); })
          .then(function(h){ if (h) out.push(h); });
      });
    });
    return chain;
  }).then(function(){
    var seen = {}, uniq = [];
    out.forEach(function(h){ if (!seen[h.secid]){ seen[h.secid] = 1; uniq.push(h); } });
    ui.wTextHits = uniq;
    ui.wTextBusy = false;
    render();
  }).catch(function(e){
    ui.wTextBusy = false;
    ui.wTextHits = null;
    alert('辨认的时候出错了：' + e.message + '\n检查一下网络，过一会儿再试。');
    render();
  });
}

function parseCodes(text){
  var out = [], seen = {};
  String(text || '').split(/[\s,，、;；]+/).forEach(function(tok){
    var m = String(tok).match(/(\d{6})/);
    if (m && !seen[m[1]]){ seen[m[1]] = 1; out.push(m[1]); }
  });
  return out;
}
/* 6/5/9 开头多在沪市，0/1/2/3 开头多在深市。两个都问一遍，谁有数据用谁，省得你填市场。 */
function guessSecids(code){
  var p = String(code).charAt(0);
  return (p === '6' || p === '5' || p === '9') ? ['1.' + code, '0.' + code] : ['0.' + code, '1.' + code];
}
function addWatchCodes(codes){
  codes = codes.filter(function(c){
    return !db.watch.some(function(w){ return w.code === c; });
  });
  if (!codes.length){ alert('这些代码都已经在自选股里了。'); return; }
  if (db.watch.length + codes.length > 120){
    alert('自选股最多 120 支，现在已经有 ' + db.watch.length + ' 支了。');
    return;
  }
  var probe = [];
  codes.forEach(function(c){
    guessSecids(c).forEach(function(sid){ if (probe.indexOf(sid) < 0) probe.push(sid); });
  });
  fetchQuotes(probe).then(function(r){
    var added = 0, miss = [];
    codes.forEach(function(c){
      var cands = guessSecids(c), hit = null;
      for (var i = 0; i < cands.length; i++){ if (r.map[cands[i]]){ hit = cands[i]; break; } }
      if (hit){
        db.watch.push({secid:hit, code:c, name:r.map[hit].name || c, addedAt:Date.now()});
        added++;
      } else miss.push(c);
    });
    save();
    render();
    refreshQuotes();
    if (miss.length) alert('有 ' + miss.length + ' 个代码没查到，可能是代码写错了：\n' + miss.join('、'));
  }).catch(function(e){
    alert('没能连上行情服务：' + e.message + '\n检查一下网络，过一会儿再试。');
  });
}
function unwatch(secid){
  var w = null;
  db.watch.forEach(function(x){ if (x.secid === secid) w = x; });
  if (!w) return;
  if (!confirm('把「' + (w.name || w.code) + '」从自选股里移除吗？')) return;
  db.watch = db.watch.filter(function(x){ return x.secid !== secid; });
  save();
  render();
}

/* =========================================================================
   复盘笔记
   ========================================================================= */
var noteDraft = null;   // 正在写/改的那篇：{id:'new'或真实 id, kind, date, title, body}

function noteListHtml(){
  var q = String(ui.noteQuery || '').trim();
  var list = db.notes.filter(function(n){
    if (n.kind !== ui.noteKind) return false;
    if (q && (String(n.title) + ' ' + String(n.body)).indexOf(q) < 0) return false;
    return true;
  }).sort(function(a, b){ return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });

  if (!list.length){
    return '<div class="empty"><div class="e1">' +
      (q ? '没搜到符合条件的笔记' : '这里还没有笔记') + '</div>' +
      (q ? '换个词试试。' : '点「写一篇」，日期会自动填今天。') + '</div>';
  }
  return list.map(function(n){
    var open = ui.noteOpen === n.id;
    return '<div class="note">' +
        '<div class="hd">' +
          '<span class="dt">' + esc(n.date) + '</span>' +
          '<span class="tt">' + esc(n.title || '（没写标题）') + '</span>' +
          '<button class="btn ghost tiny" data-act="noteOpen" data-id="' + n.id + '">' + (open ? '收起' : '展开') + '</button>' +
          '<button class="btn ghost tiny" data-act="noteEdit" data-id="' + n.id + '">编辑</button>' +
          '<button class="btn ghost tiny danger" data-act="noteDel" data-id="' + n.id + '">删除</button>' +
        '</div>' +
        '<div class="body' + (open ? '' : ' clamp') + '">' + esc(n.body) + '</div>' +
      '</div>';
  }).join('');
}
function noteQueryLive(v){
  ui.noteQuery = v;
  var el = $('noteList');
  if (el) el.innerHTML = noteListHtml();
}
function notePadHtml(){
  var d = noteDraft || {date:todayStr(), title:'', body:''};
  return '<div class="writepad">' +
      '<div class="wrow">' +
        '<input type="date" class="inp" id="ndDate" style="width:160px" value="' + esc(d.date) + '">' +
        '<input class="inp grow" id="ndTitle" placeholder="标题（可以不写）" value="' + esc(d.title) + '">' +
      '</div>' +
      '<textarea id="ndBody" placeholder="今天市场怎么样、我为什么买或卖、哪里做对了、哪里做错了、明天要注意什么……">' +
        esc(d.body) + '</textarea>' +
      '<div class="wrow">' +
        '<button class="btn primary" data-act="noteSave">保存</button>' +
        '<button class="btn ghost" data-act="noteCancel">取消</button>' +
        '<span style="font-size:12px;color:var(--ink-3)">写完点保存，存在本机，不会丢。</span>' +
      '</div></div>';
}
function renderReviewPage(){
  return '<div class="card glass">' +
      '<div class="card-hd"><div class="t">复盘笔记</div>' +
        '<div class="r">共 ' + db.notes.length + ' 篇</div></div>' +
      '<div class="toolbar">' +
        '<button class="chip' + (ui.noteKind === 'day'  ? ' on' : '') + '" data-act="noteKind" data-v="day">每日复盘</button>' +
        '<button class="chip' + (ui.noteKind === 'week' ? ' on' : '') + '" data-act="noteKind" data-v="week">每周总结</button>' +
        '<input class="inp grow" id="noteQuery" placeholder="搜关键字…" value="' + esc(ui.noteQuery || '') + '" ' +
          'oninput="noteQueryLive(this.value)">' +
        '<button class="btn primary" data-act="noteNew">写一篇</button>' +
      '</div>' +
      (noteDraft ? notePadHtml() : '') +
      '<div id="noteList">' + noteListHtml() + '</div>' +
      '<div class="hintline">「每日复盘」适合收盘后写几句；「每周总结」适合周末回头看看这周做对了什么。</div>' +
    '</div>';
}
function saveNote(){
  var bodyEl = $('ndBody');
  if (!bodyEl){ noteDraft = null; render(); return; }
  var body = bodyEl.value;
  if (!String(body).trim()){ alert('内容是空的，写几个字再保存。'); bodyEl.focus(); return; }
  var date = $('ndDate').value || todayStr();
  var title = String($('ndTitle').value || '').trim();
  var kind = (noteDraft && noteDraft.kind) || ui.noteKind;
  if (noteDraft && noteDraft.id !== 'new'){
    db.notes.forEach(function(n){
      if (n.id === noteDraft.id){
        n.date = date; n.title = title; n.body = body; n.updatedAt = Date.now();
      }
    });
  } else {
    db.notes.push({ id: uid(), kind: kind, date: date, title: title, body: body,
                    createdAt: Date.now(), updatedAt: Date.now() });
  }
  noteDraft = null;
  ui.noteKind = kind;      // 切到这篇笔记所在的分类，不然保存完可能看不见它
  save();
  render();
}

/* =========================================================================
   孩子作业：粘贴老师群里的消息 → 自动拆成一条条 → 打钩
   ========================================================================= */
var HW_SUBJECTS = ['道德与法治','语文','数学','英语','科学','道法','体育','美术','音乐',
                   '历史','地理','生物','物理','化学','信息','劳动','心理','综合'];
var HW_HUE = {'语文':205,'数学':258,'英语':152,'科学':28,'道法':180,'道德与法治':180,
              '体育':14,'美术':320,'音乐':280,'历史':38,'地理':190,'生物':140,
              '物理':222,'化学':300,'信息':200,'劳动':30,'心理':340,'综合':210};
var HW_NOISE = [/^各位家长/, /家长.{0,4}(好|您好)/, /收到请?回复/, /^请?回复/, /^谢谢/, /^@/,
                /^温馨提示/, /^通知[:：]?$/, /^大家好/, /^【?通知】?$/,
                /* 微信截图里的"发送人 + （身份）"，例如：王老师（班主任） */
                /^[\u4e00-\u9fa5]{1,4}(老师|班主任|家长)[（(【]?/,
                /^[\u4e00-\u9fa5]{2,6}[（(][^)）]{1,10}[)）]$/];
/* 短句里出现这些词，多半是通知而不是作业 */
var HW_NOISE_WORDS = ['请回复', '回复', '谢谢', '收到', '辛苦', '麻烦大家'];

function hwHue(s){ return HW_HUE[s] || 210; }

function hwOfDate(d){
  return db.homework.filter(function(x){ return x.date === d; })
                    .sort(function(a, b){ return (a.createdAt || 0) - (b.createdAt || 0); });
}

/* 科目在页面上从上到下按这个顺序排 */
var HW_ORDER = ['语文','数学','英语','科学','道法','道德与法治','物理','化学','生物',
                '历史','地理','体育','美术','音乐','信息','劳动','心理','综合','其他'];
function hwOrderOf(s){
  var i = HW_ORDER.indexOf(s);
  return i < 0 ? 900 : i;
}

/* 把某天的作业按科目分好组 */
function hwGroups(d){
  var list = hwOfDate(d), order = [], map = {};
  list.forEach(function(x){
    var s = x.subject || '其他';
    if (!map[s]){ map[s] = []; order.push(s); }
    map[s].push(x);
  });
  order.sort(function(a, b){ return hwOrderOf(a) - hwOrderOf(b); });
  return order.map(function(s){ return {subject:s, items:map[s]}; });
}

/* 哪个科目是收起来的（记在数据里，下次打开还是这样） */
function hwIsCollapsed(s){
  if (!db.meta.hwCollapsed || typeof db.meta.hwCollapsed !== 'object') db.meta.hwCollapsed = {};
  return !!db.meta.hwCollapsed[s];
}
function hwSetCollapsed(s, v){
  if (!db.meta.hwCollapsed || typeof db.meta.hwCollapsed !== 'object') db.meta.hwCollapsed = {};
  if (v) db.meta.hwCollapsed[s] = true;
  else delete db.meta.hwCollapsed[s];
  save();
}

/* =========================================================================
   固定作业：录一次，每天自动加进当天清单
   ========================================================================= */
var hwFixedOpen = false;

function hwFixedActive(){ return (db.hwFixed || []).filter(function(f){ return f.active !== false; }); }
function hwFixedById(id){
  var l = db.hwFixed || [];
  for (var i = 0; i < l.length; i++){ if (l[i].id === id) return l[i]; }
  return null;
}
/* 这条固定作业今天要不要算（每天 / 只周一到周五） */
function hwFixedMatchDay(f, d){
  if (f.days !== 'weekday') return true;
  var w = new Date(d + 'T00:00:00').getDay();
  return w >= 1 && w <= 5;
}
/* 把某天的固定作业补进清单（已经有了就跳过）。返回补了几条 */
function hwEnsureFixed(d){
  var added = 0;
  hwFixedActive().forEach(function(f){
    if (!hwFixedMatchDay(f, d)) return;
    var has = db.homework.some(function(h){ return h.date === d && h.fixedId === f.id; });
    if (has) return;
    db.homework.push({
      id: uid(), date: d, subject: f.subject || '其他', text: f.text,
      fixedId: f.id, done: false, doneAt: null, createdAt: Date.now() + (added++)
    });
  });
  if (added) save();
  return added;
}
function hwFixedPanelHtml(){
  var list = db.hwFixed || [];
  /* 用显示顺序（语文、数学、英语…在前），这样下拉里默认就是语文 */
  var subjOpts = HW_ORDER.map(function(s){
    return '<option value="' + esc(s) + '">' + esc(s) + '</option>';
  }).join('');
  var rows = list.length
    ? list.map(function(f){
        return '<div class="pick">' +
            '<span class="hw-pill" style="--h:' + hwHue(f.subject) + '">' + esc(f.subject) + '</span>' +
            '<span class="pn">' + esc(f.text) + '</span>' +
            '<select class="inp" style="width:118px;flex:0 0 auto" ' +
              'onchange="hwFixedSetDays(\'' + f.id + '\', this.value)">' +
              '<option value="all"' + (f.days !== 'weekday' ? ' selected' : '') + '>每天</option>' +
              '<option value="weekday"' + (f.days === 'weekday' ? ' selected' : '') + '>只周一到周五</option>' +
            '</select>' +
            '<button class="btn ghost tiny" data-act="hwFixedEdit" data-id="' + f.id + '">改</button>' +
            '<button class="btn ghost tiny danger" data-act="hwFixedDel" data-id="' + f.id + '">删</button>' +
          '</div>';
      }).join('')
    : '<div style="font-size:12.5px;color:var(--ink-3);padding:4px 2px 8px">' +
      '还没有固定作业。在下面加一条试试，比如：语文 / 每天朗读 15 分钟。</div>';

  return '<div class="writepad" style="margin-top:14px">' +
      '<div style="font-size:13px;font-weight:500">固定作业（录一次，以后每天自动加进当天清单）</div>' +
      rows +
      '<div class="wrow" style="margin-top:10px">' +
        '<select class="inp" id="hfxSubj" style="width:110px;flex:0 0 auto">' + subjOpts + '</select>' +
        '<input class="inp grow" id="hfxText" placeholder="固定要做的事，例如：朗读 15 分钟">' +
        '<select class="inp" id="hfxDays" style="width:132px;flex:0 0 auto">' +
          '<option value="all">每天</option><option value="weekday">只周一到周五</option></select>' +
        '<button class="btn primary" data-act="hwFixedAdd">加一条</button>' +
      '</div>' +
      '<div class="hintline">' +
        '· 固定作业<b>只在「今天」自动加</b>，你翻看以前的日子不会被追加上去。<br>' +
        '· 改内容或删掉，<b>只影响以后</b>；已经加进清单的记录不会变（打过钩的更会留着）。<br>' +
        '· 删掉后只停止「以后每天自动加」，<b>今天已经加进清单的那几条会留着</b>；' +
        '要去掉哪一条，在下面的清单里单独点「删除」。' +
      '</div></div>';
}

function hwFixedSetDays(id, v){
  var f = hwFixedById(id);
  if (!f) return;
  f.days = (v === 'weekday') ? 'weekday' : 'all';
  save();
  render();
}

/* 找出小段落里的科目名。取最长的匹配，这样「道德与法治」不会被「道法」抢走 */
function hwDetectSubject(line){
  var best = '';
  HW_SUBJECTS.forEach(function(s){
    if (String(line).indexOf(s) >= 0 && s.length > best.length) best = s;
  });
  return best;
}

/* 去掉开头的序号和符号。全角数字也认（老师常用全角打字） */
function hwClean(s){
  return String(s == null ? '' : s)
    .replace(/^[\s\-•·※▶▪*，,。;；:：]+/, '')
    .replace(/^(?:[0-9０-９]{1,2}\s*[、.．)）]|[（(]\s*[0-9０-９]{1,2}\s*[)）]|[一二三四五六七八九十]{1,2}\s*[、.．)）])\s*/, '')
    .replace(/^[\s\-•·※▶▪*，,。;；:：]+/, '')
    .trim();
}

/* 把一大段粘贴的文字切成一条条 */
function hwSplitText(raw){
  var out = [];
  String(raw || '').replace(/\r/g, '').split('\n').forEach(function(line){
    line = String(line).trim();
    if (!line) return;
    /* 一行里塞了好几条就再切开：只在"空格或分号 + 序号"处切。
       两个坑要避开：
       · "第1、2题"这种别切（所以要在空格/分号处才切）
       · "KKL 2、3课时"里的"2、3"是范围不是编号（序号后面紧跟数字的，不当成编号） */
    var parts = line.split(/[\s；;]+(?=(?:[0-9０-９]{1,2}\s*[、.．)）](?!\s*[0-9０-９]))|(?=[（(]\s*[0-9０-９]{1,2}\s*[)）])|(?=[一二三四五六七八九十]{1,2}\s*[、.．)）]))/);
    parts.forEach(function(p){
      p = hwClean(p);
      if (p) out.push(p);
    });
  });
  return out;
}

/* 短句里出现"家长/回复"这类字眼的，多半是通知不是作业 */
function hwIsNoise(t){
  t = String(t);
  if (t.length > 26) return false;
  for (var i = 0; i < HW_NOISE.length; i++){ if (HW_NOISE[i].test(t)) return true; }
  for (var j = 0; j < HW_NOISE_WORDS.length; j++){ if (t.indexOf(HW_NOISE_WORDS[j]) >= 0) return true; }
  return false;
}

/* 分析一大段文字，返回拆好的条目 [{text, subject}] */
function hwParse(raw){
  var cur = '', out = [];
  hwSplitText(raw).forEach(function(t){
    if (hwIsNoise(t)) return;
    var hit = hwDetectSubject(t);
    var body = t;
    if (hit){
      cur = hit;
      body = t.replace(new RegExp('^\\s*' + hit + '\\s*[:：、,，]?\\s*'), '');
    }
    body = hwClean(body);          // 去掉科目前缀后再去掉一次序号，否则会留下"1、"这种
    if (body.length < 2) return;                 // 只写了"语文"这种小标题，不计入作业
    out.push({text: body, subject: hit || cur || '其他'});
  });
  return out;
}

/* 从消息里猜这是哪天的作业 */
function hwGuessDate(raw){
  var s = String(raw || '');
  if (/明天/.test(s)) return dateStr(new Date(Date.now() + 86400000));
  var m = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (m){
    var d = new Date(new Date().getFullYear(), Number(m[1]) - 1, Number(m[2]));
    return dateStr(d);
  }
  return ui.hwDate || todayStr();
}

var hwDraft = null;      // 拆完还没确认的预览：[{text, subject}]
var hwPaste  = false;    // 粘贴面板是否展开
var hwSkipSync = false;  // 刚删过一条时置上：这次重画别再从旧界面上按序号读一遍（序号已错位）

/* 把预览里改过的字收回内存 —— 不这样做的话，你改完一条再删另一条，改的字就白打了 */
function hwSyncDraft(){
  if (!hwDraft) return;
  if (hwSkipSync){ hwSkipSync = false; return; }
  hwDraft = hwDraft.map(function(x, i){
    var ti = $('hwD' + i), si = $('hwS' + i);
    return { text: ti ? String(ti.value) : x.text,
             subject: si ? si.value : x.subject };
  });
}

/* =========================================================================
   用 AI 挑作业：把通知、寒暄、日期剔掉，只留真正的作业并分好科目
   （规则版的 hwParse 还在，免费、离线可用；这个更准，但要花几分钱）
   ========================================================================= */
var HW_AI_RULES =
  '硬要求：\n' +
  '1. 只输出一个 JSON 数组，不要任何解释、不要代码块。格式严格是：\n' +
  '   [{"subject":"语文","text":"抄写生字三遍"}]\n' +
  '2. subject 只能从这些里选：语文、数学、英语、科学、道法、体育、美术、音乐、其他\n' +
  '3. 【不是作业的一律不要】例如：\n' +
  '   · 称呼问候：各位家长晚上好、王老师、亲们、大家好\n' +
  '   · 通知要求：请督促孩子完成、收到请回复、谢谢配合、有问题私聊\n' +
  '   · 日期时间、签名、"校讯通"抬头、电话号码、表情、表情符号\n' +
  '   （注意："明天带跳绳""周一交回执"这种要带东西、要交东西的，算作业）\n' +
  '4. 【一条一件事】：不要把两件事挤成一条，也不要把一件事拆成两条\n' +
  '5. 去掉编号（1、2、（1））和课目前缀，保留原意，不要自己加内容\n' +
  '6. 只写了一个科目名（比如单独一行"数学"）不算作业；看不出科目的用"其他"\n' +
  '7. 如果里面确实没有作业，就输出 []\n';

var HW_AI_TEXT_PROMPT =
  '下面是一段来自"老师/家长群"的文字（可能是从图片识别出来的，可能有错别字、口语、夹杂通知）。\n' +
  '请帮我挑出【真正的作业】，按科目整理成清单。\n\n' + HW_AI_RULES;

var HW_AI_IMAGE_PROMPT =
  '这是一张老师/家长群里的消息截图（也可能是手写板书、作业本、白板拍的照片）。\n' +
  '请【读出里面的作业】，只挑作业，按科目整理成清单。\n\n' + HW_AI_RULES +
  '8. 手写或模糊的地方，认不准的字用「□」代替，不要猜成语义通顺但错误的词\n';

/* 从 AI 的回复里把作业数组抠出来 */
function parseHwJson(text){
  var m = String(text || '').match(/\[[\s\S]*\]/);
  if (!m) return [];
  var arr;
  try { arr = JSON.parse(m[0]); } catch(e){ return []; }
  if (!(arr instanceof Array)) return [];
  return arr.map(function(x){
    var s = String((x && (x.subject || x['科目'] || '')) || '');
    var t = String((x && (x.text || x['内容'] || x['作业'] || x['task'] || '')) || '').trim();
    return { subject: pickHwSubject(s), text: t };
  }).filter(function(x){ return x.text.length > 1; });
}

/* 把 AI 给的科目名对上我们自己的科目表 */
function pickHwSubject(s){
  s = String(s || '').trim();
  if (!s) return '其他';
  for (var i = 0; i < HW_ORDER.length; i++){ if (s === HW_ORDER[i]) return s; }
  for (var j = 0; j < HW_ORDER.length; j++){
    if (s.indexOf(HW_ORDER[j]) >= 0) return HW_ORDER[j];
  }
  return '其他';
}

function aiParseHomework(text){
  return aiChat([{ role:'user', content: HW_AI_TEXT_PROMPT + '\n====== 文字开始 ======\n' + text + '\n====== 文字结束 ======' }],
                { maxTokens:1500, temperature:0 })
    .then(function(r){ return parseHwJson(r.text); });
}

/* ---------------------------------------------------------------------------
   「识别作业」这一个按钮背后的两套做法
   · hwRuleSplitNow：免费的规则版（按科目名和编号切），谁都能用
   · hwAiSplitNow  ：花了钱但更准的版本，让 AI 读一遍、只挑真作业
   --------------------------------------------------------------------------- */
function hwRuleSplitNow(raw){
  raw = String(raw == null ? '' : raw);
  if (!raw.trim()){
    var e0 = $('hwRaw'); if (e0) e0.focus();
    alert('先把老师发的消息粘到框里。');
    return;
  }
  var parsed = hwParse(raw);
  if (!parsed.length){
    alert('没能从这段文字里拆出作业。\n可以自己一行写一条再试，或者直接把内容贴进去后手动改。');
    return;
  }
  var guess = hwGuessDate(raw);
  if (guess !== (ui.hwDate || todayStr())) ui.hwDate = guess;
  hwDraft = parsed;
  hwPaste = false;
  render();
}

function hwAiSplitNow(raw){
  var text = String(raw == null ? '' : raw).trim();
  if (!text){
    var e1 = $('hwRaw'); if (e1) e1.focus();
    alert('先把老师发的消息粘到框里。');
    return;
  }
  /* 没配 AI 也不拦着人 —— 直接退回不要钱的规则版 */
  if (!aiReady()){ hwRuleSplitNow(text); return; }
  ui.hwBusy = 'AI 正在读这段消息、挑作业…（一般 10-20 秒）';
  render();
  aiParseHomework(text).then(function(arr){
    ui.hwBusy = '';
    if (!arr || !arr.length){
      render();
      if (confirm('AI 说这段文字里没找到作业。\n\n要不要用免费的规则版再拆一次？（按科目名和编号切，不花钱）')){
        hwRuleSplitNow(text);
      }
      return;
    }
    hwDraft = arr;
    var g = hwGuessDate(text);
    if (g !== (ui.hwDate || todayStr())) ui.hwDate = g;
    hwPaste = false;
    render();
    toast('AI 挑出 ' + arr.length + ' 条作业，核对一下再确认');
  }).catch(function(e){
    ui.hwBusy = '';
    render();
    if (confirm('AI 挑作业失败了：' + e.message + '\n\n要不要用免费的规则版再试一次？')){
      hwRuleSplitNow(text);
    }
  });
}

function hwDraftHtml(){
  if (!hwDraft) return '';
  var opts = HW_ORDER.slice();
  return '<div class="draft" id="hwDraft">' +
      '<div style="font-size:13px;font-weight:500;margin-bottom:9px">' +
        '拆出来 ' + hwDraft.length + ' 条，核对一下（可以直接改字、改科目、不要的删掉）：</div>' +
      hwDraft.map(function(d, i){
        var sel = opts.map(function(s){
          return '<option value="' + esc(s) + '"' + (s === d.subject ? ' selected' : '') + '>' + esc(s) + '</option>';
        }).join('');
        return '<div class="drow">' +
            '<span class="bar" style="width:3px;border-radius:3px;align-self:stretch;background:hsl(' +
              hwHue(d.subject) + ',34%,60%)"></span>' +
            '<input class="inp" type="text" id="hwD' + i + '" value="' + esc(d.text) + '">' +
            '<select class="inp" id="hwS' + i + '">' + sel + '</select>' +
            '<button class="btn ghost tiny danger" data-act="hwDrop" data-i="' + i + '">删</button>' +
          '</div>';
      }).join('') +
      '<div class="wrow" style="margin-top:10px">' +
        '<button class="btn primary" data-act="hwConfirm">确认添加这 ' + hwDraft.length + ' 条</button>' +
        '<button class="btn ghost" data-act="hwCancel">取消</button>' +
        '<span style="font-size:12px;color:var(--ink-3)">加到：' + esc(ui.hwDate || todayStr()) + ' 的清单里</span>' +
      '</div></div>';
}

/* 一条作业（分组视图里用，科目已经在分组标题上了，所以不再重复打标签） */
function hwItemHtml(h, showSub){
  /* 正在改这一条：就地展开一个编辑框（能改字、也能改科目） */
  if (ui.hwEditId === h.id){
    var eopts = HW_ORDER.map(function(s){
      return '<option value="' + esc(s) + '"' + (s === (h.subject || '其他') ? ' selected' : '') + '>' +
             esc(s) + '</option>';
    }).join('');
    return '<div class="hw-row editing" style="--h:' + hwHue(h.subject) + '">' +
        '<div class="bar"></div>' +
        '<input class="inp grow" id="hwEd" value="' + esc(h.text) + '" placeholder="这条作业是什么？">' +
        '<select class="inp" id="hwEdS" style="width:112px;flex:0 0 auto">' + eopts + '</select>' +
        '<button class="btn primary tiny" data-act="hwEditSave" data-id="' + h.id + '">保存</button>' +
        '<button class="btn ghost tiny" data-act="hwEditCancel">取消</button>' +
      '</div>';
  }
  return '<div class="hw-row' + (h.done ? ' done' : '') + '" style="--h:' + hwHue(h.subject) + '">' +
      '<div class="bar"></div>' +
      '<button class="chk' + (h.done ? ' on' : '') + '" data-act="hwToggle" data-id="' + h.id + '"><span>✓</span></button>' +
      '<div class="tx">' + esc(h.text) +
        (showSub ? '<div class="meta" style="margin-top:5px"><span class="hw-pill">' + esc(h.subject) + '</span></div>' : '') +
      '</div>' +
      '<div class="ops">' +
        '<button class="btn ghost tiny" data-act="hwEdit" data-id="' + h.id + '">改字</button>' +
        '<button class="btn ghost tiny danger" data-act="hwDel" data-id="' + h.id + '">删除</button>' +
      '</div>' +
    '</div>';
}

/* 一个科目一组，可以点标题收起／展开 */
function hwGroupHtml(g){
  var collapsed = hwIsCollapsed(g.subject);
  var doneN = g.items.filter(function(x){ return x.done; }).length;
  var total = g.items.length;
  var pct = total ? Math.round(doneN / total * 100) : 0;
  var allDone = (total > 0 && doneN === total);
  return '<div class="hwgrp' + (collapsed ? ' off' : '') + (allDone ? ' alldone' : '') +
             '" style="--h:' + hwHue(g.subject) + '">' +
      '<button class="hwghd" data-act="hwCollapse" data-s="' + esc(g.subject) + '" ' +
        'title="' + (collapsed ? '点一下展开' : '点一下收起') + '">' +
        '<span class="arrow">' + (collapsed ? '▶' : '▼') + '</span>' +
        '<span class="hwname">' + esc(g.subject) + '</span>' +
        (allDone ? '<span class="hwall">全做完 ✓</span>' : '') +
        '<span class="hwcnt' + (doneN === total ? ' all' : '') + '">' + doneN + ' / ' + total + '</span>' +
        '<span class="hwbar"><i style="width:' + pct + '%"></i></span>' +
      '</button>' +
      (collapsed ? '' : '<div class="hwglist">' +
          g.items.map(function(x){ return hwItemHtml(x, false); }).join('') + '</div>') +
    '</div>';
}

function renderHomeworkPage(){
  var d = ui.hwDate || todayStr();
  /* 固定作业：只在看「今天」的时候自动补进清单 */
  if (d === todayStr()) hwEnsureFixed(d);
  var list = hwOfDate(d);
  var groups = hwGroups(d);
  var doneN = list.filter(function(x){ return x.done; }).length;
  var pct = list.length ? Math.round(doneN / list.length * 100) : 0;
  var isToday = (d === todayStr());

  var html = '<div class="card glass">' +
      '<div class="card-hd"><div class="t">' + (isToday ? '今天的作业' : '这一天的作业') + '</div>' +
        '<div class="r">' + (list.length ? (doneN + ' / ' + list.length + ' 已完成') : '还没有作业') + '</div></div>' +
      '<div class="toolbar">' +
        '<button class="btn ghost sm" data-act="hwDay" data-v="-1">← 前一天</button>' +
        '<input type="date" class="inp" id="hwDate" style="width:160px" value="' + esc(d) + '" ' +
          'onchange="hwSetDate(this.value)">' +
        '<button class="btn ghost sm" data-act="hwDay" data-v="1">后一天 →</button>' +
        (isToday ? '' : '<button class="btn ghost sm" data-act="hwDay" data-v="0">回到今天</button>') +
        '<span style="flex:1 1 20px"></span>' +
        '<button class="btn ghost sm" data-act="hwFixedToggle">' +
          (hwFixedOpen ? '收起固定作业' : '固定作业') +
          ((db.hwFixed || []).length ? '（' + (db.hwFixed || []).length + '）' : '') + '</button>' +
        '<button class="btn ghost sm" data-act="kidMode">孩子模式</button>' +
        '<button class="btn accent sm" data-act="hwPasteToggle">' +
          (hwPaste ? '收起' : '＋ 添加作业') + '</button>' +
        (list.length ? '<button class="btn ghost sm" data-act="hwAllToggle">' +
          (groups.some(function(g){ return hwIsCollapsed(g.subject); }) ? '全部展开' : '全部收起') +
          '</button>' : '') +
      '</div>' +
      (hwFixedOpen ? hwFixedPanelHtml() : '') +
      (list.length ? '<div class="hw-progress"><i style="width:' + pct + '%"></i></div>' : '') +
      (hwPaste
        ? '<div class="hw-paste" style="margin:14px 0 4px">' +
            '<textarea id="hwRaw" placeholder="把老师群里发的消息原样粘进来，然后点下面的「识别作业」。\n' +
              '（也可以什么都不粘 —— 直接点「识别作业」，它会让你挑一张图。）"></textarea>' +
            '<div class="wrow" style="margin-top:10px">' +
              '<button class="btn primary" data-act="hwSmart">识别作业（粘文字 / 传图）</button>' +
              '<span style="flex:1 1 24px"></span>' +
              '<button class="btn ghost" data-act="hwPasteToggle">取消</button>' +
              '<span style="font-size:12px;color:var(--ink-3);flex:1 1 100%">' +
                (ui.hwBusy ? '<b>' + esc(ui.hwBusy) + '</b>' :
                 '就这一个按钮，两种情况都行：<br>' +
                 '· <b>框里粘了老师的文字</b> → 它读一遍，把通知、寒暄剔掉，只留真作业；' +
                   '没配 AI 就自动用免费的规则版（按科目名和编号切）。<br>' +
                 '· <b>框里是空的</b> → 它让你挑一张图（截图、拍照、手写都行），读完直接把作业挑出来。<br>' +
                 '不管哪种，都是先给你看一遍、你确认了才加进去。') +
              '</span>' +
            '</div></div>'
        : '') +
      (hwDraft ? '<div style="margin-top:14px">' + hwDraftHtml() + '</div>' : '') +
      '<div style="margin-top:14px">' +
        (list.length
          ? groups.map(hwGroupHtml).join('')
          : '<div class="empty"><div class="e1">这一天还没有作业</div>' +
            '老师群里发消息了，就点上面那个蓝色的「＋ 添加作业」，把消息粘进去点一下「识别作业」，' +
            '它会自动按科目拆成一条条、分成一组一组。</div>') +
      '</div>' +
      '<div class="hintline">作业按科目分好了组，<b>点科目名字就能收起／展开</b>（收起状态会记住）。' +
      '打钩之后会自动沉到本组最下面并变灰，不会消失。' +
      '「孩子模式」会把今天的清单放大显示，可以全屏给孩子看或者打印出来。</div>' +
    '</div>';
  return html;
}

function hwSetDate(v){
  ui.hwDate = v || todayStr();
  ui.hwEditId = null;
  hwDraft = null;
  render();
}

/* =========================================================================
   书单和阅读
   ========================================================================= */
var BK_STATUS = {want:'想读', reading:'在读', done:'读完'};

/* 把 Windows 路径转成浏览器能打开的地址 */
function bkFileUrl(p){
  p = String(p || '').trim().replace(/^["']|["']$/g, '');
  p = p.replace(/\\/g, '/');
  if (/^[a-zA-Z]:\//.test(p)) return 'file:///' + encodeURI(p);
  if (/^\/\//.test(p)) return '';                  // 网络路径暂时不处理
  return '';
}
function bkExt(p){
  var m = String(p || '').toLowerCase().match(/\.([a-z0-9]+)(?:["']?)$/);
  return m ? m[1] : '';
}
function bkById(id){
  for (var i = 0; i < db.books.length; i++){ if (db.books[i].id === id) return db.books[i]; }
  return null;
}
function bkStatusOpts(cur){
  return ['want','reading','done'].map(function(s){
    return '<option value="' + s + '"' + (s === cur ? ' selected' : '') + '>' + BK_STATUS[s] + '</option>';
  }).join('');
}

function bkForm(b, isNew){
  b = b || {};
  return '<div class="writepad">' +
      '<div class="wrow">' +
        '<input class="inp grow" id="bkTitle" placeholder="书名（必填）" value="' + esc(b.title || '') + '">' +
        '<input class="inp" id="bkAuthor" style="flex:0 1 170px" placeholder="作者（可不写）" value="' + esc(b.author || '') + '">' +
        '<select class="inp" id="bkStatus" style="width:110px;flex:0 0 auto">' + bkStatusOpts(b.status || 'want') + '</select>' +
      '</div>' +
      '<div class="wrow">' +
        '<input class="inp grow" id="bkLink" placeholder="网页链接（可不写，例如微信读书里这本书的网址）" value="' + esc(b.link || '') + '">' +
      '</div>' +
      '<div class="wrow">' +
        '<input class="inp grow" id="bkFile" placeholder="本地电子书路径（可不写，例如 D:\\电子书\\三体.pdf）" value="' + esc(b.filePath || '') + '">' +
        '<button class="btn ghost sm" data-act="bkPathHelp">路径怎么填？</button>' +
      '</div>' +
      '<div class="wrow">' +
        '<button class="btn primary" data-act="' + (isNew ? 'bkSaveNew' : 'bkSaveEdit') + '" data-id="' + (b.id || '') + '">保存</button>' +
        '<button class="btn ghost" data-act="bkCancel">取消</button>' +
        '<span style="font-size:12px;color:var(--ink-3)">填了本地路径的话，卡片上会出现「打开这本书」，点一下直接用浏览器打开。</span>' +
      '</div></div>';
}

function bkCard(b){
  var open = (ui.bkOpen === b.id);
  var fileOk = !!bkFileUrl(b.filePath);
  var h = '<div class="bkcard' + (open ? ' open' : '') + '">' +
      '<div class="bhd">' +
        '<div style="flex:1;min-width:0">' +
          '<div class="bt">' + esc(b.title) + '</div>' +
          '<div class="ba">' + esc(b.author || '（没写作者）') + '</div>' +
        '</div>' +
        '<span class="bktag ' + (b.status || 'want') + '">' + esc(BK_STATUS[b.status] || '想读') + '</span>' +
      '</div>' +
      '<div class="bkbar"><i style="width:' + Number(b.percent || 0) + '%"></i></div>' +
      '<div class="bmeta"><span>' + Number(b.percent || 0) + '%</span><span>' +
        esc(b.pageText || (b.status === 'done' ? '已读完' : '')) + '</span></div>' +
      '<div class="bops">' +
        (fileOk ? '<a class="btn ghost tiny" href="' + bkFileUrl(b.filePath) + '" target="_blank" rel="noreferrer">打开这本书</a>' : '') +
        (b.link ? '<a class="btn ghost tiny" href="' + esc(b.link) + '" target="_blank" rel="noreferrer">打开链接</a>' : '') +
        '<button class="btn ghost tiny" data-act="bkOpen" data-id="' + b.id + '">' + (open ? '收起' : '进度与笔记') + '</button>' +
        '<button class="btn ghost tiny" data-act="bkEdit" data-id="' + b.id + '">编辑</button>' +
        '<button class="btn ghost tiny danger" data-act="bkDel" data-id="' + b.id + '">删除</button>' +
      '</div>' +
      (open ? bkDetail(b) : '') +
    '</div>';
  return h;
}

function bkDetail(b){
  var h = '<div style="margin-top:13px;border-top:1px solid var(--hairline);padding-top:13px">';
  var pct = Number(b.percent || 0);
  h += '<div class="numrow">' +
      '<span style="font-size:12px;color:var(--ink-3)">读了多少</span>' +
      '<input type="range" min="0" max="100" step="1" value="' + pct + '" ' +
        'onchange="bkSetPct(\'' + b.id + '\', this.value)">' +
      '<span style="font-size:13px;font-variant-numeric:tabular-nums;min-width:44px;text-align:right">' + pct + '%</span>' +
      '<button class="btn ghost tiny" data-act="bkStep" data-id="' + b.id + '" data-v="10">+10%</button>' +
      '<button class="btn ghost tiny" data-act="bkStep" data-id="' + b.id + '" data-v="-10">-10%</button>' +
      '<button class="btn ghost tiny" data-act="bkFinish" data-id="' + b.id + '">读完了</button>' +
    '</div>';
  h += '<div class="numrow" style="margin-top:10px">' +
      '<span style="font-size:12px;color:var(--ink-3)">读到哪了</span>' +
      '<input class="inp" id="bkPage' + b.id + '" style="flex:1 1 200px" ' +
        'placeholder="例如：第 120 页 / 共 320 页" value="' + esc(b.pageText || '') + '" ' +
        'onchange="bkSetPage(\'' + b.id + '\', this.value)">' +
    '</div>';
  if (b.filePath){
    var ext = bkExt(b.filePath);
    var tip = (ext === 'epub')
      ? 'EPUB 浏览器打不开，会变成下载。建议用专门的阅读软件，点「复制路径」粘过去；或者换成 PDF 格式。'
      : (ext === 'pdf' ? 'PDF 会用浏览器自带的阅读器打开。'
                       : (ext === 'txt' ? 'TXT 会用浏览器打开。' : '会尝试用浏览器打开。'));
    h += '<div style="margin-top:10px;font-size:11.5px;color:var(--ink-3);line-height:1.9">' +
        '文件：' + esc(b.filePath) + '<br>' + tip + ' ' +
        '<button class="btn ghost tiny" data-act="bkCopyPath" data-id="' + b.id + '">复制路径</button>' +
      '</div>';
  }
  h += '<div style="margin-top:14px">' +
      '<div style="font-size:12px;color:var(--ink-3);margin-bottom:8px">零碎笔记（' + ((b.notes || []).length) + ' 条）</div>' +
      ((b.notes || []).length
        ? b.notes.slice().reverse().map(function(n){
            return '<div class="bkn">' +
                '<div class="bn-h"><span>' + esc(n.date) + '</span>' +
                  '<button class="btn ghost tiny danger" style="margin-left:auto" ' +
                    'data-act="bkNoteDel" data-id="' + b.id + '" data-nid="' + n.id + '">删除</button></div>' +
                '<div class="bn-b">' + esc(n.text) + '</div>' +
              '</div>';
          }).join('')
        : '<div style="font-size:12.5px;color:var(--ink-3);padding:4px 2px 8px">还没记笔记。</div>') +
      '<div class="numrow" style="margin-top:8px">' +
        '<input class="inp" id="bkNote' + b.id + '" style="flex:1 1 220px" ' +
          'placeholder="随手记一句，按回车就存" value="">' +
        '<button class="btn primary sm" data-act="bkNoteAdd" data-id="' + b.id + '">加笔记</button>' +
      '</div></div>';
  h += '</div>';
  return h;
}

function bkListHtml(){
  var q = String(ui.bkQuery || '').trim();
  var order = {reading:0, want:1, done:2};
  var list = db.books.filter(function(b){
    if (!q) return true;
    return (String(b.title) + ' ' + String(b.author || '')).indexOf(q) >= 0;
  }).sort(function(a, b){
    var oa = order[a.status] === undefined ? 1 : order[a.status];
    var ob = order[b.status] === undefined ? 1 : order[b.status];
    if (oa !== ob) return oa - ob;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  if (!list.length){
    return '<div class="empty"><div class="e1">' + (q ? '没搜到这本书' : '书单还是空的') + '</div>' +
           (q ? '换个词试试。' : '点「+ 加一本书」把正在看的书加进来，以后点「进度与笔记」就能记读到哪了。') + '</div>';
  }
  return '<div class="bk">' + list.map(bkCard).join('') + '</div>';
}

function renderReadingPage(){
  var q = String(ui.bkQuery || '').trim();
  var nR = db.books.filter(function(b){ return b.status === 'reading'; }).length;
  var nW = db.books.filter(function(b){ return b.status === 'want'; }).length;
  var nD = db.books.filter(function(b){ return b.status === 'done'; }).length;

  return '<div class="card glass">' +
      '<div class="card-hd"><div class="t">书单和阅读</div>' +
        '<div class="r">在读 ' + nR + ' · 想读 ' + nW + ' · 读完 ' + nD + '</div></div>' +
      '<div class="toolbar">' +
        '<input class="inp grow" placeholder="搜书名或作者…" value="' + esc(q) + '" ' +
          'oninput="bkQueryLive(this.value)">' +
        '<button class="btn primary" data-act="bkAddToggle">' +
          (ui.bkAdd ? '收起' : '+ 加一本书') + '</button>' +
      '</div>' +
      (ui.bkAdd ? bkForm(null, true) : '') +
      (ui.bkEdit ? bkForm(bkById(ui.bkEdit), false) : '') +
      '<div id="bkList">' + bkListHtml() + '</div>' +
      '<div class="hintline">「想在读的书直接打开」的做法：在书里填上本地文件路径，' +
      '卡片上就会出现「打开这本书」。PDF 和 TXT 浏览器能直接看；EPUB 浏览器打不开，建议用别的阅读软件。</div>' +
    '</div>';
}

function bkQueryLive(v){
  ui.bkQuery = v;
  var el = $('bkList');
  if (el) el.innerHTML = bkListHtml();
}

function bkSetPct(id, v){
  var b = bkById(id);
  if (!b) return;
  b.percent = Math.max(0, Math.min(100, Number(v) || 0));
  if (b.percent >= 100) b.status = 'done';
  else if (b.status === 'want' && b.percent > 0) b.status = 'reading';
  b.updatedAt = Date.now();
  save();
  render();
}
function bkSetPage(id, v){
  var b = bkById(id);
  if (!b) return;
  b.pageText = String(v || '').trim();
  b.updatedAt = Date.now();
  save();
}
function bkAddNote(id){
  var bb = bkById(id);
  var nEl = $('bkNote' + id);
  var ntxt = nEl ? String(nEl.value).trim() : '';
  if (!bb || !ntxt){ if (nEl) nEl.focus(); return; }
  bb.notes = bb.notes || [];
  bb.notes.push({id:uid(), date:todayStr(), text:ntxt, createdAt:Date.now()});
  bb.updatedAt = Date.now();
  save();
  render();
  toast('笔记已存');
}

function bkSaveForm(isNew, id){
  var title = String($('bkTitle').value || '').trim();
  if (!title){ alert('书名不能空着。'); $('bkTitle').focus(); return; }
  var obj = {
    title: title,
    author: String($('bkAuthor').value || '').trim(),
    status: $('bkStatus').value,
    link: String($('bkLink').value || '').trim(),
    filePath: String($('bkFile').value || '').trim(),
    updatedAt: Date.now()
  };
  if (isNew){
    obj.id = uid(); obj.percent = 0; obj.pageText = ''; obj.notes = []; obj.createdAt = Date.now();
    db.books.push(obj);
    ui.bkAdd = false;
    ui.bkOpen = obj.id;
  } else {
    var b = bkById(id);
    if (!b) return;
    b.title = obj.title; b.author = obj.author; b.status = obj.status;
    b.link = obj.link; b.filePath = obj.filePath; b.updatedAt = obj.updatedAt;
    ui.bkEdit = null;
  }
  save();
  render();
}

/* =========================================================================
   密码本
   ========================================================================= */
var vbShow = {};        // 哪几条临时把密码显示出来

function sha256Hex(s){
  if (!(window.crypto && crypto.subtle && window.TextEncoder)){
    return Promise.reject(new Error('这个浏览器不支持口令校验'));
  }
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s))).then(function(buf){
    return Array.prototype.map.call(new Uint8Array(buf), function(b){
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  });
}
function vaultLocked(){ return !!db.meta.vaultPass && !ui.vaultUnlocked; }

/* 复制到剪贴板 + 小提示。file:// 下有时拿不到剪贴板权限，所以备了一手老办法 */
function copyText(text, okMsg){
  text = String(text == null ? '' : text);
  function fallback(){
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch(e){}
    ta.remove();
    toast(ok ? (okMsg || '已复制') : '复制失败，请手动选中复制');
  }
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){ toast(okMsg || '已复制'); }).catch(fallback);
  } else fallback();
}
function toast(msg, sticky){
  var el = $('toast');
  if (!el){
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'on';
  clearTimeout(toast.t);
  if (!sticky) toast.t = setTimeout(function(){ el.className = ''; }, 1700);
}

function vaultLockHtml(){
  return '<div class="card glass"><div class="lockbox">' +
      '<div class="lk1">密码本已上锁</div>' +
      '<div class="lk2">输入你设的查看口令就能打开。<br>口令只在你本机校验，不会上传，也不会发给任何人。</div>' +
      '<div class="numrow" style="justify-content:center">' +
        '<input type="password" class="inp" id="vaultPassInput" style="width:200px" ' +
          'placeholder="查看口令" onkeydown="vaultKeydown(event)">' +
        '<button class="btn primary" data-act="vaultUnlock">解锁</button>' +
      '</div>' +
      '<div style="margin-top:16px"><button class="btn ghost sm" data-act="vaultForget">口令忘了</button></div>' +
    '</div></div>';
}
function vaultKeydown(ev){
  if (ev.key === 'Enter'){ ev.preventDefault(); vaultUnlock(); }
}
function vaultUnlock(){
  var el = $('vaultPassInput');
  var p = el ? el.value : '';
  if (!p){ toast('请先输入口令'); return; }
  sha256Hex(p).then(function(h){
    if (h === db.meta.vaultPass){
      ui.vaultUnlocked = true;
      if (el) el.value = '';
      render();
      toast('已解锁');
    } else {
      toast('口令不对');
      if (el){ el.value = ''; el.focus(); }
    }
  }).catch(function(e){
    alert('口令校验没法用：' + e.message + '\n可以点「口令忘了」把这个锁去掉。');
  });
}

function vbForm(v, isNew){
  v = v || {};
  return '<div class="writepad">' +
      '<div class="wrow">' +
        '<input class="inp grow" id="vbName" placeholder="名称（例如：支付宝）" value="' + esc(v.name || '') + '">' +
        '<input class="inp grow" id="vbAcc" placeholder="账号 / 用户名 / 手机号" value="' + esc(v.account || '') + '">' +
      '</div>' +
      '<div class="wrow">' +
        '<input class="inp grow" id="vbPwd" placeholder="密码" value="' + esc(v.password || '') + '">' +
        '<button class="btn ghost sm" data-act="vbGen">随机生成一个</button>' +
      '</div>' +
      '<div class="wrow">' +
        '<input class="inp grow" id="vbUrl" placeholder="网址（可不写）" value="' + esc(v.url || '') + '">' +
      '</div>' +
      '<div class="wrow">' +
        '<input class="inp grow" id="vbNote" placeholder="备注（可不写）" value="' + esc(v.note || '') + '">' +
      '</div>' +
      '<div class="wrow">' +
        '<button class="btn primary" data-act="' + (isNew ? 'vbSaveNew' : 'vbSaveEdit') + '" data-id="' + (v.id || '') + '">保存</button>' +
        '<button class="btn ghost" data-act="vbCancel">取消</button>' +
      '</div></div>';
}

function vbSaveForm(isNew, id){
  var name = String($('vbName').value || '').trim();
  if (!name){ alert('名称不能空着。'); $('vbName').focus(); return; }
  var obj = {
    name: name,
    account: String($('vbAcc').value || '').trim(),
    password: String($('vbPwd').value || ''),
    url: String($('vbUrl').value || '').trim(),
    note: String($('vbNote').value || '').trim(),
    updatedAt: Date.now()
  };
  if (isNew){
    obj.id = uid();
    obj.createdAt = Date.now();
    db.vault.push(obj);
    ui.vbAdd = false;
  } else {
    var v = vbById(id);
    if (!v) return;
    v.name = obj.name; v.account = obj.account; v.password = obj.password;
    v.url = obj.url; v.note = obj.note; v.updatedAt = obj.updatedAt;
    ui.vbEdit = null;
  }
  save();
  render();
  toast(isNew ? '已添加一条' : '已保存');
}

/* 生成一个随手能用的强密码（不用自己编） */
function vbGenPassword(){
  var chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%*-_';
  var out = '', arr = new Uint32Array(16);
  var hasCrypto = !!(window.crypto && crypto.getRandomValues);
  if (hasCrypto) crypto.getRandomValues(arr);
  for (var i = 0; i < 16; i++){
    var n = hasCrypto ? arr[i] : Math.floor(Math.random() * 4294967295);
    out += chars.charAt(n % chars.length);
  }
  return out;
}

function vaultSetPass(){
  var p1 = prompt('给密码本设一个「查看口令」（至少 4 位）：');
  if (p1 === null) return;
  p1 = String(p1).trim();
  if (p1.length < 4){ alert('口令至少 4 位。'); return; }
  var p2 = prompt('再输一遍确认：');
  if (p2 === null) return;
  if (String(p2).trim() !== p1){ alert('两次输的不一样，没有设置成功。'); return; }
  sha256Hex(p1).then(function(h){
    db.meta.vaultPass = h;
    ui.vaultUnlocked = true;
    save();
    render();
    alert('口令设好了。\n\n以后打开密码本要先输这个口令。\n\n' +
          '说明：这个口令只防「别人随手点开」，数据本身没有加密，' +
          '所以不要拿它当保险箱 —— 最要紧的账号还是别放这里。');
  }).catch(function(e){
    alert('这台电脑的浏览器不支持口令校验：' + e.message);
  });
}

function vbRowsHtml(){
  var q = String(ui.vbQuery || '').trim();
  var list = db.vault.filter(function(v){
    if (!q) return true;
    return (String(v.name) + ' ' + String(v.account || '') + ' ' + String(v.note || '')).indexOf(q) >= 0;
  });
  if (!list.length){
    return '<div class="empty"><div class="e1">' + (q ? '没找到这一条' : '密码本还是空的') + '</div>' +
           (q ? '换个词试试。' : '点「+ 添加一条」，把账号密码记进来，以后点一下就复制。') + '</div>';
  }
  return list.map(function(v){
    var show = !!vbShow[v.id];
    return '<div class="vbrow">' +
        '<span class="vnm">' + esc(v.name) + '</span>' +
        '<span class="vac">' + esc(v.account || '（没写账号）') + '</span>' +
        '<span class="vpd">' + (show ? esc(v.password) : '••••••••') + '</span>' +
        '<div class="vops">' +
          (v.account ? '<button class="btn ghost tiny" data-act="vbCopyAcc" data-id="' + v.id + '">复制账号</button>' : '') +
          '<button class="btn ghost tiny" data-act="vbCopyPwd" data-id="' + v.id + '">复制密码</button>' +
          '<button class="btn ghost tiny" data-act="vbToggleShow" data-id="' + v.id + '">' + (show ? '藏起来' : '看一眼') + '</button>' +
          '<button class="btn ghost tiny" data-act="vbEdit" data-id="' + v.id + '">改</button>' +
          '<button class="btn ghost tiny danger" data-act="vbDel" data-id="' + v.id + '">删</button>' +
        '</div>' +
      '</div>';
  }).join('');
}
function vbById(id){
  for (var i = 0; i < db.vault.length; i++){ if (db.vault[i].id === id) return db.vault[i]; }
  return null;
}
function vbQueryLive(v){
  ui.vbQuery = v;
  var el = $('vbList');
  if (el) el.innerHTML = vbRowsHtml();
}

function renderVaultPage(){
  if (vaultLocked()) return vaultLockHtml();
  var locked = !!db.meta.vaultPass;
  return '<div class="card glass">' +
      '<div class="card-hd"><div class="t">密码本</div>' +
        '<div class="r">共 ' + db.vault.length + ' 条' + (locked ? ' · 已设查看口令' : '') + '</div></div>' +
      '<div class="warnbox">' +
        '<b>安全说明（请一定看一遍）：</b>这些东西 <b>只存在你这台电脑的浏览器里，不联网、不上传</b>。' +
        '但它们是以<b>明文</b>躺在浏览器数据里的 —— 谁能摸到你这台电脑、打开这个页面，就能看到。' +
        '所以：<b>最要紧的账号（网银、支付类）请别放这里</b>。' +
        (locked ? '你已经设了查看口令，点开密码本要先输口令。'
                : '想挡一下"别人随手点开"，可以设一个查看口令。') +
      '</div>' +
      '<div class="toolbar">' +
        '<input class="inp grow" placeholder="搜名称、账号或备注…" value="' + esc(ui.vbQuery || '') + '" ' +
          'oninput="vbQueryLive(this.value)">' +
        '<button class="btn primary" data-act="vbAddToggle">' + (ui.vbAdd ? '收起' : '+ 添加一条') + '</button>' +
        (locked
          ? '<button class="btn ghost" data-act="vaultClear">去掉查看口令</button>'
          : '<button class="btn ghost" data-act="vaultSet">设一个查看口令</button>') +
      '</div>' +
      (ui.vbAdd ? vbForm(null, true) : '') +
      (ui.vbEdit ? vbForm(vbById(ui.vbEdit), false) : '') +
      '<div id="vbList">' + vbRowsHtml() + '</div>' +
      '<div class="hintline">「复制密码」点一下就进剪贴板，可以直接粘到登录框里。</div>' +
    '</div>';
}

/* =========================================================================
   会议录音转纪要
   录音和转写由「小工具」里的小程序在本地完成（不联网、不花钱）。
   工作台这边负责：读回转写结果 → 交给 AI 整理成要点和待办 → 存起来 / 加进待办
   ========================================================================= */
function loadTranscript(){
  return new Promise(function(resolve, reject){
    var s = document.createElement('script');
    s.src = '录音/最新转写.js?_=' + Date.now();
    s.onload = function(){
      if (s.parentNode) s.parentNode.removeChild(s);
      if (window.WB_ASR && window.WB_ASR.text) resolve(window.WB_ASR);
      else reject(new Error('文件读到了，但里面没有转写内容'));
    };
    s.onerror = function(){
      if (s.parentNode) s.parentNode.removeChild(s);
      reject(new Error('没找到转写结果。先双击「小工具」里的「转写录音」，跟着它做一次。'));
    };
    document.head.appendChild(s);
  });
}

/* 从 AI 的回答里把最后那段 JSON 待办抠出来 */
function parseTodoJson(text){
  var m = String(text).match(/\[[\s\S]*\]\s*$/);
  if (!m) return [];
  try {
    var arr = JSON.parse(m[0]);
    if (!(arr instanceof Array)) return [];
    return arr.filter(function(x){
      /* AI 有时会用英文字段名，有时用中文的 —— 两种都认 */
      return x && (x.what || x.做什么 || x.事项 || x.谁 || x.who);
    }).map(function(x){
      return {
        who:  String(x.who  || x.负责人 || '').trim(),
        what: String(x.what || x.做什么 || x.事项 || '').trim(),
        when: String(x.when || x.时间 || x.什么时候 || '').trim()
      };
    });
  } catch(e){ return []; }
}

function parseDueDate(s){
  s = String(s || '');
  if (!s) return '';
  var now = new Date();
  if (/今天/.test(s)) return todayStr();
  if (/明天/.test(s)) return dateStr(new Date(Date.now() + 86400000));
  if (/后天/.test(s)) return dateStr(new Date(Date.now() + 2 * 86400000));
  /* 「周五前」「下周三」「礼拜二」这类，直接算成具体日期 */
  var map = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':0,'天':0};
  var isNext = /下周|下星期|下个?礼拜/.test(s);
  var wm = s.match(/(?:周|星期|礼拜)([一二三四五六日天])/);
  if (wm){
    var delta = (map[wm[1]] - now.getDay() + 7) % 7;
    if (isNext) delta += 7;
    return dateStr(new Date(now.getTime() + delta * 86400000));
  }
  if (isNext) return dateStr(new Date(now.getTime() + 7 * 86400000));
  if (/这周|本周|周内|这个星期/.test(s)) return dateStr(new Date(now.getTime() + 3 * 86400000));
  if (/月底/.test(s)){
    var e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return dateStr(e);
  }
  var m = s.match(/(\d{1,2})\s*[月\/]\s*(\d{1,2})/);
  if (m) return dateStr(new Date(new Date().getFullYear(), Number(m[1]) - 1, Number(m[2])));
  return '';
}

function fmtDur(sec){
  sec = Number(sec) || 0;
  return Math.floor(sec / 60) + ' 分 ' + Math.round(sec % 60) + ' 秒';
}

function renderMinutesPage(){
  var m = ui.mn || {};
  var recs = (db.minutes || []).slice().sort(function(a, b){ return (b.createdAt || 0) - (a.createdAt || 0); });
  var h = '';

  h += '<div class="card glass">' +
      '<div class="card-hd"><div class="t">会议录音转纪要</div>' +
        '<div class="r">' + (recs.length ? '已存 ' + recs.length + ' 份纪要' : '还没有纪要') + '</div></div>' +
      '<div class="stepsbox">' +
        '<div class="stp"><b>第 1 步</b>手机上开会时正常录音（半小时以内都行）</div>' +
        '<div class="stp"><b>第 2 步</b>把录音传到电脑（微信「文件传输助手」/ 数据线 / 网盘都行）</div>' +
        '<div class="stp"><b>第 3 步</b>双击「小工具」里的 <b>转写录音</b>，选那个录音文件，等它跑完' +
          '（半小时的会大概 5-15 分钟，跑的时候你可以干别的；第一次会先装个东西，见说明书）</div>' +
        '<div class="stp"><b>第 4 步</b>回到这里 → 点「读取转写结果」→ 再点「AI 整理成要点」</div>' +
      '</div>' +
      '<div class="toolbar" style="margin-top:14px">' +
        '<button class="btn primary" data-act="asrLoad">读取转写结果</button>' +
        (m.asr
          ? '<span style="font-size:12.5px;color:var(--ink-2)">已读到：<b>' + esc(m.asr.audio || '（未命名）') + '</b>' +
            (m.asr.seconds ? '　时长 ' + fmtDur(m.asr.seconds) : '') +
            (m.asr.model ? '　模型 ' + esc(m.asr.model) : '') + '</span>'
          : '') +
      '</div>' +
      (m.err ? '<div class="aistat bad"><b>✗</b><div>' + esc(m.err) + '</div></div>' : '') +
      (m.asr
        ? '<div style="margin-top:14px">' +
            '<div style="font-size:12.5px;color:var(--ink-3);margin-bottom:7px">' +
              '转写原文（<b>可以先改</b>：转写难免有错别字，改完再交给 AI 更准）' +
              '<button class="btn ghost tiny" data-act="asrCopy" style="margin-left:8px">复制原文</button></div>' +
            '<textarea class="inp" id="asrText" style="width:100%;min-height:170px;line-height:1.9;' +
              'font-size:13px;padding:12px 14px;border-radius:14px;resize:vertical">' + esc(m.asr.text) + '</textarea>' +
            '<div class="wrow" style="margin-top:10px">' +
              '<button class="btn primary" data-act="asrSummarize">AI 整理成要点</button>' +
              '<button class="btn ghost" data-act="asrHelp">录音文件在哪？</button>' +
              (m.busy ? '<span style="font-size:12px;color:var(--ink-3)">' + esc(m.busy) + '</span>' : '') +
            '</div>' +
          '</div>'
        : '') +
      '<div class="hintline">' +
        '转写是在你电脑上本地跑的：<b>免费、不联网、不上传</b>，录音也只留在你自己硬盘上。<br>' +
        '<b>关于「区分不同说话人」</b>：免费的本地方案做不到精确认人。' +
        '所以这里换了个更实用的做法 —— 让 AI 从内容里推断「谁负责什么」' +
        '（比如"张总你把这个发一下" → 负责人写成张总）。' +
      '</div>' +
    '</div>';

  if (m.sum) h += minutesResultHtml(m.sum);

  if (recs.length){
    h += '<div class="card glass">' +
        '<div class="card-hd"><div class="t">以前的纪要</div><div class="r">共 ' + recs.length + ' 份</div></div>' +
        recs.map(function(r){
          var open = ui.mnOpen === r.id;
          return '<div class="note">' +
              '<div class="hd">' +
                '<span class="dt">' + esc(r.date) + '</span>' +
                '<span class="tt">' + esc(r.title || '（没写标题）') + '</span>' +
                (r.audio ? '<span class="pill due">' + esc(r.audio) + '</span>' : '') +
                '<button class="btn ghost tiny" data-act="minOpen" data-id="' + r.id + '">' +
                  (open ? '收起' : '展开') + '</button>' +
                '<button class="btn ghost tiny danger" data-act="minDel" data-id="' + r.id + '">删除</button>' +
              '</div>' +
              '<div class="body' + (open ? '' : ' clamp') + '">' + esc(r.points || '') + '</div>' +
            '</div>';
        }).join('') +
      '</div>';
  }
  return h;
}

function minutesResultHtml(s){
  var todos = s.todos || [];
  return '<div class="card glass">' +
      '<div class="card-hd"><div class="t">整理结果</div>' +
        '<div class="r">' + (s.usage ? '这次用了 ' + s.usage + ' tokens' : '') + '</div></div>' +
      '<div class="aitext">' + esc(s.readable || '').replace(/\n/g, '<br>') + '</div>' +
      (todos.length
        ? '<div style="margin-top:14px">' +
            '<div style="font-size:12.5px;color:var(--ink-3);margin-bottom:8px">' +
              'AI 挑出 ' + todos.length + ' 条待办，勾掉不要的，然后一键加进「待办事项」：</div>' +
            todos.map(function(t, i){
              return '<div class="pick">' +
                  '<input type="checkbox" class="tchk" data-i="' + i + '" checked>' +
                  '<span class="pn">' + esc(t.what) + '</span>' +
                  (t.who ? '<span class="pc">' + esc(t.who) + '</span>' : '') +
                  '<span class="pt">' + esc(t.when || '没写时间') + '</span>' +
                '</div>';
            }).join('') +
            '<div class="wrow" style="margin-top:8px">' +
              '<button class="btn primary" data-act="minTodoAdd">加进待办事项</button>' +
              '<span style="font-size:11.5px;color:var(--ink-3)">负责人会写进事项里；' +
              '时间能认出来的就填成日期（"明天""下周"这类），认不出的就留空。</span>' +
            '</div></div>'
        : '') +
      '<div class="wrow" style="margin-top:12px">' +
        '<button class="btn primary sm" data-act="minSave">存成会议纪要</button>' +
        '<button class="btn ghost sm" data-act="minCopy">复制这段</button>' +
        '<button class="btn ghost sm" data-act="minClose">关掉结果</button>' +
      '</div>' +
    '</div>';
}

function minutesSummarize(){
  if (!aiReady()){
    alert('这一步要用 AI。\n\n先去左边「AI 助手」页面把密钥填上、点一次「一键自检」，再回来。');
    ui.page = 'ai'; render(); return;
  }
  var el = $('asrText');
  var text = el ? String(el.value).trim() : '';
  if (!text){ alert('转写原文是空的，先点「读取转写结果」。'); return; }
  ui.mn = ui.mn || {};
  ui.mn.busy = 'AI 正在读，一般 20-60 秒…';
  render();
  var prompt =
    '下面是一段会议录音的转写文字（可能有错别字、重复、口语）。请整理成一份会议纪要。\n\n' +
    '硬要求：\n' +
    '1. 只根据这段文字，不要补充没提到的事。\n' +
    '2. 按下面三个小标题输出（小标题原文照抄）：\n' +
    '【会议要点】3-6 条，每条一句话，说清"决定了什么 / 知道了什么"\n' +
    '【待办清单】每条写成"谁 · 做什么 · 什么时候交"。转写里没说清的，写"负责人未提""时间未定"，不要瞎猜。\n' +
    '【其他值得记一句的】没有就写"无"\n' +
    '3. 用大白话，别用"赋能""抓手""闭环"这类词。\n' +
    '4. 不要用 Markdown 的 ## 号，不要代码块。\n' +
    '5. 正文写完后，最后**另起一行**只输出一个 JSON 数组（不要代码块包裹），把待办列进去，' +
    '格式严格是：[{"who":"负责人","what":"做什么","when":"什么时候"}]；没有待办就输出 []。\n\n' +
    '====== 转写文字开始 ======\n' + text + '\n====== 转写文字结束 ======';
  aiChat([{ role:'user', content:prompt }], { maxTokens:1600, temperature:0.3 })
    .then(function(r){
      var full = String(r.text || '').trim();
      var todos = parseTodoJson(full);
      var readable = full.replace(/\[[\s\S]*\]\s*$/, '').trim();
      ui.mn.busy = '';
      ui.mn.sum = {
        readable: readable, todos: todos,
        usage: r.usage ? r.usage.total_tokens : 0,
        audio: (ui.mn.asr || {}).audio || ''
      };
      render();
    })
    .catch(function(e){
      ui.mn.busy = '';
      render();
      alert('AI 整理失败了：' + e.message);
    });
}

/* =========================================================================
   健身：身体数据 + 动作库
   ========================================================================= */
var fitTimer = null, fitT = 0;
var EX_BY_ID = {};
EX.forEach(function(e){ EX_BY_ID[e.id] = e; });

function fitAnimStart(){
  if (fitTimer) return;
  fitTimer = setInterval(function(){
    var list = document.querySelectorAll('.figsvg[data-fig]');
    if (!list.length){                  /* 离开这一页就自己停掉，不白耗电 */
      clearInterval(fitTimer); fitTimer = null; return;
    }
    fitT += 0.055;
    var phase = (Math.sin(fitT) + 1) / 2;
    for (var i = 0; i < list.length; i++){
      var ex = EX_BY_ID[list[i].getAttribute('data-fig')];
      if (ex) figPaint(list[i], figLerp(ex.A, ex.B, phase));
    }
  }, 80);
}

/* --- 身体数据 --- */
function bodySorted(){
  return (db.bodyLog || []).slice().sort(function(a, b){
    return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
  });
}
function bodyLast(){ var l = bodySorted(); return l.length ? l[0] : null; }

function bodySave(){
  var d = $('bdDate').value || todayStr();
  var o = {
    weight:  $('bdWeight').value.trim(),
    bodyFat: $('bdFat').value.trim(),
    waist:   $('bdWaist').value.trim(),
    chest:   $('bdChest').value.trim(),
    note:    $('bdNote').value.trim()
  };
  if (!o.weight && !o.bodyFat && !o.waist && !o.chest){
    alert('至少填一项吧（体重 / 体脂 / 腰围 / 胸围）。');
    return;
  }
  db.bodyLog = db.bodyLog || [];
  var hit = null;
  db.bodyLog.forEach(function(r){ if (r.date === d) hit = r; });
  if (hit){
    /* 只更新「这次填了的」，没填的保留原值 ——
       免得早上记了体重、晚上补腰围，一保存把体重清掉了 */
    if (o.weight)  hit.weight  = o.weight;
    if (o.bodyFat) hit.bodyFat = o.bodyFat;
    if (o.waist)   hit.waist   = o.waist;
    if (o.chest)   hit.chest   = o.chest;
    if (o.note)    hit.note    = o.note;
    hit.updatedAt = Date.now();
  } else {
    db.bodyLog.push({id:uid(), date:d, weight:o.weight, bodyFat:o.bodyFat,
                     waist:o.waist, chest:o.chest, note:o.note, createdAt:Date.now()});
  }
  ui.bodyEditId = null;
  save();
  render();
  toast('记好了（' + d + '）');
}
function bodyEdit(id){
  var r = null;
  (db.bodyLog || []).forEach(function(x){ if (x.id === id) r = x; });
  if (!r) return;
  ui.bodyEditId = id;
  ui.fitOpen = true;
  render();
  var map = {bdDate:r.date, bdWeight:r.weight, bdFat:r.bodyFat, bdWaist:r.waist, bdChest:r.chest, bdNote:r.note};
  Object.keys(map).forEach(function(k){ var el = $(k); if (el) el.value = map[k] || ''; });
}
function bodyDel(id){
  var r = null;
  (db.bodyLog || []).forEach(function(x){ if (x.id === id) r = x; });
  if (!r) return;
  if (!confirm('删掉 ' + r.date + ' 这条记录吗？')) return;
  db.bodyLog = db.bodyLog.filter(function(x){ return x.id !== id; });
  save();
  render();
}

var fitChartKey = 'weight';
var FIT_METRIC = { weight:'体重', bodyFat:'体脂率', waist:'腰围', chest:'胸围' };
var FIT_UNIT   = { weight:'kg', bodyFat:'%', waist:'cm', chest:'cm' };
function fitFmt(v, key){ return (Math.round(Number(v) * 10) / 10) + FIT_UNIT[key]; }

/* 动作讲解：默认去抖音搜「讲解人 + 动作名」。名字和主页都能自己改 */
function fitCoach(){
  if (!db.meta.fitCoach || typeof db.meta.fitCoach !== 'object'){
    db.meta.fitCoach = { name:'谭成义', home:'' };
  }
  if (typeof db.meta.fitCoach.name !== 'string') db.meta.fitCoach.name = '谭成义';
  if (typeof db.meta.fitCoach.home !== 'string') db.meta.fitCoach.home = '';
  return db.meta.fitCoach;
}

/* 用 SVG 画趋势线（不依赖任何图表库） */
function fitChartHtml(){
  var key = fitChartKey;
  var list = bodySorted().filter(function(r){ return isNum(r[key]); }).slice(0, 30).reverse();
  var tabs = Object.keys(FIT_METRIC).map(function(k){
    return '<button class="chip' + (k === key ? ' on' : '') + '" data-act="fitChartKey" data-v="' + k + '">' +
             FIT_METRIC[k] + '</button>';
  }).join('');
  if (list.length < 2){
    return '<div class="toolbar" style="margin-bottom:6px">' + tabs + '</div>' +
           '<div class="empty" style="padding:22px 10px">' +
             (list.length ? '再记一次「' + FIT_METRIC[key] + '」就能画出曲线了。'
                          : '还没有「' + FIT_METRIC[key] + '」的数据，在下面记一次。') + '</div>';
  }
  var w = 660, hgt = 160, pad = 30;
  var vals = list.map(function(r){ return Number(r[key]); });
  var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
  if (mn === mx){ mn -= 1; mx += 1; }
  var span = mx - mn;
  function X(i){ return pad + i * (w - pad * 2) / Math.max(1, list.length - 1); }
  function Y(v){ return hgt - pad - (v - mn) / span * (hgt - pad * 2); }
  var pts  = vals.map(function(v, i){ return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ');
  var area = pad + ',' + (hgt - pad) + ' ' + pts + ' ' +
             X(vals.length - 1).toFixed(1) + ',' + (hgt - pad);
  var dots = vals.map(function(v, i){
    return '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="3" fill="currentColor"/>';
  }).join('');
  var first = vals[0], last = vals[vals.length - 1];
  var diff = Math.round((last - first) * 10) / 10;
  return '<div class="toolbar" style="margin-bottom:6px">' + tabs +
      '<span style="flex:1 1 20px"></span>' +
      '<span style="font-size:12px;color:var(--ink-3)">这 ' + list.length + ' 次：' +
        fitFmt(first, key) + ' → ' + fitFmt(last, key) + '（' + (diff > 0 ? '+' : '') + diff + FIT_UNIT[key] + '）</span></div>' +
    '<div class="chartbox"><svg viewBox="0 0 ' + w + ' ' + hgt + '" class="chart-svg">' +
      '<polygon points="' + area + '" fill="currentColor" opacity="0.07"/>' +
      '<polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="2.2" ' +
        'stroke-linejoin="round" stroke-linecap="round"/>' +
      dots +
      '<text x="' + pad + '" y="14" class="chart-t">最高 ' + fitFmt(mx, key) + '</text>' +
      '<text x="' + pad + '" y="' + (hgt - 8) + '" class="chart-t">最低 ' + fitFmt(mn, key) + '</text>' +
      '<text x="' + (w - pad) + '" y="' + (hgt - 8) + '" class="chart-t" text-anchor="end">' +
        esc(list[0].date.slice(5)) + ' → ' + esc(list[list.length - 1].date.slice(5)) + '</text>' +
    '</svg></div>';
}

function exCardHtml(e){
  var c = fitCoach();
  var kw = (c.name ? c.name + ' ' : '') + e.name;
  var rel0 = exImgRel(e.id, 0), rel1 = exImgRel(e.id, 1);
  var src0 = exImgSrc(e.id, 0), src1 = exImgSrc(e.id, 1);
  return '<div class="excard" style="--h:' + fitHue(e.part) + '">' +
      '<div class="exfig">' +
        /* 底下永远铺一张自己画的动画（图没有时就是它） */
        figBuild(e.id) +
        /* 上面盖真人示范图（两张交替 = 循环动画）；图取不到就自己消失，不碍事 */
        '<img class="eximg" src="' + esc(src0) + '" alt="" loading="lazy" ' +
          'data-rel="' + esc(rel0) + '" data-mi="0" ' +
          'onload="exImgOk(this)" onerror="exImgErr(this)">' +
        '<img class="eximg eximg2" src="' + esc(src1 || src0) + '" alt="" loading="lazy" ' +
          'data-rel="' + esc(rel1 || rel0) + '" data-mi="0" ' +
          'onload="exImgOk(this)" onerror="exImgErr(this)">' +
      '</div>' +
      '<div class="exbody">' +
        '<div class="exhd"><span class="exname">' + esc(e.name) + '</span>' +
          '<span class="expill">' + esc(e.part) + '</span>' +
          '<a class="exlink" target="_blank" rel="noreferrer" ' +
            'href="https://www.douyin.com/search/' + encodeURIComponent(kw) + '" ' +
            'title="去抖音搜「' + esc(kw) + '」">看讲解 ↗</a></div>' +
        '<div class="exdose">' + esc(e.dose) + '</div>' +
        '<ul class="extips">' + e.tips.map(function(t){ return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      '</div></div>';
}

var fitImgVer = 0;   // 下载完图片后换个版本号，强制浏览器重新读图（不然会记着"这张图不存在"）

/* 图片的多个镜像：一个连不上就自动换下一个（国内访问国外图库经常被拦）。
   用 <img> 加载不受跨域限制，所以只要有一个镜像通就行。 */
var EX_IMG_MIRRORS = [
  'https://fastly.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/',
  'https://gcore.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/',
  'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/',
  'https://raw.githack.com/yuhonas/free-exercise-db/main/exercises/',
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'
];

/* 第 k 张演示图该用哪个地址 */
function exImgSrc(id, k){
  var rel = (typeof EX_IMG_PATHS !== 'undefined' && EX_IMG_PATHS[id]) ? EX_IMG_PATHS[id][k] : '';
  if (rel) return EX_IMG_MIRRORS[0] + rel;
  /* 图库里没有的（或者以前下载到本地的）→ 用本地文件；本地也没有就显示小人 */
  return 'images/动作/' + id + '/' + k + '.jpg' + (fitImgVer ? ('?v=' + fitImgVer) : '');
}
function exImgRel(id, k){
  return (typeof EX_IMG_PATHS !== 'undefined' && EX_IMG_PATHS[id]) ? EX_IMG_PATHS[id][k] : '';
}

/* 某张图加载失败：换下一个镜像；全都不行就把这张图去掉，露出下面的小人动画 */
function exImgErr(img){
  var rel = img.getAttribute('data-rel');
  var mi = Number(img.getAttribute('data-mi') || '0') + 1;
  if (!rel || mi >= EX_IMG_MIRRORS.length){ img.remove(); return; }
  img.setAttribute('data-mi', String(mi));
  img.src = EX_IMG_MIRRORS[mi] + rel;
}

/* =========================================================================
   动作示范图：直接从开源图库显示（不需要下载、不需要选文件夹）
   img 标签不受跨域限制，所以只要知道图片地址就能显示。
   地址表查一次就存起来，下次打开直接用（不用再联网查）。
   ========================================================================= */
/* 下面这几个是老做法（先查地址表再显示）留下的，现在已经不用了：
   现在直接把路径写在 exercises.js 里。名字改掉是为了不跟上面的 exImgErr 函数撞名。 */
var EX_IMG_MAP_KEY = 'wb.eximgmap.v1';
var exImgMap = null, exImgLoading = false, exImgMapErr = '';

function loadExImgMap(){
  try {
    var s = localStorage.getItem(EX_IMG_MAP_KEY);
    if (s){
      var o = JSON.parse(s);
      if (o && typeof o === 'object' && Object.keys(o).length){ exImgMap = o; return Promise.resolve(o); }
    }
  } catch(e){}
  return exFetchJson().then(function(json){
    var index = {};
    (json || []).forEach(function(e){ if (e && e.name) index[exNorm(e.name)] = e; });
    var map = {}, miss = 0;
    EX_WANT.forEach(function(pair){
      var id = pair[0], keys = pair[1].split(',');
      var hit = null;
      for (var i = 0; i < keys.length && !hit; i++){ hit = index[exNorm(keys[i])] || null; }
      if (!hit){
        for (var j = 0; j < keys.length && !hit; j++){
          var nk = exNorm(keys[j]);
          Object.keys(index).forEach(function(nm){ if (!hit && nm.indexOf(nk) >= 0) hit = index[nm]; });
        }
      }
      if (hit && hit.images && hit.images.length){
        var base = exUsedMirror ? (exUsedMirror + 'exercises/') : EX_IMG_BASES[0];
        map[id] = hit.images.slice(0, 2).map(function(rel){ return base + rel; });
      } else miss++;
    });
    if (!Object.keys(map).length) throw new Error('地址表里没找到能对上的动作');
    exImgMap = map;
    try { localStorage.setItem(EX_IMG_MAP_KEY, JSON.stringify(map)); } catch(e){}
    exImgErr = miss ? ('有 ' + miss + ' 个动作在开源库里没找到，那几个继续用小人动画') : '';
    return map;
  });
}

/* 进入健身页时自动把地址表准备好 */
function fitEnsureImgMap(){
  /* 注意：失败过就不要再自动试了 —— 否则"失败→重画→再试→再失败"会变成死循环。
     想重试要手动点「再试一次」按钮（那个会把 exImgErr 清空）。 */
  if (exImgMap || exImgLoading || exImgErr) return;
  exImgLoading = true;
  loadExImgMap().then(function(){
    exImgLoading = false;
    if (ui.page === 'fitness') render();
  }).catch(function(e){
    exImgLoading = false;
    exImgErr = (e && e.message) ? e.message : String(e);
    if (ui.page === 'fitness') render();
  });
}

function fitImgStatusHtml(){
  if (exImgLoading) return '<div class="aistat wait"><b>…</b><div>正在取真人示范图的地址（只查这一次，之后就不联网了）…</div></div>';
  if (exImgErr) return '<div class="aistat warn" style="background:rgba(198,174,133,.14);border:1px solid rgba(198,174,133,.32);color:#8A7448">' +
    '<b>!</b><div><b>没取到图的地址</b>（动作库里还是小人动画，不影响用）<br>' + esc(exImgErr) +
    '<div style="margin-top:8px"><button class="btn ghost tiny" data-act="exImgReload">再试一次</button></div></div></div>';
  if (exImgMap && exImgErr) return '<div class="aistat warn" style="background:rgba(198,174,133,.14);border:1px solid rgba(198,174,133,.32);color:#8A7448"><b>!</b><div>' + esc(exImgErr) + '</div></div>';
  return '';
}

/* =========================================================================
   用浏览器下载动作示范图
   为什么要走浏览器：这台电脑上 PowerShell 的加密通道有问题（连不上 https），
   但 Chrome 自己的加密是好的 —— 所以让浏览器来下。
   ========================================================================= */
/* 图库的多个镜像地址，按"国内能不能访问"排的顺序：
   fastly / gcore 是 jsDelivr 的备用域名（国内通常能通），cdn.jsdelivr 和 github 那两个经常被拦。
   一个一个试，哪个通就用哪个（同一个镜像去取图片）。 */
var EX_MIRRORS = [
  'https://fastly.jsdelivr.net/gh/yuhonas/free-exercise-db@main/',
  'https://gcore.jsdelivr.net/gh/yuhonas/free-exercise-db@main/',
  'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/',
  'https://raw.gitmirror.com/yuhonas/free-exercise-db/main/',
  'https://ghproxy.net/https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/',
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/'
];
var EX_JSON_URLS = EX_MIRRORS.map(function(b){ return b + 'dist/exercises.json'; });
var EX_IMG_BASES = EX_MIRRORS.map(function(b){ return b + 'exercises/'; });
var exUsedMirror = '';   // 哪一个通了，图片就用它取

/* 带超时的请求：被拦的地址会一直挂着不动，所以要限时，不然要等好几分钟 */
function fetchWithTimeout(url, ms){
  return new Promise(function(resolve, reject){
    var done = false;
    var t = setTimeout(function(){ if (!done){ done = true; reject(new Error('等太久没回应')); } }, ms || 8000);
    fetch(url).then(function(r){
      if (done) return;
      done = true; clearTimeout(t);
      if (!r.ok) reject(new Error('HTTP ' + r.status)); else resolve(r);
    }).catch(function(e){
      if (done) return;
      done = true; clearTimeout(t);
      reject(e);
    });
  });
}

/* 我要哪些动作：id → 用来匹配的英文关键词（跟小工具里那份一致） */
var EX_WANT = [
  ['pushup','push up,push-up,pushup'], ['pushup_knee','knee push up,kneeling push up'],
  ['pushup_incline','incline push up'], ['pushup_decline','decline push up'],
  ['bench_press','bench press'], ['pullup','pull up,pull-up,chin up,chin-up'],
  ['row_db','dumbbell row,one arm row,one-arm row'], ['row_barbell','bent over row,barbell row,bent-over row'],
  ['latpulldown','lat pulldown,pulldown'], ['superman','superman'],
  ['squat','barbell squat,bodyweight squat,squat'], ['lunge','lunge'],
  ['glute_bridge','glute bridge,hip bridge,bridge'], ['wall_sit','wall sit'],
  ['calf_raise','calf raise,calf press,standing calf'], ['bulgarian','bulgarian split squat,split squat'],
  ['bridge_single','single leg glute bridge,single-leg glute bridge,one leg bridge'],
  ['side_leg','side leg raise,hip abduction,lying leg raise'],
  ['donkey_kick','donkey kick,glute kickback,fire hydrant'],
  ['lateral_raise','lateral raise'], ['front_raise','front raise'],
  ['shoulder_press','shoulder press,overhead press,military press'], ['face_pull','face pull'],
  ['rear_fly','rear delt fly,reverse fly,rear lateral'],
  ['curl','bicep curl,biceps curl,barbell curl,dumbbell curl'], ['hammer_curl','hammer curl'],
  ['dip_chair','bench dip,dip'], ['overhead_ext','overhead triceps extension,triceps extension,skull crusher'],
  ['plank','plank'], ['side_plank','side plank'], ['crunch','crunch,sit up,sit-up'],
  ['leg_raise','lying leg raise,leg raise'], ['russian_twist','russian twist'], ['dead_bug','dead bug'],
  ['jumping_jack','jumping jack'], ['high_knee','high knee,running,run'], ['burpee','burpee'],
  ['jog','jogging,jog,running,run,treadmill'], ['mountain_climber','mountain climber'],
  ['jump_rope','jump rope,rope jump']
];

function exNorm(s){ return String(s || '').replace(/[-_]/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim(); }

function fitDlStatusHtml(){
  var d = ui.fitDl;
  if (!d) return '';
  if (d.running) return '<div class="aistat wait"><b>…</b><div>' + esc(d.step || '正在下载…') +
    (d.total ? '' : '') + '</div></div>';
  if (d.err) return '<div class="aistat bad"><b>✗</b><div><b>没下成</b><br>' + esc(d.err) +
    '<br><br>怎么办：' +
    '① 确认这台电脑能上外网（浏览器能打开 cdn.jsdelivr.net）；' +
    '② 如果是"用户取消"，重新点一次、这次选一个文件夹；' +
    '③ 还不行就点「看看问题」把那句话发我。</div>' +
    '<div style="margin-top:8px"><button class="btn ghost tiny" data-act="fitDlHelp">看看问题</button></div></div>';
  if (d.done) return '<div class="aistat ' + (d.verify === 'bad' ? 'bad' : 'ok') + '"><b>' +
    (d.verify === 'bad' ? '!' : '✓') + '</b><div><b>下载完成：成功 ' + (d.ok || 0) + ' 个动作' +
    (d.fail ? '，' + d.fail + ' 个没找到' : '') + '</b><br>' +
    (d.verify === 'bad'
      ? '但是图片好像没存到工作台文件夹里 —— 再点一次，<b>这次选「我的工作台」文件夹</b>（里面有 index.html 的那个）。'
      : '动作库里已经换成真人示范图了（两张交替闪 = 循环动画）。' +
        '没下到的会继续显示自带的小人动画。') +
    '<div style="margin-top:8px"><button class="btn ghost tiny" data-act="fitDlHelp">图片存在哪了？</button></div>' +
    '</div></div>';
  return '';
}

function exFetchJson(){
  var i = 0;
  function tryOne(){
    if (i >= EX_JSON_URLS.length){
      return Promise.reject(new Error('试了 ' + EX_JSON_URLS.length + ' 个图库镜像地址，都连不上' +
        '（国内访问国外开源图库经常被拦，这是网络环境的问题，不是工作台坏了）'));
    }
    var u = EX_JSON_URLS[i++];
    return fetchWithTimeout(u, 8000).then(function(r){
      exUsedMirror = EX_MIRRORS[i - 1];
      return r.json();
    }).catch(function(){ return tryOne(); });
  }
  return tryOne();
}

/* 把某个动作的两张图下下来，写进用户选的文件夹 */
function exFetchImage(rel, dirHandle){
  var i = 0;
  function tryOne(){
    if (i >= EX_IMG_BASES.length) return Promise.reject(new Error('图下不下来'));
    var u = EX_IMG_BASES[i++] + rel;
    return fetch(u).then(function(r){
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob();
    }).catch(function(){ return tryOne(); });
  }
  return tryOne().then(function(blob){
    return dirHandle.getFileHandle(rel.split('/').pop(), { create:true }).then(function(fh){
      return fh.createWritable();
    }).then(function(w){
      return w.write(blob).then(function(){ return w.close(); });
    });
  });
}

function fitDownloadImages(){
  if (!window.showDirectoryPicker){
    alert('这个浏览器不能用这个功能。\n\n用 Chrome 打开工作台再试（Edge 新版也行）。');
    return;
  }
  if (ui.fitDl && ui.fitDl.running) return;

  ui.fitDl = { running:true, step:'请在弹出的窗口里选中「我的工作台」文件夹（里面有 index.html 的那个）…', ok:0, fail:0, done:false };
  render();

  var rootDir = null, imgDir = null, actDir = null;
  window.showDirectoryPicker({ mode:'readwrite' }).then(function(d){
    rootDir = d;
    ui.fitDl.step = '正在取动作清单…'; render();
    return rootDir.getDirectoryHandle('images', { create:true });
  }).then(function(d){
    imgDir = d;
    return imgDir.getDirectoryHandle('动作', { create:true });
  }).then(function(d){
    actDir = d;
    ui.fitDl.step = '正在取动作清单（约 2MB）…'; render();
    return exFetchJson();
  }).then(function(json){
    var index = {};
    (json || []).forEach(function(e){ index[exNorm(e.name)] = e; });
    var plan = [];
    EX_WANT.forEach(function(pair){
      var id = pair[0], keys = pair[1].split(',');
      var hit = null;
      for (var i = 0; i < keys.length; i++){ if (index[exNorm(keys[i])]){ hit = index[exNorm(keys[i])]; break; } }
      if (!hit){
        for (var j = 0; j < keys.length && !hit; j++){
          var nk = exNorm(keys[j]);
          Object.keys(index).forEach(function(nm){ if (!hit && nm.indexOf(nk) >= 0) hit = index[nm]; });
        }
      }
      if (hit && hit.images && hit.images.length){
        plan.push({id:id, name:hit.name, imgs:hit.images.slice(0, 2)});
      } else {
        ui.fitDl.fail++;
      }
    });
    if (!plan.length) throw new Error('在动作清单里没找到能对上的动作');
    ui.fitDl.total = plan.length;
    /* 一条条来（太猛容易被限流） */
    var chain = Promise.resolve();
    plan.forEach(function(p, idx){
      chain = chain.then(function(){
        ui.fitDl.step = '正在下载 ' + (idx + 1) + ' / ' + plan.length + '：' + p.name + '…';
        render();
        return actDir.getDirectoryHandle(p.id, { create:true }).then(function(sub){
          var c = Promise.resolve();
          p.imgs.forEach(function(rel, k){
            c = c.then(function(){
              return exFetchImage(rel, sub).catch(function(){ /* 单张失败就算了 */ });
            });
          });
          return c.then(function(){
            /* 检查一下真的写进去了 */
            return sub.getFileHandle('0.jpg').then(function(){ ui.fitDl.ok++; }).catch(function(){ ui.fitDl.fail++; });
          });
        });
      });
    });
    return chain;
  }).then(function(){
    ui.fitDl.running = false;
    ui.fitDl.done = true;
    ui.fitDl.step = '下载完了';
    fitImgVer = Date.now();
    render();
    /* 试着读一张，确认存对地方了 */
    var probe = new Image();
    probe.onload = function(){
      ui.fitDl.verify = 'ok';
      render();
      toast('图片存对地方了，动作库里已经换成真人示范图 ✓');
    };
    probe.onerror = function(){
      ui.fitDl.verify = 'bad';
      render();
      toast('图片下下来了，但好像没存到工作台文件夹里 —— 点「看看问题」');
    };
    probe.src = 'images/动作/pushup/0.jpg?v=' + fitImgVer;
  }).catch(function(e){
    if (ui.fitDl) { ui.fitDl.running = false; ui.fitDl.err = e && e.message ? e.message : String(e); }
    render();
    if (ui.fitDl && /abort/i.test(String(ui.fitDl.err))) toast('你取消了，没下载');
    else if (ui.fitDl && ui.fitDl.err) toast('没下成：' + ui.fitDl.err);
  });
}

/* 第 1 张图到了就先静态显示；第 2 张也到了，两张交替闪 = 循环动画 */
function exImgOk(img){
  var box = img.parentNode;
  if (img.classList.contains('eximg2')){
    var first = box.querySelector('.eximg');
    if (first){ first.classList.remove('solo'); first.classList.add('flipA'); }
    img.classList.add('flipB');
  } else {
    img.classList.add('solo');
  }
}

function renderFitnessPage(){
  var recs = bodySorted();
  var last = bodyLast();
  var h = '';

  /* --- 身体数据 --- */
  h += '<div class="card glass">' +
      '<div class="card-hd"><div class="t">身体数据</div>' +
        '<div class="r">共 ' + recs.length + ' 次' + (last ? ' · 最近 ' + esc(last.date) : '') + '</div></div>' +
      fitChartHtml() +
      '<div class="toolbar" style="margin-top:12px">' +
        '<button class="btn primary" data-act="fitOpenToggle">' + (ui.fitOpen ? '收起记录框' : '+ 记一次') + '</button>' +
        '<span style="font-size:12px;color:var(--ink-3)">同一天记两次会覆盖，不会重复。</span>' +
      '</div>' +
      (ui.fitOpen
        ? '<div class="writepad">' +
            '<div class="wrow">' +
              '<input type="date" class="inp" id="bdDate" style="width:150px" ' +
                'value="' + esc(ui.bodyEditId ? '' : todayStr()) + '">' +
              '<input class="inp" id="bdWeight" style="flex:1 1 88px" placeholder="体重 kg">' +
              '<input class="inp" id="bdFat" style="flex:1 1 88px" placeholder="体脂 %">' +
              '<input class="inp" id="bdWaist" style="flex:1 1 88px" placeholder="腰围 cm">' +
              '<input class="inp" id="bdChest" style="flex:1 1 88px" placeholder="胸围 cm">' +
            '</div>' +
            '<div class="wrow">' +
              '<input class="inp grow" id="bdNote" placeholder="备注（可不写，比如：早上空腹、昨晚没睡好）">' +
              '<button class="btn primary" data-act="bodySave">保存</button>' +
              (ui.bodyEditId ? '<button class="btn ghost" data-act="bodyCancelEdit">取消编辑</button>' : '') +
            '</div></div>'
        : '') +
      (recs.length
        ? '<div style="margin-top:10px">' + recs.slice(0, 12).map(function(r){
            var parts = [];
            if (isNum(r.weight))  parts.push('体重 <b>' + esc(r.weight) + '</b> kg');
            if (isNum(r.bodyFat)) parts.push('体脂 <b>' + esc(r.bodyFat) + '</b>%');
            if (isNum(r.waist))   parts.push('腰围 <b>' + esc(r.waist) + '</b> cm');
            if (isNum(r.chest))   parts.push('胸围 <b>' + esc(r.chest) + '</b> cm');
            return '<div class="bdrow">' +
                '<span class="bdd">' + esc(r.date) + '</span>' +
                '<span class="bdv">' + parts.join('　') +
                  (r.note ? '<span class="bdn">' + esc(r.note) + '</span>' : '') + '</span>' +
                '<span class="bdops">' +
                  '<button class="btn ghost tiny" data-act="bodyEdit" data-id="' + r.id + '">改</button>' +
                  '<button class="btn ghost tiny danger" data-act="bodyDel" data-id="' + r.id + '">删</button>' +
                '</span></div>';
          }).join('') + '</div>' +
          (recs.length > 12 ? '<div class="hintline">上面只列最近 12 次，曲线里画的是最近 30 次。</div>' : '')
        : '<div class="empty" style="padding:20px 10px">还没有记录。点「+ 记一次」，记两次以上就能看到曲线了。</div>') +
      '<div class="hintline">量体重建议固定时间（比如早上上完厕所、空腹），曲线才有可比性。</div>' +
    '</div>';

  /* --- 动作库 --- */
  var part = ui.fitPart || '全部';
  var list = EX.filter(function(e){ return part === '全部' || e.part === part; });
  var chips = ['全部'].concat(FIT_PARTS).map(function(p){
    var n = (p === '全部') ? EX.length : EX.filter(function(e){ return e.part === p; }).length;
    return '<button class="chip' + (p === part ? ' on' : '') + '" data-act="fitPart" data-v="' + esc(p) + '">' +
             esc(p) + '<span class="c">' + n + '</span></button>';
  }).join('');
  h += '<div class="card glass">' +
      '<div class="card-hd"><div class="t">动作库</div>' +
        '<div class="r">每个动作都有循环小动画，右边可以跳去抖音看讲解</div></div>' +
      '<div class="toolbar" style="margin-bottom:10px">' +
        '<span style="font-size:12.5px;color:var(--ink-2)">讲解人：<b>' + esc(fitCoach().name || '（没设）') + '</b></span>' +
        '<button class="btn ghost sm" data-act="coachName">改讲解人</button>' +
        (fitCoach().home
          ? '<a class="btn ghost sm" target="_blank" rel="noreferrer" href="' + esc(fitCoach().home) + '">去他的抖音主页</a>' +
            '<button class="btn ghost sm" data-act="coachHome" data-v="clear">清掉主页链接</button>'
          : '<button class="btn ghost sm" data-act="coachHome">填他的抖音主页链接</button>') +
        '<span style="font-size:11.5px;color:var(--ink-3)">点动作右边的「看讲解」＝去抖音搜「讲解人 + 动作名」</span>' +
      '</div>' +
      '<div class="toolbar" style="margin-bottom:10px">' +
        '<span style="font-size:11.5px;color:var(--ink-3)">' +
          '真人示范图<b>直接从开源图库（免费、公有领域）显示</b>，不用下载。' +
          '有 ' + (typeof EX_IMG_PATHS !== 'undefined' ? Object.keys(EX_IMG_PATHS).length : 0) +
          ' 个动作有真人图；图库没有的那几个、或者连不上网时，显示我画的小人动画。</span>' +
      '</div>' +
      '<div class="chips">' + chips + '</div>' +
      '<div class="exgrid">' + list.map(exCardHtml).join('') + '</div>' +
      '<div class="hintline">要点写的是「怎么做不容易受伤」，练之前扫一眼。' +
        '组数次数只是参考：还有余力就加一点，做不动就减。</div>' +
    '</div>';
  return h;
}

/* =========================================================================
   AI 助手：接入 DeepSeek（或任何兼容 OpenAI 格式的服务）
   ========================================================================= */
var AI_DEFAULT = { base:'https://api.deepseek.com', model:'deepseek-chat', vision:'', key:'' };
var aiTest = null;        // 自检结果
var aiImgTarget = null;   // AI 读图的结果要塞到哪个粘贴框

function aiCfg(){
  if (!db.meta.ai || typeof db.meta.ai !== 'object') db.meta.ai = {};
  var a = db.meta.ai;
  if (!a.base) a.base = AI_DEFAULT.base;
  if (!a.model) a.model = AI_DEFAULT.model;
  if (typeof a.vision !== 'string') a.vision = '';
  if (typeof a.key !== 'string') a.key = '';
  return a;
}
function aiReady(){ var a = aiCfg(); return !!(a.base && a.model && a.key); }
function aiApi(path){ return String(aiCfg().base || '').replace(/\/+$/, '') + path; }

/* 浏览器拦跨域时抛的是一句英文的 Failed to fetch，这里翻译成人话 */
function aiFriendlyError(e){
  if (e && (e.name === 'TypeError' || /failed to fetch|networkerror|load failed|fetch failed/i.test(String(e.message)))){
    return new Error('连不上这个接口。两种可能：① 网络不通；② 浏览器把这个网站的跨域请求拦住了（CORS）。' +
                     '如果是第②种，把这句话发我，我给你换个走法。');
  }
  return e;
}

/* 发一条对话请求（兼容 OpenAI 的 /chat/completions） */
function aiChat(messages, opts){
  opts = opts || {};
  var a = aiCfg();
  if (!a.key) return Promise.reject(new Error('还没填密钥'));
  var body = { model:(opts.model || a.model), messages:messages,
               temperature:(opts.temperature === undefined ? 0.2 : opts.temperature) };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  return fetch(aiApi('/chat/completions'), {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + a.key },
    body: JSON.stringify(body)
  }).then(function(res){
    return res.text().then(function(t){
      if (!res.ok) throw new Error('接口返回 ' + res.status + '：' + String(t).slice(0, 200));
      var j;
      try { j = JSON.parse(t); } catch(e){ throw new Error('返回的内容看不懂：' + String(t).slice(0, 150)); }
      var m = j.choices && j.choices[0] && j.choices[0].message;
      if (!m) throw new Error('没拿到回答：' + String(t).slice(0, 150));
      return { text:String(m.content || ''), usage:j.usage || null };
    });
  }).catch(function(e){
    throw aiFriendlyError(e);
  });
}

function aiListModels(){
  var a = aiCfg();
  return fetch(aiApi('/models'), { headers:{ 'Authorization':'Bearer ' + a.key } })
    .then(function(r){
      return r.text().then(function(t){
        if (!r.ok) throw new Error('取模型列表失败 ' + r.status + '：' + String(t).slice(0, 150));
        var j = JSON.parse(t);
        return (j.data || []).map(function(x){ return x.id; });
      });
    })
    .catch(function(e){ throw aiFriendlyError(e); });
}

/* 画一张带中文的测试图，用来验证"这个接口到底能不能看图" */
function aiTestImage(){
  var c = document.createElement('canvas');
  c.width = 560; c.height = 160;
  var g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#111111';
  g.font = '36px "Microsoft YaHei","PingFang SC",sans-serif';
  g.fillText('语文作业：抄写生字三遍', 26, 66);
  g.font = '27px "Microsoft YaHei","PingFang SC",sans-serif';
  g.fillText('数学：练习册 P32 第1-5题', 26, 120);
  return c.toDataURL('image/jpeg', 0.92);
}

function aiSelfTest(){
  aiTest = { running:true, done:false, canSee:null, steps:[] };
  var a = aiCfg();
  function push(name, state, msg){ aiTest.steps.push({name:name, state:state, msg:msg}); render(); }
  function setLast(state, msg){
    var s = aiTest.steps[aiTest.steps.length - 1];
    if (s){ s.state = state; s.msg = msg; }
    render();
  }
  function finish(){ aiTest.running = false; aiTest.done = true; render(); }

  push('① 配置检查', 'wait', '正在检查…');
  var bad = [];
  if (!a.key) bad.push('还没填密钥');
  if (!a.base) bad.push('还没填接口地址');
  if (!a.model) bad.push('还没填模型名');
  if (bad.length){ setLast('bad', bad.join('、')); finish(); return; }
  setLast('ok', '接口 ' + a.base + ' · 模型 ' + a.model + ' · 密钥 ' +
                String(a.key).slice(0, 6) + '…（共 ' + String(a.key).length + ' 位）');

  push('② 能不能连上、密钥对不对', 'wait', '正在请求模型列表…');
  aiListModels().then(function(list){
    setLast('ok', '连上了，密钥可以用。这个账号能用 ' + list.length + ' 个模型' +
                  (list.length ? '：' + list.slice(0, 6).join('、') + (list.length > 6 ? ' …' : '') : ''));
    push('③ 纯文字对话', 'wait', '正在让它回一句话…');
    return aiChat([{ role:'user', content:'请只回复两个字：收到' }], { maxTokens:20, temperature:0 });
  }).then(function(r){
    setLast('ok', '能对话，它回的是「' + String(r.text).trim().slice(0, 20) + '」' +
                  (r.usage ? '（这次用了 ' + r.usage.total_tokens + ' tokens）' : ''));
    push('④ 能不能看图（这一步最关键）', 'wait', '正在画一张带中文的测试图发给它…');
    return aiChat([{ role:'user', content:[
      { type:'text', text:'这张图里有汉字，请原样照抄出来，不要任何解释。' },
      { type:'image_url', image_url:{ url: aiTestImage() } }
    ]}], { maxTokens:60, temperature:0 });
  }).then(function(r){
    var t = String(r.text);
    if (/作业|抄写|生字|语文|数学|练习册/.test(t)){
      aiTest.canSee = true;
      setLast('ok', '它认出来了：「' + t.trim().slice(0, 40) + '」→ 这个接口支持看图，手写图片也能直接读。');
    } else {
      aiTest.canSee = false;
      setLast('bad', '它回的是「' + t.trim().slice(0, 60) + '」—— 这不是图里的字，说明这个模型看不了图片。');
    }
    finish();
  }).catch(function(e){
    if (aiTest.steps.length && aiTest.steps[aiTest.steps.length - 1].state === 'wait'){
      setLast('bad', e.message);
    } else {
      push('出错了', 'bad', e.message);
    }
    finish();
  });
}

function aiTestHtml(){
  if (!aiTest) return '';
  var h = '<div class="card glass" style="margin-top:14px">' +
      '<div class="card-hd"><div class="t">自检结果</div><div class="r">' +
        (aiTest.running ? '正在检测…' : '检测完了') + '</div></div>';
  aiTest.steps.forEach(function(s){
    var ic  = s.state === 'ok' ? '✓' : (s.state === 'bad' ? '✗' : '…');
    var cls = s.state === 'ok' ? 'ok' : (s.state === 'bad' ? 'bad' : 'wait');
    h += '<div class="aistat ' + cls + '"><b style="flex:0 0 auto">' + ic + '</b>' +
         '<div><b>' + esc(s.name) + '</b><br>' + esc(s.msg) + '</div></div>';
  });
  if (aiTest.done){
    if (aiTest.canSee === true){
      h += '<div class="aistat ok"><b>✓</b><div><b>结论：可以放心用 AI 读图</b><br>' +
           '以后去「孩子作业」「自选股」「待取快递」的粘贴框，点「AI 读图」就行，手写拍照也能认。</div></div>';
    } else if (aiTest.canSee === false){
      h += '<div class="aistat bad"><b>✗</b><div><b>结论：这个模型看不了图</b><br>' +
           '两个办法：① 换一个支持看图的模型（改上面的「模型名」，或者把「接口地址」换成支持看图的服务）；' +
           '② 图片识别继续用桌面上的「识别图片文字」小工具（印刷体很好用，手写不行）。<br>' +
           '<b>但好消息是</b>：AI 的文字能力不受影响，以后做「股票分析」照样能用。</div></div>';
    } else {
      h += '<div class="aistat bad"><b>!</b><div><b>检测没走完</b><br>' +
           '把上面的红字看清楚，改完再点一次「一键自检」。实在连不上就把这段截图发我。</div></div>';
    }
  }
  return h + '</div>';
}

function renderAiPage(){
  var a = aiCfg();
  return '<div class="card glass">' +
      '<div class="card-hd"><div class="t">AI 助手</div><div class="r">' +
        (aiReady() ? '已填好配置' : '还没配置') + '</div></div>' +
      '<div class="privacy">' +
        '<b>先看这段（重要）：</b>密钥只保存在<b>你这台电脑的浏览器里</b>，不会上传到别的地方。' +
        '但它是<b>明文</b>存的，所以两点务必记住：<br>' +
        '① 建议去服务商后台建一个<b>专用密钥</b>，并设一个<b>消费上限</b>（万一泄漏也只损失那点额度）；<br>' +
        '② 「导出备份」时我会<b>自动把密钥剔掉</b>，但你转发备份文件前也自己确认一下。' +
      '</div>' +
      '<div class="aiform">' +
        '<div class="airow"><label>接口地址</label>' +
          '<input class="inp" id="aiBase" value="' + esc(a.base) + '" placeholder="https://api.deepseek.com"></div>' +
        '<div class="airow"><label>模型名</label>' +
          '<input class="inp" id="aiModel" value="' + esc(a.model) + '" placeholder="deepseek-chat"></div>' +
        '<div class="airow"><label>识图专用模型</label>' +
          '<input class="inp" id="aiVision" value="' + esc(a.vision) + '" ' +
            'placeholder="留空＝用上面那个。手写照片读不准就填 deepseek-v4-pro"></div>' +
        '<div class="airow"><label>密钥</label>' +
          '<input class="inp" id="aiKey" type="password" value="' + esc(a.key) + '" placeholder="sk-……"></div>' +
        '<div class="airow"><label></label>' +
          '<button class="btn primary" data-act="aiSave">保存</button>' +
          '<button class="btn" data-act="aiTest">一键自检（先点这个）</button>' +
          '<button class="btn ghost" data-act="aiHelp">去哪拿密钥？</button>' +
          '<button class="btn ghost" data-act="aiClear">清掉密钥</button>' +
        '</div>' +
      '</div>' +
      aiTestHtml() +
      '<div class="hintline" style="margin-top:16px">' +
        '<b>手写照片读得不够准？</b>把「识图专用模型」填上更聪明的那一个（你账号里有 ' +
        '<code>deepseek-v4-pro</code>），再试一次同一张图。认字这种细活，模型强一点差别很明显，' +
        '一张图也就贵一两分钱。<br>' +
        '<b>填好之后能干什么：</b><br>' +
        '· <b>AI 读图</b>：在「孩子作业」「自选股」「待取快递」的粘贴框旁边点一下，选张截图或照片，' +
        '它把里面的文字抄出来、直接填进框里（手写拍照也行 —— 前提是自检第④步是绿的）。<br>' +
        '· <b>以后的股票分析</b>：把某支股票的行情和新闻喂给它，让它写一段分析。这个用的是文字能力，' +
        '跟看不看图没关系。<br>' +
        '<b>花钱吗：</b>读一张图大约消耗 2000-4000 tokens，按 DeepSeek 的价格大约几分钱一次；' +
        '写一段股票分析大约一分钱以内。具体以服务商官网为准。' +
      '</div>' +
    '</div>';
}

/* 图片先缩小再发，省流量也省钱 */
function resizeImage(file, maxSide, quality){
  return new Promise(function(resolve, reject){
    var fr = new FileReader();
    fr.onload = function(){
      var img = new Image();
      img.onload = function(){
        var w = img.width, h = img.height;
        var s = Math.min(1, maxSide / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * s));
        c.height = Math.max(1, Math.round(h * s));
        var g = c.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        try { resolve(c.toDataURL('image/jpeg', quality || 0.85)); }
        catch(e){ reject(new Error('图片处理失败：' + e.message)); }
      };
      img.onerror = function(){ reject(new Error('这张图打不开，换个格式再试')); };
      img.src = fr.result;
    };
    fr.onerror = function(){ reject(new Error('读文件失败')); };
    fr.readAsDataURL(file);
  });
}

/* =========================================================================
   股票分析：把行情 + K线 + 相关快讯交给 AI，让它写一段研判
   ========================================================================= */
function aiStockPanelHtml(){
  var s = ui.aiStock;
  if (!s) return '';
  var head = '<div class="card-hd"><div class="t">AI 分析 · ' + esc(s.name || '') +
             (s.code ? '（' + esc(s.code) + '）' : '') + '</div>' +
             '<div class="r">' +
               (s.state === 'loading' ? '<span class="dot warn"></span>进行中' :
                s.state === 'fail' ? '没成功' : '写完了') + '</div></div>';
  var body;
  if (s.state === 'loading'){
    body = '<div class="aistat wait"><b>…</b><div>' + esc(s.step || '正在准备…') + '</div></div>';
  } else if (s.state === 'fail'){
    body = '<div class="aistat bad"><b>✗</b><div>' + esc(s.err || '出错了') + '</div></div>' +
           '<div class="wrow" style="margin-top:10px">' +
             '<button class="btn ghost sm" data-act="aiStockRetry">再试一次</button>' +
             '<button class="btn ghost sm" data-act="aiStockClose">关掉</button></div>';
  } else {
    body = '<div class="aitext">' + esc(s.text).replace(/\n/g, '<br>') + '</div>' +
           (s.note ? '<div class="hintline">' + esc(s.note) + '</div>' : '') +
           '<div class="wrow" style="margin-top:12px">' +
             '<button class="btn primary sm" data-act="aiStockSave">存进复盘笔记</button>' +
             '<button class="btn ghost sm" data-act="aiStockCopy">复制这段</button>' +
             '<button class="btn ghost sm" data-act="aiStockRetry">重新分析</button>' +
             '<button class="btn ghost sm" data-act="aiStockClose">关掉</button>' +
           '</div>';
  }
  return '<div class="card glass">' + head + body +
      '<div class="hintline">这是 AI 按你看到的这些公开数据写的参考，<b>不是投资建议</b>。' +
      '数据里没有的事（比如公司内幕、明天的消息）它不知道，我也不会让它编。</div></div>';
}

/* 把数据整理成给 AI 的文字 */
function aiStockPrompt(d){
  var q = d.q, k = d.klines;
  var closes = k.map(function(x){ return x.close; });
  var last = closes[closes.length - 1];
  var ma5  = closes.slice(-5).reduce(function(a, b){ return a + b; }, 0) / Math.min(5, closes.length);
  var ma20 = closes.slice(-20).reduce(function(a, b){ return a + b; }, 0) / Math.min(20, closes.length);
  var hi = Math.max.apply(null, k.map(function(x){ return x.high; }));
  var lo = Math.min.apply(null, k.map(function(x){ return x.low; }));
  var vols = k.map(function(x){ return x.vol; });
  var v5 = vols.slice(-6, -1).reduce(function(a, b){ return a + b; }, 0) / Math.max(1, Math.min(5, vols.length - 1));
  var todayVol = vols[vols.length - 1];
  var upDays = 0;
  for (var i = 1; i < k.length; i++){ if (k[i].close >= k[i-1].close) upDays++; }
  var pct5 = ((last / closes[Math.max(0, closes.length - 6)] - 1) * 100).toFixed(1);
  var pct20 = ((last / closes[Math.max(0, closes.length - 21)] - 1) * 100).toFixed(1);

  function nz(v, unit, digits){
    if (!isNum(v)) return '（没取到）';
    return fmtNum(v, digits === undefined ? 2 : digits) + (unit || '');
  }
  var lines = [];
  lines.push('【基本行情】');
  lines.push('名称：' + q.name + '（' + d.code + '）');
  lines.push('现价：' + nz(q.val) + '　涨跌幅：' + nz(q.pct, '%') + '　涨跌额：' + nz(q.amt));
  lines.push('今日：开 ' + nz(q.open) + ' 最高 ' + nz(q.high) + ' 最低 ' + nz(q.low) + ' 昨收 ' + nz(q.prev));
  lines.push('成交量：' + nz(q.vol, ' 手', 0) + '　成交额：' + nz(q.amount ? q.amount / 100000000 : '', ' 亿元', 2));
  lines.push('换手率：' + nz(q.turnover, '%') + '　量比：' + nz(q.volRatio));
  lines.push('市盈率(动)：' + nz(q.pe) + '　市净率：' + nz(q.pb));
  lines.push('总市值：' + nz(q.mktCap ? q.mktCap / 100000000 : '', ' 亿元', 0));
  lines.push('');
  lines.push('【我替你算好的几个数】');
  lines.push('5 日均线：' + nz(ma5) + '（现价在均线' + (last >= ma5 ? '上方' : '下方') + '）');
  lines.push('20 日均线：' + nz(ma20) + '（现价在均线' + (last >= ma20 ? '上方' : '下方') + '）');
  lines.push('近 5 个交易日涨跌：' + pct5 + '%　近 20 个交易日涨跌：' + pct20 + '%');
  lines.push('区间最高 ' + nz(hi) + '　区间最低 ' + nz(lo));
  lines.push('今天成交量是前 5 天平均的 ' + (v5 ? (todayVol / v5).toFixed(2) : '?') + ' 倍');
  lines.push('区间里上涨的天数：' + upDays + ' / ' + (k.length - 1));
  lines.push('');
  lines.push('【最近 ' + k.length + ' 个交易日日K】（日期 开 收 高 低 成交量(手)）');
  k.forEach(function(x){
    lines.push(x.date + ' ' + x.open + ' ' + x.close + ' ' + x.high + ' ' + x.low + ' ' + x.vol);
  });
  if (d.news && d.news.length){
    lines.push('');
    lines.push('【相关快讯】（从财经快讯里挑出提到这支股票的，可能有噪音，仅供参考）');
    d.news.slice(0, 5).forEach(function(n){ lines.push('- ' + n.time + ' ' + n.text.slice(0, 120)); });
  } else {
    lines.push('');
    lines.push('【相关快讯】暂时没抓到提到这支股票的快讯。');
  }
  return lines.join('\n');
}

function aiStockRun(secid, code, name){
  if (!aiReady()){
    alert('还没配置 AI。\n\n先去左边「AI 助手」页面把密钥填上、点一次「一键自检」，再回来分析。');
    ui.page = 'ai'; render();
    return;
  }
  ui.aiStock = { secid:secid, code:code, name:name, state:'loading', step:'正在取行情和K线…' };
  render();

  var got = {};
  fetchQuotes([secid]).then(function(r){
    var q = r.map[secid];
    if (!q) throw new Error('没取到这支股票的行情');
    got.q = q;
    ui.aiStock.step = '正在取最近 30 个交易日的K线…'; render();
    return fetchKline(secid, 30);
  }).then(function(k){
    got.klines = k;
    ui.aiStock.step = '正在找提到这支股票的快讯…'; render();
    if (NEWS.list.length && Date.now() - NEWS.at < 300000) return NEWS.list;
    return fetchNews().then(function(){ return NEWS.list; }).catch(function(){ return []; });
  }).then(function(news){
    var nm = (got.q && got.q.name) || name;
    got.news = (news || []).filter(function(x){
      return String(x.text).indexOf(nm) >= 0 || (code && String(x.text).indexOf(code) >= 0);
    });
    ui.aiStock.step = 'AI 正在读数据、写研判（一般 10-30 秒）…'; render();
    var prompt =
      '你是一个严谨的 A 股复盘助手。下面是东方财富的公开数据，请据此写一份简明研判。\n\n' +
      '硬要求：\n' +
      '1. 只根据我给你的数据说话。数据里没有的事不要编（比如不要编"公司新签订单""机构调研"这类你不知道的信息）。\n' +
      '2. 分四段写，每段用一个小标题：\n' +
      '   【现在什么状态】【技术上要注意什么】【有哪些风险】【一句话总结】\n' +
      '3. 用大白话。必须用术语时，用括号解释一下（比如"均线（一段时间里的平均价）"）。\n' +
      '4. 不要给"买入/卖出/加仓"这种明确指令，改成"如果要关注，可以看哪几点"。\n' +
      '5. 全文 400 字以内，别啰嗦。\n\n' +
      '====== 数据开始 ======\n' + aiStockPrompt(got) + '\n====== 数据结束 ======';
    return aiChat([{ role:'user', content:prompt }], { maxTokens:1200, temperature:0.4 });
  }).then(function(r){
    var nm = (got.q && got.q.name) || name;
    ui.aiStock = {
      secid:secid, code:code, name:nm, state:'done',
      text: String(r.text || '').trim(),
      note: '用的是：现价/今开最高最低/成交量额/换手率/量比/市盈率/市净率/总市值 + 最近 30 个交易日日K + ' +
            got.news.length + ' 条相关快讯' + (r.usage ? '；这次消耗 ' + r.usage.total_tokens + ' tokens' : '')
    };
    save();
    render();
    var m = document.querySelector('.main');
    if (m) m.scrollTop = 0;
  }).catch(function(e){
    ui.aiStock = { secid:secid, code:code, name:name, state:'fail', err:e.message };
    render();
  });
}

function aiReadPick(target){
  if (!aiReady()){
    alert('还没配置 AI。\n\n先去左边「AI 助手」页面，把接口地址、模型名、密钥填上，再点「一键自检」。\n填一次就行，以后一直用。');
    ui.page = 'ai';
    render();
    return;
  }
  aiImgTarget = target;
  var el = $('aiImg');
  if (el){ el.value = ''; el.click(); }
}

function aiReadRun(file){
  if (!file) return;
  var target = aiImgTarget;
  var isHw = (target === 'hw');
  var pick = isHw ? '确认添加' : (target === 'watch' ? '开始辨认' : '自动辨认');
  toast('正在处理图片…', true);
  resizeImage(file, 1800, 0.88).then(function(dataUrl){
    toast('AI 正在读这张图，大概 10-30 秒，别关页面…', true);
    return aiChat([{ role:'user', content:[
      { type:'text', text: isHw ? HW_AI_IMAGE_PROMPT :
          '把这张图片里的文字一字不漏地抄出来。要求：\n' +
          '1. 只输出文字本身，不要任何解释、不要用代码块包起来\n' +
          '2. 按图上原本的换行换行\n' +
          '3. 先在心里一行一行看清楚，再动手写；**不要**凭上下文猜成"通顺但错误"的词\n' +
          '4. 这张图可能是用手机拍的照片（黑板、白板、作业本、课本、电脑或手机屏幕），' +
            '可能有反光、歪斜、模糊、手写潦草 —— 请尽力辨认\n' +
          '5. 某个字实在认不准，就用「□」代替这一个字；整行都看不清，就写「（这一行看不清）」\n' +
          '6. 如果是作业，保留原来的编号（1、2、（1））和科目名（语文、数学、英语…）\n' +
          '7. 图片边缘被裁掉、看不清的部分就跳过' },
      { type:'image_url', image_url:{ url: dataUrl } }
    ]}], { maxTokens:2500, temperature:0, model:(aiCfg().vision || '') });
  }).then(function(r){
    /* 作业：让 AI 直接把"真正的作业"挑出来，不再只丢一段文字 */
    if (isHw){
      var arr = parseHwJson(r.text);
      if (arr && arr.length){
        hwDraft = arr;
        hwPaste = false;
        render();
        toast('AI 从图里挑出 ' + arr.length + ' 条作业，核对一下再确认');
        return;
      }
      /* 挑不出来（AI 没按格式回）→ 退回老做法：把文字填进粘贴框 */
      var raw = String(r.text || '').replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
      var box = $('hwRaw');
      if (box && raw){
        box.value = raw;
        toast('AI 没按清单格式回答，我把文字填进框里了 —— 你点「识别作业」或手动改');
        return;
      }
      toast('AI 说这张图里没有找到作业');
      return;
    }
    var txt = String(r.text || '').replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
    if (!txt){ toast('AI 说这张图里没有文字'); return; }
    var ta = (target === 'hw') ? $('hwRaw') : (target === 'watch' ? $('wTextRaw') : $('pcRaw'));
    if (!ta){ toast('粘贴框没打开 —— 先把面板展开，再点一次「AI 读图」'); return; }
    ta.value = ta.value ? (String(ta.value).replace(/\s+$/, '') + '\n' + txt) : txt;
    toast('读好了，文字已经填进粘贴框 → 下一步点「' + pick + '」');
  }).catch(function(e){
    toast('没读成：' + e.message);
  });
}

/* =========================================================================
   待取快递：粘贴短信或物流信息 → 自动摘出取件码、单号、地点
   ========================================================================= */
var PARCEL_COMPANY = ['顺丰','中通','圆通','申通','韵达','京东','邮政EMS','EMS','邮政','极兔',
                      '德邦','菜鸟','丹鸟','天天','优速','丰网','宅急送'];
var PARCEL_KW = /([\u4e00-\u9fa5A-Za-z0-9]{0,12}(?:菜鸟驿站|丰巢智能柜|快递驿站|快递超市|智能柜|快递柜|代收点|丰巢|驿站|门卫|前台|物业|便利店|超市))/;
var PARCEL_VERB = /^(已到|已放|已送|放在|放到|请到|请至|到|在|去|至|由)/;
/* 地点前面常带一串废话（"您的顺丰快递已存入"），从最后一个动词后面开始截 */
var PC_VERB = /(?:到达|已到|已放|放在|放到|放至|存入|送至|送到|投递至|投递到|投递|到|放|在|去|至)/g;

function pcTrimStation(s){
  s = String(s || '');
  var last = -1, m;
  PC_VERB.lastIndex = 0;
  while ((m = PC_VERB.exec(s)) !== null){ last = m.index + m[0].length; }
  if (last > 0 && last < s.length) s = s.slice(last);
  return s.replace(/^[的了吗呢，,、]+/, '').replace(/[，,。;；]+$/, '').trim();
}

/* 把所有可能的地点都找出来，挑信息量最大的那个 */
function pcFindStation(flat){
  var re = new RegExp(PARCEL_KW.source, 'g'), m, best = '';
  while ((m = re.exec(flat)) !== null){
    var c = pcTrimStation(m[1]);
    if (c.length > best.length && c.length <= 20) best = c;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return best;
}

function parcelParse(raw){
  var s = String(raw || '');
  var flat = s.replace(/\s+/g, ' ').trim();
  var r = {code:'', company:'', no:'', station:'', phone:'', when:'', raw:s};
  var m;

  /* 取件码 */
  m = flat.match(/(?:取件码|取货码|提货码|取件号|件码)[:：]?\s*([A-Za-z0-9\-]{3,16})/);
  if (m) r.code = m[1];
  if (!r.code){
    m = flat.match(/凭\s*([A-Za-z0-9\-]{4,16})\s*(?:到|取)/);
    if (m) r.code = m[1];
  }
  if (!r.code){
    /* 「取件码：A12-345」有时写成「取件 A12-345」 */
    m = flat.match(/取件[:：]?\s*([A-Za-z0-9\-]{3,16})/);
    if (m) r.code = m[1];
  }

  /* 快递公司 */
  for (var i = 0; i < PARCEL_COMPANY.length; i++){
    if (flat.indexOf(PARCEL_COMPANY[i]) >= 0){ r.company = PARCEL_COMPANY[i]; break; }
  }

  /* 单号 */
  m = flat.match(/(?:运单号|快递单号|单号)[:：]?\s*([A-Za-z0-9]{8,24})/);
  if (m) r.no = m[1];
  if (!r.no){
    m = flat.match(/\b(?:SF|YT|ZTO|STO|JD|EMS|DPK|JT|DBL|FWS)[A-Za-z0-9]{8,20}\b/i);
    if (m) r.no = m[0];
  }
  if (!r.no){
    m = flat.match(/\b\d{12,20}\b/);
    if (m) r.no = m[0];
  }

  /* 放哪儿了 */
  r.station = pcFindStation(flat);
  if (!r.station){
    m = flat.match(/(?:放在|送到|已放|已到|在)([\u4e00-\u9fa5A-Za-z0-9]{2,20})/);
    if (m) r.station = m[1];
  }

  /* 电话 / 取件时间提醒 */
  m = flat.match(/1[3-9]\d{9}/);
  if (m) r.phone = m[0];
  m = flat.match(/(请?\s*\d{1,2}\s*[:：点]\s*\d{0,2}\s*前?\s*取[件货])/);
  if (m) r.when = m[1].replace(/\s+/g, '');

  return r;
}

var pcDraft = null, pcPaste = false;

function pcDraftHtml(){
  if (!pcDraft) return '';
  function f(id, label, val, ph){
    return '<div class="drow"><span style="flex:0 0 76px;font-size:12.5px;color:var(--ink-3)">' + label + '</span>' +
           '<input class="inp" type="text" id="' + id + '" value="' + esc(val || '') + '" placeholder="' + esc(ph || '') + '">' +
           '</div>';
  }
  var conf = !!(pcDraft.code || pcDraft.no || pcDraft.station);
  return '<div class="draft" id="pcDraft">' +
      '<div style="font-size:13px;font-weight:500;margin-bottom:10px">' +
        (conf ? '摘出来这些，核对一下（可以直接改）：' : '没能自动认出取件码，手动填一下吧：') + '</div>' +
      f('pcCode', '取件码', pcDraft.code, '例如 8-2-1234') +
      f('pcCompany', '快递公司', pcDraft.company, '例如 中通') +
      f('pcStation', '放哪儿了', pcDraft.station, '例如 菜鸟驿站（小区门口）') +
      f('pcNo', '单号', pcDraft.no, '一般不填也行') +
      f('pcPhone', '电话', pcDraft.phone, '') +
      '<div class="wrow" style="margin-top:10px">' +
        '<button class="btn primary" data-act="pcConfirm">加入待取清单</button>' +
        '<button class="btn ghost" data-act="pcCancel">取消</button>' +
      '</div></div>';
}

function renderParcelPage(){
  var open = db.parcels.filter(function(p){ return !p.taken; })
                      .sort(function(a, b){ return (b.createdAt || 0) - (a.createdAt || 0); });
  var got  = db.parcels.filter(function(p){ return p.taken; })
                      .sort(function(a, b){ return (b.takenAt || 0) - (a.takenAt || 0); });

  function card(p, done){
    return '<div class="pcard' + (done ? ' done' : '') + '">' +
        '<div class="prow">' +
          '<div style="flex:1;min-width:0">' +
            '<div class="pcode">' + esc(p.code || '（没填取件码）') + '</div>' +
            '<div class="pmeta">' +
              (p.company ? '<span class="pill cat">' + esc(p.company) + '</span>' : '') +
              (p.station ? '<span>' + esc(p.station) + '</span>' : '') +
              (p.when ? '<span class="pill today">' + esc(p.when) + '</span>' : '') +
            '</div>' +
            (p.no ? '<div class="psmall">单号 ' + esc(p.no) + '</div>' : '') +
            (p.phone ? '<div class="psmall">电话 ' + esc(p.phone) + '</div>' : '') +
          '</div>' +
          '<div class="pops">' +
            (done ? '<button class="btn ghost tiny" data-act="pcUntake" data-id="' + p.id + '">还没取</button>'
                  : '<button class="btn primary tiny" data-act="pcTake" data-id="' + p.id + '">已取走</button>') +
            '<button class="btn ghost tiny" data-act="pcCopy" data-id="' + p.id + '">复制取件码</button>' +
            '<button class="btn ghost tiny" data-act="pcEdit" data-id="' + p.id + '">改</button>' +
            '<button class="btn ghost tiny danger" data-act="pcDel" data-id="' + p.id + '">删除</button>' +
          '</div>' +
        '</div>' +
        (p.raw ? '<details class="praw"><summary>看原文</summary><div>' + esc(p.raw) + '</div></details>' : '') +
      '</div>';
  }

  return '<div class="card glass">' +
      '<div class="card-hd"><div class="t">待取快递</div>' +
        '<div class="r">还有 ' + open.length + ' 个没取' + (got.length ? ' · 已取 ' + got.length + ' 个' : '') + '</div></div>' +
      '<div class="toolbar">' +
        '<button class="btn primary" data-act="pcPasteToggle">' + (pcPaste ? '收起' : '粘贴取件短信') + '</button>' +
        '<span style="font-size:12px;color:var(--ink-3)">把快递短信（或者物流信息）整段粘进来，' +
          '它会自己把取件码、单号、放哪儿了摘出来。</span>' +
      '</div>' +
      (pcPaste
        ? '<div class="hw-paste" style="margin-bottom:14px">' +
            '<textarea id="pcRaw" placeholder="例如：\n【菜鸟驿站】您的包裹已到东门菜鸟驿站，取件码 8-2-1234，请于 20 点前取件。电话 13800000000"></textarea>' +
            '<div class="wrow" style="margin-top:10px">' +
              '<button class="btn primary" data-act="pcSplit">自动辨认</button>' +
              '<button class="btn ghost" data-act="pcPasteToggle">取消</button>' +
              '<button class="btn" data-act="aiRead" data-target="parcel">AI 读图（手写也行）</button>' +
            '</div></div>'
        : '') +
      (pcDraft ? pcDraftHtml() : '') +
      (open.length
        ? open.map(function(p){ return card(p, false); }).join('')
        : '<div class="empty"><div class="e1">' + (got.length ? '快递都取完了' : '还没有待取的快递') + '</div>' +
          '收到取件短信就点「粘贴取件短信」，粘进去点「自动辨认」，取件码会自动摘出来。' +
          '<br>取走之后点一下「已取走」，它就会沉下去。</div>') +
      (got.length
        ? '<div class="done-hd"><span>已取走 ' + got.length + ' 个</span><span class="ln"></span></div>' +
          got.map(function(p){ return card(p, true); }).join('')
        : '') +
      '<div class="hintline">' +
        '<b>关于「自动调取手机短信和支付宝物流」：</b>电脑上的网页读不到手机短信，支付宝也没有给个人开放接口 —— ' +
        '这是系统和 App 的限制，不是我不想做。这一版的做法是「收到短信复制一下、粘进来」，' +
        '以后做手机版（App 或小程序）的时候，才能真的自动读。' +
      '</div>' +
    '</div>';
}

function pcById(id){
  for (var i = 0; i < db.parcels.length; i++){ if (db.parcels[i].id === id) return db.parcels[i]; }
  return null;
}

/* =========================================================================
   孩子模式：放大的作业清单，给孩子看或者打印
   ========================================================================= */
function kidModeHtml(){
  var d = ui.hwDate || todayStr();
  var list = hwOfDate(d);
  var doneN = list.filter(function(x){ return x.done; }).length;
  return '<div class="kidmode">' +
      '<div class="km-bar no-print">' +
        '<button class="btn ghost sm" data-act="kidClose">退出孩子模式</button>' +
        '<button class="btn ghost sm" data-act="kidPrint">打印这一份</button>' +
        '<span style="font-size:12px;color:var(--ink-3)">点圆圈可以打钩，勾了会自动划掉</span>' +
      '</div>' +
      '<div style="margin-top:24px">' +
        '<div class="km-h">今天的作业</div>' +
        '<div class="km-d">' + cnFullDate(new Date(d + 'T00:00:00')) + '</div>' +
        '<div class="km-h" style="margin-top:12px">已完成 ' + doneN + ' / ' + list.length + '</div>' +
        (list.length
          ? '<div class="km-list">' + list.map(function(h){
              return '<div class="km-i' + (h.done ? ' on' : '') + '">' +
                  '<button class="km-c" data-act="hwToggle" data-id="' + h.id + '">✓</button>' +
                  '<div><div class="km-t">' + esc(h.text) + '</div>' +
                    '<div class="km-s">' + esc(h.subject) + '</div></div>' +
                '</div>';
            }).join('') + '</div>'
          : '<div style="margin-top:22px;font-size:17px;color:var(--ink-3)">这一天没有作业记录。</div>') +
      '</div>' +
    '</div>';
}

/* ---------------------------------------------------------------- 事件 */
/* 国债卡片：按住左右拖一下（手机上是滑）就换期限 */
var bondDragX = null;
document.addEventListener('pointerdown', function(ev){
  var v = ev.target && ev.target.closest ? ev.target.closest('.bondview') : null;
  if (v){ bondDragX = ev.clientX; v.classList.add('grabbing'); }
});
document.addEventListener('pointerup', function(ev){
  if (bondDragX === null) return;
  var dx = ev.clientX - bondDragX;
  bondDragX = null;
  var vs = document.querySelectorAll('.bondview');
  for (var i = 0; i < vs.length; i++) vs[i].classList.remove('grabbing');
  if (Math.abs(dx) < 34) return;                 // 轻轻点一下不算滑动
  bondGo(ui.bondIdx + (dx < 0 ? 1 : -1));
});
document.addEventListener('pointercancel', function(){ bondDragX = null; });

document.addEventListener('click', function(ev){
  /* 点别的地方就把搜索下拉收起来 */
  if (!(ev.target.closest && ev.target.closest('.wsearch'))){
    var hb = $('wHits');
    if (hb) hb.className = 'hits';
  }
  var el = ev.target.closest ? ev.target.closest('[data-act]') : null;
  if (!el) return;
  var act = el.getAttribute('data-act');
  var id  = el.getAttribute('data-id');

  if (act === 'goto'){
    ui.page = el.getAttribute('data-page');
    ui.editingId = null;
    Q.at = 0;                                   // 换了页面，标的清单也变了，行情要重新取
    var m = document.querySelector('.main');
    if (m) m.scrollTop = 0;
    render();
  } else if (act === 'chip'){
    ui.filter = el.getAttribute('data-f');
    ui.editingId = null;
    render();
  } else if (act === 'gotoFilter'){
    ui.page   = el.getAttribute('data-page');
    ui.filter = el.getAttribute('data-f');
    ui.editingId = null;
    Q.at = 0;
    var mm = document.querySelector('.main');
    if (mm) mm.scrollTop = 0;
    render();
  } else if (act === 'add'){
    addTodo();
  } else if (act === 'toggle'){
    toggleTodo(id);
  } else if (act === 'del'){
    deleteTodo(id);
  } else if (act === 'edit'){
    ui.editingId = id;
    render();
  } else if (act === 'cancelEdit'){
    ui.editingId = null;
    render();
  } else if (act === 'saveEdit'){
    saveEdit(id);
  } else if (act === 'watchAdd'){
    var wEl = $('wCode');
    /* 下拉里有候选就先加第一支；否则按代码处理 */
    if (wLastHits.length){ addWatchBySecid(wLastHits[0].secid, wLastHits[0].code, wLastHits[0].name); return; }
    var wc = parseCodes(wEl ? wEl.value : '');
    if (!wc.length){
      alert('请输入股票名字、拼音首字母或 6 位代码，例如：茅台 / gzmt / 600519。');
      if (wEl) wEl.focus();
      return;
    }
    if (wEl) wEl.value = '';
    addWatchCodes(wc);
  } else if (act === 'watchPick'){
    var pi = Number(el.getAttribute('data-i'));
    var pick = wLastHits[pi];
    if (pick) addWatchBySecid(pick.secid, pick.code, pick.name);
  } else if (act === 'unwatch'){
    unwatch(el.getAttribute('data-secid'));
  } else if (act === 'bulkToggle'){
    syncNoteDraft();
    ui.bulkOpen = !ui.bulkOpen;
    render();
  } else if (act === 'bulkAdd'){
    var bt = $('bulkText');
    var bcs = parseCodes(bt ? bt.value : '');
    if (!bcs.length){ alert('没读到股票代码。\n一行写一个 6 位数字，例如 600519。'); return; }
    ui.bulkOpen = false;
    addWatchCodes(bcs);
  } else if (act === 'watchSort'){
    ui.watchSort = el.getAttribute('data-v');
    render();
  } else if (act === 'kwSave'){
    saveKeywords(false);
  } else if (act === 'onlyKw'){
    saveKeywords(true);      // 先把你刚打的字收进去，免得一点就丢
    ui.onlyKw = !ui.onlyKw;
    render();
  } else if (act === 'onlyHigh'){
    ui.onlyHigh = !ui.onlyHigh;
    render();
  } else if (act === 'newsOpen'){
    var nid = el.getAttribute('data-id');
    ui.newsOpen[nid] = true;
    paintNews();
  } else if (act === 'newsFold'){
    var nid2 = el.getAttribute('data-id');
    delete ui.newsOpen[nid2];
    paintNews();
  } else if (act === 'fxMode'){
    ui.fxMode = (ui.fxMode === 'cny') ? 'usd' : 'cny';
    render();
  } else if (act === 'bondPrev'){
    bondGo(ui.bondIdx - 1);
  } else if (act === 'bondNext'){
    bondGo(ui.bondIdx + 1);
  } else if (act === 'bondTab'){
    bondGo(Number(el.getAttribute('data-i')));
  } else if (act === 'noteNew'){
    syncNoteDraft();
    noteDraft = {id:'new', kind:ui.noteKind, date:todayStr(), title:'', body:''};
    render();
    var nb = $('ndBody');
    if (nb) nb.focus();
  } else if (act === 'noteCancel'){
    noteDraft = null;
    render();
  } else if (act === 'noteSave'){
    saveNote();
  } else if (act === 'noteKind'){
    syncNoteDraft();
    ui.noteKind = el.getAttribute('data-v');
    render();
  } else if (act === 'noteOpen'){
    var nid = el.getAttribute('data-id');
    syncNoteDraft();
    ui.noteOpen = (ui.noteOpen === nid) ? null : nid;
    render();
  } else if (act === 'noteEdit'){
    var eid = el.getAttribute('data-id');
    syncNoteDraft();
    db.notes.forEach(function(n){
      if (n.id === eid){ noteDraft = {id:n.id, kind:n.kind, date:n.date, title:n.title, body:n.body}; }
    });
    render();
  } else if (act === 'noteDel'){
    var did = el.getAttribute('data-id');
    if (!confirm('删除这篇笔记吗？删了就找不回来了。')) return;
    db.notes = db.notes.filter(function(n){ return n.id !== did; });
    if (noteDraft && noteDraft.id === did) noteDraft = null;
    save();
    render();

  /* ---------------- 孩子作业 ---------------- */
  } else if (act === 'hwDay'){
    var step = Number(el.getAttribute('data-v'));
    var base = ui.hwDate || todayStr();
    ui.hwDate = (step === 0) ? todayStr() : dateStr(new Date(new Date(base + 'T00:00:00').getTime() + step * 86400000));
    hwDraft = null;
    render();
  } else if (act === 'hwPasteToggle'){
    hwPaste = !hwPaste;
    hwDraft = null;
    render();
  } else if (act === 'hwSplit' || act === 'hwSmart'){
    /* 「识别作业」：框里有字就拆字，框是空的就当"我要传张图" */
    var rawEl = $('hwRaw');
    var raw = rawEl ? String(rawEl.value).trim() : '';
    if (!raw){
      if (act !== 'hwSmart'){
        alert('先把老师发的消息粘到框里。'); if (rawEl) rawEl.focus(); return;
      }
      if (!aiReady()){
        alert('框里还是空的。\n\n两条路，挑一条走：\n' +
              '① 老师发的是文字 → 把它粘到上面的框里，再点这个按钮（这条免费，不用配 AI）。\n' +
              '② 老师发的是图片、或者手写拍照 → 得先让工作台连上 AI：左边「AI 助手」填一次密钥，\n' +
              '   以后再点这个按钮，它就会让你挑一张图，读完直接把作业挑出来。');
        ui.page = 'ai';
        render();
        return;
      }
      aiReadPick('hw');
      return;
    }
    if (aiReady()) hwAiSplitNow(raw); else hwRuleSplitNow(raw);
  } else if (act === 'hwDrop'){
    var di = Number(el.getAttribute('data-i'));
    if (!hwDraft || hwDraft[di] === undefined) return;
    hwSyncDraft();                       // 先把你在输入框里改过的字收回来，不然会丢
    hwDraft = hwDraft.slice(0, di).concat(hwDraft.slice(di + 1));
    hwSkipSync = true;                   // 关键：这次重画不要再从旧界面按序号读（序号已经错位了）
    render();
  } else if (act === 'hwCancel'){
    hwDraft = null;
    render();
  } else if (act === 'hwAiSplit'){
    var aiEl = $('hwRaw');
    var aiRaw = aiEl ? String(aiEl.value).trim() : '';
    if (!aiRaw){ alert('先把老师发的消息粘到框里。'); if (aiEl) aiEl.focus(); return; }
    if (!aiReady()){
      alert('这条要用到 AI。\n\n' +
            '两个选择：① 先去左边「AI 助手」把密钥填上（填一次就行）；② 先不配，直接用免费的规则版。');
      ui.page = 'ai'; render(); return;
    }
    hwAiSplitNow(aiRaw);
  } else if (act === 'hwConfirm'){
    if (!hwDraft || !hwDraft.length) return;
    var d0 = ui.hwDate || todayStr();
    var added = 0;
    hwDraft.forEach(function(x, i){
      var ti = $('hwD' + i), si = $('hwS' + i);
      var txt = ti ? String(ti.value).trim() : x.text;
      if (!txt) return;
      db.homework.push({
        id: uid(), date: d0, subject: (si ? si.value : x.subject),
        text: txt, done: false, doneAt: null, createdAt: Date.now() + i
      });
      added++;
    });
    hwDraft = null;
    save();
    render();
    toast('加了 ' + added + ' 条作业');
  } else if (act === 'hwToggle'){
    var hid = el.getAttribute('data-id');
    db.homework.forEach(function(h){
      if (h.id === hid){ h.done = !h.done; h.doneAt = h.done ? Date.now() : null; }
    });
    save();
    render();
  } else if (act === 'hwCollapse'){
    var cs = el.getAttribute('data-s');
    hwSetCollapsed(cs, !hwIsCollapsed(cs));
    render();
  } else if (act === 'hwAllToggle'){
    var gs = hwGroups(ui.hwDate || todayStr());
    var anyCollapsed = gs.some(function(g){ return hwIsCollapsed(g.subject); });
    db.meta.hwCollapsed = {};
    if (!anyCollapsed){                       // 现在全是展开的 → 全部收起来
      gs.forEach(function(g){ db.meta.hwCollapsed[g.subject] = true; });
    }
    save();
    render();
  } else if (act === 'hwFixedToggle'){
    hwFixedOpen = !hwFixedOpen;
    render();
  } else if (act === 'hwFixedAdd'){
    var fxS = $('hfxSubj'), fxT = $('hfxText'), fxD = $('hfxDays');
    var fxText = String(fxT ? fxT.value : '').trim();
    if (!fxText){
      alert('先把「固定要做的事」写上，例如：朗读 15 分钟。');
      if (fxT) fxT.focus();
      return;
    }
    db.hwFixed = db.hwFixed || [];
    db.hwFixed.push({
      id: uid(), subject: (fxS ? fxS.value : '其他'), text: fxText,
      days: (fxD && fxD.value === 'weekday') ? 'weekday' : 'all',
      active: true, createdAt: Date.now()
    });
    save();
    /* 顺手加到今天的清单里，这样立刻就能看到效果 */
    var n = hwEnsureFixed(todayStr());
    render();
    toast(n ? '固定作业加好了，今天的清单里已经出现' : '固定作业加好了');
  } else if (act === 'hwFixedEdit'){
    var fid = el.getAttribute('data-id');
    var ff = hwFixedById(fid);
    if (!ff) return;
    var nn = prompt('改一下这条固定作业：', ff.text);
    if (nn === null) return;
    nn = String(nn).trim();
    if (!nn){ alert('不能改成空的。'); return; }
    ff.text = nn;
    save();
    render();
    toast('改好了，只影响以后（今天已经加进去的那条不变）');
  } else if (act === 'hwFixedDel'){
    var did2 = el.getAttribute('data-id');
    var df = hwFixedById(did2);
    if (!df) return;
    if (!confirm('删掉这条固定作业吗？\n\n' + df.subject + '：' + df.text +
                 '\n\n删掉后，以后每天就不会再自动加了。\n' +
                 '（今天已经加进清单的那几条会留着，不受影响）')) return;
    db.hwFixed = (db.hwFixed || []).filter(function(f){ return f.id !== did2; });
    save();
    render();
    toast('固定作业已删掉，今天的清单没动');
  } else if (act === 'hwEdit'){
    /* 就地展开编辑框（内容 + 科目），不用弹窗 */
    ui.hwEditId = el.getAttribute('data-id');
    render();
  } else if (act === 'hwEditCancel'){
    ui.hwEditId = null;
    render();
  } else if (act === 'hwEditSave'){
    var heid = el.getAttribute('data-id');
    var tEl = $('hwEd'), sEl = $('hwEdS');
    var nt = tEl ? String(tEl.value).trim() : '';
    if (!nt){ alert('内容不能是空的。'); if (tEl) tEl.focus(); return; }
    db.homework.forEach(function(h){
      if (h.id === heid){
        h.text = nt;
        if (sEl) h.subject = sEl.value;    // 重点：这里能改科目了
      }
    });
    ui.hwEditId = null;
    save();
    render();
    toast('改好了');
  } else if (act === 'hwDel'){
    var hdid = el.getAttribute('data-id');
    var dcur = null;
    db.homework.forEach(function(h){ if (h.id === hdid) dcur = h; });
    if (!dcur) return;
    if (!confirm('删掉这条作业吗？\n\n「' + dcur.text + '」')) return;
    db.homework = db.homework.filter(function(h){ return h.id !== hdid; });
    save();
    render();
  } else if (act === 'kidMode'){
    ui.kidMode = true;
    render();
  } else if (act === 'kidClose'){
    ui.kidMode = false;
    render();
  } else if (act === 'kidPrint'){
    window.print();

  /* ---------------- 书单和阅读 ---------------- */
  } else if (act === 'bkAddToggle'){
    ui.bkAdd = !ui.bkAdd;
    ui.bkEdit = null;
    render();
  } else if (act === 'bkCancel'){
    ui.bkAdd = false;
    ui.bkEdit = null;
    render();
  } else if (act === 'bkSaveNew'){
    bkSaveForm(true, '');
  } else if (act === 'bkSaveEdit'){
    bkSaveForm(false, el.getAttribute('data-id'));
  } else if (act === 'bkOpen'){
    var boid = el.getAttribute('data-id');
    ui.bkOpen = (ui.bkOpen === boid) ? null : boid;
    render();
  } else if (act === 'bkEdit'){
    ui.bkEdit = el.getAttribute('data-id');
    ui.bkAdd = false;
    render();
  } else if (act === 'bkDel'){
    var bdid = el.getAttribute('data-id');
    var bd = bkById(bdid);
    if (!bd) return;
    if (!confirm('把「' + bd.title + '」从书单里删掉吗？\n（这本书的笔记也会一起删掉）')) return;
    db.books = db.books.filter(function(b){ return b.id !== bdid; });
    if (ui.bkOpen === bdid) ui.bkOpen = null;
    save();
    render();
  } else if (act === 'bkStep'){
    var bsid = el.getAttribute('data-id');
    var bs = bkById(bsid);
    if (!bs) return;
    bkSetPct(bsid, Number(bs.percent || 0) + Number(el.getAttribute('data-v')));
  } else if (act === 'bkFinish'){
    bkSetPct(el.getAttribute('data-id'), 100);
    toast('恭喜读完一本');
  } else if (act === 'bkCopyPath'){
    var bcp = bkById(el.getAttribute('data-id'));
    if (bcp) copyText(bcp.filePath, '路径已复制');
  } else if (act === 'bkNoteAdd'){
    bkAddNote(el.getAttribute('data-id'));
  } else if (act === 'bkNoteDel'){
    var nbid = el.getAttribute('data-id'), nnid = el.getAttribute('data-nid');
    var nb = bkById(nbid);
    if (!nb) return;
    nb.notes = (nb.notes || []).filter(function(n){ return n.id !== nnid; });
    save();
    render();
  } else if (act === 'bkPathHelp'){
    alert('怎么拿到本地文件的路径：\n\n' +
          '1. 在「此电脑」里找到那个电子书文件（.pdf / .txt / .epub）\n' +
          '2. 按住键盘上的 Shift 键不放，用鼠标右键点它\n' +
          '3. 菜单里选「复制为路径」（Win11 里叫「复制文件地址」）\n' +
          '4. 回到这里粘进输入框，保存\n\n' +
          '之后卡片上会出现「打开这本书」，点一下就能打开。\n\n' +
          '注意：PDF 和 TXT 浏览器能直接看；EPUB 浏览器打不开（会变成下载），' +
          '建议 EPUB 用专门的阅读软件看，用「复制路径」把路径粘过去。');

  /* ---------------- 密码本 ---------------- */
  } else if (act === 'vbAddToggle'){
    ui.vbAdd = !ui.vbAdd;
    ui.vbEdit = null;
    render();
  } else if (act === 'vbCancel'){
    ui.vbAdd = false;
    ui.vbEdit = null;
    render();
  } else if (act === 'vbSaveNew'){
    vbSaveForm(true, '');
  } else if (act === 'vbSaveEdit'){
    vbSaveForm(false, el.getAttribute('data-id'));
  } else if (act === 'vbEdit'){
    ui.vbEdit = el.getAttribute('data-id');
    ui.vbAdd = false;
    render();
  } else if (act === 'vbDel'){
    var vdid = el.getAttribute('data-id');
    var vd = vbById(vdid);
    if (!vd) return;
    if (!confirm('删掉「' + vd.name + '」这条吗？删了就找不回来了。')) return;
    db.vault = db.vault.filter(function(v){ return v.id !== vdid; });
    save();
    render();
  } else if (act === 'vbCopyAcc'){
    var va = vbById(el.getAttribute('data-id'));
    if (va) copyText(va.account, '账号已复制');
  } else if (act === 'vbCopyPwd'){
    var vp = vbById(el.getAttribute('data-id'));
    if (vp) copyText(vp.password, '密码已复制，可以直接粘到登录框');
  } else if (act === 'vbToggleShow'){
    var vs = el.getAttribute('data-id');
    vbShow[vs] = !vbShow[vs];
    render();
  } else if (act === 'vbGen'){
    var gen = vbGenPassword();
    var gEl = $('vbPwd');
    if (gEl){ gEl.value = gen; gEl.focus(); }
    toast('生成好了，记得保存');
  } else if (act === 'vaultSet'){
    vaultSetPass();
  } else if (act === 'vaultClear'){
    if (!confirm('去掉查看口令？\n\n去掉以后，谁打开这个页面都能直接看到密码本里的内容。\n\n确定去掉吗？')) return;
    db.meta.vaultPass = '';
    save();
    render();
    toast('查看口令已去掉');
  } else if (act === 'vaultUnlock'){
    vaultUnlock();
  } else if (act === 'vaultForget'){
    alert('先说明一下：这个锁只是「挡一下别人随手点开」，数据本身没有加密。\n' +
          '所以忘了口令不会丢数据，把锁去掉就能继续用。');
    if (!confirm('现在把查看口令去掉，可以吗？')) return;
    db.meta.vaultPass = '';
    ui.vaultUnlocked = true;
    save();
    render();
    toast('查看口令已去掉');

  /* ---------------- 待取快递 ---------------- */
  } else if (act === 'pcPasteToggle'){
    pcPaste = !pcPaste;
    pcDraft = null;
    render();
  } else if (act === 'pcSplit'){
    var prEl = $('pcRaw');
    var prTxt = prEl ? prEl.value : '';
    if (!String(prTxt).trim()){ alert('先把取件短信粘到框里。'); if (prEl) prEl.focus(); return; }
    pcDraft = parcelParse(prTxt);
    pcPaste = false;
    render();
  } else if (act === 'pcCancel'){
    pcDraft = null;
    render();
  } else if (act === 'pcConfirm'){
    if (!pcDraft) return;
    var getV = function(id){ var e = $(id); return e ? String(e.value).trim() : ''; };
    var code = getV('pcCode');
    if (!code && !getV('pcNo')){
      alert('至少得有个取件码或者单号，不然以后认不出是哪个包裹。');
      return;
    }
    db.parcels.push({
      id: uid(), code: code, company: getV('pcCompany'), station: getV('pcStation'),
      no: getV('pcNo'), phone: getV('pcPhone'),
      when: (pcDraft.when || ''), raw: pcDraft.raw || '',
      taken: false, takenAt: null, createdAt: Date.now()
    });
    pcDraft = null;
    save();
    render();
    toast('加进待取清单了');
  } else if (act === 'pcTake'){
    var pt = pcById(el.getAttribute('data-id'));
    if (pt){ pt.taken = true; pt.takenAt = Date.now(); save(); render(); toast('取走啦'); }
  } else if (act === 'pcUntake'){
    var pu = pcById(el.getAttribute('data-id'));
    if (pu){ pu.taken = false; pu.takenAt = null; save(); render(); }
  } else if (act === 'pcCopy'){
    var pcp = pcById(el.getAttribute('data-id'));
    if (pcp) copyText(pcp.code, '取件码已复制');
  } else if (act === 'pcEdit'){
    var pe = pcById(el.getAttribute('data-id'));
    if (!pe) return;
    var nc = prompt('改取件码：', pe.code || '');
    if (nc === null) return;
    pe.code = String(nc).trim();
    var ns = prompt('改「放哪儿了」：', pe.station || '');
    if (ns !== null) pe.station = String(ns).trim();
    save();
    render();
  } else if (act === 'pcDel'){
    var pd = pcById(el.getAttribute('data-id'));
    if (!pd) return;
    if (!confirm('删掉这条快递记录吗？\n\n取件码 ' + (pd.code || '(空)') + '　' + (pd.station || ''))) return;
    db.parcels = db.parcels.filter(function(p){ return p.id !== pd.id; });
    save();
    render();

  /* ---------------- 图片文字小工具说明 ---------------- */
  } else if (act === 'ocrHelp'){
    alert('图片里的字怎么弄成文字（不要钱的土办法，但很好用）：\n\n' +
          '1. 打开工作台文件夹里的「小工具」文件夹\n' +
          '2. 双击「识别图片文字」\n' +
          '3. 弹出来的窗口里选那张截图（也可以把图片直接拖到它上面）\n' +
          '4. 等两三秒，它会说「识别完成」—— 文字已经复制到剪贴板了\n' +
          '5. 回到这里，在这个粘贴框里按 Ctrl+V，再点「识别作业」\n\n' +
          '它是用 Windows 系统自带的识别引擎跑的：不用联网、不上传、不花钱、不用装东西。\n\n' +
          '说明一下为什么不能做成"页面里点上传"：本地打开的网页被浏览器禁止调用电脑上的程序，' +
          '这是浏览器的安全限制，不是偷懒。');

  /* ---------------- 健身 ---------------- */
  } else if (act === 'fitOpenToggle'){
    ui.fitOpen = !ui.fitOpen;
    if (!ui.fitOpen) ui.bodyEditId = null;
    render();
  } else if (act === 'bodySave'){
    bodySave();
  } else if (act === 'bodyCancelEdit'){
    ui.bodyEditId = null;
    var dEl = $('bdDate');
    if (dEl) dEl.value = todayStr();
    render();
  } else if (act === 'bodyEdit'){
    bodyEdit(el.getAttribute('data-id'));
  } else if (act === 'bodyDel'){
    bodyDel(el.getAttribute('data-id'));
  } else if (act === 'fitChartKey'){
    fitChartKey = el.getAttribute('data-v') || 'weight';
    render();
  } else if (act === 'fitPart'){
    ui.fitPart = el.getAttribute('data-v') || '全部';
    var m0 = document.querySelector('.main');
    var keep = m0 ? m0.scrollTop : 0;
    render();
    if (m0) m0.scrollTop = keep;
  } else if (act === 'fitDl'){
    fitDownloadImages();
  } else if (act === 'exImgReload'){
    exImgMap = null; exImgErr = ''; exImgLoading = false;
    try { localStorage.removeItem(EX_IMG_MAP_KEY); } catch(e){}
    render();
    fitEnsureImgMap();
  } else if (act === 'fitDlHelp'){
    alert('图片存在哪？\n\n' +
          '· 刚才让你选的那个文件夹里，会新建一个\n' +
          '  images → 动作 → 每个动作一个子文件夹 → 里面是 0.jpg 和 1.jpg\n\n' +
          '· 正确的位置长这样：\n' +
          '  我的工作台\\images\\动作\\pushup\\0.jpg\n' +
          '  （「我的工作台」就是有 index.html 的那个文件夹）\n\n' +
          '· 如果图片被存到别的地方了：再点一次「用浏览器下载真人示范图」，' +
          '这次选「我的工作台」文件夹就行（不会重复下载，会覆盖）。\n\n' +
          '· 为什么小工具那个脚本会失败：这台电脑的 PowerShell 用不了系统的加密通道，' +
          '连不上 https；而 Chrome 用的是自己的加密实现，所以浏览器这条路是通的。');
  } else if (act === 'coachName'){
    var cn = prompt('动作讲解人叫什么？（点「看讲解」会去抖音搜「这个名字 + 动作名」）', fitCoach().name || '');
    if (cn === null) return;
    fitCoach().name = String(cn).trim();
    save();
    render();
    toast(fitCoach().name ? ('讲解人改成「' + fitCoach().name + '」了') : '已清空讲解人（只搜动作名）');
  } else if (act === 'coachHome'){
    if (el.getAttribute('data-v') === 'clear'){
      fitCoach().home = '';
      save();
      render();
      toast('主页链接已清掉');
      return;
    }
    var ch = prompt('把他的抖音主页链接粘进来（抖音里点他头像 → 分享 → 复制链接）：', fitCoach().home || '');
    if (ch === null) return;
    ch = String(ch).trim();
    if (ch && ch.indexOf('http') !== 0){
      alert('这看起来不是链接。把抖音里复制的那段粘进来就行，或者先跳过。');
      return;
    }
    fitCoach().home = ch;
    save();
    render();
    toast(ch ? '主页链接存好了' : '没填，跳过了');
  /* ---------------- 股票分析 ---------------- */
  /* ---------------- 会议录音转纪要 ---------------- */
  } else if (act === 'asrLoad'){
    ui.mn = ui.mn || {};
    ui.mn.err = '';
    render();
    loadTranscript().then(function(d){
      ui.mn.asr = d;
      ui.mn.sum = null;
      ui.mn.err = '';
      ui.mn.fileName = (d.audio || '');
      render();
      toast('读到转写了，共 ' + String(d.text).length + ' 个字');
    }).catch(function(e){
      ui.mn.err = e.message;
      render();
    });
  } else if (act === 'asrCopy'){
    var at = $('asrText');
    if (at) copyText(at.value, '转写原文已复制');
  } else if (act === 'asrSummarize'){
    minutesSummarize();
  } else if (act === 'asrHelp'){
    alert('录音文件在哪？\n\n' +
          '· 你双击「转写录音」选中的那个文件，会被自动复制一份到\n  ' +
          '  工作台文件夹 →「录音」文件夹里，留档用\n' +
          '· 转写结果存在同文件夹的「最新转写.js」里（这个文件别删，工作台要读它）\n' +
          '· 每个录音还会存一份同名的 .txt 文字稿，方便你自己翻');
  } else if (act === 'minOpen'){
    var mid = el.getAttribute('data-id');
    ui.mnOpen = (ui.mnOpen === mid) ? null : mid;
    render();
  } else if (act === 'minDel'){
    var did3 = el.getAttribute('data-id');
    if (!confirm('删掉这份纪要吗？\n（只删工作台里的记录，录音文件和你导出的 txt 不会被删）')) return;
    db.minutes = (db.minutes || []).filter(function(r){ return r.id !== did3; });
    save();
    render();
  } else if (act === 'minClose'){
    ui.mn.sum = null;
    render();
  } else if (act === 'minCopy'){
    if (ui.mn.sum) copyText(ui.mn.sum.readable, '纪要已复制');
  } else if (act === 'minSave'){
    var sm = ui.mn.sum;
    if (!sm || !sm.readable) return;
    db.minutes = db.minutes || [];
    db.minutes.push({
      id: uid(), date: todayStr(),
      title: (sm.audio ? sm.audio.replace(/\.[a-z0-9]+$/i, '') : '会议纪要'),
      audio: sm.audio || '', points: sm.readable,
      createdAt: Date.now()
    });
    save();
    render();
    toast('存好了，下面「以前的纪要」里能看到');
  } else if (act === 'minTodoAdd'){
    var s3 = ui.mn.sum;
    if (!s3 || !s3.todos) return;
    var boxes = document.querySelectorAll('.tchk');
    var n = 0;
    for (var bi = 0; bi < boxes.length; bi++){
      if (!boxes[bi].checked) continue;
      var idx = Number(boxes[bi].getAttribute('data-i'));
      var t = s3.todos[idx];
      if (!t) continue;
      var txt = (t.who ? t.who + '：' : '') + t.what;
      db.todos.push({
        id: uid(), text: txt, cat: 'work',
        due: parseDueDate(t.when) || '', level: 2,
        done: false, doneAt: null, createdAt: Date.now() + n
      });
      n++;
    }
    save();
    render();
    toast(n ? ('加了 ' + n + ' 条到待办事项（分类是"工作"）') : '一条都没勾');
  /* ---------------- 股票分析 ---------------- */
  } else if (act === 'aiStock'){
    aiStockRun(el.getAttribute('data-secid'), el.getAttribute('data-code'), el.getAttribute('data-name'));
  } else if (act === 'aiStockClose'){
    ui.aiStock = null;
    render();
  } else if (act === 'aiStockRetry'){
    var st = ui.aiStock;
    ui.aiStock = null;
    if (st) aiStockRun(st.secid, st.code, st.name);
  } else if (act === 'aiStockCopy'){
    if (ui.aiStock) copyText(ui.aiStock.text, '分析内容已复制');
  } else if (act === 'aiStockSave'){
    var s2 = ui.aiStock;
    if (!s2 || !s2.text) return;
    db.notes = db.notes || [];
    db.notes.push({
      id: uid(), kind:'day', date: todayStr(),
      title: 'AI 分析：' + s2.name,
      body: s2.text + '\n\n——（' + s2.note + '）',
      createdAt: Date.now(), updatedAt: Date.now()
    });
    ui.noteKind = 'day';
    save();
    toast('已存进复盘笔记，去「复盘笔记」就能看到');
  /* ---------------- AI 助手 ---------------- */
  } else if (act === 'aiSave'){
    var a = aiCfg();
    a.base  = String($('aiBase').value || '').trim() || AI_DEFAULT.base;
    a.model = String($('aiModel').value || '').trim() || AI_DEFAULT.model;
    var vEl = $('aiVision');
    a.vision = vEl ? String(vEl.value || '').trim() : '';
    a.key   = String($('aiKey').value || '').trim();
    save();
    render();
    toast(aiReady() ? '配置已保存，建议点一下「一键自检」' : '还差密钥没填');
  } else if (act === 'aiClear'){
    if (!confirm('清掉保存在本机的密钥吗？\n（清掉后 AI 读图就不能用了，以后可以重新填）')) return;
    aiCfg().key = '';
    aiTest = null;
    save();
    render();
    toast('密钥已清掉');
  } else if (act === 'aiTest'){
    if (!aiReady()){
      alert('先把接口地址、模型名、密钥填上，再点「一键自检」。');
      return;
    }
    aiSelfTest();
  } else if (act === 'aiHelp'){
    alert('去哪拿密钥（以 DeepSeek 为例）：\n\n' +
          '1. 浏览器打开 platform.deepseek.com\n' +
          '2. 注册 / 登录\n' +
          '3. 左侧点「API keys」（密钥）\n' +
          '4. 点「创建 API key」，起个名字，比如 我的工作台\n' +
          '5. 它会给你一串 sk- 开头的东西 —— 复制下来，粘到上面「密钥」那一栏\n' +
          '6. 记得先去「充值 / 账单」里充一点钱（几块钱就够用很久）\n\n' +
          '【重要提醒】\n' +
          '· 密钥只在创建时显示一次，关掉就看不到了，所以要马上粘进来\n' +
          '· 建议建一个「专用的」密钥，并在后台设一个消费上限\n' +
          '· 别把这个密钥发给任何人（它等于你的钱包）\n' +
          '· 密钥保存在你自己电脑的浏览器里，不会上传');

  } else if (act === 'aiRead'){
    aiReadPick(el.getAttribute('data-target'));

  } else if (act === 'wTextToggle'){
    ui.wText = !ui.wText;
    if (!ui.wText){ ui.wTextHits = null; }
    render();
  } else if (act === 'wTextRun'){
    wTextRun();
  } else if (act === 'wTextAdd'){
    if (!ui.wTextHits || !ui.wTextHits.length) return;
    var boxes = document.querySelectorAll('.wchk');
    var picked = [];
    for (var bi = 0; bi < boxes.length; bi++){
      if (boxes[bi].checked && !boxes[bi].disabled){
        var idx = Number(boxes[bi].getAttribute('data-i'));
        if (ui.wTextHits[idx]) picked.push(ui.wTextHits[idx]);
      }
    }
    if (!picked.length){ alert('一个都没勾。'); return; }
    var added = 0;
    picked.forEach(function(x){
      if (db.watch.some(function(w){ return w.secid === x.secid; })) return;
      if (db.watch.length >= 120) return;
      db.watch.push({secid:x.secid, code:x.code, name:x.name, addedAt:Date.now()});
      added++;
    });
    save();
    ui.wTextHits = null;
    ui.wText = false;
    render();
    refreshQuotes();
    toast('加了 ' + added + ' 支到自选股');
  }
});

document.addEventListener('keydown', function(ev){
  if (ev.key === 'Escape'){
    var hb = $('wHits');
    if (hb) hb.className = 'hits';
    return;
  }
  /* 行情看板上，左右方向键切换国债期限（鼠标按着滑也行） */
  if (ui.page === 'market' && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')){
    var tag = (ev.target && ev.target.tagName) || '';
    if (!/INPUT|TEXTAREA|SELECT/.test(tag)){
      ev.preventDefault();
      bondGo(ui.bondIdx + (ev.key === 'ArrowLeft' ? -1 : 1));
      return;
    }
  }
  if (ev.key !== 'Enter') return;

  if (ev.target && ev.target.id === 'inText'){ ev.preventDefault(); addTodo(); }
  else if (ev.target && ev.target.id === 'edText' && ui.editingId){
    ev.preventDefault(); saveEdit(ui.editingId);
  }
  else if (ev.target && ev.target.id === 'wCode'){
    ev.preventDefault();
    /* 下拉里有候选就直接加第一支，最顺手 */
    if (wLastHits.length){ addWatchBySecid(wLastHits[0].secid, wLastHits[0].code, wLastHits[0].name); return; }
    var b = $('wCode');
    var c = parseCodes(b.value);
    if (c.length) addWatchCodes(c);
  }
  else if (ev.target && ev.target.id === 'kwInput'){
    ev.preventDefault();
    saveKeywords(true);
  }
  else if (ev.target && ev.target.id && ev.target.id.indexOf('bkNote') === 0){
    ev.preventDefault();
    bkAddNote(ev.target.id.slice(6));       // "bkNote" 是 6 个字母，后面那串就是书的 id
  }
  else if (ev.target && ev.target.id && ev.target.id.indexOf('hwRaw') === 0){
    /* 粘贴区里按回车不直接拆，避免长段文字被误切 */
  }
});

/* 绑定按钮。都做了存在性判断 —— 万一哪天 index.html 和 app.js 版本对不上，也不会整页崩掉 */
function on(id, evt, fn){
  var el = $(id);
  if (el) el.addEventListener(evt, fn);
}
on('btnExport', 'click', exportBackup);
on('btnImport', 'click', function(){ var f = $('fileImport'); if (f) f.click(); });
on('fileImport', 'change', function(ev){
  var f = ev.target.files && ev.target.files[0];
  if (f) importBackup(f);
  ev.target.value = '';     // 同一个文件也能再选一次
});
/* AI 读图：选完图片就开始识别 */
on('aiImg', 'change', function(ev){
  var f = ev.target.files && ev.target.files[0];
  if (f) aiReadRun(f);
  ev.target.value = '';
});
on('bannerAct', 'click', function(){
  if (typeof bannerAction === 'function') bannerAction();
});

/* ---------------------------------------------------------------- 启动 */
load();
render();
renderBackupInfo();
maybeWarnBackup();
tickClock();
setInterval(tickClock, 1000);
setInterval(dataTick, 1000);
nextQuoteAt = 0; nextNewsAt = 0;
dataTick();

document.addEventListener('visibilitychange', function(){
  if (!document.hidden){ tickClock(); nextQuoteAt = 0; dataTick(); }
});
