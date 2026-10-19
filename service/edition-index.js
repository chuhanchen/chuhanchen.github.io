'use strict';
const fs=require('node:fs');
const d=JSON.parse(fs.readFileSync('data/edition.json','utf8'));
// Commit only real catalogue changes, not repeated timestamps or image binaries.
fs.writeFileSync('edition-index.json',JSON.stringify({revision:d.revision,channels:d.channels,articles:d.articles.map(a=>({id:a.id,title:a.title,source:a.source,url:a.url,published:a.published,genre:a.genre}))},null,2)+'\n');
