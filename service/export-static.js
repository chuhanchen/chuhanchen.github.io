'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
async function main(){
  const root=path.resolve(__dirname,'..'),data=path.join(root,'data'),output=path.join(root,'dist');
  const edition=JSON.parse(await fs.readFile(path.join(data,'edition.json'),'utf8'));
  const health=JSON.parse(await fs.readFile(path.join(data,'health.json'),'utf8'));
  if(edition.articles.length<12)throw new Error('本期内容不足，保留线上上一期');
  await fs.rm(output,{recursive:true,force:true});await fs.cp(path.join(root,'ui'),output,{recursive:true});
  await fs.mkdir(path.join(output,'api'),{recursive:true});await fs.mkdir(path.join(output,'media'),{recursive:true});
  const images=new Set();for(const a of edition.articles){images.add(a.cover);for(const b of a.blocks)if(b.type==='image')images.add(b.src);}
  let imageBytes=0;for(const url of images){
    if(!/^\/media\/[a-f0-9]{64}\.jpg$/.test(url))throw new Error('图片尚未完成阅读尺寸转换');
    const source=path.join(data,url.slice(1));const stat=await fs.stat(source);imageBytes+=stat.size;
    await fs.copyFile(source,path.join(output,url.slice(1)));
  }
  await fs.writeFile(path.join(output,'api/edition'),JSON.stringify(edition));
  await fs.writeFile(path.join(output,'api/edition.json'),JSON.stringify(edition));
  await fs.writeFile(path.join(output,'.nojekyll'),'');
  await fs.writeFile(path.join(output,'api/health'),JSON.stringify({published:health.published,lastRun:health.startedAt,articles:edition.articles.length,channels:edition.channels,platforms:edition.platforms,hotMatched:health.hotMatched,sources:health.sources}));
  await fs.writeFile(path.join(output,'_headers'),`/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'
/api/*
  Content-Type: application/json; charset=utf-8
  Cache-Control: public, max-age=0, must-revalidate
/media/*
  Cache-Control: public, max-age=31536000, immutable
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/sw.js
  Cache-Control: no-cache
`);
  await fs.writeFile(path.join(output,'_redirects'),'/favicon.ico /favicon.svg 302\n');
  console.log(JSON.stringify({staticExport:true,articles:edition.articles.length,images:images.size,imageBytes}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
