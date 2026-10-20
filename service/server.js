'use strict';
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {gzipSync}=require('node:zlib');
const {spawn}=require('node:child_process');
const {hash}=require('./net');
const ROOT=path.resolve(__dirname,'..');
const DATA=path.resolve(process.env.CJ_DATA_DIR||path.join(ROOT,'data'));
const UI=path.join(ROOT,'ui');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif','.svg':'image/svg+xml'};
const publicFiles=new Set(['index.html','app.js','rotation.js','host.js','config.js','seed.js','seed-assets.json','style.css','sw.js','favicon.svg','manifest.webmanifest']);
const metrics={requests:0,editionRequests:0,mediaRequests:0};
let editionCache;
async function edition(){
  const file=path.join(DATA,'edition.json'),stat=await fs.stat(file);
  if(editionCache?.mtime===stat.mtimeMs)return editionCache;
  const bytes=await fs.readFile(file),data=JSON.parse(bytes);
  editionCache={mtime:stat.mtimeMs,bytes,gzip:gzipSync(bytes),etag:'"'+data.revision+'"'};return editionCache;
}
function headers(res,type,extra={}){
  res.setHeader('content-type',type);res.setHeader('x-content-type-options','nosniff');
  res.setHeader('referrer-policy','no-referrer');res.setHeader('x-frame-options','DENY');
  res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'");
  for(const [k,v]of Object.entries(extra))res.setHeader(k,v);
}
async function handler(req,res){
  metrics.requests++;
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{allow:'GET, HEAD'});res.end();return;}
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
  try{
    if(pathname==='/favicon.ico'){res.writeHead(302,{location:'/favicon.svg'});res.end();return;}
    if(pathname==='/api/edition'||pathname==='/api/edition.json'){
      metrics.editionRequests++;const c=await edition();
      headers(res,'application/json; charset=utf-8',{'cache-control':'private, no-cache',etag:c.etag});
      if(req.headers['if-none-match']===c.etag){res.writeHead(304);res.end();return;}
      const gzip=/\bgzip\b/.test(req.headers['accept-encoding']||'');const body=gzip?c.gzip:c.bytes;
      res.setHeader('vary','Accept-Encoding');if(gzip)res.setHeader('content-encoding','gzip');res.setHeader('content-length',body.length);
      res.end(req.method==='HEAD'?undefined:body);return;
    }
    if(pathname==='/api/health'){
      const report=JSON.parse(await fs.readFile(path.join(DATA,'health.json'),'utf8'));
      headers(res,MIME['.json'],{'cache-control':'no-store'});
      res.end(JSON.stringify({lastRun:report.startedAt,published:report.published,elapsedMs:report.elapsedMs,articles:report.articles,channels:report.channels,platforms:report.platforms,hotSignals:report.hotSignals,hotMatched:report.hotMatched,sources:report.sources,metrics}));return;
    }
    let file,immutable=false;
    if(/^\/media\/[a-f0-9]{64}\.(?:jpg|png|webp|gif|avif)$/.test(pathname)){file=path.join(DATA,pathname.slice(1));immutable=true;metrics.mediaRequests++;}
    else if(pathname.startsWith('/assets/')&&/^\/assets\/[a-zA-Z0-9_.-]+$/.test(pathname)){file=path.join(UI,pathname.slice(1));immutable=true;}
    else{const name=pathname==='/'?'index.html':pathname.slice(1);if(!publicFiles.has(name)){res.writeHead(404);res.end();return;}file=path.join(UI,name);}
    const body=await fs.readFile(file),etag='"'+hash(body).slice(0,24)+'"';
    headers(res,MIME[path.extname(file)]||'application/octet-stream',{'cache-control':immutable?'public,max-age=31536000,immutable':'no-cache',etag});
    if(req.headers['if-none-match']===etag){res.writeHead(304);res.end();return;}
    res.setHeader('content-length',body.length);res.end(req.method==='HEAD'?undefined:body);
  }catch(e){headers(res,MIME['.json'],{'cache-control':'no-store'});res.writeHead(e.code==='ENOENT'?503:500);res.end(JSON.stringify({error:e.code==='ENOENT'?'内容尚未准备完成':'暂时无法读取内容'}));}
}
function start({port=Number(process.env.PORT)||8787,host=process.env.CJ_HOST||'127.0.0.1'}={}){
  const server=http.createServer((req,res)=>handler(req,res).catch(()=>{res.writeHead(500);res.end();}));
  server.listen(port,host,()=>console.log('辰江网络杂志 http://'+host+':'+server.address().port));
  if(process.env.CJ_AUTO_COLLECT==='1'){
    let worker;
    const tick=()=>{
      if(worker)return;
      worker=spawn(process.execPath,[path.join(__dirname,'collect.js')],{env:process.env,stdio:['ignore','pipe','pipe']});
      worker.stdout.on('data',b=>process.stdout.write(b));worker.stderr.on('data',b=>process.stderr.write(b));
      worker.once('error',e=>{console.error('内容更新失败:',e.message);worker=undefined;});
      worker.once('exit',code=>{if(code)console.error('本轮未发布新内容，继续提供上一期。');worker=undefined;});
    };
    const timer=setInterval(tick,Math.max(300000,Number(process.env.CJ_UPDATE_INTERVAL_MS)||1800000));timer.unref();tick();
    server.once('close',()=>{clearInterval(timer);if(worker)worker.kill();});
  }
  return server;
}
if(require.main===module)start();
module.exports={start,metrics};
