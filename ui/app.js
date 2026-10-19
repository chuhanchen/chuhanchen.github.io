(function(){
'use strict';
var $=function(id){return document.getElementById(id);};
var CHANNELS=[{id:'home',name:'今日荐读',short:'荐读'},{id:'news',name:'天下观察',short:'天下'},{id:'military',name:'军情与战史',short:'军事'},{id:'history',name:'百年中国',short:'历史'},{id:'culture',name:'文娱故事',short:'文娱'}];
var state={articles:[],channel:'home',reading:null,refreshing:false,saved:[],read:[],font:24,night:false,lastUpdate:0,revision:'',editionIds:[],pendingRender:false};
var db=null,toastTimer=0,homeScroll=0;
var bundledImages={};
(window.CJ_SEED||[]).forEach(function(a){[a.cover].concat((a.blocks||[]).filter(function(b){return b.type==='image';}).map(function(b){return b.src;})).forEach(function(u){if(/^assets\/[a-f0-9]{64}\.jpg$/.test(u||''))bundledImages['/media/'+u.slice(7)]=u;});});
function text(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function safeUrl(u){return /^https?:\/\//i.test(u||'')?u:'';}
function imgSrc(u){return typeof u==='string'&&(/^(?:assets\/[a-zA-Z0-9_.-]+|\/media\/[a-f0-9]{64}\.(?:jpg|png|webp|gif|avif))$/.test(u))?(bundledImages[u]||u):'';}
function idFor(u){var h=2166136261;for(var i=0;i<u.length;i++){h^=u.charCodeAt(i);h=Math.imul(h,16777619);}return'a'+(h>>>0).toString(36);}
function channelName(id){return(CHANNELS.find(function(c){return c.id===id;})||{name:'精选文章'}).name;}
function isValid(a){return a&&a.selectionVersion===2&&a.complete===true&&a.title&&safeUrl(a.url)&&Array.isArray(a.blocks)&&a.blocks.filter(function(b){return b.type==='p'&&b.text&&b.text.trim().length>3;}).length>=2&&a.blocks.reduce(function(n,b){return n+((b.type==='p'||b.type==='h2')&&b.text?b.text.length:0);},0)>=180;}
function normalize(a,seed){a.id=a.id||idFor(a.url);a.isSeed=!!seed;a.addedAt=a.addedAt||Date.now();a.rank=typeof a.rank==='number'?a.rank:999;a.channel=a.channel||'news';a.source=a.source||'原文来源';a.published=a.published||'';a.cover=a.cover||'';return a;}
function prefSave(){try{localStorage.setItem('cj4_prefs',JSON.stringify({font:state.font,night:state.night,saved:state.saved,read:state.read,lastUpdate:state.lastUpdate,revision:state.revision,editionIds:state.editionIds}));}catch(e){}}
function prefsLoad(){try{var p=JSON.parse(localStorage.getItem('cj4_prefs')||'{}');state.font=Math.min(36,Math.max(20,p.font||24));state.night=!!p.night;state.saved=Array.isArray(p.saved)?p.saved:[];state.read=Array.isArray(p.read)?p.read:[];state.lastUpdate=p.lastUpdate||0;state.revision=p.revision||'';state.editionIds=Array.isArray(p.editionIds)?p.editionIds:[];}catch(e){}applySettings();}
function applySettings(){document.documentElement.style.setProperty('--reader-size',state.font+'px');document.body.classList.toggle('night',state.night);$('theme').textContent=state.night?'☀ 日间':'☾ 夜间';$('smaller').disabled=state.font<=20;$('larger').disabled=state.font>=36;}
function openDB(){return new Promise(function(resolve){if(!window.indexedDB){resolve([]);return;}var done=false,timer=setTimeout(function(){finish([]);},3000);function finish(rows){if(done)return;done=true;clearTimeout(timer);resolve(rows||[]);}try{var req=indexedDB.open('chenjiang-magazine-v4',1);req.onblocked=function(){finish([]);};req.onupgradeneeded=function(){if(!req.result.objectStoreNames.contains('articles'))req.result.createObjectStore('articles',{keyPath:'id'});};req.onerror=function(){finish([]);};req.onsuccess=function(){db=req.result;try{var store=db.transaction('articles').objectStore('articles');if(store.getAll){var q=store.getAll();q.onsuccess=function(){finish(q.result||[]);};q.onerror=function(){finish([]);};}else{var rows=[],cursor=store.openCursor();cursor.onsuccess=function(e){var c=e.target.result;if(c){rows.push(c.value);c.continue();}else finish(rows);};cursor.onerror=function(){finish([]);};}}catch(e){finish([]);}};}catch(e){finish([]);}});}
function storeArticle(a){if(!db)return;try{db.transaction('articles','readwrite').objectStore('articles').put(a);}catch(e){}}
function purgeArchive(){if(!db)return;var keep=state.articles.filter(function(a){return !a.isSeed;}).sort(function(a,b){return b.addedAt-a.addedAt;});var expired=keep.slice(180).filter(function(a){return state.saved.indexOf(a.id)<0;});expired.forEach(function(a){try{db.transaction('articles','readwrite').objectStore('articles').delete(a.id);}catch(e){}});state.articles=state.articles.filter(function(a){return !expired.some(function(x){return x.id===a.id;});});}
function dateLabel(s){var m=String(s||'').match(/(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})/);return m?(+m[1]!==new Date().getFullYear()?m[1]+'年':'')+ +m[2]+'月'+ +m[3]+'日':'';}
function fullDate(s){var m=String(s||'').match(/(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})(?:日)?(?:[T\s]+(\d{1,2}:\d{2}))?/);return m?m[1]+'年'+ +m[2]+'月'+ +m[3]+'日'+(m[4]?' '+m[4]:''):String(s||'');}
function sourceDisplay(a){var s=a.source||'原文来源';if(a.hotTopic)return s+' · 关联头条热点';if(a.discovery==='360首页推荐'&&s.indexOf('360')<0)return s+' · 360推荐';return s;}
function articleMeta(a){var bits=['<span class="category">'+text(channelName(a.channel))+'</span>','<span>'+text(sourceDisplay(a))+'</span>'];var d=dateLabel(a.published);if(d)bits.push('<span>'+d+'</span>');return bits.join('<span class="dot"></span>');}
function excerpt(a){return a.blocks.filter(function(b){return b.type==='p';}).map(function(b){return b.text;}).join(' ').slice(0,130);}
function story(a,kind){var u=imgSrc(a.cover),cls='story '+(kind||'')+(u?'':' no-image');return'<button class="'+cls+'" data-article="'+text(a.id)+'" aria-label="阅读：'+text(a.title)+'">'+(u?'<div class="image-wrap"><img src="'+text(u)+'" alt="" loading="'+(kind==='hero'?'eager':'lazy')+'" '+(kind==='hero'?'fetchpriority="high"':'')+' data-cover="1"></div>':'')+'<div class="story-content"><h3>'+text(a.title)+'</h3>'+(kind==='hero'?'<p class="excerpt">'+text(excerpt(a))+'</p>':'')+'<div class="story-meta">'+articleMeta(a)+'</div></div></button>';}
function sortedArticles(){return state.articles.slice().sort(function(a,b){return a.rank-b.rank;});}
function rankedHome(all){var result=[],groups={};CHANNELS.slice(1).forEach(function(c){var group=all.filter(function(a){return a.channel===c.id;});groups[c.id]=group.filter(function(a){return !!a.cover;}).concat(group.filter(function(a){return !a.cover;}));});var order=['news','military','culture','history'];for(var i=0;i<Math.max(5,all.length);i++)order.forEach(function(c){if(groups[c][i])result.push(groups[c][i]);});return result;}
function nav(){var compact=window.innerWidth<=620;$('channels').innerHTML=CHANNELS.map(function(c){return'<button class="channel'+(state.channel===c.id?' active':'')+'" data-channel="'+c.id+'" aria-current="'+(state.channel===c.id?'page':'false')+'">'+(compact?c.short:c.name)+'</button>';}).join('');}
function setStatus(s,busy){$('status').textContent=s;$('status').classList.toggle('busy',!!busy);}
function defaultStatus(){if(state.refreshing)return;var count=state.articles.length;if(state.lastUpdate){var d=new Date(state.lastUpdate);setStatus('本机可读 '+count+' 篇 · '+('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)+' 更新');}else setStatus('本机可读 '+count+' 篇 · 联网后自动添新');}
function render(){nav();$('channel-title').textContent=state.channel==='saved'?'我的收藏':channelName(state.channel);$('eyebrow').textContent=state.channel==='saved'?'MY READING COLLECTION':'CHENJIANG MAGAZINE';var all=sortedArticles(),h='';if(state.channel==='home'){
  var top=rankedHome(all).slice(0,4),used=top.map(function(a){return a.id;});if(top.length)h='<div class="feature-grid">'+story(top[0],'hero')+'<div class="side-stories">'+top.slice(1).map(function(a){return story(a,'compact');}).join('')+'</div></div>';
  CHANNELS.slice(1).forEach(function(c){var arr=all.filter(function(a){return a.channel===c.id&&used.indexOf(a.id)<0;}).slice(0,3);if(!arr.length)arr=all.filter(function(a){return a.channel===c.id;}).slice(0,3);if(arr.length)h+='<section class="mag-section"><div class="section-heading"><h3>'+c.name+'</h3><button data-channel="'+c.id+'">更多文章 ›</button></div><div class="story-grid">'+arr.map(function(a){return story(a);}).join('')+'</div></section>';});
}else{var list=all.filter(function(a){return state.channel==='saved'?state.saved.indexOf(a.id)>=0:a.channel===state.channel;});if(state.channel==='saved')h='<div class="saved-heading">点文章里的“收藏”，喜欢的图文就留在这里。</div>';h+=list.length?'<div class="story-grid">'+list.map(function(a){return story(a);}).join('')+'</div>':'<div class="empty">'+(state.channel==='saved'?'还没有收藏文章':'本栏文章正在准备')+'<p>'+(state.channel==='saved'?'阅读时轻点右上角“☆ 收藏”即可。':'可先去今日荐读看看，或点击更新文章。')+'</p><button class="primary-btn" data-channel="home">去今日荐读</button></div>';}
  $('feed').innerHTML=h;defaultStatus();performance.mark('cj-feed-rendered');
}
function switchChannel(id){if(!CHANNELS.some(function(c){return c.id===id;})&&id!=='saved')return;state.channel=id;render();window.scrollTo(0,0);}
function toast(s){clearTimeout(toastTimer);$('toast').textContent=s;$('toast').hidden=false;toastTimer=setTimeout(function(){$('toast').hidden=true;},2600);}
function blockHTML(b){var type=b.type;if(type==='image'){var src=imgSrc(b.src||b.url);return src?'<figure><img src="'+text(src)+'" alt="'+text(b.alt||'文章配图')+'" loading="lazy" data-body-image="1">'+(b.caption?'<figcaption>'+text(b.caption)+'</figcaption>':'')+'</figure>':'';}if(type==='caption')return'<figcaption>'+text(b.text)+'</figcaption>';if(type==='h2'||type==='h3'||type==='h')return'<h2>'+text(b.text)+'</h2>';if(type==='p'&&b.text)return'<p>'+text(b.text)+'</p>';return'';}
function openArticle(id,replace){var a=state.articles.find(function(x){return x.id===id;});if(!a||!isValid(a)){toast('这篇文章还没有准备好，请先读其他文章。');return;}if(!state.reading)homeScroll=window.scrollY;state.reading=a;document.body.classList.add('reader-open');$('reader').hidden=false;$('article').innerHTML='<div class="article-kicker">'+text(channelName(a.channel))+'</div><h1>'+text(a.title)+'</h1><div class="article-byline"><span>'+text(sourceDisplay(a))+'</span>'+(a.published?'<span>'+text(fullDate(a.published))+'</span>':'')+'<span>正文已存本机</span><button id="original">原文出处 ↗</button></div><div class="article-body">'+a.blocks.map(blockHTML).join('')+'</div><div class="source-note">内容来源：'+text(a.source)+'。文章按原文整理阅读，版权归原作者及来源媒体所有。'+(a.isSeed?'此篇为首期精选，联网更新后会继续加入新内容。':'')+'</div>';$('article-scroll').scrollTop=0;$('progress-bar').style.width='0%';updateBookmark();if(state.read.indexOf(a.id)<0){state.read.push(a.id);if(state.read.length>500)state.read.shift();prefSave();}if(!replace){try{history.pushState({reader:true},'',location.pathname+location.search+'#read');}catch(e){}}$('back').focus({preventScroll:true});performance.mark('cj-article-open');
}
function closeReader(fromHistory){if(!state.reading)return;state.reading=null;$('reader').hidden=true;document.body.classList.remove('reader-open');if(state.pendingRender){state.pendingRender=false;render();}window.scrollTo(0,homeScroll);if(!fromHistory&&location.hash==='#read'){history.back();}}
function updateBookmark(){var yes=state.reading&&state.saved.indexOf(state.reading.id)>=0;$('bookmark').textContent=yes?'★ 已藏':'☆ 收藏';$('bookmark').classList.toggle('selected',!!yes);}
function toggleBookmark(){if(!state.reading)return;var id=state.reading.id,i=state.saved.indexOf(id);if(i<0)state.saved.push(id);else state.saved.splice(i,1);prefSave();updateBookmark();toast(i<0?'已收藏，可在杂志首页查看。':'已取消收藏。');if(state.channel==='saved')render();}
function nextArticle(){var list=rankedHome(sortedArticles()),a=list.find(function(x){return x.id!==state.reading.id&&state.read.indexOf(x.id)<0;});if(!a){var i=list.findIndex(function(x){return x.id===state.reading.id;});a=list[(i+1)%list.length];}if(a)openArticle(a.id,true);}
window.CJBack=function(){if(state.reading){closeReader();return true;}if(state.channel!=='home'){switchChannel('home');return true;}return false;};
async function refresh(manual){
  if(state.refreshing){if(manual)toast('正在查看有没有新文章，现有文章可以直接读。');return;}
  state.refreshing=true;$('refresh').disabled=true;
  try{
    var result=await CJHost.edition(state.revision);
    if(result.unchanged){if(manual)toast('已经是最新一期。');return;}
    if(!result.ok||!result.data)throw new Error(result.error||'暂时无法更新');
    var edition=result.data;
    if(edition.schemaVersion!==1||!Array.isArray(edition.articles)||typeof edition.revision!=='string')throw new Error('内容格式无效');
    var incoming=edition.articles.filter(isValid);
    if(incoming.length!==edition.articles.length||incoming.length<8)throw new Error('本期内容尚未准备完整');
    if(edition.revision===state.revision){if(manual)toast(result.stale?'暂时离线，已存文章照常阅读。':'已经是最新一期。');return;}
    var keep=state.articles.filter(function(a){return state.saved.indexOf(a.id)>=0&&!incoming.some(function(n){return n.id===a.id;});});
    state.articles=incoming.map(function(a,i){a.rank=i;return normalize(a,false);}).concat(keep);
    state.revision=edition.revision;state.editionIds=incoming.map(function(a){return a.id;});state.lastUpdate=Date.parse(edition.generatedAt)||Date.now();
    state.articles.forEach(storeArticle);prefSave();purgeArchive();
    if(state.reading)state.pendingRender=true;else{var scroll=window.scrollY;render();window.scrollTo(0,scroll);}
    if(manual)toast(result.stale?'暂时离线，继续阅读已存文章。':'新一期已备好，共 '+incoming.length+' 篇。');
  }catch(e){if(manual)toast('这次暂时没有更新，已存的文章照常读。');}
  finally{state.refreshing=false;$('refresh').disabled=false;defaultStatus();}
}

document.addEventListener('click',function(e){var card=e.target.closest('[data-article]');if(card){openArticle(card.getAttribute('data-article'));return;}var channel=e.target.closest('[data-channel]');if(channel){switchChannel(channel.getAttribute('data-channel'));return;}if(e.target.id==='original'&&state.reading&&safeUrl(state.reading.url)){if(CJHost.openOriginal)CJHost.openOriginal(state.reading.url);else CJHost.openExternal(state.reading.url);}});
document.addEventListener('error',function(e){var im=e.target;if(im.tagName!=='IMG')return;if(im.dataset.cover){var wrap=im.closest('.image-wrap');if(wrap)wrap.style.display='none';var card=im.closest('.story');if(card)card.classList.add('no-image');}else if(im.dataset.bodyImage){var note=document.createElement('div');note.className='image-missing';note.textContent='这张配图暂未下载，文字可继续阅读。';im.replaceWith(note);}},true);
$('refresh').onclick=function(){refresh(true);};$('more').onclick=function(){refresh(true);};$('saved').onclick=function(){switchChannel('saved');};$('back').onclick=function(){closeReader();};$('return-bottom').onclick=function(){closeReader();};$('bookmark').onclick=toggleBookmark;$('next-article').onclick=nextArticle;$('smaller').onclick=function(){state.font=Math.max(20,state.font-2);applySettings();prefSave();};$('larger').onclick=function(){state.font=Math.min(36,state.font+2);applySettings();prefSave();};$('theme').onclick=function(){state.night=!state.night;applySettings();prefSave();};
$('article-scroll').onscroll=function(){var e=this,n=e.scrollHeight-e.clientHeight;$('progress-bar').style.width=(n>0?Math.min(100,e.scrollTop/n*100):100)+'%';};window.addEventListener('popstate',function(){if(state.reading)closeReader(true);});document.addEventListener('keydown',function(e){if(e.key==='Escape')window.CJBack();});window.addEventListener('resize',nav);
async function init(){
  performance.mark('cj-init');prefsLoad();var d=new Date();$('date').textContent=d.getFullYear()+'年'+(d.getMonth()+1)+'月'+d.getDate()+'日';
  state.articles=(window.CJ_SEED||[]).filter(isValid).map(function(a,i){a.rank=i;return normalize(a,true);});render();
  var cache=(await openDB()).filter(isValid),ids=state.editionIds;
  if(!ids.length||!ids.every(function(id){return cache.some(function(a){return a.id===id;});}))state.revision='';
  if(cache.length){cache=cache.filter(function(a){return !ids.length||ids.indexOf(a.id)>=0||state.saved.indexOf(a.id)>=0;});if(cache.length)state.articles=cache.map(function(a){return normalize(a,false);}).concat(state.articles.filter(function(a){return !cache.some(function(c){return c.id===a.id;});}));render();}
  if(location.hash==='#read')history.replaceState({},'',location.pathname+location.search);
  setTimeout(function(){refresh(false);},300);
  setInterval(function(){if(!document.hidden)refresh(false);},300000);
  window.addEventListener('online',function(){refresh(false);});
  document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh(false);});
  if(!window.CJNative&&'serviceWorker'in navigator&&/^https?:$/.test(location.protocol))navigator.serviceWorker.register('/sw.js').catch(function(){});
}
init();
})();
