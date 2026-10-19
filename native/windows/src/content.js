'use strict';
const fs=require('fs');
const path=require('path');
const https=require('https');
const crypto=require('crypto');
const zlib=require('zlib');
function validOrigin(value){
  if(!value)return '';
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||u.pathname!=='/'||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(u.hostname)||/^\d+(?:\.\d+){3}$/.test(u.hostname)||/\.(?:local|localhost)$/i.test(u.hostname))throw new Error('内容地址无效');
  return u.origin;
}
function origin(userData){
  for(const p of [path.join(userData,'content-source.json'),path.join(__dirname,'content-source.json')]){
    try{return validOrigin(JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'' )).origin);}catch(_){}
  }return '';
}
function download(url,root,limit,redirects=0){return new Promise((resolve,reject)=>{
  const u=new URL(url);if(u.origin!==root||redirects>3){reject(new Error('内容地址发生变化'));return;}
  const req=https.get(u,{headers:{'Accept-Encoding':'gzip, deflate','User-Agent':'ChenJiangMagazine/4.0'}},res=>{
    if([301,302,303,307,308].includes(res.statusCode)&&res.headers.location){res.resume();download(new URL(res.headers.location,u).href,root,limit,redirects+1).then(resolve,reject);return;}
    if(res.statusCode!==200){res.resume();reject(new Error('更新暂不可用'));return;}
    let stream=res;if(res.headers['content-encoding']==='gzip')stream=res.pipe(zlib.createGunzip());else if(res.headers['content-encoding']==='deflate')stream=res.pipe(zlib.createInflate());
    const chunks=[];let size=0;stream.on('data',b=>{size+=b.length;if(size>limit){req.destroy();stream.destroy();reject(new Error('内容过大'));}else chunks.push(b);});
    stream.on('error',reject);res.on('error',reject);stream.on('end',()=>resolve({bytes:Buffer.concat(chunks),mime:String(res.headers['content-type']||'').split(';')[0]}));
  });
  const timer=setTimeout(()=>req.destroy(new Error('更新暂时超时')),7000);req.on('close',()=>clearTimeout(timer));req.on('error',reject);
});}
async function edition(userData,revision){
  const root=origin(userData);if(!root)return{ok:false,error:'更新服务正在准备，内置图文可以直接阅读'};
  try{
    const r=await download(root+'/api/edition.json',root,4*1024*1024);
    const data=JSON.parse(r.bytes.toString('utf8'));
    if(data.schemaVersion!==1||!Array.isArray(data.articles))throw new Error('本期内容未准备完整');
    return data.revision===revision?{ok:true,unchanged:true}:{ok:true,data};
  }catch(e){return{ok:false,error:e.message};}
}
async function image(userData,pathname){
  if(!/^\/media\/[a-f0-9]{64}\.jpg$/.test(pathname))throw new Error('图片地址无效');
  const dir=path.join(userData,'prepared-images');fs.mkdirSync(dir,{recursive:true});
  const root=origin(userData),file=path.join(dir,crypto.createHash('sha256').update(root+pathname).digest('hex')+'.jpg');
  try{return{bytes:fs.readFileSync(file),mime:'image/jpeg'};}catch(_){}
  if(!root)throw new Error('图片尚未准备');
  const r=await download(root+pathname,root,4*1024*1024);if(!/^image\//.test(r.mime))throw new Error('图片尚未准备');
  try{fs.writeFileSync(file+'.tmp',r.bytes);fs.renameSync(file+'.tmp',file);}catch(_){}
  return r;
}
module.exports={edition,image,origin,validOrigin};
