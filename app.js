'use strict';
const Q = window.QUESTIONS, B = [], ROLES = window.CHARACTERS;
const KEY = 'anime-personality-v2', LEGACY_KEY = 'between-days-v1';
const DIMS = [['交流发起','更多回应','更多发起'],['事前安排','临近决定','提前安排'],['尝试新方式','熟悉方式','尝试新方式'],['判断前比较','较少比较','较多比较'],['当场表达分歧','稍后表达','当场表达'],['情绪回落速度','持续较久','较快回落']];
const E = window.createQuizEngine(Q, B, ROLES);
const $ = s => document.querySelector(s), el = $('#app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let storageOK = true, view = 'home', previous = 'home', advanceTimer = null, advancing = false;
function parseJSON(s) { try { return JSON.parse(s); } catch { return null; } }
let state = E.emptyState();
try { state = E.restore(parseJSON(localStorage.getItem(KEY)), parseJSON(localStorage.getItem(LEGACY_KEY))); }
catch { storageOK = false; }
function notify(text) {
  $('#notice').textContent = text;
  clearTimeout(notify.timer); notify.timer = setTimeout(() => $('#notice').textContent = '', 3200);
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { if (storageOK) notify('浏览器无法保存进度，当前仍可继续答题'); storageOK = false; }
}
function art() { return '<div class="art" aria-hidden="true"></div>'; }
function portraitMarkup(r) {
  const p = r && window.PORTRAITS?.[r.id];
  if (!p) return art();
  const [x,y,w,h] = p.crop;
  return `<div class="portrait-frame"><img class="portrait-image" src="${esc(p.src)}" alt="${esc(r.name)}的角色头像" width="${p.width}" height="${p.height}" style="width:${p.width/w*100}%;left:${-x/w*100}%;top:${-y/h*100}%"></div>`;
}
function loadPortrait(r) {
  const p = r && window.PORTRAITS?.[r.id];
  if (!p) return Promise.resolve(null);
  return new Promise(resolve => {
    const img = new Image(); let done = false;
    const finish = value => { if (done) return; done = true; clearTimeout(timer); resolve(value); };
    const timer = setTimeout(() => finish(null), 6000);
    img.onload = () => finish({img, p}); img.onerror = () => finish(null); img.src = p.src;
  });
}
function footer() { return '<footer class="footer"><button class="text-button" id="about">关于测试</button><span>仅供娱乐</span></footer>'; }
function show(nextView) {
  clearTimeout(advanceTimer); advancing = false; view = nextView;
  render(); window.scrollTo({top:0, behavior:'instant'});
  const title = el.querySelector('h1,h2');
  if (title) { title.tabIndex = -1; title.focus({preventScroll:true}); }
}
function render() {
  el.className = 'fade';
  if (view === 'home') home(); else if (view === 'quiz') quiz(); else if (view === 'result') result(); else about();
  $('#about')?.addEventListener('click', () => { previous = view; show('about'); });
}
function home() {
  const count = state.answers.filter(a => a !== null).length;
  el.innerHTML = `<section class="cover"><div class="wordmark">动漫人格测试</div><h1>测测你像哪个动漫角色</h1>${art()}<button class="primary" id="start">${count ? (state.completed ? '查看结果' : '继续测试') : '开始测试'}</button><p class="hint">36 道题 · 约 5—7 分钟</p>${count ? '<button class="text-button" id="reset">重新开始</button>' : ''}</section>${footer()}`;
  $('#start').onclick = () => {
    const migrated = state.migrated;
    state.migrated = false;
    const destination = E.route(state); save(); show(destination);
    if (migrated) notify('已沿用新版保留题目的旧回答');
  };
  $('#reset')?.addEventListener('click', reset);
}
function reset() { state = E.emptyState(); save(); show('quiz'); }
function quiz() {
  const index = state.index, q = Q[index], answer = state.answers[index];
  const total = Q.length, position = state.index, done = state.answers.filter(a => a !== null).length;
  el.innerHTML = `<header class="top"><button class="back" id="back" aria-label="${state.index ? '上一题' : '返回首页'}">←</button><span class="counter">${position+1} / ${total}</span><span class="brand">动漫人格测试</span></header><div class="progress" role="progressbar" aria-label="答题进度" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i style="width:${done/total*100}%"></i></div><section class="question">${art()}<p class="scene">${esc(q.scene)}，</p><h2>${esc(q.text)}</h2></section><div class="options" role="group" aria-label="最近一个月的发生频率">${['几乎没有','较少','约一半时候','较多','几乎每次'].map((text,i) => `<button class="option" data-value="${i}" aria-pressed="${answer===i}"><span class="dot"></span><span>${text}</span></button>`).join('')}</div><div class="skip"><button data-skip="none" aria-pressed="${answer==='none'||answer==='unsure'}">没经历过 / 记不清</button></div><p class="qfoot">按最近一个月的实际情况选择</p>`;
  $('#back').onclick = () => { const destination = E.back(state); save(); show(destination); };
  el.querySelectorAll('[data-value]').forEach(button => button.onclick = () => pick(Number(button.dataset.value)));
  el.querySelectorAll('[data-skip]').forEach(button => button.onclick = () => pick('none'));
}
function pick(answer) {
  if (advancing) return;
  advancing = true; E.record(state, answer); save();
  el.querySelectorAll('[data-value]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.value) === answer)));
  el.querySelectorAll('[data-skip]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.skip === answer)));
  advanceTimer = setTimeout(() => { const destination = E.next(state); save(); show(destination); }, 220);
}
function calculate(answers) { return E.calculate(answers); }
function rank(scores) { return E.rank(scores); }
function tendency(s){return s.value===null?'相关回答不足':s.value<40?'偏向'+DIMS[s.d][1]:s.value>60?'偏向'+DIMS[s.d][2]:'没有明显倾向';}
function summary(scores){const strongest=scores.map((s,d)=>({...s,d})).filter(s=>s.value!==null&&Math.abs(s.value-50)>10).sort((a,b)=>Math.abs(b.value-50)-Math.abs(a.value-50)).slice(0,2);return strongest.length?strongest.map(tendency).join('，'):'你的回答中，暂时没有特别突出的单一倾向';}

function matchLine(scores,r){
 const words=[['先观察再加入','主动开启交流'],['边做边安排','提前安排步骤'],['偏爱熟悉方式','愿意尝试新事'],['较少反复比较','决定前比较选项'],['整理后再表达','当场说出意见'],['情绪停留较久','情绪较快回落']];
 const unknown=window.MATCH_EVIDENCE?.unknownDimensions[r.id]||[];
 const parts=scores.map((s,d)=>({value:s.value,d,gap:Math.abs(s.value-r.v[d])})).filter(s=>!unknown.includes(s.d)&&s.value!==null&&(s.value<40||s.value>60)&&s.gap<=20).sort((a,b)=>(Math.abs(b.value-50)-b.gap)-(Math.abs(a.value-50)-a.gap)||a.d-b.d).slice(0,2);
 return parts.length?'相似点：'+parts.map(s=>words[s.d][s.value>60?1:0]).join(' · '):'';
}

function roleExplanation(r,scores) {
  return `<p class="work">${esc(r.work)}</p><p class="small">参考阶段：${esc(r.period)}</p><p class="description">${esc(r.desc)}</p>${matchLine(scores,r)?`<p class="similarity">${esc(matchLine(scores,r))}</p>`:''}<p class="small">也要一起看：${esc(r.counterexample)}</p>`;
}
function result() {
  const scores=calculate(state.answers), assessment=E.assess(scores), kind=assessment.kind;
  const r=assessment.primary?.r||null;
  let content='';
  if(r) content=`<p class="work">${esc(r.work)}</p><p class="description">${esc(r.desc)}</p>${matchLine(scores,r)?`<p class="similarity">${esc(matchLine(scores,r))}</p>`:''}${assessment.note?`<p class="small match-note">${esc(assessment.note)}</p>`:''}<details class="role-explanation"><summary>看看角色解读</summary><p class="small">参考阶段：${esc(r.period)}</p><p class="small">也要一起看：${esc(r.counterexample)}</p></details>${assessment.alternatives.length?`<details class="other-matches"><summary>也有些相似</summary><div class="alternative-names">${assessment.alternatives.map(x=>`<button data-candidate="${esc(x.r.id)}" aria-expanded="false">${esc(x.r.name)}</button>`).join('')}</div><div id="candidate-detail" class="candidate-detail" hidden></div></details>`:''}`;
  else content='<p class="description">有些维度的实际经历偏少，还不能匹配角色。可以返回，补充有真实经历的题目。</p>';
  el.innerHTML=`<section class="result-head"><p class="res-label">${r?'这次最接近你的角色':'你的日常画像'}</p>${r?portraitMarkup(r):art()}<h1>${esc(r?r.name:'暂时还看不清')}</h1>${content}</section><section class="chart-box"><h3>你的六个日常侧面</h3><div class="chart">${scores.map((s,d)=>`<div class="bar-item"><div class="bar-track"><i style="height:${s.value??0}%"></i></div><span>${['主动交流','提前安排','尝试新事','比较选项','当场表达','情绪回落'][d]}</span>${s.value===null?'<small>不足</small>':''}</div>`).join('')}</div></section><p class="small answer-count">本次：${Q.length} 道题</p><div class="actions"><button class="primary" id="share">保存结果图片</button><button class="secondary" id="review">${kind==='insufficient'?'返回补充':'再测一次'}</button></div><div id="share-area"></div>${footer()}`;
  el.querySelectorAll('.portrait-image').forEach(portrait=>{portrait.onerror=()=>{const frame=portrait.parentElement;const blank=document.createElement('div');blank.className='art';blank.setAttribute('aria-hidden','true');frame.replaceWith(blank);};});
  el.querySelectorAll('[data-candidate]').forEach(button=>button.onclick=()=>{
    const panel=$('#candidate-detail'),expanded=button.getAttribute('aria-expanded')==='true';
    el.querySelectorAll('[data-candidate]').forEach(b=>b.setAttribute('aria-expanded','false'));
    panel.hidden=expanded;
    if(!expanded){button.setAttribute('aria-expanded','true');const selected=assessment.alternatives.find(x=>x.r.id===button.dataset.candidate).r;panel.innerHTML=`<h2>${esc(selected.name)}</h2>`+roleExplanation(selected,scores);}
  });
  $('#review').onclick=()=>{
    if(kind!=='insufficient')reset();
    else{const dim=scores.findIndex(s=>s.value===null);state.completed=false;state.index=Q.findIndex((q,i)=>q.dim===dim&&typeof state.answers[i]!=='number');save();show('quiz');}
  };
  $('#share').onclick=async()=>{const button=$('#share');if(button.disabled)return;button.disabled=true;try{await shareCard(scores,assessment);}finally{button.disabled=false;}};
}
function about() {
  el.innerHTML = `<div class="about"><button class="back" id="return">← 返回</button><h1>关于测试</h1><p>回想最近一个月的日常行为，选择实际发生的频率。没有经历过的情况可以跳过。</p><p>全程固定 36 题，做完即可查看结果，不追加补充题。题目覆盖六个日常侧面；有效回答足够后，选出一位本次最接近的角色。</p><p>每个维度有 6 道题，至少 4 道有效回答才展示。不把没经历过记成中间分。</p><p>这是趣味测试，目前包含 ${ROLES.length} 位角色的编辑试配，不是经过验证的心理量表。结果仅供娱乐参考；增加题数不等于已证明更准确。</p><p>答案仅保存在当前浏览器里。旧版答过、且保留在新版中的题目会沿用回答，其余题目需要补答。分享图片不包含完整答题记录。</p><p>视觉参考 <a href="https://exoticflicker.github.io/cati/" target="_blank" rel="noopener noreferrer">cati</a>。</p><details class="image-credits"><summary>角色图片与匹配说明</summary><p>角色图片随网站提供，版权归各作品权利方。多数身份与图片索引来自 <a href="https://anilist.co/" target="_blank" rel="noopener noreferrer">AniList</a>；惠惠、利威尔、红莉栖保留原官方样例，白发金木采用√A官方角色图。配图不改变人格解读的参考阶段。</p><p>当前按热度与明确点名保留80位角色，热度仅用于选角。六个日常侧面不能完整区分这些人物。按六维距离给出一位首选，相近角色折叠展示；倾向均衡、相似有限或资料不足时会简短说明。首选是本次编辑试配中的最接近者，不代表唯一的人格归属。没有随机抽取角色，也不按人气分配结果。</p></details></div>`;
  $('#return').onclick = () => show(previous);
}
function publicURL(){const u=new URL(location.href);return ['http:','https:'].includes(u.protocol)&&!['localhost','127.0.0.1','::1','[::1]'].includes(u.hostname)&&!/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)?u.origin+u.pathname:null;}
async function shareLink(){const url=publicURL();if(!url){notify('当前是本地预览，部署后才会有可分享的公网链接');return;}try{if(navigator.share){await navigator.share({title:'动漫人格测试',text:'你平时的样子，像故事里的谁？',url});}else{await navigator.clipboard.writeText(url);notify('测试链接已复制');}}catch(e){if(e.name!=='AbortError'){const area=$('#share-area');area.replaceChildren();const p=document.createElement('p');p.textContent='可长按或选中复制：'+url;area.append(p);}}}
async function shareCard(scores,assessment) {
  const clear=assessment.kind==='match';
  const candidates=assessment.candidates;
  const portraits=await Promise.all(candidates.map(x=>loadPortrait(x.r)));
  const c=document.createElement('canvas');c.width=900;c.height=1200;
  const ctx=c.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle='#000000';ctx.strokeRect(35,35,830,c.height-70);ctx.fillStyle='#000000';ctx.font='22px sans-serif';ctx.fillText('动漫人格测试',70,100);
  ctx.font='bold 48px sans-serif';ctx.fillText('你平时的样子，',70,205);ctx.fillText('也有故事的回声。',70,270);
  function drawPortrait(p,x,y,size){if(!p)return;const[sx,sy,w,h]=p.p.crop;ctx.save();ctx.filter='grayscale(1)';ctx.drawImage(p.img,sx,sy,w,h,x,y,size,size);ctx.restore();ctx.strokeStyle='#000000';ctx.strokeRect(x,y,size,size);}
  ctx.font='bold 32px sans-serif';
  if(clear){drawPortrait(portraits[0],650,140,180);ctx.fillText('这次最接近的角色：'+candidates[0].r.name,70,355,760);ctx.font='20px sans-serif';ctx.fillText(candidates[0].r.work,70,395,760);if(assessment.note){ctx.font='18px sans-serif';ctx.fillText(assessment.note,70,430,760);}}
  else{ctx.fillText('我的六维日常画像',70,355);ctx.font='18px sans-serif';ctx.fillText('相关经历不足，暂时还不能匹配角色。',70,395,760);}
  const chartTop=clear?490:440;
  scores.forEach((s,d)=>{const y=chartTop+d*80;ctx.font='22px sans-serif';ctx.fillStyle='#000000';ctx.fillText(DIMS[d][0],70,y);ctx.font='19px sans-serif';ctx.fillText(tendency({...s,d}),480,y);ctx.strokeStyle='#000000';ctx.beginPath();ctx.moveTo(70,y+20);ctx.lineTo(830,y+20);ctx.stroke();if(s.value!==null){ctx.beginPath();ctx.arc(70+s.value*7.6,y+20,7,0,Math.PI*2);ctx.fill();}});
  const foot=c.height-170;ctx.font='18px sans-serif';ctx.fillText('基于近期行为的趣味联想 · 编辑试配版',70,foot);ctx.fillText('每一种日常，都有自己的形状。',70,foot+40);
  if(portraits.some(Boolean)){ctx.font='13px sans-serif';ctx.fillText('角色插画版权归原权利方',70,foot+70);}
  const url=publicURL();if(url){ctx.font='14px sans-serif';ctx.fillText(url,70,c.height-80,750);}
  const area=$('#share-area');area.replaceChildren();const img=new Image();img.alt='动漫人格测试结果分享卡片';img.className='image-preview';img.src=c.toDataURL('image/png');area.append(img);
  const a=document.createElement('a');a.href=img.src;a.download='动漫人格测试-我的画像.png';a.className='secondary';a.textContent='下载分享图片 ↓';area.append(a);
  const p=document.createElement('p');p.className='small';p.textContent='也可长按图片保存。分享卡片不包含完整答题记录。';area.append(p);area.scrollIntoView({behavior:'smooth'});
}

window.TestCore = {calculate, rank, matchLine, Q, B, ROLES, E};
render();
