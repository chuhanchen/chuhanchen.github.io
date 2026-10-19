'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {gunzipSync}=require('node:zlib');
test('阅读接口仅提供已准备内容：支持条件更新、压缩、断源，且不触发采集',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'chenjiang-api-'));
  process.env.CJ_DATA_DIR=dir;delete process.env.CJ_AUTO_COLLECT;
  const doc={schemaVersion:1,revision:'test-revision',articles:[{title:'测试正文',blocks:[{type:'p',text:'测试'.repeat(1000)}]}]};
  await fs.writeFile(path.join(dir,'edition.json'),JSON.stringify(doc));
  await fs.writeFile(path.join(dir,'health.json'),JSON.stringify({sources:[],published:true}));
  const {start}=require('../service/server');const server=start({port:0,host:'127.0.0.1'});
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});});
  const get=(pathname,headers={},method='GET')=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:server.address().port,path:pathname,headers,method},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));});req.on('error',reject);req.end();
  });
  const originalFetch=global.fetch;global.fetch=()=>{throw new Error('阅读时禁止访问原网站');};
  try{
    const r=await get('/api/edition',{'Accept-Encoding':'gzip'});assert.equal(r.status,200);assert.equal(r.headers['content-encoding'],'gzip');assert.deepEqual(JSON.parse(gunzipSync(r.body)),doc);
    const same=await get('/api/edition',{'If-None-Match':r.headers.etag});assert.equal(same.status,304);assert.equal(same.body.length,0);
    assert.equal((await get('/__fetch?url=https://news.ifeng.com')).status,404);
    assert.equal((await get('/api/edition',{},'POST')).status,405);
    assert.equal((await get('/service/collect.js')).status,404);
    await fs.writeFile(path.join(dir,'edition.next'),JSON.stringify({...doc,revision:'new-revision'}));await fs.rename(path.join(dir,'edition.next'),path.join(dir,'edition.json'));
    const update=await get('/api/edition',{'If-None-Match':r.headers.etag});assert.equal(update.status,200);assert.equal(JSON.parse(update.body).revision,'new-revision');
  }finally{global.fetch=originalFetch;}
});
