// Experimental simulator of the Landing Composition promotion *decision*, not real CI/CD.
export type Participant='identity'|'accounts'|'landing';
export type RepoId=Participant|'composition';
export type Suite='owner-linux'|'composition-linux'|'composition-windows';
export type Verdict='passed'|'failed'|'inconclusive';
export type Phase='idle'|'blocked'|'queued'|'deploying'|'failed'|'published'|'already-deployed';
export type Candidate={id:string;revision:string;tree:string;mergedTree:string|null};
export type Evidence={repo:RepoId;revision:string;tree:string;suite:Suite;verdict:Verdict;profile:string};
export type Attempt={phase:Phase;number:number;reason:string[]};
export type Configuration={formatVersion:2;scenario:'landing-composition-promotion';name:string;target:'qa-internal';repos:Record<RepoId,string>;requires:Record<Participant,string>;windowsRequired:boolean};
export type Interaction=
 |{type:'candidate';repo:RepoId;revision:string;tree:string}
 |{type:'test';repo:RepoId;suite:Suite;verdict:Verdict;profile:string}
 |{type:'merge';repo:RepoId;mergedTree:string}
 |{type:'evaluate'}
 |{type:'request-promotion'}
 |{type:'start';repo:Participant}
 |{type:'finish';repo:Participant;success:boolean;observedRevision:string|null;healthy:boolean}
 |{type:'observe';repo:Participant;revision:string|null;healthy:boolean;sequence:number};
export type Document={formatVersion:2;config:Configuration;interactions:Interaction[];cursor:number};
export type State={
  candidates:Partial<Record<RepoId,Candidate>>;
  evidence:Evidence[]; compositionMain:boolean; evaluation:'unknown'|'eligible'|'blocked'|'rejected';
  evaluationReasons:string[]; attempts:Record<Participant,Attempt>;
  deployed:Partial<Record<Participant,string>>; unhealthy:Participant[];
  observations:Record<Participant,number>; log:string[];
};
const ids:RepoId[]=['identity','accounts','landing','composition'];
export const participants:Participant[]=['identity','accounts','landing'];
function assert(condition:unknown,message:string):asserts condition {if(!condition)throw Error(message)}
const isObj=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const string=(value:unknown,label:string)=>{assert(typeof value==='string'&&value.length>0&&value.length<=100,label+' inválido');return value};
const isParticipant=(value:unknown):value is Participant=>participants.includes(value as Participant);
const isRepo=(value:unknown):value is RepoId=>ids.includes(value as RepoId);
const suites:Suite[]=['owner-linux','composition-linux','composition-windows'];
const verdicts:Verdict[]=['passed','failed','inconclusive'];

export const initialConfig=():Configuration=>({
 formatVersion:2,scenario:'landing-composition-promotion',name:'Landing · promoción coordinada por Composition',
 target:'qa-internal',
 repos:{identity:'identity-service',accounts:'account-service',landing:'landing-product',composition:'landing-composition'},
 requires:{identity:'I1',accounts:'A1',landing:'L2'},
 windowsRequired:true
});
export const empty=():State=>({
 candidates:{},evidence:[],compositionMain:false,evaluation:'unknown',evaluationReasons:['No se ha evaluado Composition/main'],
 attempts:{
  identity:{phase:'idle',number:0,reason:[]},
  accounts:{phase:'idle',number:0,reason:[]},
  landing:{phase:'idle',number:0,reason:[]}
 },deployed:{},unhealthy:[],observations:{identity:0,accounts:0,landing:0},log:[]
});
export function validateConfig(input:unknown):Configuration{
 assert(isObj(input),'Raw Config debe ser objeto');
 assert(input.formatVersion===2&&input.scenario==='landing-composition-promotion','Formato de escenario incompatible');
 assert(input.target==='qa-internal','MVP: solo QA interno admite promoción automática');
 assert(isObj(input.repos)&&isObj(input.requires),'Repositorios y revisiones requeridas obligatorios');
 const repos={} as Record<RepoId,string>;
 for(const id of ids)repos[id]=string(input.repos[id],'Repositorio '+id);
 assert(new Set(Object.values(repos)).size===4,'Nombres de repositorio duplicados');
 const requires={} as Record<Participant,string>;
 for(const id of participants)requires[id]=string(input.requires[id],'Revisión fijada '+id);
 assert(typeof input.windowsRequired==='boolean','windowsRequired debe ser boolean');
 return {formatVersion:2,scenario:'landing-composition-promotion',name:string(input.name,'Nombre'),target:'qa-internal',
 repos,requires,windowsRequired:input.windowsRequired};
}
export function parseInteraction(raw:unknown):Interaction{
 assert(isObj(raw),'Cada interacción debe ser un objeto');
 switch(raw.type){
 case 'candidate':
  assert(isRepo(raw.repo),'Repositorio inválido');
  return {type:'candidate',repo:raw.repo,revision:string(raw.revision,'Revisión'),tree:string(raw.tree,'Árbol')};
 case 'test':
  assert(isRepo(raw.repo)&&suites.includes(raw.suite as Suite)&&verdicts.includes(raw.verdict as Verdict),'Evidencia inválida');
  assert(raw.repo==='composition'?raw.suite!=='owner-linux':raw.suite==='owner-linux','La suite no pertenece al repositorio');
  return {type:'test',repo:raw.repo,suite:raw.suite as Suite,verdict:raw.verdict as Verdict,profile:string(raw.profile,'Perfil de CI')};
 case 'merge':
  assert(isRepo(raw.repo),'Repositorio inválido');
  return {type:'merge',repo:raw.repo,mergedTree:string(raw.mergedTree,'Árbol resultante')};
 case 'evaluate':return {type:'evaluate'};
 case 'request-promotion':return {type:'request-promotion'};
 case 'start':assert(isParticipant(raw.repo),'Propietario inválido');return {type:'start',repo:raw.repo};
 case 'finish':
  assert(isParticipant(raw.repo)&&typeof raw.success==='boolean'&&typeof raw.healthy==='boolean'&&(raw.observedRevision===null||typeof raw.observedRevision==='string'),'Resultado de publicación inválido');
  return {type:'finish',repo:raw.repo,success:raw.success,healthy:raw.healthy,observedRevision:raw.observedRevision as string|null};
 case 'observe':
  assert(isParticipant(raw.repo)&&typeof raw.healthy==='boolean'&&(raw.revision===null||typeof raw.revision==='string')&&Number.isSafeInteger(raw.sequence)&&Number(raw.sequence)>0,'Observación inválida');
  return {type:'observe',repo:raw.repo,revision:raw.revision as string|null,healthy:raw.healthy,sequence:raw.sequence as number};
 default:throw Error('Interacción desconocida: '+String(raw.type));
 }
}
const currentEvidence=(s:State,id:RepoId,suite:Suite):Evidence|undefined=>{
 const candidate=s.candidates[id];if(!candidate)return;
 return [...s.evidence].reverse().find(e=>e.repo===id&&e.suite===suite&&e.revision===candidate.revision&&e.tree===(candidate.mergedTree??candidate.tree));
};
const evidenceReasons=(s:State,c:Configuration):string[]=>{
 const reasons:string[]=[];
 if(!s.compositionMain)reasons.push('Composition no está fusionada en main');
 for(const id of ids){
  const candidate=s.candidates[id];
  if(!candidate){reasons.push(c.repos[id]+': candidato ausente');continue}
  if(!candidate.mergedTree)reasons.push(c.repos[id]+': PR aún no fusionado');
  if(id!=='composition'&&candidate.revision!==c.requires[id])reasons.push(c.repos[id]+': SHA distinto del gitlink fijado');
  const needed:Suite[]=id==='composition'?['composition-linux',...(c.windowsRequired?['composition-windows' as Suite]:[])]:['owner-linux'];
  for(const suite of needed){
   const evidence=currentEvidence(s,id,suite);
   if(!evidence)reasons.push(c.repos[id]+': evidencia '+suite+' desconocida o no reutilizable');
   else if(evidence.verdict!=='passed')reasons.push(c.repos[id]+': '+suite+' '+evidence.verdict);
  }
 }
 return reasons;
};
const dependencyReasons=(s:State,c:Configuration,id:Participant):string[]=>{
 if(id!=='landing')return [];
 const reasons:string[]=[];
 for(const dep of ['identity','accounts'] as Participant[]){
  const actual=s.deployed[dep],required=c.requires[dep];
  if(!actual)reasons.push(c.repos[dep]+': ausente');
  else if(actual!==required)reasons.push(c.repos[dep]+': revisión distinta de '+required);
  else if(s.unhealthy.includes(dep))reasons.push(c.repos[dep]+': unhealthy');
 }
 return reasons;
};
const isReady=(s:State,c:Configuration,id:Participant)=>
 s.evaluation==='eligible'&&dependencyReasons(s,c,id).length===0;
function reconsider(s:State,c:Configuration){
 for(const id of participants){
  const a=s.attempts[id];
  if(a.phase==='deploying'||a.phase==='published'||a.phase==='failed'||a.phase==='already-deployed')continue;
  const reasons=s.evaluation==='eligible'?dependencyReasons(s,c,id):['Composition/main sin autorización válida'];
  if(reasons.length){
   if(a.phase==='queued')s.log.push(c.repos[id]+': autorización en cola revocada');
   a.phase='blocked';a.reason=reasons;
  }else if(a.phase==='blocked'){
   a.phase='queued';a.number++;a.reason=[];
   s.log.push(c.repos[id]+': reevaluado; try-publish #'+a.number+' (sin repetir CI)');
  }
 }
}
export function transition(before:State,config:Configuration,input:Interaction):State{
 const s=structuredClone(before),event=parseInteraction(input);
 const candidate=(id:RepoId)=>{const c=s.candidates[id];assert(c,'Candidato inexistente: '+id);return c};
 switch(event.type){
 case 'candidate':
  assert(!s.candidates[event.repo],'Candidato ya creado para '+event.repo);
  s.candidates[event.repo]={id:event.repo,revision:event.revision,tree:event.tree,mergedTree:null};
  s.log.push(config.repos[event.repo]+'@'+event.revision+': candidato preparado');break;
 case 'test':{
  const c=candidate(event.repo);
  s.evidence.push({repo:event.repo,revision:c.revision,tree:c.mergedTree??c.tree,suite:event.suite,
   verdict:event.verdict,profile:event.profile});
  s.log.push(config.repos[event.repo]+': '+event.suite+' '+event.verdict+' ('+event.profile+')');break;
 }
 case 'merge':{
  const c=candidate(event.repo);
  assert(c.mergedTree===null,'El candidato ya fue fusionado');
  if(event.repo==='composition'){
   for(const id of participants){
    assert(s.candidates[id]?.mergedTree,'Fusionar primero los propietarios');
    assert(s.candidates[id]?.revision===config.requires[id],'Gitlink no coincide: '+id);
   }
  }
  c.mergedTree=event.mergedTree;
  if(event.repo==='composition')s.compositionMain=true;
  s.log.push(config.repos[event.repo]+': fusionado en main; árbol '+event.mergedTree);break;
 }
 case 'evaluate':{
  s.evaluationReasons=evidenceReasons(s,config);
  s.evaluation=s.evaluationReasons.length===0?'eligible':
   s.evaluationReasons.some(x=>/failed|fallido/i.test(x))?'rejected':
   s.evaluationReasons.some(x=>/desconocida|inconclusive|no está|ausente|aún no|no fusionado/i.test(x))?'unknown':'blocked';
  s.log.push('Composition/main: '+s.evaluation+' — '+(s.evaluationReasons.join('; ')||'evidencia completa y vigente'));
  reconsider(s,config);break;
 }
 case 'request-promotion':{
  assert(s.evaluation==='eligible','Composition/main no ha autorizado la promoción');
  for(const id of participants){
   const a=s.attempts[id];assert(a.phase==='idle'||a.phase==='blocked'||a.phase==='failed','Solicitud duplicada: '+id);
   const deployed=s.deployed[id];
   if(deployed===config.requires[id]&&!s.unhealthy.includes(id)){
    a.phase='already-deployed';a.reason=[];s.log.push(config.repos[id]+': AlreadyDeployed');
   }else{
    const reasons=dependencyReasons(s,config,id);
    a.phase=reasons.length?'blocked':'queued';a.reason=reasons;
    if(!reasons.length)a.number++;
    s.log.push(config.repos[id]+': '+(reasons.length?'Blocked '+reasons.join(', '):'try-publish #'+a.number+' en QA interno'));
   }
  }break;
 }
 case 'start':{
  const a=s.attempts[event.repo];
  assert(a.phase==='queued','No existe solicitud autorizada en cola');
  assert(isReady(s,config,event.repo),'Dependencias cambiaron antes del efecto');
  a.phase='deploying';s.log.push(config.repos[event.repo]+': publicación iniciada por propietario');break;
 }
 case 'finish':{
  const a=s.attempts[event.repo];assert(a.phase==='deploying','No hay publicación en curso');
  if(event.success){
   assert(event.observedRevision===config.requires[event.repo]&&event.healthy,'SUCCESS requiere SHA exacto observado y healthy');
   a.phase='published';s.deployed[event.repo]=event.observedRevision;s.unhealthy=s.unhealthy.filter(x=>x!==event.repo);
  }else a.phase='failed';
  s.log.push(config.repos[event.repo]+': '+(event.success?'SUCCESS observado '+event.observedRevision:'FAILED observado'));
  reconsider(s,config);break;
 }
 case 'observe':{
  if(event.sequence<=s.observations[event.repo]){
   s.log.push(config.repos[event.repo]+': observación antigua/duplicada ignorada');break;
  }
  s.observations[event.repo]=event.sequence;
  if(event.revision===null)delete s.deployed[event.repo];else s.deployed[event.repo]=event.revision;
  s.unhealthy=s.unhealthy.filter(x=>x!==event.repo);
  if(!event.healthy&&event.revision!==null)s.unhealthy.push(event.repo);
  s.log.push(config.repos[event.repo]+': observación #'+event.sequence+' '+(event.revision??'ausente'));
  reconsider(s,config);break;
 }
 }
 return s;
}
export function replay(doc:Document,until:number=doc.cursor):State{
 const c=validateConfig(doc.config);
 assert(Number.isInteger(until)&&until>=0&&until<=doc.interactions.length,'Cursor inválido');
 let s=empty();
 for(const e of doc.interactions.slice(0,until))s=transition(s,c,e);
 return s;
}
export function validateDocument(raw:unknown):Document{
 assert(isObj(raw)&&raw.formatVersion===2,'Documento v2 inválido');
 const config=validateConfig(raw.config);
 assert(Array.isArray(raw.interactions)&&raw.interactions.length<=160,'Historial excesivo');
 const interactions=raw.interactions.map(parseInteraction);
 assert(Number.isInteger(raw.cursor)&&Number(raw.cursor)>=0&&Number(raw.cursor)<=interactions.length,'Cursor inválido');
 const doc:Document={formatVersion:2,config,interactions,cursor:raw.cursor as number};
 replay(doc,interactions.length);return doc;
}
export const append=(doc:Document,event:Interaction):Document=>validateDocument({...doc,
 interactions:[...doc.interactions.slice(0,doc.cursor),event],cursor:doc.cursor+1});
export const move=(doc:Document,cursor:number):Document=>validateDocument({...doc,cursor});
export const replaceConfig=(doc:Document,config:unknown):Document=>validateDocument({...doc,config});
export const replaceInteractions=(doc:Document,interactions:unknown):Document=>{
 assert(Array.isArray(interactions),'Raw Interactions debe ser arreglo');
 return validateDocument({...doc,interactions,cursor:interactions.length});
};
export const example=():Document=>validateDocument({formatVersion:2,config:initialConfig(),cursor:10,interactions:[
 {type:'candidate',repo:'identity',revision:'I1',tree:'tree-I1'},
 {type:'candidate',repo:'accounts',revision:'A1',tree:'tree-A1'},
 {type:'candidate',repo:'landing',revision:'L2',tree:'tree-L2'},
 {type:'candidate',repo:'composition',revision:'C1',tree:'tree-C1'},
 {type:'test',repo:'identity',suite:'owner-linux',verdict:'passed',profile:'linux'},
 {type:'test',repo:'accounts',suite:'owner-linux',verdict:'passed',profile:'linux'},
 {type:'test',repo:'landing',suite:'owner-linux',verdict:'passed',profile:'linux'},
 {type:'test',repo:'composition',suite:'composition-linux',verdict:'passed',profile:'linux-aspire-sql-e2e'},
 {type:'test',repo:'composition',suite:'composition-windows',verdict:'passed',profile:'windows-iis-serviu-qa-approx'},
 {type:'evaluate'}
]});
