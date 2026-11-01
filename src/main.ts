import {blockers,version,type Event,type Repo,type State,type Version} from './model.js';
import {landingMvp,replay,append,jump,updateConfig,updateInteractions,type Interaction,type PlaygroundDocument} from './document.js';
import {encodeHash,decodeHash} from './share.js';

type Tab='overview'|'raw';
let current:PlaygroundDocument=landingMvp();
let state:State=replay(current);
let activeTab:Tab='overview';
let versionRepo='identity';
let observeRepo='identity';
let writeGeneration=0;

const byId=<T extends HTMLElement=HTMLElement>(id:string):T=>{
  const element=document.getElementById(id);
  if(!element)throw new Error('Elemento faltante: '+id);
  return element as T;
};
const escapeHtml=(value:unknown):string=>String(value).replace(/[&<>"']/g,
  character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
const errorMessage=(error:unknown)=>error instanceof Error?error.message:String(error);
const describeStatus=(status:Version['publish'])=>({
  idle:'Sin publicar',blocked:'Bloqueado',queued:'En cola',deploying:'Desplegando',failed:'Falló',published:'Publicado'
}[status]);
const statusClass=(status:Version['publish']):string=>({
  idle:'',blocked:'warning',queued:'purple',deploying:'purple',failed:'danger',published:'success'
}[status]);

function showMessage(message:string,informational=false){
  const notice=byId('notice');
  notice.textContent=message;
  notice.hidden=false;
  notice.className=informational?'info':'';
}
function clearMessage(){
  const notice=byId('notice');
  notice.hidden=true;
  notice.textContent='';
}
function makeCurrent(next:PlaygroundDocument){
  current=next;
  state=replay(current);
  clearMessage();
  render();
  void updateUrl();
}
async function updateUrl(){
  const generation=++writeGeneration;
  try{
    const hash=await encodeHash(current);
    if(generation===writeGeneration)
      window.history.replaceState(null,'',window.location.pathname+window.location.search+hash);
  }catch(error){if(generation===writeGeneration)showMessage(errorMessage(error))}
}
function interact(event:Interaction){
  try{makeCurrent(append(current,event))}
  catch(error){showMessage(errorMessage(error))}
}
function move(cursor:number){
  try{makeCurrent(jump(current,cursor))}
  catch(error){showMessage(errorMessage(error))}
}

function candidateActions(candidate:Version):string {
  const id=escapeHtml(candidate.id);
  const button=(action:string,label:string,primary=false)=>
    '<button class="button small '+(primary?'primary':'secondary')+'" data-event="'+action+'" data-version="'+id+'" type="button">'+label+'</button>';
  const buttons:string[]=[];
  if(candidate.test==='pending'){
    buttons.push(button('test-pass','✓ Aprobar test.yml',true));
    buttons.push(button('test-fail','✕ Fallar test'));
  }
  if(candidate.publish==='idle'||candidate.publish==='blocked'||candidate.publish==='failed')
    buttons.push(button('try','Intentar publish.yml',candidate.test==='passed'));
  if(candidate.publish==='queued')buttons.push(button('start','Iniciar deploy',true));
  if(candidate.publish==='deploying'){
    buttons.push(button('success','SUCCESS',true));
    buttons.push(button('failure','FAILED'));
  }
  return buttons.length?'<div class="candidate-actions">'+buttons.join('')+'</div>':'';
}
function renderCandidate(candidate:Version):string {
  const reasons=candidate.publish==='blocked'?blockers(state,candidate):[];
  const requires=Object.entries(candidate.requires).map(([repoId,rev])=>{
    const name=state.repos.find(r=>r.id===repoId)?.name??repoId;
    return escapeHtml(name)+'@'+escapeHtml(version(state,rev)?.name??rev);
  }).join(' · ');
  const testLabel=candidate.test==='passed'?'CI aprobado':candidate.test==='failed'?'CI fallido':'CI pendiente';
  const testColor=candidate.test==='passed'?'success':candidate.test==='failed'?'danger':'';
  return '<div class="candidate">'+
    '<div class="candidate-title"><strong>'+escapeHtml(candidate.name)+'</strong><small>'+candidate.attempts+' intentos</small></div>'+
    '<div class="chips"><span class="chip '+testColor+'">'+testLabel+'</span><span class="chip '+statusClass(candidate.publish)+'">'+describeStatus(candidate.publish)+'</span></div>'+
    (requires?'<div class="repo-deps">Requiere: '+requires+'</div>':'')+
    (reasons.length?'<div class="blockers">⏳ '+reasons.map(escapeHtml).join(' · ')+'</div>':'')+
    candidateActions(candidate)+'</div>';
}
function renderRepo(repo:Repo):string {
  const candidates=state.versions.filter(v=>v.repo===repo.id);
  const deployedId=state.deployed[repo.id];
  const deployed=deployedId?version(state,deployedId):undefined;
  const healthy=!!deployed&&!state.unhealthy.includes(deployedId);
  const dependencyNames=repo.dependencies.map(id=>state.repos.find(r=>r.id===id)?.name??id);
  const name=escapeHtml(repo.name),id=escapeHtml(repo.id);
  return '<article class="repo-card '+(repo.id==='landing'?'primary-repo':'')+'">'+
    '<div class="repo-head"><div class="repo-title"><span class="repo-symbol" aria-hidden="true">◇</span>'+
    '<div><div class="repo-name">'+name+'</div><div class="repo-role">'+(repo.id==='landing'?'Producto desplegable':'Servicio independiente')+'</div></div></div></div>'+
    '<div class="current-deploy">'+(deployed?
      '<span class="health '+(healthy?'':'bad')+'">●</span> Desplegada '+escapeHtml(deployed.name)+(healthy?' · Healthy':' · Unhealthy'):
      '○ Sin versión desplegada')+'</div>'+
    '<div class="repo-deps">'+(dependencyNames.length?
      'Depende de <strong>'+dependencyNames.map(escapeHtml).join('</strong> y <strong>')+'</strong>':
      'Sin dependencias de producto')+'</div>'+
    (candidates.length?candidates.slice().reverse().map(renderCandidate).join(''):'<p class="muted small">Sin versiones creadas.</p>')+
    '<div class="repo-footer"><span>'+candidates.length+' versiones</span><div class="candidate-actions">'+
    '<button class="button small secondary" data-new-version="'+id+'" type="button">+ Nueva versión</button>'+
    '<button class="button small ghost" data-observe="'+id+'" type="button">Observar</button>'+
    '</div></div></article>';
}
function describeInteraction(event:Interaction):string {
  const versionName='id'in event?(state.versions.find(v=>v.id===event.id)?.name??event.id):'';
  switch(event.type){
    case 'version':return event.repo+' → '+event.name+' creada';
    case 'test':return versionName+': test.yml '+(event.result==='passed'?'passed':'failed');
    case 'try':return versionName+': intentar publish.yml';
    case 'start':return versionName+': iniciar despliegue';
    case 'finish':return versionName+': '+(event.success?'SUCCESS':'FAILED');
    case 'health':return versionName+': '+(event.healthy?'healthy':'unhealthy');
    case 'observe':return event.repo+': observación #'+event.sequence;
  }
}
function renderHistory(){
  const length=current.interactions.length;
  byId('history-position').textContent=current.cursor+' / '+length;
  const range=byId<HTMLInputElement>('history-range');
  range.max=String(length);
  range.value=String(current.cursor);
  byId<HTMLButtonElement>('step-first').disabled=current.cursor===0;
  byId<HTMLButtonElement>('step-prev').disabled=current.cursor===0;
  byId<HTMLButtonElement>('step-next').disabled=current.cursor===length;
  byId<HTMLButtonElement>('step-last').disabled=current.cursor===length;
  const items=[{label:'Inicio',cursor:0},...current.interactions.map((interaction,index)=>({
    label:describeInteraction(interaction),cursor:index+1
  }))];
  byId('history-list').innerHTML=items.map(item=>'<button type="button" class="history-step '+
    (item.cursor===current.cursor?'current':item.cursor>current.cursor?'future':'')+
    '" data-cursor="'+item.cursor+'" aria-current="'+(item.cursor===current.cursor?'step':'false')+'">#'+item.cursor+' '+escapeHtml(item.label)+'</button>').join('');
}
function renderEvents(){
  const entries=state.log.slice(current.config.repositories.length).map((message,index)=>({message,index:index+1})).reverse();
  byId('events-list').innerHTML=entries.length?entries.slice(0,16).map(item=>{
    const type=/bloqueado|revocada|unhealthy|incompatible|ausente/i.test(item.message)?'caution':
      /FAILED|fallido|rechazado/i.test(item.message)?'negative':
      /SUCCESS|passed|disponible|queued|published|healthy/i.test(item.message)?'positive':'';
    return '<li class="'+type+'"><span class="event-dot" aria-hidden="true"></span><div class="event-text">'+
      escapeHtml(item.message)+'<span class="event-number">Transición derivada #'+item.index+'</span></div></li>';
  }).join(''):'<li><span class="event-dot"></span><div class="event-text muted">Sin transiciones en este punto.</div></li>';
}
function render(){
  byId('scenario-title').textContent=current.config.name;
  byId('metric-repos').textContent=String(state.repos.length);
  byId('metric-deps').textContent=String(state.repos.reduce((n,r)=>n+r.dependencies.length,0));
  byId('metric-interactions').textContent=String(current.interactions.length);
  byId('metric-cursor').textContent=String(current.cursor);
  byId('upstream-repos').innerHTML=state.repos.filter(r=>r.id!=='landing').map(renderRepo).join('');
  const landing=state.repos.find(r=>r.id==='landing');
  byId('landing-repo').innerHTML=landing?renderRepo(landing):'';
  renderEvents();
  renderHistory();
  byId('overview-view').hidden=activeTab!=='overview';
  byId('raw-view').hidden=activeTab!=='raw';
  byId('tab-overview').classList.toggle('active',activeTab==='overview');
  byId('tab-raw').classList.toggle('active',activeTab==='raw');
  byId('tab-overview').setAttribute('aria-selected',String(activeTab==='overview'));
  byId('tab-raw').setAttribute('aria-selected',String(activeTab==='raw'));
  if(activeTab==='raw'){
    byId<HTMLTextAreaElement>('config-json').value=JSON.stringify(current.config,null,2);
    byId<HTMLTextAreaElement>('interactions-json').value=JSON.stringify(current.interactions,null,2);
    byId('raw-count').textContent=current.interactions.length+' interacciones · cursor '+current.cursor;
  }
}
function openNewVersion(repoId:string){
  versionRepo=repoId;
  const repo=state.repos.find(r=>r.id===repoId);
  if(!repo)return;
  byId('version-repo-label').textContent=repo.name;
  byId<HTMLInputElement>('new-version-name').value='';
  byId('version-dependencies').innerHTML=repo.dependencies.map(depId=>{
    const dep=state.repos.find(r=>r.id===depId);
    const choices=state.versions.filter(v=>v.repo===depId).map(v=>
      '<option value="'+escapeHtml(v.id)+'">'+escapeHtml(v.name)+'</option>');
    return '<label>'+escapeHtml(dep?.name??depId)+' — versión requerida'+
      '<select required data-require="'+escapeHtml(depId)+'"><option value="">Seleccionar versión</option>'+choices.join('')+'</select></label>';
  }).join('');
  byId<HTMLDialogElement>('version-dialog').showModal();
  byId<HTMLInputElement>('new-version-name').focus();
}
function openObservation(repoId:string){
  observeRepo=repoId;
  const repo=state.repos.find(r=>r.id===repoId);
  if(!repo)return;
  byId('observe-repo-label').textContent=repo.name;
  const selected=state.deployed[repoId]??'';
  byId<HTMLSelectElement>('observed-revision').innerHTML='<option value="">Ausente</option>'+
    state.versions.filter(v=>v.repo===repoId).map(v=>
      '<option value="'+escapeHtml(v.id)+'" '+(selected===v.id?'selected':'')+'>'+escapeHtml(v.name)+'</option>').join('');
  byId<HTMLSelectElement>('observed-health').value='true';
  byId<HTMLInputElement>('observed-sequence').value=String((state.observations[repoId]??0)+1);
  byId<HTMLDialogElement>('observe-dialog').showModal();
}
function eventFromButton(button:HTMLButtonElement){
  const id=button.dataset.version??'';
  let action:Interaction;
  switch(button.dataset.event){
    case 'test-pass':action={type:'test',id,result:'passed'};break;
    case 'test-fail':action={type:'test',id,result:'failed'};break;
    case 'try':action={type:'try',id};break;
    case 'start':action={type:'start',id};break;
    case 'success':action={type:'finish',id,success:true};break;
    case 'failure':action={type:'finish',id,success:false};break;
    default:return;
  }
  interact(action);
}
function setTab(tab:Tab){activeTab=tab;render()}
byId('tab-overview').addEventListener('click',()=>setTab('overview'));
byId('tab-raw').addEventListener('click',()=>setTab('raw'));
byId('reset-demo').addEventListener('click',()=>makeCurrent(landingMvp()));
byId('copy-link').addEventListener('click',async()=>{
  try{
    const hash=await encodeHash(current);
    ++writeGeneration;
    window.history.replaceState(null,'',window.location.pathname+window.location.search+hash);
    await navigator.clipboard.writeText(window.location.href);
    showMessage('Enlace reproducible copiado al portapapeles.',true);
  }catch(error){showMessage('No se pudo copiar el enlace: '+errorMessage(error))}
});
byId('overview-view').addEventListener('click',event=>{
  const element=(event.target as Element).closest<HTMLButtonElement>('[data-event],[data-new-version],[data-observe],[data-cursor]');
  if(!element)return;
  if(element.dataset.event)eventFromButton(element);
  else if(element.dataset.newVersion)openNewVersion(element.dataset.newVersion);
  else if(element.dataset.observe)openObservation(element.dataset.observe);
  else if(element.dataset.cursor)move(Number(element.dataset.cursor));
});
byId('step-first').addEventListener('click',()=>move(0));
byId('step-prev').addEventListener('click',()=>move(current.cursor-1));
byId('step-next').addEventListener('click',()=>move(current.cursor+1));
byId('step-last').addEventListener('click',()=>move(current.interactions.length));
byId<HTMLInputElement>('history-range').addEventListener('change',event=>move(Number((event.target as HTMLInputElement).value)));
document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(button=>
  button.addEventListener('click',()=>byId<HTMLDialogElement>(button.dataset.close!).close()));
byId<HTMLFormElement>('version-form').addEventListener('submit',event=>{
  event.preventDefault();
  const repo=state.repos.find(r=>r.id===versionRepo);
  if(!repo)return;
  const requires:Record<string,string>={};
  byId('version-dependencies').querySelectorAll<HTMLSelectElement>('[data-require]').forEach(select=>{
    requires[select.dataset.require!]=select.value;
  });
  let number=state.versions.length+1;
  while(state.versions.some(v=>v.id==='candidate-'+number))number++;
  const name=byId<HTMLInputElement>('new-version-name').value.trim();
  try{
    makeCurrent(append(current,{type:'version',id:'candidate-'+number,repo:repo.id,name,requires}));
    byId<HTMLDialogElement>('version-dialog').close();
  }catch(error){showMessage(errorMessage(error))}
});
byId<HTMLFormElement>('observe-form').addEventListener('submit',event=>{
  event.preventDefault();
  const revision=byId<HTMLSelectElement>('observed-revision').value||null;
  const healthy=byId<HTMLSelectElement>('observed-health').value==='true';
  const sequence=Number(byId<HTMLInputElement>('observed-sequence').value);
  try{
    makeCurrent(append(current,{type:'observe',repo:observeRepo,revision,healthy,sequence}));
    byId<HTMLDialogElement>('observe-dialog').close();
  }catch(error){showMessage(errorMessage(error))}
});
byId('apply-config').addEventListener('click',()=>{
  try{
    makeCurrent(updateConfig(current,JSON.parse(byId<HTMLTextAreaElement>('config-json').value)));
    showMessage('Raw Config validado y aplicado.',true);
  }catch(error){showMessage('Raw Config: '+errorMessage(error))}
});
byId('apply-interactions').addEventListener('click',()=>{
  try{
    makeCurrent(updateInteractions(current,JSON.parse(byId<HTMLTextAreaElement>('interactions-json').value)));
    showMessage('Raw Interactions validado. Historia reconstruida.',true);
  }catch(error){showMessage('Raw Interactions: '+errorMessage(error))}
});

async function initialize(){
  if(window.location.hash){
    try{current=await decodeHash(window.location.hash)}
    catch(error){showMessage('Enlace inválido: '+errorMessage(error)+'. Se cargó la demo local.')}
  }
  state=replay(current);
  render();
  if(!window.location.hash)void updateUrl();
}
void initialize();
