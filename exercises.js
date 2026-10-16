/* =========================================================================
   动作库：火柴人循环动画 + 动作要点
   画法：每个动作给两个姿势（A 起始 / B 结束），中间自动来回插值，就是循环动画。
   角度规则：0°=朝上，90°=朝右，180°=朝下，270°=朝左。
   数据里：r=髋部位置[x,y]  sp=躯干角度  aA/aB=两条手臂[肩,肘]  lA/lB=两条腿[髋,膝]
   ========================================================================= */

var FIT_PARTS = ['胸','背','腿','臀','肩','手臂','核心','有氧'];

/* ------------------------------------------------------------------------
   真人示范图在图库里的确切路径（free-exercise-db，开源公有领域）
   这是我查过图库清单后逐个核对出来的，不是猜的。
   图库里没有的（跪姿俯卧撑、靠墙静蹲、开合跳、高抬腿、波比跳）不在这里，
   那几个会显示工作台自带的小人动画。
   ------------------------------------------------------------------------ */
var EX_IMG_PATHS = {
  'pushup':            ['Pushups/0.jpg','Pushups/1.jpg'],
  'pushup_incline':    ['Incline_Push-Up/0.jpg','Incline_Push-Up/1.jpg'],
  'pushup_decline':    ['Decline_Push-Up/0.jpg','Decline_Push-Up/1.jpg'],
  'bench_press':       ['Barbell_Bench_Press_-_Medium_Grip/0.jpg','Barbell_Bench_Press_-_Medium_Grip/1.jpg'],
  'pullup':            ['Pullups/0.jpg','Pullups/1.jpg'],
  'row_db':            ['One-Arm_Dumbbell_Row/0.jpg','One-Arm_Dumbbell_Row/1.jpg'],
  'row_barbell':       ['Bent_Over_Barbell_Row/0.jpg','Bent_Over_Barbell_Row/1.jpg'],
  'latpulldown':       ['Full_Range-Of-Motion_Lat_Pulldown/0.jpg','Full_Range-Of-Motion_Lat_Pulldown/1.jpg'],
  'superman':          ['Superman/0.jpg','Superman/1.jpg'],
  'squat':             ['Bodyweight_Squat/0.jpg','Bodyweight_Squat/1.jpg'],
  'lunge':             ['Bodyweight_Walking_Lunge/0.jpg','Bodyweight_Walking_Lunge/1.jpg'],
  'glute_bridge':      ['Barbell_Glute_Bridge/0.jpg','Barbell_Glute_Bridge/1.jpg'],
  'calf_raise':        ['Rocking_Standing_Calf_Raise/0.jpg','Rocking_Standing_Calf_Raise/1.jpg'],
  'bulgarian':         ['Split_Squat_with_Dumbbells/0.jpg','Split_Squat_with_Dumbbells/1.jpg'],
  'bridge_single':     ['Single_Leg_Glute_Bridge/0.jpg','Single_Leg_Glute_Bridge/1.jpg'],
  'side_leg':          ['Side_Leg_Raises/0.jpg','Side_Leg_Raises/1.jpg'],
  'donkey_kick':       ['Glute_Kickback/0.jpg','Glute_Kickback/1.jpg'],
  'lateral_raise':     ['Side_Lateral_Raise/0.jpg','Side_Lateral_Raise/1.jpg'],
  'front_raise':       ['Front_Dumbbell_Raise/0.jpg','Front_Dumbbell_Raise/1.jpg'],
  'shoulder_press':    ['Dumbbell_Shoulder_Press/0.jpg','Dumbbell_Shoulder_Press/1.jpg'],
  'face_pull':         ['Face_Pull/0.jpg','Face_Pull/1.jpg'],
  'rear_fly':          ['Cable_Rear_Delt_Fly/0.jpg','Cable_Rear_Delt_Fly/1.jpg'],
  'curl':              ['Dumbbell_Bicep_Curl/0.jpg','Dumbbell_Bicep_Curl/1.jpg'],
  'hammer_curl':       ['Hammer_Curls/0.jpg','Hammer_Curls/1.jpg'],
  'dip_chair':         ['Bench_Dips/0.jpg','Bench_Dips/1.jpg'],
  'overhead_ext':      ['Cable_Rope_Overhead_Triceps_Extension/0.jpg','Cable_Rope_Overhead_Triceps_Extension/1.jpg'],
  'plank':             ['Plank/0.jpg','Plank/1.jpg'],
  'side_plank':        ['Side_Bridge/0.jpg','Side_Bridge/1.jpg'],
  'crunch':            ['Crunch_-_Hands_Overhead/0.jpg','Crunch_-_Hands_Overhead/1.jpg'],
  'leg_raise':         ['Flat_Bench_Lying_Leg_Raise/0.jpg','Flat_Bench_Lying_Leg_Raise/1.jpg'],
  'russian_twist':     ['Russian_Twist/0.jpg','Russian_Twist/1.jpg'],
  'dead_bug':          ['Dead_Bug/0.jpg','Dead_Bug/1.jpg'],
  'jog':               ['Jogging_Treadmill/0.jpg','Jogging_Treadmill/1.jpg'],
  'mountain_climber':  ['Mountain_Climbers/0.jpg','Mountain_Climbers/1.jpg'],
  'jump_rope':         ['Rope_Jumping/0.jpg','Rope_Jumping/1.jpg']
};
var FIT_HUE = {'胸':205,'背':258,'腿':152,'臀':330,'肩':28,'手臂':190,'核心':38,'有氧':14};

var FIG_LEN = { torso:46, uarm:24, farm:24, thigh:30, shin:30, head:10.5 };

function fitHue(p){ return FIT_HUE[p] === undefined ? 210 : FIT_HUE[p]; }

function figPt(x, y, ang, len){
  var r = ang * Math.PI / 180;
  return [x + Math.sin(r) * len, y - Math.cos(r) * len];
}

/* 一张火柴人的空壳（线条位置后面逐帧填） */
function figBuild(id){
  function limb(k, off){
    return '<g data-g="' + k + '" transform="translate(' + off[0] + ',' + off[1] + ')"' +
             (off[2] ? ' opacity="0.4"' : '') + '>' +
        '<line data-p="' + k + '1"/><line data-p="' + k + '2"/>' +
      '</g>';
  }
  return '<svg class="figsvg" viewBox="0 0 200 180" data-fig="' + id + '">' +
      '<g stroke="currentColor" stroke-width="3.6" stroke-linecap="round" fill="none">' +
        '<line data-p="spine"/>' +
        limb('lA', [5, 3, 1]) +      /* 远侧腿（淡一点） */
        limb('lB', [0, 0, 0]) +
        limb('aA', [6, 4, 1]) +      /* 远侧手 */
        limb('aB', [0, 0, 0]) +
        '<circle data-p="hipdot" r="2.6" fill="currentColor" stroke="none"/>' +
      '</g>' +
      '<circle data-p="head" r="' + FIG_LEN.head + '" stroke="currentColor" stroke-width="3.6" fill="none"/>' +
    '</svg>';
}

function figSetLine(svg, p, a, b){
  var el = svg.querySelector('[data-p="' + p + '"]');
  if (!el) return;
  el.setAttribute('x1', a[0].toFixed(1)); el.setAttribute('y1', a[1].toFixed(1));
  el.setAttribute('x2', b[0].toFixed(1)); el.setAttribute('y2', b[1].toFixed(1));
}

/* 按姿势把火柴人画到 svg 上 */
function figPaint(svg, p){
  if (!svg) return;
  var L = FIG_LEN;
  var hip  = p.r;
  var neck = figPt(hip[0], hip[1], p.sp, L.torso);
  var head = figPt(neck[0], neck[1], p.sp, L.head + 3);

  figSetLine(svg, 'spine', hip, neck);
  var hd = svg.querySelector('[data-p="head"]');
  if (hd){ hd.setAttribute('cx', head[0].toFixed(1)); hd.setAttribute('cy', head[1].toFixed(1)); }
  var dp = svg.querySelector('[data-p="hipdot"]');
  if (dp){ dp.setAttribute('cx', hip[0].toFixed(1)); dp.setAttribute('cy', hip[1].toFixed(1)); }

  [['aA','aA'],['aB','aB']].forEach(function(pair){
    var k = pair[0], a = p[k];
    var el = figPt(neck[0], neck[1], a[0], L.uarm);
    var h  = figPt(el[0], el[1], a[0] + a[1], L.farm);
    figSetLine(svg, k + '1', neck, el);
    figSetLine(svg, k + '2', el, h);
  });
  [['lA','lA'],['lB','lB']].forEach(function(pair){
    var k = pair[0], a = p[k];
    var kn = figPt(hip[0], hip[1], a[0], L.thigh);
    var ft = figPt(kn[0], kn[1], a[0] + a[1], L.shin);
    figSetLine(svg, k + '1', hip, kn);
    figSetLine(svg, k + '2', kn, ft);
  });
}

/* 两个姿势之间来回插值（用缓动，看起来像在用力而不是机械平移） */
function figLerp(A, B, t){
  var e = (1 - Math.cos(t * Math.PI)) / 2;          // 0→1 平滑
  function m4(a, b){ return [a[0] + (b[0]-a[0])*e, a[1] + (b[1]-a[1])*e]; }
  return {
    r:  m4(A.r, B.r),
    sp: A.sp + (B.sp - A.sp) * e,
    aA: m4(A.aA, B.aA), aB: m4(A.aB, B.aB),
    lA: m4(A.lA, B.lA), lB: m4(A.lB, B.lB)
  };
}

/* ------------------------------------------------------------------------ */
var EX = [
  /* ---------------- 胸 ---------------- */
  {id:'pushup', name:'标准俯卧撑', part:'胸', dose:'3-4 组 × 8-15 次',
   tips:['手掌略宽于肩，身体从头到脚保持一条直线','下放到胸口离地一拳，肘部约 45° 夹角','不要塌腰、不要撅屁股'],
   A:{r:[92,116], sp:72, aA:[182,-6], aB:[186,-2], lA:[242,0], lB:[246,2]},
   B:{r:[92,130], sp:72, aA:[228,-95], aB:[232,-91], lA:[248,4], lB:[252,6]}},
  {id:'pushup_knee', name:'跪姿俯卧撑', part:'胸', dose:'3 组 × 10-15 次',
   tips:['膝盖着地，比标准俯卧撑省力，适合刚开始','身体从膝到肩仍要保持直线','适合女生或刚开始练的人'],
   A:{r:[96,118], sp:74, aA:[182,-6], aB:[186,-2], lA:[248,80], lB:[252,78]},
   B:{r:[96,132], sp:74, aA:[228,-95], aB:[232,-91], lA:[250,80], lB:[254,78]}},
  {id:'pushup_incline', name:'上斜俯卧撑（手撑高处）', part:'胸', dose:'3 组 × 12-15 次',
   tips:['手撑在桌子、椅子或台阶上，越高越省力','身体保持一条直线，胸口靠近支撑面','比标准俯卧撑简单，适合起步'],
   A:{r:[84,110], sp:55, aA:[95,10], aB:[99,14], lA:[178,0], lB:[182,0]},
   B:{r:[84,118], sp:55, aA:[88,-25], aB:[92,-21], lA:[178,0], lB:[182,0]}},
  {id:'pushup_decline', name:'下斜俯卧撑（脚垫高）', part:'胸', dose:'3 组 × 8-12 次',
   tips:['脚垫高，重心前移，练上胸更多','比标准俯卧撑更难，注意别塌腰','手腕不舒服就换成握把或拳头撑'],
   A:{r:[74,112], sp:62, aA:[172,0], aB:[176,4], lA:[200,-14], lB:[204,-12]},
   B:{r:[74,120], sp:62, aA:[152,-92], aB:[156,-88], lA:[200,-14], lB:[204,-12]}},
  {id:'bench_press', name:'哑铃卧推', part:'胸', dose:'4 组 × 8-12 次',
   tips:['躺平，肩胛骨收紧贴住凳子','哑铃下放到胸口两侧，再往上推','肘部不要完全锁死，保持一点点弯'],
   A:{r:[96,140], sp:90, aA:[110,-95], aB:[114,-92], lA:[268,0], lB:[272,2]},
   B:{r:[96,140], sp:90, aA:[85,-35], aB:[89,-32], lA:[268,0], lB:[272,2]}},

  /* ---------------- 背 ---------------- */
  {id:'pullup', name:'引体向上', part:'背', dose:'3-4 组 × 力竭',
   tips:['正握单杠，比肩略宽','用背发力把胸口拉向横杠，不要靠甩','下放时慢慢放，别自由落体'],
   A:{r:[100,114], sp:0, aA:[10,0], aB:[14,4], lA:[180,-8], lB:[184,-6]},
   B:{r:[100,96], sp:0, aA:[150,-115], aB:[154,-112], lA:[180,-8], lB:[184,-6]}},
  {id:'row_db', name:'哑铃单臂划船', part:'背', dose:'每侧 3 组 × 10-12 次',
   tips:['一手一膝撑在凳子上，背保持平','把哑铃沿着身体往髋部方向拉','肩膀别耸起来，用背夹'],
   A:{r:[92,120], sp:78, aA:[170,0], aB:[174,4], lA:[178,0], lB:[182,0]},
   B:{r:[92,120], sp:78, aA:[120,-100], aB:[124,-96], lA:[178,0], lB:[182,0]}},
  {id:'row_barbell', name:'俯身划船', part:'背', dose:'4 组 × 8-12 次',
   tips:['屈髋前倾约 45°，背要直，别弓','杠铃拉向小腹，肘部贴身','起身时不要用腰甩起来'],
   A:{r:[88,116], sp:52, aA:[178,0], aB:[182,4], lA:[172,-10], lB:[176,-8]},
   B:{r:[88,116], sp:52, aA:[128,-105], aB:[132,-101], lA:[172,-10], lB:[176,-8]}},
  {id:'latpulldown', name:'坐姿下拉', part:'背', dose:'4 组 × 10-12 次',
   tips:['坐直，握距比肩宽','把横杆拉到锁骨附近，想像用肘往下砸','回上去时控制住，别让重量拽着走'],
   A:{r:[96,118], sp:0, aA:[15,-10], aB:[19,-6], lA:[150,55], lB:[154,53]},
   B:{r:[96,120], sp:6, aA:[160,-115], aB:[164,-111], lA:[150,55], lB:[154,53]}},
  {id:'superman', name:'超人式', part:'背', dose:'3 组 × 12-15 次（每次停 2 秒）',
   tips:['趴在地上，手脚同时抬起','抬起时慢慢呼气，别憋气','颈部放松，别用力仰头'],
   A:{r:[104,126], sp:95, aA:[190,0], aB:[194,4], lA:[275,0], lB:[279,2]},
   B:{r:[104,126], sp:95, aA:[185,-25], aB:[189,-21], lA:[268,-35], lB:[272,-33]}},

  /* ---------------- 腿 ---------------- */
  {id:'squat', name:'深蹲', part:'腿', dose:'4 组 × 12-15 次',
   tips:['脚与肩同宽，脚尖略外撇','想像往后坐椅子，膝盖不要内扣','蹲到大腿接近平行地面就够了'],
   A:{r:[100,96], sp:4, aA:[168,0], aB:[172,4], lA:[180,0], lB:[184,2]},
   B:{r:[100,122], sp:20, aA:[92,-12], aB:[96,-8], lA:[146,52], lB:[150,50]}},
  {id:'lunge', name:'箭步蹲', part:'腿', dose:'每侧 3 组 × 10-12 次',
   tips:['往前跨一大步，前腿膝盖不要超过脚尖太多','后腿膝盖往地面下沉，身体保持直立','重心落在两腿中间，别全压在前脚'],
   A:{r:[96,100], sp:2, aA:[170,0], aB:[174,4], lA:[178,0], lB:[182,2]},
   B:{r:[96,120], sp:6, aA:[172,-6], aB:[176,-2], lA:[150,55], lB:[205,35]}},
  {id:'glute_bridge', name:'臀桥', part:'臀', dose:'4 组 × 15-20 次',
   tips:['躺下屈膝，脚跟离臀部一掌距离','用臀部发力把髋顶起来，顶到最高停 1 秒','顶点时别用腰顶，感觉是屁股在夹'],
   A:{r:[92,124], sp:88, aA:[272,-14], aB:[276,-10], lA:[300,80], lB:[304,78]},
   B:{r:[92,110], sp:80, aA:[272,-14], aB:[276,-10], lA:[330,55], lB:[334,53]}},
  {id:'wall_sit', name:'靠墙静蹲', part:'腿', dose:'3 组 × 40-60 秒',
   tips:['背贴墙，屈膝到 90° 左右','膝盖在脚踝正上方，别超过脚尖','坚持住，这是静态动作，不需要动'],
   A:{r:[96,126], sp:8, aA:[176,0], aB:[180,4], lA:[120,60], lB:[124,58]},
   B:{r:[96,120], sp:8, aA:[176,0], aB:[180,4], lA:[124,58], lB:[128,56]}},
  {id:'calf_raise', name:'提踵（练小腿）', part:'腿', dose:'4 组 × 15-20 次',
   tips:['踮到最高停 1 秒，再慢慢落下','可以扶着墙保持平衡','站在台阶边缘做，活动范围更大'],
   A:{r:[100,100], sp:2, aA:[172,0], aB:[176,4], lA:[180,0], lB:[184,2]},
   B:{r:[100,86], sp:2, aA:[174,0], aB:[178,4], lA:[178,0], lB:[182,2]}},
  {id:'bulgarian', name:'保加利亚分腿蹲', part:'腿', dose:'每侧 3 组 × 8-10 次',
   tips:['后脚搭在椅子或沙发上','前腿单独发力下蹲，重心垂直上下','这个动作很难，先徒手再考虑负重'],
   A:{r:[96,96], sp:4, aA:[170,0], aB:[174,4], lA:[178,0], lB:[182,2]},
   B:{r:[96,124], sp:8, aA:[172,-4], aB:[176,0], lA:[150,60], lB:[240,-30]}},

  /* ---------------- 臀 ---------------- */
  {id:'bridge_single', name:'单腿臀桥', part:'臀', dose:'每侧 3 组 × 10-12 次',
   tips:['一条腿伸直，另一条屈膝踩地','用踩地那条腿的臀部把髋顶起来','两边感觉差别大很正常，弱的那侧多做一组'],
   A:{r:[92,124], sp:92, aA:[272,-14], aB:[276,-10], lA:[300,-95], lB:[302,-2]},
   B:{r:[92,108], sp:86, aA:[272,-14], aB:[276,-10], lA:[268,-65], lB:[292,-8]}},
  {id:'side_leg', name:'站姿侧抬腿', part:'臀', dose:'每侧 3 组 × 15-20 次',
   tips:['站直，扶住墙或椅子保持平衡','一条腿向侧面抬起来，脚尖朝前','不要用身体侧倾来借力，慢上慢下'],
   A:{r:[100,100], sp:2, aA:[176,0], aB:[180,4], lA:[182,0], lB:[186,2]},
   B:{r:[100,100], sp:2, aA:[176,0], aB:[180,4], lA:[182,0], lB:[150,-34]}},
  {id:'donkey_kick', name:'四足跪姿后踢腿', part:'臀', dose:'每侧 3 组 × 12-15 次',
   tips:['双手双膝撑地，背保持平','一条腿屈膝往后上方踢，像蹬墙','顶点停一下再收回，别甩'],
   A:{r:[96,120], sp:80, aA:[184,-8], aB:[188,-4], lA:[209,-112], lB:[213,-110]},
   B:{r:[96,120], sp:80, aA:[184,-8], aB:[188,-4], lA:[209,-112], lB:[290,0]}},

  /* ---------------- 肩 ---------------- */
  {id:'lateral_raise', name:'哑铃侧平举', part:'肩', dose:'3-4 组 × 12-15 次',
   tips:['小重量就够，肩膀容易借力','抬到与肩同高，手心朝下','慢上慢下，别甩'],
   A:{r:[100,104], sp:2, aA:[176,0], aB:[180,4], lA:[180,0], lB:[184,2]},
   B:{r:[100,104], sp:2, aA:[95,-6], aB:[99,-2], lA:[180,0], lB:[184,2]}},
  {id:'front_raise', name:'哑铃前平举', part:'肩', dose:'3 组 × 12-15 次',
   tips:['抬到与肩同高，别过头','身体别后仰借力','也可以两个哑铃交替抬'],
   A:{r:[100,104], sp:2, aA:[176,0], aB:[180,4], lA:[180,0], lB:[184,2]},
   B:{r:[100,104], sp:2, aA:[92,-10], aB:[96,-6], lA:[180,0], lB:[184,2]}},
  {id:'shoulder_press', name:'哑铃推举', part:'肩', dose:'4 组 × 8-12 次',
   tips:['起始时哑铃在耳朵两侧，手心朝前','往上推到手臂接近伸直，别完全锁死','核心收紧，别塌腰'],
   A:{r:[100,104], sp:2, aA:[120,-95], aB:[124,-91], lA:[180,0], lB:[184,2]},
   B:{r:[100,104], sp:2, aA:[8,-8], aB:[12,-4], lA:[180,0], lB:[184,2]}},
  {id:'face_pull', name:'面拉（拉橡皮带/绳索）', part:'肩', dose:'3 组 × 15 次',
   tips:['拉向脸的方向，肘部打开、往上抬','主要练后肩和上背','重量不用大，感受背部夹'],
   A:{r:[100,104], sp:2, aA:[168,-10], aB:[172,-6], lA:[180,0], lB:[184,2]},
   B:{r:[100,104], sp:2, aA:[118,-95], aB:[122,-91], lA:[180,0], lB:[184,2]}},
  {id:'rear_fly', name:'俯身飞鸟', part:'肩', dose:'3 组 × 12-15 次',
   tips:['屈髋前倾，背保持平','手臂往两侧打开，像展翅','小重量，重点是后肩有感觉'],
   A:{r:[92,116], sp:50, aA:[178,0], aB:[182,4], lA:[172,-10], lB:[176,-8]},
   B:{r:[92,116], sp:50, aA:[105,-15], aB:[109,-11], lA:[172,-10], lB:[176,-8]}},

  /* ---------------- 手臂 ---------------- */
  {id:'curl', name:'哑铃弯举', part:'手臂', dose:'3-4 组 × 10-12 次',
   tips:['肘部夹住身体两侧，别往前甩','慢慢放下，别让哑铃自由落体','想练不同部位可以换握法'],
   A:{r:[100,100], sp:2, aA:[180,0], aB:[184,4], lA:[180,0], lB:[184,2]},
   B:{r:[100,100], sp:2, aA:[180,-115], aB:[184,-111], lA:[180,0], lB:[184,2]}},
  {id:'hammer_curl', name:'锤式弯举', part:'手臂', dose:'3 组 × 10-12 次',
   tips:['像握锤子一样竖着握哑铃','主要练手臂外侧和前臂','同样的重量会比普通弯举更吃力'],
   A:{r:[100,100], sp:2, aA:[180,0], aB:[184,4], lA:[180,0], lB:[184,2]},
   B:{r:[100,100], sp:2, aA:[180,-110], aB:[184,-106], lA:[180,0], lB:[184,2]}},
  {id:'dip_chair', name:'椅上臂屈伸', part:'手臂', dose:'3 组 × 10-15 次',
   tips:['背对椅子，手撑在椅面边缘','屈肘下沉到 90° 左右，再用手臂把自己撑起来','肩膀别耸，靠近身体'],
   A:{r:[104,130], sp:88, aA:[88,-90], aB:[92,-86], lA:[290,40], lB:[294,38]},
   B:{r:[104,146], sp:88, aA:[95,-35], aB:[99,-31], lA:[290,40], lB:[294,38]}},
  {id:'overhead_ext', name:'哑铃颈后臂屈伸', part:'手臂', dose:'3 组 × 12 次',
   tips:['双手捧一个哑铃举过头顶','只弯小臂，肘部保持朝上、别打开','练的是手臂后侧（拜拜肉那块）'],
   A:{r:[100,102], sp:2, aA:[8,-8], aB:[12,-4], lA:[180,0], lB:[184,2]},
   B:{r:[100,102], sp:2, aA:[10,-120], aB:[14,-116], lA:[180,0], lB:[184,2]}},

  /* ---------------- 核心 ---------------- */
  {id:'plank', name:'平板支撑', part:'核心', dose:'3 组 × 40-60 秒',
   tips:['肘部在肩膀正下方，身体一条直线','肚子收紧、屁股别翘也别塌','静态动作，能撑住就行'],
   A:{r:[92,124], sp:70, aA:[200,-72], aB:[204,-68], lA:[243,0], lB:[247,2]},
   B:{r:[92,122], sp:68, aA:[201,-72], aB:[205,-68], lA:[242,0], lB:[246,2]}},
  {id:'side_plank', name:'侧平板', part:'核心', dose:'每侧 2-3 组 × 30 秒',
   tips:['侧躺，用一只手肘撑起身体','身体从头到脚保持一条斜线','腰不要往下掉'],
   A:{r:[100,124], sp:96, aA:[180,-6], aB:[356,-6], lA:[254,0], lB:[258,2]},
   B:{r:[100,118], sp:96, aA:[182,-6], aB:[358,-6], lA:[256,0], lB:[260,2]}},
  {id:'crunch', name:'卷腹', part:'核心', dose:'3-4 组 × 15-20 次',
   tips:['屈膝躺下，手放耳侧（别抱头拉脖子）','用肚子发力把上背卷起来，不是把整个背坐起来','起身呼气，躺下吸气'],
   A:{r:[92,148], sp:95, aA:[170,-120], aB:[174,-116], lA:[300,80], lB:[304,78]},
   B:{r:[92,148], sp:60, aA:[150,-110], aB:[154,-106], lA:[300,80], lB:[304,78]}},
  {id:'leg_raise', name:'仰卧举腿', part:'核心', dose:'3 组 × 12-15 次',
   tips:['躺平，双腿伸直并拢','用下腹把腿抬起来，别甩','腰别离开地面，感觉腰酸就屈膝做'],
   A:{r:[94,134], sp:92, aA:[266,-18], aB:[270,-14], lA:[268,0], lB:[272,2]},
   B:{r:[94,134], sp:92, aA:[266,-18], aB:[270,-14], lA:[285,-45], lB:[289,-43]}},
  {id:'russian_twist', name:'俄罗斯转体', part:'核心', dose:'3 组 × 每侧 15 次',
   tips:['坐姿屈膝，上背后仰约 45°','双手在身前左右转动','慢一点，用腰腹带动，不是甩手'],
   A:{r:[98,120], sp:114, aA:[148,-24], aB:[152,-20], lA:[300,-95], lB:[304,-93]},
   B:{r:[98,120], sp:114, aA:[42,-24], aB:[46,-20], lA:[300,-95], lB:[304,-93]}},
  {id:'dead_bug', name:'死虫式', part:'核心', dose:'3 组 × 每侧 10 次',
   tips:['躺着，手脚都朝上，腰贴紧地面','对侧手脚慢慢伸出去，再收回来','全程腰不能离地，离了就说明做快了'],
   A:{r:[92,150], sp:92, aA:[352,-8], aB:[356,-4], lA:[350,-82], lB:[354,-80]},
   B:{r:[92,150], sp:92, aA:[352,-8], aB:[288,-8], lA:[268,6], lB:[354,-80]}},

  /* ---------------- 有氧 ---------------- */
  {id:'jumping_jack', name:'开合跳', part:'有氧', dose:'3 组 × 30-45 秒',
   tips:['跳起时双脚分开、双手举过头顶','落地轻一点，用前脚掌缓冲','膝盖不舒服就换成"左右开合步"'],
   A:{r:[100,104], sp:2, aA:[176,0], aB:[180,4], lA:[176,-4], lB:[184,4]},
   B:{r:[100,96], sp:2, aA:[8,-6], aB:[12,-2], lA:[155,-8], lB:[205,8]}},
  {id:'high_knee', name:'原地高抬腿', part:'有氧', dose:'3 组 × 30-45 秒',
   tips:['膝盖抬到腰部高度，手臂跟着摆','前脚掌着地，保持节奏','撑不住就放慢，别停'],
   A:{r:[100,100], sp:6, aA:[140,-75], aB:[215,-70], lA:[132,84], lB:[180,0]},
   B:{r:[100,100], sp:6, aA:[215,-70], aB:[140,-75], lA:[180,0], lB:[136,82]}},
  {id:'burpee', name:'波比跳', part:'有氧', dose:'3-4 组 × 8-12 次',
   tips:['下蹲 → 手撑地 → 腿往后跳成俯卧撑 → 收腿 → 跳起','整套动作要连贯，别停顿','很累很正常，宁可减次数也别做变形'],
   A:{r:[100,100], sp:4, aA:[172,0], aB:[176,4], lA:[180,0], lB:[184,2]},
   B:{r:[92,126], sp:72, aA:[182,-6], aB:[186,-2], lA:[244,0], lB:[248,2]}},
  {id:'jog', name:'原地慢跑', part:'有氧', dose:'10-20 分钟',
   tips:['抬头挺胸，手臂自然摆动','前脚掌先落地，别重重砸下去','呼吸有节奏，能说话的速度就对了'],
   A:{r:[100,100], sp:5, aA:[140,-70], aB:[212,-70], lA:[155,45], lB:[186,-6]},
   B:{r:[100,100], sp:5, aA:[212,-70], aB:[140,-70], lA:[186,-6], lB:[158,42]}},
  {id:'mountain_climber', name:'登山跑', part:'核心', dose:'3 组 × 30-40 秒',
   tips:['俯卧撑姿势撑住，交替把膝盖收到胸前','屁股别翘起来，身体保持一条线','节奏可以慢，但肚子要一直收紧'],
   A:{r:[92,118], sp:72, aA:[182,-6], aB:[186,-2], lA:[244,0], lB:[244,0]},
   B:{r:[92,118], sp:72, aA:[182,-6], aB:[186,-2], lA:[140,80], lB:[244,0]}},
  {id:'jump_rope', name:'跳绳', part:'有氧', dose:'5-10 分钟',
   tips:['手腕摇绳，不是整条胳膊甩','跳得低一点、频率快一点，比跳高更省力','穿有缓冲的鞋，保护膝盖'],
   A:{r:[100,96], sp:3, aA:[150,-30], aB:[210,-30], lA:[178,0], lB:[180,0]},
   B:{r:[100,86], sp:3, aA:[140,-60], aB:[220,-60], lA:[170,-8], lB:[186,8]}}
];
