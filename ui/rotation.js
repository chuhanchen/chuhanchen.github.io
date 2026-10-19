(function(root){
  'use strict';
  function pick(articles,limit,options){
    options=options||{};
    var previous=options.previous||[],shown=options.shown||[],read=options.read||[];
    var random=options.random||Math.random;
    return articles.map(function(a){return {article:a,previous:previous.indexOf(a.id)>=0,read:read.indexOf(a.id)>=0,age:shown.indexOf(a.id),tie:random()};})
      .sort(function(a,b){return Number(a.previous)-Number(b.previous)||Number(a.read)-Number(b.read)||a.age-b.age||a.tie-b.tie;})
      .slice(0,limit).map(function(x){return x.article;});
  }
  var api={pick:pick};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CJRotation=api;
})(typeof window==='object'?window:this);
