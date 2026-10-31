import {initial,landing,reduce,blockers,version,type State,type Event,type Version} from './model.js';
let state:State=initial();
let next=1;
let expanded:string|null=null;
const get=(id:string)=>document.getElementById(id)!;
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const dispatch=(event:Event)=>{try{state=reduce(state,event);get('notice').textContent='';render()}catch(e){get('notice').textContent=e instanceof Error?e.message:String(e)}};
const newId=()=>`rev-${next++}`;
function renderVersion(v:Version):string{
 const repo=state.repos.find(r=>r.id===v.repo);
 const deps=Object.entries(v.requires).map(([r,sha])=>`${esc(state.repos.find(x=>x.id===r)?.name??r)}: ${esc(version(state,sha)?.name??sha)}`).join(' · ');
 const reasons=blockers(state,v);
 const deployed=state.deployed[v.repo]===v.id;
 const buttons=[
  ...(v.test==='pending'?[['test-pass','✓ test.yml'],['test-fail','✕ test.yml']]:[]),
  ...(!['published','queued','deploying'].includes(v.publish)?[['try','publish.yml']]:[]),
  ...(v.publish==='queued'?[['start','Iniciar deploy']]:[]),
  ...(v.publish==='deploying'?[['success','Railway SUCCESS'],['failure','Railway FAILED']]:[]),
  ...(deployed?[[state.unhealthy.includes(v.id)?'healthy':'unhealthy',state.unhealthy.includes(v.id)?'Restablecer salud':'Marcar unhealthy']]:[])
 ];
 return `<article class="card version"><h3>${esc(repo?.name??v.repo)} <span class="muted">/</span> ${esc(v.name)}</h3>
 <p class="caption muted">test.yml: <strong class="${v.test==='passed'?'ok':''}">${v.test}</strong> · publish.yml: ${v.publish} · intentos: ${v.attempts}</p>
 <p class="caption muted">${deps||'Sin dependencias'}</p>
 ${deployed?'<span class="pill ok">Publicada</span>':''}
 ${v.publish==='blocked'?'<div class="error">'+reasons.map(esc).join('<br>')+'</div>':''}
 <div class="actions">${buttons.map(([act,name])=>`<button data-act="${act}" data-id="${esc(v.id)}" class="${act==='try'?'primary':''}">${name}</button>`).join('')}</div></article>`;
}
function render(){
 get('count').textContent=`${state.repos.length} repositorios`;
 const select=get('deps') as HTMLSelectElement;
 select.replaceChildren(...state.repos.map(r=>new Option(r.name,r.id)));
 get('repos').innerHTML=state.repos.length?state.repos.map(r=>{
 const versions=state.versions.filter(v=>v.repo===r.id);
 const details=expanded===r.id?`<form data-repo="${esc(r.id)}" class="version-form"><label>Nombre de versión<input name="version" required placeholder="v1.0.0"></label>
 ${r.dependencies.map(d=>`<label>${esc(state.repos.find(x=>x.id===d)?.name??d)} — revisión requerida<select required name="dep:${esc(d)}"><option value="">Seleccionar...</option>${state.versions.filter(v=>v.repo===d).map(v=>`<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('')}</select></label>`).join('')}
 <button class="primary">Crear candidato</button></form>`:'';
 return `<article class="card"><h3>${esc(r.name)}</h3><p class="caption muted">Dependencias: ${r.dependencies.length?r.dependencies.map(d=>`<span class="pill">${esc(state.repos.find(x=>x.id===d)?.name??d)}</span>`).join(''):'ninguna'}</p><p class="caption muted">${versions.length} versiones</p><button data-expand="${esc(r.id)}">+ Nueva versión</button>${details}</article>`;
 }).join(''):'<p class="muted">Agrega repositorios o carga Landing.</p>';
 get('versions').innerHTML=state.versions.map(renderVersion).join('')||'<p class="muted">No hay candidatos todavía.</p>';
 get('events').innerHTML=state.log.map((l,i)=>`<li><span class="ok">${String(i+1).padStart(2,'0')}</span> · ${esc(l)}</li>`).reverse().join('');
}
get('example').addEventListener('click',()=>{state=landing();expanded=null;next=1;get('notice').textContent='';render()});
get('reset').addEventListener('click',()=>{state=initial();expanded=null;next=1;get('notice').textContent='';render()});
get('repo-form').addEventListener('submit',e=>{
 e.preventDefault();
 const f=e.currentTarget as HTMLFormElement;
 const name=(f.elements.namedItem('name') as HTMLInputElement).value.trim();
 const dependencies=Array.from((f.elements.namedItem('deps') as HTMLSelectElement).selectedOptions).map(o=>o.value);
 dispatch({type:'repo',id:newId(),name,dependencies});
 if(!get('notice').textContent)f.reset();
});
get('repos').addEventListener('click',e=>{const button=(e.target as Element).closest<HTMLElement>('[data-expand]');if(button){expanded=expanded===button.dataset.expand?null:button.dataset.expand??null;render()}});
get('repos').addEventListener('submit',e=>{
 const f=(e.target as Element).closest<HTMLFormElement>('[data-repo]');if(!f)return;
 e.preventDefault();
 const repo=state.repos.find(r=>r.id===f.dataset.repo);if(!repo)return;
 const name=(f.elements.namedItem('version') as HTMLInputElement).value.trim();
 const requires:Record<string,string>={};
 for(const d of repo.dependencies)requires[d]=(f.elements.namedItem('dep:'+d) as HTMLSelectElement).value;
 dispatch({type:'version',id:newId(),repo:repo.id,name,requires});
 if(!get('notice').textContent){expanded=null;render()}
});
get('versions').addEventListener('click',e=>{
 const b=(e.target as Element).closest<HTMLElement>('[data-act]');if(!b)return;
 const id=b.dataset.id??'';
 switch(b.dataset.act){
 case 'test-pass':dispatch({type:'test',id,result:'passed'});break;
 case 'test-fail':dispatch({type:'test',id,result:'failed'});break;
 case 'try':dispatch({type:'try',id});break;
 case 'start':dispatch({type:'start',id});break;
 case 'success':dispatch({type:'finish',id,success:true});break;
 case 'failure':dispatch({type:'finish',id,success:false});break;
 case 'healthy':dispatch({type:'health',id,healthy:true});break;
 case 'unhealthy':dispatch({type:'health',id,healthy:false});break;
 }
});
render();
