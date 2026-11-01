import {test} from 'node:test';
import assert from 'node:assert/strict';
import {append,empty,example,initialConfig,move,replay,replaceInteractions,validateDocument} from '../dist/composition.js';
import {encode,decode} from '../dist/composition-share.js';
const send=(d,...actions)=>actions.reduce(append,d);
const passed=(repo,suite,profile='linux')=>({type:'test',repo,suite,verdict:'passed',profile});
function approved(){
 let d=example();
 d=send(d,{type:'merge',repo:'identity',mergedTree:'tree-I1'},
  {type:'merge',repo:'accounts',mergedTree:'tree-A1'},
  {type:'merge',repo:'landing',mergedTree:'tree-L2'},
  {type:'merge',repo:'composition',mergedTree:'tree-C1'},
  {type:'evaluate'});
 return d;
}
test('a service CI green cannot authorize autonomous deployment',()=>{
 let d=example();
 assert.equal(replay(d).compositionMain,false);
 assert.equal(replay(d).evaluation,'unknown');
 assert.throws(()=>append(d,{type:'request-promotion'}),/no ha autorizado/);
 assert.throws(()=>append(d,{type:'start',repo:'identity'}),/No existe solicitud/);
});
test('Composition/main can promote the fixed exact commits after owners merged',()=>{
 let d=approved();
 assert.equal(replay(d).evaluation,'eligible');
 d=append(d,{type:'request-promotion'});
 let s=replay(d);
 assert.equal(s.attempts.identity.phase,'queued');
 assert.equal(s.attempts.accounts.phase,'queued');
 assert.equal(s.attempts.landing.phase,'blocked');
 assert.throws(()=>append(d,{type:'start',repo:'landing'}),/No existe solicitud/);
 for(const repo of ['identity','accounts']){
   d=send(d,{type:'start',repo},{type:'finish',repo,success:true,observedRevision:repo==='identity'?'I1':'A1',healthy:true});
 }
 s=replay(d);
 assert.equal(s.attempts.landing.phase,'queued');
 assert.equal(s.attempts.landing.number,1);
 assert.equal(s.evidence.length,5,'dependency availability must not rerun CI');
 d=send(d,{type:'start',repo:'landing'},{type:'finish',repo:'landing',success:true,observedRevision:'L2',healthy:true});
 assert.equal(replay(d).deployed.landing,'L2');
});
test('merge changing tree invalidates PR tests until new matching evidence exists',()=>{
 let d=example();
 d=send(d,{type:'merge',repo:'identity',mergedTree:'different-tree'},
  {type:'merge',repo:'accounts',mergedTree:'tree-A1'},
  {type:'merge',repo:'landing',mergedTree:'tree-L2'},
  {type:'merge',repo:'composition',mergedTree:'tree-C1'},
  {type:'evaluate'});
 let s=replay(d);
 assert.notEqual(s.evaluation,'eligible');
 assert.match(s.evaluationReasons.join(' '),/no reutilizable/);
 assert.throws(()=>append(d,{type:'request-promotion'}));
 d=send(d,passed('identity','owner-linux'),{type:'evaluate'});
 assert.equal(replay(d).evaluation,'eligible');
});
test('a failed or inconclusive Windows/IIS regression does not authorize QA',()=>{
 let d=example();
 d=send(d,{type:'merge',repo:'identity',mergedTree:'tree-I1'},
  {type:'merge',repo:'accounts',mergedTree:'tree-A1'},
  {type:'merge',repo:'landing',mergedTree:'tree-L2'},
  {type:'merge',repo:'composition',mergedTree:'tree-C1'},
  {type:'test',repo:'composition',suite:'composition-windows',verdict:'inconclusive',profile:'windows-iis-serviu-qa-approx'},
  {type:'evaluate'});
 assert.equal(replay(d).evaluation,'unknown');
 assert.throws(()=>append(d,{type:'request-promotion'}));
});
test('release SUCCESS requires observed exact SHA and health',()=>{
 let d=append(approved(),{type:'request-promotion'});
 d=append(d,{type:'start',repo:'identity'});
 assert.throws(()=>append(d,{type:'finish',repo:'identity',success:true,observedRevision:'I2',healthy:true}));
 assert.throws(()=>append(d,{type:'finish',repo:'identity',success:true,observedRevision:'I1',healthy:false}));
 assert.equal(replay(d).attempts.identity.phase,'deploying');
});
test('stale observations do not overwrite current state and block landing if unhealthy',()=>{
 let d=append(approved(),{type:'request-promotion'});
 d=send(d,{type:'start',repo:'identity'},{type:'finish',repo:'identity',success:true,observedRevision:'I1',healthy:true});
 d=send(d,{type:'start',repo:'accounts'},{type:'finish',repo:'accounts',success:true,observedRevision:'A1',healthy:true});
 assert.equal(replay(d).attempts.landing.phase,'queued');
 d=append(d,{type:'observe',repo:'identity',revision:'I1',healthy:false,sequence:10});
 assert.equal(replay(d).attempts.landing.phase,'blocked');
 d=append(d,{type:'observe',repo:'identity',revision:'I1',healthy:true,sequence:9});
 assert.equal(replay(d).attempts.landing.phase,'blocked');
 d=append(d,{type:'observe',repo:'identity',revision:'I1',healthy:true,sequence:11});
 assert.equal(replay(d).attempts.landing.phase,'queued');
 assert.equal(replay(d).evidence.length,5);
});
test('history cursor, branch and share preserve exact state',async()=>{
 let d=approved();
 d=append(d,{type:'request-promotion'});
 const encoded=await encode(move(d,3));
 const decoded=await decode(encoded);
 assert.deepEqual(decoded,move(d,3));
 assert.deepEqual(replay(decoded),replay(d,3));
 const fork=append(move(d,3),{type:'test',repo:'identity',suite:'owner-linux',verdict:'failed',profile:'linux'});
 assert.equal(fork.interactions.length,4);
 assert.equal(replay(fork).evidence.at(-1).verdict,'failed');
 assert.throws(()=>replaceInteractions(d,[...d.interactions,{type:'merge',repo:'identity',mergedTree:'again'}]));
});
test('only QA internal automatic policy is representable',()=>{
 const d=example();
 assert.throws(()=>validateDocument({...d,config:{...d.config,target:'prod'}}));
 assert.throws(()=>validateDocument({...d,config:{...d.config,target:'qa-serviu'}}));
});

test('evidence profile mismatch or omitted Windows gate cannot silently authorize promotion',()=>{
 let d=example();
 d={...d,config:{...d.config,profiles:{...d.config.profiles,ownerLinux:'different-runner'}}};
 d=validateDocument(d);
 d=send(d,{type:'merge',repo:'identity',mergedTree:'tree-I1'},
  {type:'merge',repo:'accounts',mergedTree:'tree-A1'},
  {type:'merge',repo:'landing',mergedTree:'tree-L2'},
  {type:'merge',repo:'composition',mergedTree:'tree-C1'},
  {type:'evaluate'});
 assert.notEqual(replay(d).evaluation,'eligible');
 assert.match(replay(d).evaluationReasons.join(' '),/perfil incompatible/);
 assert.throws(()=>validateDocument({...d,config:{...d.config,windowsRequired:false}}));
});
test('new evidence after eligibility invalidates authorization until reevaluated',()=>{
 let d=approved();
 assert.equal(replay(d).evaluation,'eligible');
 d=append(d,{type:'test',repo:'identity',suite:'owner-linux',verdict:'failed',profile:'linux'});
 assert.equal(replay(d).evaluation,'unknown');
 assert.throws(()=>append(d,{type:'request-promotion'}));
 d=append(d,{type:'evaluate'});
 assert.equal(replay(d).evaluation,'rejected');
});

test('pending authorization is revoked by evidence changes and requires new explicit request',()=>{
 let d=append(approved(),{type:'request-promotion'});
 assert.equal(replay(d).attempts.identity.phase,'queued');
 d=append(d,passed('composition','composition-linux','linux-aspire-sql-e2e'));
 let s=replay(d);
 assert.equal(s.promotionRequested,false);
 assert.equal(s.attempts.identity.phase,'blocked');
 assert.throws(()=>append(d,{type:'start',repo:'identity'}));
 d=append(d,{type:'evaluate'});
 assert.equal(replay(d).evaluation,'eligible');
 assert.equal(replay(d).attempts.identity.phase,'blocked');
 d=append(d,{type:'request-promotion'});
 assert.equal(replay(d).attempts.identity.phase,'queued');
});

test('scenario introduction is validated, configurable and shareable without altering execution',async()=>{
 const original=example();
 const updated=validateDocument({...original,config:{...original.config,
   name:'Mi escenario',introduction:{eyebrow:'EXPERIMENTO',description:'Esta es una descripción configurable del escenario.'}}});
 assert.equal(updated.config.introduction.eyebrow,'EXPERIMENTO');
 assert.equal(updated.config.introduction.description,'Esta es una descripción configurable del escenario.');
 assert.deepEqual(replay(updated),replay(original));
 assert.deepEqual(await decode(await encode(updated)),updated);
 assert.throws(()=>validateDocument({...original,config:{...original.config,introduction:{eyebrow:'',description:'Texto'}}}));
 assert.throws(()=>validateDocument({...original,config:{...original.config,introduction:{eyebrow:'Etiqueta',description:''}}}));
});
test('previous v2 URLs without an introduction receive a compatible default',async()=>{
 const original=example();
 const legacy={...original,config:{...original.config}};
 delete legacy.config.introduction;
 const migrated=validateDocument(legacy);
 assert.equal(migrated.config.introduction.eyebrow,'LANDING · CONTRATO PROPUESTO');
 assert.match(migrated.config.introduction.description,/Composition/);
 assert.deepEqual(replay(migrated),replay(original));
 assert.deepEqual(await decode(await encode(migrated)),migrated);
});
