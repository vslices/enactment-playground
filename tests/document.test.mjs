import {test} from 'node:test';
import assert from 'node:assert/strict';
import {landingMvp,replay,append,jump,updateConfig,updateInteractions,validateDocument} from '../dist/document.js';
import {encodeHash,decodeHash} from '../dist/share.js';

const published=(doc,id)=>['try','start','finish'].reduce((d,type)=>
  append(d,type==='finish'?{type,id,success:true}:{type,id}),doc);

test('MVP: green Landing tests remain blocked on absent Identity and Accounts',()=>{
 const doc=landingMvp();
 const state=replay(doc);
 const landing=state.versions.find(v=>v.id==='l2');
 assert.equal(landing.test,'passed');
 assert.equal(landing.publish,'blocked');
 assert.match(state.log.at(-1),/identity-service: ausente/);
 assert.match(state.log.at(-1),/account-service: ausente/);
});
test('MVP: publishing Identity then Accounts requeues only Landing publish',()=>{
 let doc=landingMvp();
 doc=published(doc,'i1');
 assert.equal(replay(doc).versions.find(v=>v.id==='l2').publish,'blocked');
 doc=published(doc,'a1');
 let state=replay(doc),landing=state.versions.find(v=>v.id==='l2');
 assert.equal(landing.publish,'queued');
 assert.equal(landing.attempts,1);
 assert.equal(state.log.filter(x=>x==='L2: test.yml passed').length,1);
 doc=append(doc,{type:'start',id:'l2'});
 doc=append(doc,{type:'finish',id:'l2',success:true});
 assert.equal(replay(doc).deployed.landing,'l2');
});
test('Replay: undo, redo and branching discard only the future',()=>{
 let doc=published(landingMvp(),'i1');
 doc=published(doc,'a1');
 const all=doc.interactions.length;
 const previous=jump(doc,all-1);
 assert.equal(replay(previous).versions.find(v=>v.id==='l2').publish,'blocked');
 assert.equal(replay(jump(previous,all)).versions.find(v=>v.id==='l2').publish,'queued');
 const branch=append(previous,{type:'finish',id:'a1',success:false});
 assert.equal(branch.interactions.length,all);
 assert.equal(replay(branch).versions.find(v=>v.id==='l2').publish,'blocked');
 assert.notDeepEqual(branch.interactions[all-1],doc.interactions[all-1]);
});
test('Raw editors reject invalid topology or invalid replay',()=>{
 const doc=landingMvp();
 const config={...doc.config,repositories:[{id:'landing',name:'landing-product',dependencies:[]}]};
 assert.throws(()=>updateConfig(doc,config));
 assert.throws(()=>updateInteractions(doc,[...doc.interactions,{type:'test',id:'l2',result:'passed'}]));
 assert.throws(()=>validateDocument({...doc,cursor:300}));
 assert.equal(replay(doc).versions.find(v=>v.id==='l2').publish,'blocked');
});
test('Share hash restores config, interactions, cursor and Unicode',async()=>{
 let doc=landingMvp();
 doc=jump(doc,4);
 doc=updateConfig(doc,{...doc.config,name:'Publicación de Landing – simulación'});
 const hash=await encodeHash(doc);
 assert.match(hash,/^#v1\.[A-Za-z0-9_-]+$/);
 const restored=await decodeHash(hash);
 assert.deepEqual(restored,doc);
 assert.deepEqual(replay(restored),replay(doc));
});
test('Share hash rejects corrupt input',async()=>{
 await assert.rejects(()=>decodeHash('#v1.invalid!!'));
 await assert.rejects(()=>decodeHash('#v2.abc'));
});
