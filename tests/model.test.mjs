import {test} from 'node:test';
import assert from 'node:assert/strict';
import {landing,reduce,blockers} from '../dist/model.js';
const send=(s,type,id,other={})=>reduce(s,{type,id,...other});
const success=(s,id)=>send(send(send(s,'try',id),'start',id),'finish',id,{success:true});
test('Landing blocked with two absent dependencies, CI already green',()=>{
 const s=landing(),v=s.versions.find(v=>v.id==='l2');
 assert.equal(v.test,'passed');assert.equal(v.publish,'blocked');assert.equal(blockers(s,v).length,2);
});
test('Identity then Accounts re-attempts only publish.yml; not test.yml',()=>{
 let s=landing();s=success(s,'i1');
 assert.equal(s.versions.find(v=>v.id==='l2').publish,'blocked');
 s=success(s,'a1');
 const v=s.versions.find(v=>v.id==='l2');
 assert.equal(v.publish,'queued');assert.equal(v.attempts,1);assert.equal(v.test,'passed');
 assert.equal(s.log.filter(x=>x==='L2: test.yml passed').length,1);
 s=send(send(s,'start','l2'),'finish','l2',{success:true});
 assert.equal(s.deployed.landing,'l2');
});
test('Cannot queue twice and cannot invent dependency revisions',()=>{
 let s=landing();s=success(success(s,'i1'),'a1');
 assert.throws(()=>send(s,'try','l2'));
 assert.throws(()=>reduce(s,{type:'version',id:'l3',repo:'landing',name:'L3',requires:{identity:'unseen',accounts:'a1'}}));
});
test('failed deployment can retry without retesting',()=>{
 let s=landing();s=success(success(s,'i1'),'a1');
 s=send(send(s,'start','l2'),'finish','l2',{success:false});
 s=send(s,'try','l2');const v=s.versions.find(v=>v.id==='l2');
 assert.equal(v.attempts,2);assert.equal(v.test,'passed');
});

test('queued release is revoked if Identity becomes unhealthy before start',()=>{
 let s=landing();s=success(success(s,'i1'),'a1');
 assert.equal(s.versions.find(v=>v.id==='l2').publish,'queued');
 s=reduce(s,{type:'observe',repo:'identity',revision:'i1',healthy:false,sequence:10});
 const l=s.versions.find(v=>v.id==='l2');
 assert.equal(l.publish,'blocked');assert.equal(l.test,'passed');
 assert.match(blockers(s,l).join(' '),/no saludable/);
 assert.throws(()=>send(s,'start','l2'),/Sin intento en cola/);
});
test('fresh healthy observation re-queues only deployment',()=>{
 let s=landing();s=success(success(s,'i1'),'a1');
 s=reduce(s,{type:'observe',repo:'identity',revision:'i1',healthy:false,sequence:10});
 s=reduce(s,{type:'observe',repo:'identity',revision:'i1',healthy:true,sequence:11});
 const l=s.versions.find(v=>v.id==='l2');
 assert.equal(l.publish,'queued');assert.equal(l.attempts,2);
 assert.equal(s.log.filter(x=>x==='L2: test.yml passed').length,1);
});
test('duplicate and older observation do not override the latest environment',()=>{
 let s=landing();s=success(success(s,'i1'),'a1');
 s=reduce(s,{type:'observe',repo:'identity',revision:null,healthy:false,sequence:20});
 assert.equal(s.versions.find(v=>v.id==='l2').publish,'blocked');
 s=reduce(s,{type:'observe',repo:'identity',revision:'i1',healthy:true,sequence:19});
 s=reduce(s,{type:'observe',repo:'identity',revision:'i1',healthy:true,sequence:20});
 assert.equal(s.deployed.identity,undefined);
 assert.equal(s.versions.find(v=>v.id==='l2').publish,'blocked');
});
test('duplicate terminal notification cannot trigger duplicate release',()=>{
 let s=landing();s=success(success(s,'i1'),'a1');
 s=send(s,'start','l2');
 s=send(s,'finish','l2',{success:true});
 const oldLogs=s.log.length;
 s=send(s,'finish','l2',{success:true});
 assert.equal(s.log.length,oldLogs);
 assert.equal(s.versions.find(v=>v.id==='l2').attempts,1);
});
test('observed incompatible version blocks same tested candidate',()=>{
 let s=landing();s=success(success(s,'i1'),'a1');
 s=reduce(s,{type:'version',id:'i2',repo:'identity',name:'I2',requires:{}});
 s=reduce(s,{type:'observe',repo:'identity',revision:'i2',healthy:true,sequence:12});
 const l=s.versions.find(v=>v.id==='l2');
 assert.equal(l.publish,'blocked');assert.match(blockers(s,l).join(' '),/versión incompatible/);
});
