export async function readEventStream(body:ReadableStream<Uint8Array>,receive:(data:string)=>void){
 const reader=body.getReader(),decoder=new TextDecoder();let buffer='';
 try{while(true){const part=await reader.read();buffer+=decoder.decode(part.value||new Uint8Array(),{stream:!part.done});let end;while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(data)receive(data);}if(part.done)break;}}finally{reader.releaseLock();}
}
