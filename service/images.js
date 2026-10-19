'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const sharp=require('sharp');
const {hash,request}=require('./net');
const VERSION='reading-jpeg82-v1';
function filename(url,role){return hash(url+'|'+role+'|'+VERSION)+'.jpg';}
function imageStore(data,{signal,stats={requests:0,downloadedImages:0}}={}){
  const directory=path.join(data,'media'),pending=new Map();
  async function prepare(url){
    if(pending.has(url))return pending.get(url);
    const promise=(async()=>{
      const names={cover:filename(url,'cover'),body:filename(url,'body')};
      const exists=await Promise.all(Object.values(names).map(n=>fs.access(path.join(directory,n)).then(()=>true,()=>false)));
      if(!exists.every(Boolean)){
        // Migrate previous downloads without fetching the same original again.
        const legacy=(await fs.readdir(directory)).find(n=>n.startsWith(hash(url)+'.')&&!n.endsWith('.tmp'));
        let bytes;
        if(exists[1])bytes=await fs.readFile(path.join(directory,names.body));
        else if(legacy)bytes=await fs.readFile(path.join(directory,legacy));
        else{stats.requests++;bytes=(await request(url,{image:true,timeout:6500,signal})).bytes;stats.downloadedImages++;}
        const image=sharp(bytes,{limitInputPixels:40_000_000}).rotate();
        for(const [role,name]of Object.entries(names)){
          if(exists[role==='cover'?0:1])continue;
          const width=role==='cover'?720:1280;
          const temp=path.join(directory,name+'.tmp');
          await image.clone().resize({width,withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:82,mozjpeg:true}).toFile(temp);
          await fs.rename(temp,path.join(directory,name));
        }
      }
      return {cover:'/media/'+names.cover,body:'/media/'+names.body};
    })();pending.set(url,promise);return promise;
  }
  return {prepare};
}
async function migrate(){
  const data=path.resolve(process.env.CJ_DATA_DIR||path.join(__dirname,'../data'));
  const file=path.join(data,'edition.json'),edition=JSON.parse(await fs.readFile(file,'utf8'));
  const store=imageStore(data);
  for(const a of edition.articles){
    a.cover=(await store.prepare(a.originalCover)).cover;
    for(const b of a.blocks)if(b.type==='image')b.src=(await store.prepare(b.originalSrc)).body;
  }
  edition.revision=hash(JSON.stringify(edition.articles)).slice(0,24);
  await fs.writeFile(file+'.tmp',JSON.stringify(edition));await fs.rename(file+'.tmp',file);
  console.log('图片已生成阅读尺寸，原图出处保留。');
}
if(require.main===module)migrate().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={imageStore,filename};
