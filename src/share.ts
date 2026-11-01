import {validateDocument, type PlaygroundDocument} from './document.js';

const MAX_COMPRESSED = 16000;
const MAX_DECOMPRESSED = 120000;
const marker = '#v1.';

export async function encodeHash(doc:PlaygroundDocument):Promise<string> {
  const input=new TextEncoder().encode(JSON.stringify(validateDocument(doc)));
  if(input.byteLength>MAX_DECOMPRESSED)throw new Error('La historia excede el tamaño compartible: exporta JSON');
  const compressed=new Uint8Array(await new Response(
    new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'))
  ).arrayBuffer());
  if(compressed.length>MAX_COMPRESSED)throw new Error('La URL es demasiado larga; exporta JSON');
  let binary='';
  for(const byte of compressed)binary+=String.fromCharCode(byte);
  return marker+btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

export async function decodeHash(hash:string):Promise<PlaygroundDocument> {
  if(!hash.startsWith(marker))throw new Error('Formato del enlace desconocido');
  const payload=hash.slice(marker.length);
  if(!payload||payload.length>MAX_COMPRESSED*2||!/^[A-Za-z0-9_-]+$/.test(payload))
    throw new Error('Contenido del enlace inválido');
  const base64=payload.replace(/-/g,'+').replace(/_/g,'/');
  let decoded:string;
  try{decoded=atob(base64.padEnd(Math.ceil(base64.length/4)*4,'='))}
  catch{throw new Error('Codificación del enlace inválida')}
  if(decoded.length>MAX_COMPRESSED)throw new Error('Enlace demasiado grande');
  const compressed=Uint8Array.from(decoded,c=>c.charCodeAt(0));
  let stream:ReadableStream<Uint8Array>;
  try{stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))}
  catch{throw new Error('No se pudo descomprimir el enlace')}
  const reader=stream.getReader();
  const chunks:Uint8Array[]=[];
  let length=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      length+=value.length;
      if(length>MAX_DECOMPRESSED){
        await reader.cancel();
        throw new Error('Enlace descomprimido demasiado grande');
      }
      chunks.push(value);
    }
  }catch(e){throw e instanceof Error?e:new Error('No se pudo descomprimir el enlace')}
  const bytes=new Uint8Array(length);
  let pos=0;
  for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length}
  let decodedJson:unknown;
  try{decodedJson=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}
  catch{throw new Error('El enlace no contiene JSON válido')}
  return validateDocument(decodedJson);
}
