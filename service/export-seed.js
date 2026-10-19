'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {diversify}=require('./sources');
async function main(){
  const root=path.resolve(__dirname,'..'),data=JSON.parse(await fs.readFile(path.join(root,'data/edition.json'),'utf8'));
  const chosen=diversify(data.articles,24).map(a=>JSON.parse(JSON.stringify(a)));
  const assets=path.join(root,'ui/assets');await fs.rm(assets,{recursive:true,force:true});await fs.mkdir(assets,{recursive:true});
  const copy=async url=>{const name=path.basename(url);await fs.copyFile(path.join(root,'data/media',name),path.join(assets,name));return 'assets/'+name;};
  for(const a of chosen){a.cover=await copy(a.cover);for(const b of a.blocks)if(b.type==='image')b.src=await copy(b.src);}
  await fs.writeFile(path.join(root,'ui/seed.js'),'/* Complete, locally prepared first-reading edition. Original publication dates retained. */\nwindow.CJ_SEED='+JSON.stringify(chosen)+';\n');
  await fs.writeFile(path.join(root,'ui/seed-assets.json'),JSON.stringify((await fs.readdir(assets)).map(n=>'/assets/'+n)));
  await fs.rm(path.join(root,'ui/seed.json'),{force:true});
  console.log(JSON.stringify({seedArticles:chosen.length,platforms:chosen.reduce((m,a)=>(m[a.platform]=(m[a.platform]||0)+1,m),{}),assetFiles:(await fs.readdir(assets)).length}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
