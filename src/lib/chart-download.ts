export function downloadBlob(name:string,blob:Blob){
 const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function downloadChart(svg:SVGSVGElement,name:string,format:'svg'|'png'){
 const copy=svg.cloneNode(true) as SVGSVGElement;
 copy.setAttribute('xmlns','http://www.w3.org/2000/svg');
 const originals=[svg,...svg.querySelectorAll('*')],clones=[copy,...copy.querySelectorAll('*')];
 const properties=['fill','stroke','stroke-width','font-family','font-size','font-weight','opacity','fill-opacity','stroke-opacity','text-anchor','dominant-baseline'];
 originals.forEach((node,i)=>{const style=getComputedStyle(node);for(const key of properties)(clones[i] as SVGElement).style.setProperty(key,style.getPropertyValue(key));});
 const bounds=svg.getBoundingClientRect(),width=Math.max(1,Math.ceil(bounds.width)),height=Math.max(1,Math.ceil(bounds.height));
 copy.setAttribute('width',String(width));copy.setAttribute('height',String(height));
 const blob=new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml;charset=utf-8'});
 if(format==='svg'){downloadBlob(name+'.svg',blob);return;}
 const url=URL.createObjectURL(blob);
 try{
  const image=new Image();image.src=url;await image.decode();
  // A supported 1,000-row chart can be taller than a browser's PNG canvas limit.
  const scale=Math.min(2,16384/width,16384/height,Math.sqrt(16000000/(width*height)));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const context=canvas.getContext('2d')!;context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('图表生成失败，请重试')),'image/png'));
  downloadBlob(name+'.png',png);
 }finally{URL.revokeObjectURL(url);}
}
