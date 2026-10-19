'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
// A new deployment starts with the same complete local reading edition as the apps.
async function bootstrap(data,ui){
  const source=await fs.readFile(path.join(ui,'seed.js'),'utf8');
  const marker='window.CJ_SEED=';const start=source.indexOf(marker);
  if(start<0)throw Error('内置内容格式无效');
  const articles=JSON.parse(source.slice(start+marker.length).trim().replace(/;$/,''));
  const copy=async value=>{
    if(!/^assets\/[a-f0-9]{64}\.jpg$/.test(value))throw Error('内置图片路径无效');
    const name=path.basename(value);await fs.copyFile(path.join(ui,value),path.join(data,'media',name));return '/media/'+name;
  };
  for(const a of articles){a.cover=await copy(a.cover);for(const b of a.blocks)if(b.type==='image')b.src=await copy(b.src);}
  return {articles};
}
module.exports={bootstrap};
