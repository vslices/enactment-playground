export type Test = 'pending'|'passed'|'failed';
export type Publish = 'idle'|'blocked'|'queued'|'deploying'|'failed'|'published';
export type Repo = { id:string; name:string; dependencies:string[] };
export type Version = {id:string; repo:string; name:string; requires:Record<string,string>; test:Test; publish:Publish; attempts:number};
export type State = {repos:Repo[]; versions:Version[]; deployed:Record<string,string>; unhealthy:string[]; log:string[]};
export type Event =
 | {type:'repo';id:string;name:string;dependencies:string[]}
 | {type:'version';id:string;repo:string;name:string;requires:Record<string,string>}
 | {type:'test';id:string;result:'passed'|'failed'}
 | {type:'try';id:string}
 | {type:'start';id:string}
 | {type:'finish';id:string;success:boolean}
 | {type:'health';id:string;healthy:boolean};
export const initial=():State=>({repos:[],versions:[],deployed:{},unhealthy:[],log:[]});
export const version=(s:State,id:string)=>s.versions.find(v=>v.id===id);
export function blockers(s:State,v:Version):string[]{
 const problems:string[]=[];
 if(v.test!=='passed')problems.push(v.test==='pending'?'test.yml pendiente':'test.yml fallido');
 for(const d of s.repos.find(r=>r.id===v.repo)?.dependencies??[]){
  const name=s.repos.find(r=>r.id===d)?.name??d;
  const actual=s.deployed[d];
  if(!actual)problems.push(name+': ausente');
  else if(actual!==v.requires[d])problems.push(name+': versión incompatible');
  else if(s.unhealthy.includes(actual))problems.push(name+': no saludable');
 }
 return problems;
}
export const eligible=(s:State,v:Version)=>blockers(s,v).length===0;
function ensure(ok:unknown,message:string):asserts ok {if(!ok)throw Error(message)}
export function reduce(before:State,event:Event):State {
 const s:State=structuredClone(before);
 const log=(message:string)=>s.log.push(message);
 const get=(id:string):Version=>{const v=version(s,id);ensure(v,'Versión no encontrada');return v};
 switch(event.type){
 case 'repo':{
  ensure(event.name.trim(),'Nombre obligatorio');
  ensure(!s.repos.some(r=>r.name===event.name||r.id===event.id),'Repositorio duplicado');
  ensure(event.dependencies.every(d=>s.repos.some(r=>r.id===d)),'Dependencia desconocida');
  ensure(new Set(event.dependencies).size===event.dependencies.length,'Dependencia repetida');
  s.repos.push({id:event.id,name:event.name,dependencies:event.dependencies});
  log('Repositorio '+event.name+' agregado');break;
 }
 case 'version':{
  const r=s.repos.find(r=>r.id===event.repo);ensure(r,'Repositorio desconocido');
  ensure(event.name.trim(),'Versión obligatoria');
  ensure(!s.versions.some(v=>v.id===event.id||(v.repo===event.repo&&v.name===event.name)),'Versión duplicada');
  ensure(Object.keys(event.requires).length===r.dependencies.length,'Faltan revisiones de dependencia');
  for(const d of r.dependencies)ensure(version(s,event.requires[d])?.repo===d,'Revisión de dependencia incorrecta');
  s.versions.push({id:event.id,repo:event.repo,name:event.name,requires:{...event.requires},test:'pending',publish:'idle',attempts:0});
  log(r.name+'@'+event.name+': candidato creado');break;
 }
 case 'test':{const v=get(event.id);ensure(v.test==='pending','La prueba ya tiene resultado');v.test=event.result;log(v.name+': test.yml '+event.result);break}
 case 'try':{
  const v=get(event.id);ensure(!['published','queued','deploying'].includes(v.publish),'Publicación duplicada');
  const reasons=blockers(s,v);
  if(reasons.length){v.publish='blocked';log(v.name+': bloqueado — '+reasons.join(', '))}
  else {v.publish='queued';v.attempts++;log(v.name+': try-deploy-railway #'+v.attempts)}
  break;
 }
 case 'start':{const v=get(event.id);ensure(v.publish==='queued','Sin intento en cola');ensure(eligible(s,v),'Cambió el ambiente');v.publish='deploying';log(v.name+': despliegue iniciado');break}
 case 'finish':{
  const v=get(event.id);ensure(v.publish==='deploying','No está desplegándose');
  if(event.success)ensure(eligible(s,v),'Cambió el ambiente');
  v.publish=event.success?'published':'failed';
  if(event.success)s.deployed[v.repo]=v.id;
  log(v.name+': Railway '+(event.success?'SUCCESS':'FAILED'));break;
 }
 case 'health':{
  const v=get(event.id);
  s.unhealthy=event.healthy?s.unhealthy.filter(x=>x!==v.id):[...new Set([...s.unhealthy,v.id])];
  log(v.name+': '+(event.healthy?'healthy':'unhealthy'));break;
 }
 }
 if((event.type==='finish'&&event.success)||event.type==='health'){
  for(const v of s.versions)if(v.publish==='blocked'&&eligible(s,v)){
   v.publish='queued';v.attempts++;log(v.name+': dependencia disponible; solo try-deploy-railway #'+v.attempts);
  }
 }
 return s;
}
export function landing():State {
 let s=initial();
 s=reduce(s,{type:'repo',id:'identity',name:'identity-service',dependencies:[]});
 s=reduce(s,{type:'repo',id:'accounts',name:'account-service',dependencies:[]});
 s=reduce(s,{type:'repo',id:'landing',name:'landing-product',dependencies:['identity','accounts']});
 s=reduce(s,{type:'version',id:'i1',repo:'identity',name:'I1',requires:{}});
 s=reduce(s,{type:'version',id:'a1',repo:'accounts',name:'A1',requires:{}});
 s=reduce(s,{type:'version',id:'l2',repo:'landing',name:'L2',requires:{identity:'i1',accounts:'a1'}});
 for(const id of ['i1','a1','l2'])s=reduce(s,{type:'test',id,result:'passed'});
 return reduce(s,{type:'try',id:'l2'});
}
