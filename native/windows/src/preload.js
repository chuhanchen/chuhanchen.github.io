'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('CJHost',{
 edition:revision=>ipcRenderer.invoke('cj:edition',String(revision||'')),
 openExternal:url=>ipcRenderer.invoke('cj:external',String(url||''))
});
