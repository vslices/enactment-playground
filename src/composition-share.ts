import {validateDocument,type Document} from './composition.js';
const prefix='#v2.';
const MAX_COMPRESSED=16000,MAX_BYTES=120000;
export async function encode(doc:Document):Promise<string>{
 const raw=new TextEncoder().encode(JSON.stringify(validateDocument(doc)));
 if(raw.byteLength>MAX_BYTES)throw Error('Documento demasiado grande para URL');
 const bytes=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 if(bytes.length>MAX_COMPRESSED)throw Error('Enlace excesivo');
 let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
 return prefix+btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export async function decode(hash:string):Promise<Document>{
 if(!hash.startsWith(prefix)||hash.length>MAX_COMPRESSED*2+prefix.length)throw Error('Formato de enlace inválido');
 const payload=hash.slice(prefix.length);
 if(!/^[A-Za-z0-9_-]+$/.test(payload))throw Error('Codificación inválida');
 let binary:string;
 try{binary=atob(payload.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(payload.length/4)*4,'='))}
 catch{throw Error('Base64 inválido')}
 if(binary.length>MAX_COMPRESSED)throw Error('Enlace demasiado grande');
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
 const chunks:Uint8Array[]=[];let len=0;
 for(;;){const {done,value}=await reader.read();if(done)break;len+=value.length;
  if(len>MAX_BYTES){await reader.cancel();throw Error('JSON descomprimido demasiado grande')}chunks.push(value)}
 const raw=new Uint8Array(len);let pos=0;for(const chunk of chunks){raw.set(chunk,pos);pos+=chunk.length}
 return validateDocument(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)));
}
