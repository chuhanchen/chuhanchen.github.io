'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {request,pool,hash}=require('./net');
const {imageStore}=require('./images');
const {SOURCES,parseList,extract,classify,reject,similarity,titleKey,score,diversify}=require('./sources');
const {annotate,evaluate,eligibleCandidate}=require('./editorial');
const {bootstrap}=require('./bootstrap');
const ROOT=path.resolve(__dirname,'..');
const DATA=path.resolve(process.env.CJ_DATA_DIR||path.join(ROOT,'data'));
async function readJSON(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return fallback;}}
async function atomic(file,value){const temp=file+'.'+process.pid+'.tmp';await fs.writeFile(temp,JSON.stringify(value));await fs.rename(temp,file);}
async function collect({budgetMs=60000}={}){
  await fs.mkdir(path.join(DATA,'media'),{recursive:true});
  // A lock prevents overlapping timer/manual runs from overwriting one another.
  let lock;const lockPath=path.join(DATA,'collect.lock');
  try{lock=await fs.open(lockPath,'wx');await lock.writeFile(String(process.pid));}
  catch(e){if(e.code==='EEXIST'){const pid=Number(await fs.readFile(lockPath,'utf8').catch(()=>0));try{process.kill(pid,0);return {skipped:'collection already running'};}catch{await fs.unlink(lockPath).catch(()=>{});return collect({budgetMs});}}throw e;}
  const start=performance.now(),deadline=new AbortController(),timer=setTimeout(()=>deadline.abort(),budgetMs);
  const report={startedAt:new Date().toISOString(),sources:[],rejections:[],requests:0,downloadedImages:0};
  const pageCache=new Map();
  const fetchPage=url=>{if(!pageCache.has(url)){report.requests++;pageCache.set(url,request(url,{signal:deadline.signal}));}return pageCache.get(url);};
  const images=imageStore(DATA,{signal:deadline.signal,stats:report});
  const saveImage=async(url,role='body')=>(await images.prepare(url))[role];

  try{
    const prior=await readJSON(path.join(DATA,'edition.json'),null)||await bootstrap(DATA,path.join(ROOT,'ui'));
    const byURL=new Map(prior.articles.map(a=>[a.url,a]));
    const signals=[],buckets=[],sourceReports=new Map();
    await pool(SOURCES,4,async source=>{
      const t=performance.now(),status={id:source.id,name:source.name,platform:source.platform,kind:source.kind||'articles',candidates:0,accepted:0,retained:0,failed:0};
      sourceReports.set(source.id,status);report.sources.push(status);
      try{
        const r=source.kind==='curated'?{text:'',url:source.url}:await fetchPage(source.url);const list=parseList(source,r.text,r.url);
        status.candidates=list.length;status.status=list.length?'available':'empty';
        if(source.kind==='signals'){signals.push(...list);return;}
        const seen=new Set();
        const candidates=list.filter(a=>{if(!a.url||seen.has(a.url)||reject(a.title))return false;seen.add(a.url);return true;})
          .map(a=>({...a,channel:classify(a.title,a.channel||source.channel),platform:source.platform,sourceId:source.id,discovery:source.name,authorFeed:!!source.authorFeed})).filter(eligibleCandidate);
        candidates.sort((a,b)=>score(b)-score(a));
        buckets.push({source,items:candidates.slice(0,source.platform==='guancha'?14:8)});
      }catch(e){status.status='failed';status.error=e.name==='TimeoutError'?'来源响应超时':String(e.message).slice(0,120);}
      finally{status.discoveryMs=Math.round(performance.now()-t);}
    });
    // Slow/failing sources have a bounded discovery budget. Page reads never wait for this job.
    const queue=[];for(let i=0;i<14;i++)for(const b of buckets)if(b.items[i])queue.push(b.items[i]);
    const accepted=[];
    await pool(queue,4,async candidate=>{
      const status=sourceReports.get(candidate.sourceId);
      if(deadline.signal.aborted)return;
      const old=byURL.get(candidate.url);
      if(old){status.retained++;accepted.push({...old,selectedReading:!!(old.selectedReading||candidate.selectedReading)});return;}
      try{
        const r=await fetchPage(candidate.url),art=extract(r.text,r.url);
        if(!art.valid)throw new Error(art.unsupportedImages?'原文配图尚不支持，整篇跳过':'正文结构或长度未通过');
        if(similarity(candidate.title,art.title)<.3)throw new Error('列表标题和正文不对应');
        if(reject(art.title))throw new Error('推广或不适合的内容');
        const editorial=evaluate({...art,channel:candidate.channel,authorFeed:candidate.authorFeed});
        if(!editorial.eligible)throw new Error(editorial.reason);
        const blocks=art.blocks.map(b=>({...b}));
        const imageURLs=[...new Set(blocks.filter(b=>b.type==='image').map(b=>b.src))];
        const rawCover=art.cover||candidate.cover||imageURLs[0]||'';
        if(!rawCover)throw new Error('缺少真实封面');
        // Prepare the complete image set before publishing; partial image failures never become broken cards.
        const imageMap=new Map(await pool(imageURLs,3,async url=>[url,await saveImage(url)]));
        const cover=await saveImage(rawCover,'cover');
        for(const b of blocks)if(b.type==='image'){b.originalSrc=b.src;b.src=imageMap.get(b.src);}
        const record={id:'a'+hash(candidate.url).slice(0,20),title:art.title,url:candidate.url,
          source:art.source||candidate.byline||candidate.discovery,byline:art.byline||candidate.byline||'',
          platform:candidate.platform,discovery:candidate.discovery,discoveries:[candidate.discovery],
          channel:classify(art.title,candidate.channel),published:art.published||candidate.published||'',authorFeed:!!candidate.authorFeed,
          editorial,genre:editorial.genre,selectedReading:!!candidate.selectedReading,
          cover,originalCover:rawCover,blocks,textLength:art.textLength,
          preparedAt:new Date().toISOString(),complete:true};
        if(record.channel==='news'){
          const when=Date.parse(record.published);
          if(!Number.isFinite(when)||Date.now()-when>7*86400000)throw new Error('时事稿件日期不明或超过七天');
        }
        accepted.push(record);status.accepted++;
      }catch(e){status.failed++;if(report.rejections.length<80)report.rejections.push({source:candidate.sourceId,title:candidate.title,url:candidate.url,reason:deadline.signal.aborted?'本轮时间预算已到':String(e.message).slice(0,160)});}
    });
    const merged=new Map(),discoveredThisRun=new Set(accepted.map(a=>a.url));
    for(const a of [...accepted,...prior.articles]){
      if(merged.has(a.url)||!a.complete)continue;
      // Manual taste examples bootstrap the first reading only. A later issue keeps
      // one only if a normal source independently discovers it again this round.
      if(a.selectedReading&&!discoveredThisRun.has(a.url))continue;
      const when=Date.parse(a.published||'');
      if(a.channel==='news'&&(!Number.isFinite(when)||Date.now()-when>7*86400000))continue;
      const reviewed=annotate({...a,selectedReading:undefined,channel:classify(a.title,a.channel)});
      if(!reviewed.editorial.eligible)continue;
      merged.set(a.url,{...reviewed,discoveries:(a.discoveries||[a.discovery]).filter(x=>x!=='今日头条热榜'),hotTopic:undefined});
    }
    const keys=new Set(),unique=[];
    for(const a of merged.values()){
      const key=titleKey(a.title);if(keys.has(key))continue;keys.add(key);
      const hot=signals.find(s=>similarity(a.title,s.title)>=.52);
      if(hot){a.hotTopic={title:hot.title,url:hot.url};a.discoveries=[...new Set([...a.discoveries,'今日头条热榜'])];}
      unique.push(a);
    }
    const articles=diversify(unique,100);
    const channels=Object.fromEntries(['news','military','history','culture'].map(c=>[c,articles.filter(a=>a.channel===c).length]));
    const platforms=articles.reduce((m,a)=>(m[a.platform]=(m[a.platform]||0)+1,m),{});
    const valid=articles.length>=12&&Object.values(channels).every(n=>n>=2)&&Object.keys(platforms).length>=3;
    report.articles=articles.length;report.channels=channels;report.platforms=platforms;
    report.genres=articles.reduce((m,a)=>(m[a.genre]=(m[a.genre]||0)+1,m),{});
    report.hotSignals=signals.length;report.hotMatched=articles.filter(a=>a.hotTopic).length;
    report.elapsedMs=Math.round(performance.now()-start);report.published=valid;
    const hotStatus=sourceReports.get('toutiao');if(hotStatus){hotStatus.matched=report.hotMatched;hotStatus.status=signals.length?'signals-ready':hotStatus.status;}
    for(const status of report.sources)if(status.kind!=='signals'&&status.status==='available')status.status=status.accepted+status.retained?'contributing':status.blockedReason?'unsupported-images':'no-usable-articles';
    if(valid){
      const revision=hash(JSON.stringify(articles)).slice(0,24);
      await atomic(path.join(DATA,'edition.json'),{schemaVersion:1,revision,generatedAt:new Date().toISOString(),channels,platforms,articles});
    }
    await atomic(path.join(DATA,'health.json'),report);
    console.log(JSON.stringify({published:valid,articles:articles.length,channels,platforms,hotMatched:report.hotMatched,seconds:report.elapsedMs/1000,requests:report.requests}));
    return report;
  }finally{clearTimeout(timer);await lock.close();await fs.unlink(lockPath).catch(()=>{});}
}
if(require.main===module)collect().then(report=>{if(report.published===false)process.exitCode=2;}).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={collect,DATA};
