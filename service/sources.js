'use strict';
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const path=require('node:path');
const {createDecipheriv}=require('node:crypto');
const editorial=require('./editorial');
const realm=new JSDOM('<!doctype html>',{runScripts:'outside-only'});
realm.window.eval(fs.readFileSync(path.join(__dirname,'extractor-legacy.js'),'utf8'));
const legacy=realm.window.CJContent;
const SOURCES=[
  {id:'toutiao',platform:'toutiao',name:'今日头条热榜',channel:'news',kind:'signals',url:'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc'},
  {id:'360-home',platform:'360',name:'360首页推荐',channel:'news',kind:'360',url:'https://hao.360.com/'},
  {id:'guancha',platform:'guancha',name:'观察者网',channel:'news',url:'https://www.guancha.cn/'},
  {id:'ifeng-news',platform:'ifeng',name:'凤凰资讯',channel:'news',url:'https://news.ifeng.com/'},
  {id:'ifeng-mil',platform:'ifeng',name:'凤凰军事',channel:'military',url:'https://mil.ifeng.com/'},
  {id:'ifeng-history',platform:'ifeng',name:'凤凰历史',channel:'history',url:'https://history.ifeng.com/'},
  {id:'ifeng-ent',platform:'ifeng',name:'凤凰娱乐',channel:'culture',url:'https://ent.ifeng.com/'},
  {id:'sohu-history',platform:'sohu',name:'搜狐历史',channel:'history',url:'https://history.sohu.com/'},
  {id:'sohu-ent',platform:'sohu',name:'搜狐娱乐',channel:'culture',url:'https://yule.sohu.com/'},
  {id:'sohu-people',platform:'sohu',name:'细品名人 · 作者主页',channel:'culture',authorFeed:true,url:'https://mp.sohu.com/profile?xpt=NDc3N2UyZGEtM2ZhZi00YjA5LThhZjMtYTk2ZWIyNzRhYTMz'},
  {id:'sohu-backstage',platform:'sohu',name:'我是个码字的 · 作者主页',channel:'culture',authorFeed:true,url:'https://mp.sohu.com/profile?xpt=MTA0NzQ2ODUyMzM5MzI0MTA4OEBzb2h1LmNvbQ=='},
  {id:'chinanews-news',platform:'chinanews',name:'中国新闻网',channel:'news',filter:'news',url:'https://www.chinanews.com.cn/scroll-news/news1.html'}
];
const TOPICS={
  military:/抗美援朝|抗日|解放战争|野战军|二野|三野|华野|长征|红军|八路军|新四军|战役|战史|军史|航母|导弹|战机|军演|国防|军队|军事/,
  history:/民国|共和国|近代|党史|改革开放|两弹一星|往事|回忆|抗战|新中国|开国|革命|史料|国民党|历史人物/,
  culture:/演员|电影|电视剧|演唱会|歌手|音乐|春晚|相声|戏曲|文娱|作家|文学|文艺|导演|婚姻|前妻|前夫|未娶|初恋|成名|影坛|乐坛/,
  news:/国际|外交|总统|政府|局势|冲突|中美|联合国|经济|社会|民生|中国|美国|欧洲|亚洲/
};
function classify(title,fallback='news'){if(fallback==='culture')return 'culture';for(const c of ['military','history','culture'])if(TOPICS[c].test(title))return c;return fallback;}
function reject(title){return legacy.rejectTitle(title)||/妙创岛|剧本创作|短剧|入赘|假太监|车模|星座运势|大尺度|性感写真/.test(title);}
function canonical(raw,base){try{const u=new URL(raw,base);u.protocol='https:';u.search='';u.hash='';return u.href;}catch{return '';}}
function assignmentJSON(text,variable){const marker=new RegExp('(?:var\\s+|window\\.)'+variable+'\\s*=\\s*').exec(text);if(!marker)return null;const start=marker.index+marker[0].length;let depth=0,quoted=false,escape=false;for(let i=start;i<text.length;i++){const c=text[i];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue;}if(c==='"')quoted=true;else if(c==='{'||c==='[')depth++;else if(c==='}'||c===']'){if(--depth===0){try{return JSON.parse(text.slice(start,i+1));}catch{return null;}}}}return null;}
function parseList(source,html,url=source.url){
  if(source.kind==='curated')return source.articles.map(a=>({...a,channel:a.channel||source.channel,discovery:source.name,selectedReading:true}));
  if(source.kind==='signals'){
    const data=JSON.parse(html).data||[];
    return data.filter(x=>x.Title&&!reject(x.Title)).slice(0,40).map(x=>({title:x.Title,url:x.Url,heat:Number(x.HotValue)||0,discovery:'今日头条热榜'}));
  }
  if(source.kind==='360'){
    const rows=['INFO_FLOW_MULTI_DATA','INFO_FLOW_CAROUSEL_DATA'].flatMap(v=>assignmentJSON(html,v)?.data?.data?.res||[]);
    return rows.filter(x=>Number(x.content_length)>=180&&!reject(x.t||'')).map(x=>{
      const raw=[x.pcurl,x.u].find(u=>/^https?:\/\/www\.360kuai\.com\/[a-f0-9]{12,}(?:\?|$)/i.test(u||''));
      const category=/history/.test(x.c)?'history':/military/.test(x.c)?'military':/fun|culture|star|sport/.test(x.c)?'culture':'news';
      return {title:x.t,url:canonical(raw||'',url),cover:(x.i||'').split('|')[0],byline:x.f,channel:classify(x.t,category),published:x.p?new Date(Number(x.p)*1000).toISOString():'',discovery:source.name};
    }).filter(x=>/360kuai.com\/[a-f0-9]{12,}$/i.test(x.url));
  }
  if(source.platform!=='sohu')return Array.from(legacy.parseList(source,html,url)).map(x=>({...x,channel:classify(x.title,source.channel)}));
  const doc=new JSDOM(html).window.document,seen=new Set(),out=[];
  for(const a of doc.querySelectorAll('a[href]')){
    const target=canonical(a.getAttribute('href'),url);
    if(!/^https:\/\/www\.sohu\.com\/a\/\d+_\d+$/.test(target)||seen.has(target))continue;
    const title=(a.getAttribute('title')||a.querySelector('h3,h4,h2,.item-text-content-title')?.textContent||a.querySelector('img')?.getAttribute('alt')||a.textContent||'').replace(/\s+/g,' ').trim();
    if(title.length<8||reject(title))continue;
    const im=a.querySelector('img'),cover=im?.getAttribute('data-src')||im?.getAttribute('src')||'';
    seen.add(target);out.push({title,url:target,channel:classify(title,source.channel),cover:canonical(cover,url),discovery:source.name,authorFeed:!!source.authorFeed});
  }
  doc.defaultView.close();return out.slice(0,50);
}
function extract(html,url){
  const document=new JSDOM(html).window.document;
  let detail;
  if(/360kuai.com/.test(url)){
    const match=/window\.__INITIAL_DATA__\s*=\s*(['"])([\s\S]*?)\1\s*;/.exec(html);
    if(match){
      try{
        // Same data decoding used by the publisher's public reader, module 33373.
        // Only JSON is decoded; no remote script is evaluated.
        const encoded=match[2].replace(/\\\r?\n/g,'');
        const plain=encoded.slice(0,1000).split('').map((c,i)=>String.fromCharCode(c.charCodeAt(0)-i%2)).join('')+encoded.slice(1000);
        detail=JSON.parse(Buffer.from(plain,'base64').toString('utf8'))?.result?.Detail;
        if(detail?.content&&detail.s==='t'&&!detail.del){
          const heading=document.createElement('h1');heading.textContent=detail.title;
          const body=document.createElement('article');body.innerHTML=detail.content;
          document.body.replaceChildren(heading,body);
        }else detail=undefined;
      }catch{detail=undefined;}
    }
  }
  const container=document.querySelector('#mp-editor');
  let unsupportedImages=0;
  if(container)for(const img of container.querySelectorAll('img')){
    const raw=img.getAttribute('data-src')||img.getAttribute('src')||'';
    if(raw&&!/^(?:https?:)?\/\/|^\//i.test(raw)){
      try{
        // Public Sohu reader image URL encoding, AES-128-ECB/PKCS7. No scripts executed.
        const decoder=createDecipheriv('aes-128-ecb',Buffer.from('www.sohu.com6666'),null);
        const decoded=Buffer.concat([decoder.update(raw,'base64'),decoder.final()]).toString('utf8');
        const image=new URL(decoded,url);if(!/^https?:$/.test(image.protocol))throw new Error('invalid image');
        img.setAttribute('data-src',image.href);img.setAttribute('src',image.href);
      }catch{unsupportedImages++;}
    }
  }
  // 360's public text article body has a named boundary; source scripts remain unexecuted.
  if(/360kuai.com/.test(url)){
    const body=document.querySelector('.article-content,.article_content,#article-content,.content-detail');
    if(body){const art=document.createElement('article');art.innerHTML=body.innerHTML;document.body.replaceChildren(art);}
  }
  const result=JSON.parse(JSON.stringify(legacy.extract(document.documentElement.outerHTML,url)));
  if(container){
    const author=document.querySelector('meta[name="mediaid"]')?.content||[...document.querySelectorAll('a[href*="mp.sohu.com/profile"]')].map(a=>a.getAttribute('aria-label')||a.textContent.trim()).find(t=>t&&!/查看TA/.test(t));
    if(author){result.source=author;result.byline=author;}
    result.parser='sohu-public-reader';
    // Inline platform calls to action are outside the story's editorial content.
    result.blocks=result.blocks.filter(b=>b.type!=='p'||!/^点击关注，每天都有|^返回搜狐|^平台声明[：:]|^展开全文$/.test(b.text));
    result.textLength=result.blocks.reduce((n,b)=>n+(b.text?.length||0),0);
  }
  if(detail){result.source=detail.src||'快资讯';result.byline=detail.src||'';result.published=detail.pub_time?new Date(Number(detail.pub_time)).toISOString():'';result.parser='360-public-data';}
  if(!result.published){result.published=document.querySelector('#news-time,.time')?.textContent?.match(/20\d{2}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2})?/)?.[0]||'';}
  document.defaultView.close();result.unsupportedImages=unsupportedImages;
  result.valid=!!result.valid&&!unsupportedImages&&!container?.querySelector('img[src*="/single_image.png"]')&&result.textLength>=180&&result.blocks.filter(b=>b.type==='p'&&b.text.length>8).length>=3;
  return result;
}
function similarity(a,b){return legacy.titleSimilarity(a,b);}
function titleKey(t){return t.replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase();}
function score(a,now=Date.now()){
  const e=a.editorial||editorial.evaluate(a);
  let s=(a.cover?8:0)+(e.priority||0);const time=Date.parse(a.published||'');
  if(Number.isFinite(time)){const days=Math.max(0,(now-time)/86400000);s+=a.channel==='news'?Math.max(-60,24-days*8):Math.max(0,6-days*.02);}
  if(TOPICS[a.channel]?.test(a.title))s+=12;
  if(a.channel==='history'&&/近代|抗战|解放|民国|共和国|党史|新中国|长征|革命|国民党|开国|抗日/.test(a.title))s+=18;
  if(a.hotTopic)s+=18;
  return s;
}
function diversify(items,limit=80){
  const sorted=items.slice().sort((a,b)=>score(b)-score(a)),out=[],used=new Set(),counts={},authors={};
  const totals=items.reduce((m,a)=>(m[a.platform]=(m[a.platform]||0)+1,m),{});
  const caps=Object.fromEntries(Object.entries(totals).map(([p,n])=>[p,Object.keys(totals).length>=3?Math.min(n,Math.max(4,Math.floor(limit*.45)),n>items.length*.45?Math.max(4,Math.floor((items.length-n)*.45/.55)):n):n]));
  // Round-robin channels and prefer different publishing platforms within each channel.
  const queues=Object.fromEntries(['news','military','history','culture'].map(c=>[c,sorted.filter(a=>a.channel===c)]));
  while(out.length<limit){let added=false;for(const c of ['news','military','history','culture']){
    const q=queues[c].filter(a=>!used.has(a.id)&&(counts[a.platform]||0)<caps[a.platform]&&(c!=='culture'||!a.byline||(authors[a.byline]||0)<3)&&(a.genre!=='新闻动态'||out.filter(x=>x.genre==='新闻动态').length<Math.max(1,Math.floor(Math.min(limit,items.length)*.2))));if(!q.length)continue;
    const best=q.find(a=>(counts[a.platform]||0)<Math.max(2,Math.ceil((out.length+4)*.45)))||q[0];
    used.add(best.id);counts[best.platform]=(counts[best.platform]||0)+1;if(c==='culture'&&best.byline)authors[best.byline]=(authors[best.byline]||0)+1;out.push(best);added=true;
    if(out.length>=limit)break;
  }if(!added)break;}
  while(out.filter(a=>a.genre==='新闻动态').length>Math.floor(out.length*.2)){
    const index=out.findLastIndex(a=>a.genre==='新闻动态');if(index<0)break;out.splice(index,1);
  }
  return out;
}
module.exports={SOURCES,parseList,extract,classify,reject,canonical,similarity,titleKey,score,diversify,assignmentJSON};
