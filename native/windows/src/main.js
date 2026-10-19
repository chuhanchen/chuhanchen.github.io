'use strict';
const {app,BrowserWindow,ipcMain,protocol,shell}=require('electron');
const path=require('path'),fs=require('fs');
const content=require('./content');
app.setName('辰江网络杂志');
app.setAppUserModelId('cn.chenjiang.magazine');
app.setPath('userData',path.join(app.getPath('appData'),'ChenJiangMagazine'));
protocol.registerSchemesAsPrivileged([{scheme:'cj-app',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const UI=path.join(__dirname,'ui');let win;
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};
const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'";
if(!app.requestSingleInstanceLock())app.quit();
else{
 app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
 app.whenReady().then(()=>{
  protocol.registerBufferProtocol('cj-app',async(req,callback)=>{
   try{
    const u=new URL(req.url);if(u.host!=='magazine')throw Error('无效来源');
    const pathname=decodeURIComponent(u.pathname);
    if(pathname.startsWith('/media/')){const r=await content.image(app.getPath('userData'),pathname);callback({data:r.bytes,mimeType:r.mime});return;}
    const relative=pathname==='/'?'index.html':pathname.slice(1);
    if(!relative||relative.includes('..')||relative.includes('\\')||!/^[-a-zA-Z0-9_./]+$/.test(relative))throw Error('无效路径');
    const file=path.join(UI,relative);callback({data:fs.readFileSync(file),mimeType:mime[path.extname(file)]||'application/octet-stream',headers:{'Content-Security-Policy':csp}});
   }catch(_){callback({error:-6});}
  });
  ipcMain.handle('cj:edition',(event,revision)=>win&&event.sender===win.webContents?content.edition(app.getPath('userData'),String(revision||'')):{ok:false});
  ipcMain.handle('cj:external',async(event,value)=>{
   if(!win||event.sender!==win.webContents)return;
   try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password)await shell.openExternal(u.href);}catch(_){}
  });
  win=new BrowserWindow({width:1360,height:930,minWidth:850,minHeight:640,fullscreen:true,title:'辰江网络杂志',backgroundColor:'#f6f1e8',icon:path.join(__dirname,'magazine.ico'),autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,spellcheck:false}});
  win.removeMenu();win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.on('will-attach-webview',e=>e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_w,_p,done)=>done(false));
  win.webContents.on('before-input-event',(e,key)=>{if(key.type==='keyDown'&&key.key==='F11'){win.setFullScreen(!win.isFullScreen());e.preventDefault();}if(key.key==='Escape'&&win.isFullScreen())win.setFullScreen(false);});
  win.on('closed',()=>{win=null;});win.loadURL('cj-app://magazine/index.html');
 });
 app.on('window-all-closed',()=>app.quit());
}
