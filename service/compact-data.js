'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
async function main(){
  const data=path.resolve(process.env.CJ_DATA_DIR||path.join(__dirname,'../data'));
  const edition=JSON.parse(await fs.readFile(path.join(data,'edition.json'),'utf8'));
  const keep=new Set();for(const a of edition.articles){keep.add(path.basename(a.cover));for(const b of a.blocks)if(b.type==='image')keep.add(path.basename(b.src));}
  let removed=0;for(const n of await fs.readdir(path.join(data,'media'))){if(!keep.has(n)){await fs.unlink(path.join(data,'media',n));removed++;}}
  console.log(JSON.stringify({kept:keep.size,removed}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
