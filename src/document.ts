import {initial, reduce, type Event, type Repo, type State} from './model.js';

export type Interaction = Exclude<Event, {type:'repo'}>;
export type ScenarioConfig = {formatVersion:1; name:string; repositories:Repo[]};
export type PlaygroundDocument = {formatVersion:1; config:ScenarioConfig; interactions:Interaction[]; cursor:number};

const MAX_INTERACTIONS = 200;
const fail = (message:string):never => {throw new Error(message)};
const obj = (value:unknown, label:string):Record<string,unknown> => {
  if(value===null || typeof value!=='object' || Array.isArray(value)) return fail(label+' debe ser un objeto');
  return value as Record<string,unknown>;
};
const str = (value:unknown,label:string):string => {
  if(typeof value!=='string'||!value.trim()||value.length>100)return fail(label+' debe ser texto no vacío (máx. 100)');
  return value;
};
const strMap = (value:unknown,label:string):Record<string,string> => {
  const source=obj(value,label);
  const result:Record<string,string>={};
  for(const [key,val] of Object.entries(source)) result[str(key,label+' clave')]=str(val,label+' valor');
  return result;
};

export function validateConfig(value:unknown):ScenarioConfig {
  const source=obj(value,'Raw Config');
  if(source.formatVersion!==1) return fail('Versión de Raw Config no compatible');
  const name=str(source.name,'Nombre del escenario');
  if(!Array.isArray(source.repositories)||source.repositories.length!==3)
    return fail('MVP Landing: se requieren Identity, Accounts y Landing');
  const repositories:Repo[]=source.repositories.map((input:unknown)=>{
    const entry=obj(input,'Repositorio');
    const id=str(entry.id,'ID del repositorio');
    const repoName=str(entry.name,'Nombre del repositorio');
    if(!Array.isArray(entry.dependencies)||!entry.dependencies.every((v:unknown)=>typeof v==='string'))
      return fail('Dependencias inválidas en '+id);
    return {id,name:repoName,dependencies:[...entry.dependencies] as string[]};
  });
  if(new Set(repositories.map(r=>r.id)).size!==3||new Set(repositories.map(r=>r.name)).size!==3)
    return fail('Repositorios o nombres duplicados');
  const identity=repositories.find(r=>r.id==='identity');
  const accounts=repositories.find(r=>r.id==='accounts');
  const landing=repositories.find(r=>r.id==='landing');
  if(!identity||!accounts||!landing || identity.dependencies.length || accounts.dependencies.length ||
     landing.dependencies.length!==2 || new Set(landing.dependencies).size!==2 ||
     !landing.dependencies.includes('identity')||!landing.dependencies.includes('accounts'))
    return fail('MVP Landing: Landing depende de Identity y Accounts; ambos no tienen dependencias');
  return {formatVersion:1,name,repositories};
}

export function parseInteraction(value:unknown):Interaction {
  const item=obj(value,'Raw Interaction');
  switch(item.type){
    case 'version': return {type:'version',id:str(item.id,'ID de versión'),
      repo:str(item.repo,'Repositorio'),name:str(item.name,'Nombre de versión'),
      requires:strMap(item.requires,'Versiones requeridas')};
    case 'test':{
      if(item.result!=='passed'&&item.result!=='failed')return fail('Resultado de test.yml inválido');
      return {type:'test',id:str(item.id,'ID de versión'),result:item.result};
    }
    case 'try':return {type:'try',id:str(item.id,'ID de versión')};
    case 'start':return {type:'start',id:str(item.id,'ID de versión')};
    case 'finish':{
      if(typeof item.success!=='boolean')return fail('Resultado de publicación inválido');
      return {type:'finish',id:str(item.id,'ID de versión'),success:item.success};
    }
    case 'health':{
      if(typeof item.healthy!=='boolean')return fail('Salud inválida');
      return {type:'health',id:str(item.id,'ID de versión'),healthy:item.healthy};
    }
    case 'observe':{
      if(item.revision!==null&&typeof item.revision!=='string')return fail('Revisión observada inválida');
      if(typeof item.healthy!=='boolean')return fail('Salud observada inválida');
      if(typeof item.sequence!=='number'||!Number.isSafeInteger(item.sequence)||item.sequence<1)
        return fail('Secuencia de observación inválida');
      return {type:'observe',repo:str(item.repo,'Repositorio'),
        revision:item.revision===null?null:str(item.revision,'Revisión'),
        healthy:item.healthy,sequence:item.sequence};
    }
    default:return fail('Interacción desconocida: '+String(item.type));
  }
}

export function replay(doc:PlaygroundDocument, until:number=doc.cursor):State {
  const config=validateConfig(doc.config);
  if(!Number.isSafeInteger(until)||until<0||until>doc.interactions.length)
    return fail('Cursor fuera de la historia');
  let state=initial();
  for(const repo of config.repositories){
    if(repo.id==='landing')continue;
    state=reduce(state,{type:'repo',id:repo.id,name:repo.name,dependencies:repo.dependencies});
  }
  const landing=config.repositories.find(r=>r.id==='landing')!;
  state=reduce(state,{type:'repo',id:landing.id,name:landing.name,dependencies:landing.dependencies});
  for(const raw of doc.interactions.slice(0,until)){
    state=reduce(state,parseInteraction(raw));
  }
  return state;
}

export function validateDocument(value:unknown):PlaygroundDocument {
  const source=obj(value,'Documento');
  if(source.formatVersion!==1)return fail('Formato de documento desconocido');
  const config=validateConfig(source.config);
  if(!Array.isArray(source.interactions)||source.interactions.length>MAX_INTERACTIONS)
    return fail('Raw Interactions debe ser una lista de máximo '+MAX_INTERACTIONS+' entradas');
  const interactions=source.interactions.map(parseInteraction);
  const cursor=source.cursor;
  if(typeof cursor!=='number'||!Number.isInteger(cursor)||cursor<0||cursor>interactions.length)
    return fail('Cursor fuera del historial');
  const doc:PlaygroundDocument={formatVersion:1,config,interactions,cursor};
  replay(doc,interactions.length); // Validate even the redo tail before adopting the document.
  return doc;
}

export function append(doc:PlaygroundDocument,event:Interaction):PlaygroundDocument {
  return validateDocument({...doc,interactions:[...doc.interactions.slice(0,doc.cursor),event],cursor:doc.cursor+1});
}
export function jump(doc:PlaygroundDocument,cursor:number):PlaygroundDocument {
  return validateDocument({...doc,cursor});
}
export function updateConfig(doc:PlaygroundDocument,config:unknown):PlaygroundDocument {
  return validateDocument({...doc,config});
}
export function updateInteractions(doc:PlaygroundDocument,interactions:unknown):PlaygroundDocument {
  if(!Array.isArray(interactions))return fail('Raw Interactions debe ser un arreglo JSON');
  return validateDocument({...doc,interactions,cursor:interactions.length});
}

export const landingConfig:ScenarioConfig={
  formatVersion:1,
  name:'Landing conditional publication',
  repositories:[
    {id:'identity',name:'identity-service',dependencies:[]},
    {id:'accounts',name:'account-service',dependencies:[]},
    {id:'landing',name:'landing-product',dependencies:['identity','accounts']}
  ]
};

export function landingMvp():PlaygroundDocument {
  return validateDocument({
    formatVersion:1,
    config:structuredClone(landingConfig),
    interactions:[
      {type:'version',id:'i1',repo:'identity',name:'I1',requires:{}},
      {type:'version',id:'a1',repo:'accounts',name:'A1',requires:{}},
      {type:'version',id:'l2',repo:'landing',name:'L2',requires:{identity:'i1',accounts:'a1'}},
      {type:'test',id:'i1',result:'passed'},
      {type:'test',id:'a1',result:'passed'},
      {type:'test',id:'l2',result:'passed'},
      {type:'try',id:'l2'}
    ],
    cursor:7
  });
}
