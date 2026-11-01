import {append,empty,example,initialConfig,move,replay,replaceConfig,replaceInteractions,
 type Configuration,type Document,type Interaction,type Participant,type RepoId,type State,type Suite,
 participants,validateDocument} from './composition.js';
import {decode,encode} from './composition-share.js';
let doc:Document=example(),s:State=replay(doc),tab:'overview'|'raw'='overview';
let action: {type:string;repo?:RepoId}={type:''},writeId=0;
const el=<T extends HTMLElement=HTMLElement>(id:string):T=>document.getElementById(id) as T;
const esc=(s:unknown):string=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const button=(repo:RepoId,type:string,label:string,primary=false)=>
 '<button class="button small '+(primary?'primary':'secondary')+'" data-action="'+esc(type)+'" data-repo="'+repo+'">'+esc(label)+'</button>';
const status=(phase:string)=>phase==='published'||phase==='already-deployed'?'success':
 phase==='failed'?'danger':phase==='blocked'?'warning':phase==='queued'||phase==='deploying'?'purple':'';
function message(value:string,ok=false){
 el('notice').hidden=false;el('notice').className=ok?'info':'';el('notice').textContent=value;
}
function clearMessage(){el('notice').hidden=true;el('notice').textContent=''}
async function syncUrl(){
 const id=++writeId;
 try{const hash=await encode(doc);if(id===writeId)history.replaceState(null,'',location.pathname+location.search+hash)}
 catch(e){if(id===writeId)message(String(e))}
}
function setDoc(next:Document){
 doc=next;s=replay(doc);clearMessage();render();void syncUrl();
}
function send(interaction:Interaction){
 try{setDoc(append(doc,interaction))}catch(e){message(e instanceof Error?e.message:String(e))}
}
function seek(cursor:number){try{setDoc(move(doc,cursor))}catch(e){message(String(e))}}
function name(repo:RepoId){return doc.config.repos[repo]}
function repoCard(repo:RepoId){
 const candidate=s.candidates[repo],owner=repo!=='composition',a=owner?s.attempts[repo as Participant]:undefined;
 const observed=owner?s.deployed[repo as Participant]:undefined;
 const evidence=s.evidence.filter(e=>e.repo===repo).slice(-4).reverse();
 const merged=candidate?.mergedTree;
 const nameHtml=esc(name(repo));
 let controls='';
 if(!candidate)controls+=button(repo,'candidate','+ Crear candidato',true);
 else{
  if(!merged){
   if(repo==='composition'){
    controls+=button(repo,'test','Registrar E2E Linux');
    if(doc.config.windowsRequired)controls+=button(repo,'windows','Registrar Windows/IIS');
   }else controls+=button(repo,'test','Registrar CI funcional');
   controls+=button(repo,'merge','Fusionar PR a main');
  }else{
   controls+=button(repo,'test','Reevaluar tests Linux');
   if(repo==='composition'&&doc.config.windowsRequired)controls+=button(repo,'windows','Reevaluar Windows/IIS');
  }
 }
 if(owner&&candidate){
  if(a?.phase==='queued')controls+=button(repo,'start','Iniciar publicación',true);
  if(a?.phase==='deploying')controls+=button(repo,'finish','Registrar resultado',true);
  controls+=button(repo,'observe','Observar ambiente');
 }
 if(repo==='composition'&&candidate){
  controls+=button(repo,'evaluate','Evaluar evidencia',true);
  if(s.evaluation==='eligible')controls+=button(repo,'request-promotion','Solicitar QA interno',true);
 }
 const evidenceRows=evidence.map(e=>'<div class="composition-evidence">'+esc(e.suite)+' · <strong class="'+(e.verdict==='passed'?'health':'')+'">'+esc(e.verdict)+'</strong><span>'+esc(e.profile)+'</span></div>').join('');
 const tag=repo==='composition'?'<span class="panel-tag">AUTORIDAD</span>':
 '<span class="panel-tag">PROPIETARIO</span>';
 return '<article class="repo-card '+(repo==='composition'?'primary-repo':'')+'">'+
 '<div class="repo-head"><div class="repo-title"><span class="repo-symbol">◇</span><div><div class="repo-name">'+nameHtml+'</div><div class="repo-role">'+(repo==='composition'?'Compatibilidad y autorización de promoción':'Pruebas propias y realización del despliegue')+'</div></div></div>'+tag+'</div>'+
 '<div class="chips">'+(candidate?'<span class="chip purple">'+esc(candidate.revision)+'</span><span class="chip '+(merged?'success':'')+'">'+(merged?'Fusionado a main':'Candidato PR')+'</span>':'<span class="chip">Sin candidato</span>')+
 (a?'<span class="chip '+status(a.phase)+'">'+esc(a.phase)+'</span>':'')+'</div>'+
 (candidate?'<div class="repo-deps">Árbol candidato: '+esc(candidate.tree)+(merged?'<br>Árbol en main: '+esc(merged):'')+'</div>':'')+
 (owner?'<div class="current-deploy">Ambiente QA interno: '+(observed?esc(observed)+(s.unhealthy.includes(repo as Participant)?' · unhealthy':' · healthy'):'sin revisión observada')+'</div>':'<div class="repo-deps">Gitlinks fijados: '+participants.map(p=>esc(name(p))+'@'+esc(doc.config.requires[p])).join(' · ')+'</div>')+
 (evidenceRows?'<div class="composition-evidence-list">'+evidenceRows+'</div>':'')+
 (a?.reason.length?'<div class="blockers">'+a.reason.map(esc).join(' · ')+'</div>':'')+
 (repo==='composition'?'<div class="composition-evaluation">Decisión: <span class="chip '+status(s.evaluation==='eligible'?'published':s.evaluation==='rejected'?'failed':'blocked')+'">'+esc(s.evaluation)+'</span>'+
 (s.evaluationReasons.length?'<p>'+s.evaluationReasons.map(esc).join(' · ')+'</p>':'')+'</div>':'')+
 '<div class="candidate-actions">'+controls+'</div></article>';
}
function renderHistory(){
 const h=[{text:'Inicio',cursor:0},...doc.interactions.map((e,i)=>({text:
  e.type==='candidate'?e.repo+'@'+e.revision+' candidato':
  e.type==='test'?e.repo+' '+e.suite+' '+e.verdict:
  e.type==='merge'?e.repo+' fusionado':
  e.type==='finish'?e.repo+' '+(e.success?'SUCCESS':'FAILED'):
  e.type==='observe'?e.repo+' observación #'+e.sequence:
  e.type==='start'?e.repo+' inicia publicación':e.type,cursor:i+1}))];
 el('history-position').textContent=doc.cursor+' / '+doc.interactions.length;
 const range=el<HTMLInputElement>('cursor');range.max=String(doc.interactions.length);range.value=String(doc.cursor);
 for(const [id,disabled] of [['first',doc.cursor===0],['prev',doc.cursor===0],['next',doc.cursor===doc.interactions.length],['last',doc.cursor===doc.interactions.length]] as const)
 el<HTMLButtonElement>(id).disabled=disabled;
 el('history-list').innerHTML=h.map(e=>'<button class="history-step '+(e.cursor===doc.cursor?'current':e.cursor>doc.cursor?'future':'')+
 '" data-cursor="'+e.cursor+'">#'+e.cursor+' '+esc(e.text)+'</button>').join('');
}
function render(){
 el('scenario-title').textContent=doc.config.name;
 el('metric-interactions').textContent=String(doc.interactions.length);
 el('metric-cursor').textContent=String(doc.cursor);
 el('composition-card').innerHTML=repoCard('composition');
 el('service-cards').innerHTML=repoCard('identity')+repoCard('accounts');
 el('landing-card').innerHTML=repoCard('landing');
 el('events-list').innerHTML=s.log.slice().reverse().map((e,i)=>
 '<li><span class="event-dot"></span><div class="event-text">'+esc(e)+'<span class="event-number">Evento #'+(s.log.length-i)+'</span></div></li>').join('')||
 '<li><span class="event-dot"></span><div class="event-text">Sin transiciones todavía</div></li>';
 renderHistory();
 el('overview-view').hidden=tab!=='overview';el('raw-view').hidden=tab!=='raw';
 el('tab-overview').classList.toggle('active',tab==='overview');el('tab-raw').classList.toggle('active',tab==='raw');
 el('tab-overview').setAttribute('aria-selected',String(tab==='overview'));
 el('tab-raw').setAttribute('aria-selected',String(tab==='raw'));
 if(tab==='raw'){
  el<HTMLTextAreaElement>('config-json').value=JSON.stringify(doc.config,null,2);
  el<HTMLTextAreaElement>('interactions-json').value=JSON.stringify(doc.interactions,null,2);
  el('raw-count').textContent=doc.interactions.length+' interacciones · cursor '+doc.cursor;
 }
}
function field(id:string,label:string,value:string,selectOptions?:string[]):string {
 return '<label>'+esc(label)+(selectOptions?
 '<select name="'+id+'">'+selectOptions.map(opt=>'<option value="'+esc(opt)+'" '+(opt===value?'selected':'')+'>'+esc(opt)+'</option>').join('')+'</select>':
 '<input name="'+id+'" value="'+esc(value)+'" required maxlength="100">')+'</label>';
}
function openAction(type:string,repo?:RepoId){
 action={type,repo};
 const candidate=repo?s.candidates[repo]:undefined;
 el('action-title').textContent=type+' · '+(repo?name(repo):'Composition');
 let html='';
 if(type==='candidate'){
  html+=field('revision','Revisión (identificador ilustrativo)',repo==='composition'?'C1':doc.config.requires[repo as Participant]);
  html+=field('tree','Identificador del árbol probado','tree-'+(repo==='composition'?'C1':doc.config.requires[repo as Participant]));
 }else if(type==='test'||type==='windows'){
  html+=field('verdict','Resultado','passed',['passed','failed','inconclusive']);
  html+=field('profile','Perfil de pruebas',type==='windows'?doc.config.profiles.compositionWindows:
   repo==='composition'?doc.config.profiles.compositionLinux:doc.config.profiles.ownerLinux);
 }else if(type==='merge'){
  html+=field('tree','Árbol resultante de merge',candidate?.tree??'');
 }else if(type==='finish'){
  html+=field('result','Resultado','success',['success','failed']);
  html+=field('revision','Revisión efectivamente observada',doc.config.requires[repo as Participant]);
  html+=field('healthy','Healthy','true',['true','false']);
 }else if(type==='observe'){
  html+=field('revision','Revisión observada (vacío = ausente)',s.deployed[repo as Participant]??'');
  html+=field('healthy','Salud','true',['true','false']);
  html+=field('sequence','Número de observación',String((s.observations[repo as Participant]??0)+1));
 }
 el('action-fields').innerHTML=html;
 el<HTMLDialogElement>('action-dialog').showModal();
}
function commitAction(){
 const {type,repo}=action;
 if(!repo)return;
 const form=new FormData(el<HTMLFormElement>('action-form'));
 const value=(name:string)=>String(form.get(name)??'');
 let e:Interaction;
 switch(type){
 case 'candidate':e={type:'candidate',repo,revision:value('revision'),tree:value('tree')};break;
 case 'merge':e={type:'merge',repo,mergedTree:value('tree')};break;
 case 'test':case 'windows':
  e={type:'test',repo,suite:(repo==='composition'?(type==='windows'?'composition-windows':'composition-linux'):'owner-linux') as Suite,
   verdict:value('verdict') as 'passed'|'failed'|'inconclusive',profile:value('profile')};break;
 case 'finish':e={type:'finish',repo:repo as Participant,success:value('result')==='success',
  observedRevision:value('result')==='success'?value('revision'):null,healthy:value('healthy')==='true'};break;
 case 'observe':e={type:'observe',repo:repo as Participant,revision:value('revision')||null,
  healthy:value('healthy')==='true',sequence:Number(value('sequence'))};break;
 default:return;
 }
 send(e);
}
document.querySelectorAll('[id^="tab-"]').forEach(b=>b.addEventListener('click',()=>{
 tab=b.id==='tab-raw'?'raw':'overview';render()
}));
el('reset-demo').addEventListener('click',()=>setDoc(example()));
el('clear').addEventListener('click',()=>setDoc(validateDocument({formatVersion:2,config:initialConfig(),interactions:[],cursor:0})));
el('copy-link').addEventListener('click',async()=>{
 try{const hash=await encode(doc);++writeId;history.replaceState(null,'',location.pathname+location.search+hash);
 await navigator.clipboard.writeText(location.href);message('Enlace reproducible copiado.',true)}
 catch(e){message(String(e))}
});
el('overview-view').addEventListener('click',e=>{
 const t=(e.target as Element).closest<HTMLElement>('[data-action],[data-cursor]');
 if(!t)return;
 if(t.dataset.cursor)seek(Number(t.dataset.cursor));
 else if(t.dataset.action){
  const type=t.dataset.action,repo=t.dataset.repo as RepoId;
  if(type==='evaluate')send({type:'evaluate'});
  else if(type==='request-promotion')send({type:'request-promotion'});
  else if(type==='start')send({type:'start',repo:repo as Participant});
  else openAction(type,repo);
 }
});
el('first').addEventListener('click',()=>seek(0));el('prev').addEventListener('click',()=>seek(doc.cursor-1));
el('next').addEventListener('click',()=>seek(doc.cursor+1));
el('last').addEventListener('click',()=>seek(doc.interactions.length));
el<HTMLInputElement>('cursor').addEventListener('change',e=>seek(Number((e.target as HTMLInputElement).value)));
el('close-dialog').addEventListener('click',()=>el<HTMLDialogElement>('action-dialog').close());
el('cancel-dialog').addEventListener('click',()=>el<HTMLDialogElement>('action-dialog').close());
el<HTMLFormElement>('action-form').addEventListener('submit',e=>{
 e.preventDefault();const old=doc;commitAction();if(old!==doc)el<HTMLDialogElement>('action-dialog').close();
});
el('apply-config').addEventListener('click',()=>{
 try{setDoc(replaceConfig(doc,JSON.parse(el<HTMLTextAreaElement>('config-json').value)));message('Config validada.',true)}
 catch(e){message(String(e))}
});
el('apply-interactions').addEventListener('click',()=>{
 try{setDoc(replaceInteractions(doc,JSON.parse(el<HTMLTextAreaElement>('interactions-json').value)));message('Historia validada.',true)}
 catch(e){message(String(e))}
});
async function bootstrap(){
 if(location.hash.startsWith('#v2.')){
  try{doc=await decode(location.hash)}catch(e){message('URL inválida: '+String(e))}
 }
 s=replay(doc);render();
 if(!location.hash)void syncUrl();
}
void bootstrap();
