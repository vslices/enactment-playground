import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';

const assets=['composition.js','composition-share.js','composition-main.js'];
const fingerprint=createHash('sha256')
  .update(assets.map(name=>readFileSync('site/assets/'+name)).reduce((acc,chunk)=>Buffer.concat([acc,chunk]),Buffer.alloc(0)))
  .digest('hex').slice(0,12);

function update(path,source,replacement){
  const before=readFileSync(path,'utf8');
  if(!before.includes(source))throw Error('Expected asset reference missing in '+path+': '+source);
  writeFileSync(path,before.replaceAll(source,replacement));
}
for(const source of ['composition-main.js','composition-share.js']){
  const path='site/assets/'+source;
  update(path,"from './composition.js'","from './composition.js?v="+fingerprint+"'");
}
update('site/assets/composition-main.js',"from './composition-share.js'","from './composition-share.js?v="+fingerprint+"'");
update('site/index.html','./assets/composition-main.js','./assets/composition-main.js?v='+fingerprint);
console.log('Versioned Composition browser assets with '+fingerprint);
