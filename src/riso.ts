export interface RisoParams {
  texture: 'grain' | 'soft-dots' | 'dots';
  contrast:number;
  gamma:number;
  separation: 'tonal' | 'chromatic';
  inkOpacity:number;
  splitPosition: number;
  bgColor: string;
  noiseLevel: number;
  offsetX: number;
  offsetY: number;
  baseLayer: {
    enabled: boolean;
    mode: 'color' | 'grayscale';
    opacity: number;
  };
  ink1: {
    color: string;
    angle: number;
    dotSize: number;
    density: number;
    shadowThreshold: number;
  };
  ink2: {
    enabled: boolean;
    color: string;
    angle: number;
    dotSize: number;
    density: number;
    midThreshold: number;
  };
}

// One print palette for stills, motion and the poster composer.
export const PRINT_PALETTE = {paper:'#faf9f3',cyan:'#29c5e8',pink:'#ff75bb',yellow:'#f4e328',black:'#242823'} as const;
export const DEFAULT_PARAMS: RisoParams = {
  texture: 'grain', contrast:1.45, gamma:.85, separation:'tonal',inkOpacity:.68,
  splitPosition: 100,
  bgColor: PRINT_PALETTE.paper,
  noiseLevel: 2,
  offsetX: 1.2,
  offsetY: .4,
  baseLayer: {
    enabled: false,
    mode: 'grayscale',
    opacity: 15,
  },
  ink1: {
    color: PRINT_PALETTE.cyan,
    angle: 15,
    dotSize: 3,
    density: 1.3,
    shadowThreshold: 0.6,
  },
  ink2: {
    enabled: true,
    color: PRINT_PALETTE.pink,
    angle: 75,
    dotSize: 3,
    density: 1.15,
    midThreshold: 0.8,
  }
};


export const PRESETS = [
 {name:'青粉刊物',note:'海报同款 · 轻透叠色',colors:[PRINT_PALETTE.cyan,PRINT_PALETTE.pink],texture:'grain',separation:'tonal',contrast:1.45,gamma:.85,dot:3,density:1.3,second:1.15,noise:2,offset:1.2,opacity:.68},
 {name:'青黄叠印',note:'青黄交叠 · 通透留白',colors:[PRINT_PALETTE.cyan,PRINT_PALETTE.yellow],texture:'grain',separation:'tonal',contrast:1.35,gamma:.9,dot:3,density:1.25,second:1.1,noise:2,offset:1,opacity:.72},
 {name:'粉黄印样',note:'粉黄交叠 · 柔和暖色',colors:[PRINT_PALETTE.pink,PRINT_PALETTE.yellow],texture:'grain',separation:'tonal',contrast:1.35,gamma:.9,dot:3,density:1.15,second:1.15,noise:2,offset:1,opacity:.76},
 {name:'青粉柔网',note:'柔边网点 · 轻套色',colors:[PRINT_PALETTE.cyan,PRINT_PALETTE.pink],texture:'soft-dots',separation:'tonal',contrast:1.25,gamma:.95,dot:4.5,density:1.1,second:1,noise:1.5,offset:.45,opacity:.82},
 {name:'青墨摄影',note:'单色青墨 · 保留层次',colors:[PRINT_PALETTE.cyan,PRINT_PALETTE.cyan],texture:'grain',separation:'tonal',contrast:1.25,gamma:.85,dot:2,density:1.2,second:0,noise:2,offset:0,opacity:.75},
 {name:'黑墨纸本',note:'柔黑油墨 · 纸本灰阶',colors:[PRINT_PALETTE.black,PRINT_PALETTE.black],texture:'grain',separation:'tonal',contrast:1.25,gamma:.9,dot:2,density:1.1,second:0,noise:1,offset:0,opacity:.8}
] as const;
export function presetParams(i:number):RisoParams{const x=PRESETS[i],p=structuredClone(DEFAULT_PARAMS);p.texture=x.texture;p.separation=x.separation;p.contrast=x.contrast;p.gamma=x.gamma;p.noiseLevel=x.noise;p.offsetX=x.offset;p.offsetY=i===0?.4:x.offset*.4;p.inkOpacity=x.opacity;p.baseLayer.enabled=false;p.ink1.color=x.colors[0];p.ink2.color=x.colors[1];p.ink2.enabled=x.second>0;p.ink1.dotSize=x.dot;p.ink2.dotSize=x.dot;p.ink1.density=x.density;p.ink2.density=x.second||1;return p;}
export function matchesPreset(p:RisoParams,i:number){const expected=presetParams(i);return JSON.stringify({...p,splitPosition:100})===JSON.stringify(expected);}
export function sizeFor(w:number,h:number,max:number){const s=Math.min(1,max/Math.max(w,h));return [Math.max(2,Math.round(w*s/2)*2),Math.max(2,Math.round(h*s/2)*2)];}
// A fixed pixel hash keeps the paper texture still across video frames.
export function grain(x:number,y:number){let n=Math.imul(x+1,374761393)^Math.imul(y+1,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295-.5;}
export function createRenderer(){
 const original=document.createElement('canvas'), ink=document.createElement('canvas');
 return function render(target:HTMLCanvasElement,source:CanvasImageSource,w:number,h:number,p:RisoParams,split=100){
  if(target.width!==w||target.height!==h){target.width=w;target.height=h;}
  if(original.width!==w||original.height!==h){original.width=w;original.height=h;ink.width=w;ink.height=h;}
  const ctx=target.getContext('2d')!,o=original.getContext('2d',{willReadFrequently:true})!,layer=ink.getContext('2d')!;
  o.fillStyle=p.bgColor;o.fillRect(0,0,w,h);o.drawImage(source,0,0,w,h);
  const pixels=o.getImageData(0,0,w,h).data;
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.fillStyle=p.bgColor;ctx.fillRect(0,0,w,h);
  if(p.baseLayer.enabled){ctx.save();ctx.globalAlpha=p.baseLayer.opacity/100;ctx.filter=p.baseLayer.mode==='grayscale'?'grayscale(1)':'none';ctx.drawImage(original,0,0);ctx.restore();}
  const scale=Math.max(w,h)/1000;
  const clamp=(n:number)=>Math.min(1,Math.max(0,n));
  const finish=()=>{
   // Dilute both inks into the same paper once, before any original/effect comparison.
   ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1-clamp(p.inkOpacity??1);ctx.fillStyle=p.bgColor;ctx.fillRect(0,0,w,h);ctx.globalAlpha=1;
   if(split<100){ctx.save();ctx.beginPath();ctx.rect(0,0,w*(100-split)/100,h);ctx.clip();ctx.drawImage(original,0,0);ctx.restore();}
  };
  const weightAt=(k:number,i:number)=>{
   const r=pixels[k]/255,g=pixels[k+1]/255,b=pixels[k+2]/255;
   const light=clamp(((r*.299+g*.587+b*.114)-.5)*p.contrast+.5);
   const d=Math.pow(1-light,p.gamma);
   if(!p.ink2.enabled)return d;
   if(p.separation==='chromatic'){
    const warm=clamp(.5+(r-b)*1.2);
    return i===0?d*(1-warm*.85):d*(.15+warm*.85);
   }
   return i===0?Math.pow(d,1.8):Math.pow(Math.sin(d*Math.PI),1.1)*.9;
  };
  if(p.texture==='grain'){
   const d=ctx.getImageData(0,0,w,h),rgb=(hex:string)=>[1,3,5].map(a=>parseInt(hex.slice(a,a+2),16));
   const c1=rgb(p.ink1.color),c2=rgb(p.ink2.color),dx=Math.round(p.offsetX*scale),dy=Math.round(p.offsetY*scale);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const k=(y*w+x)*4,n=grain(x,y)+.5,n2=grain(x+179,y+71)+.5;
    const grainSize=Math.max(1,Math.round(p.ink1.dotSize*scale/2));
    const threshold=grain(Math.floor(x/grainSize),Math.floor(y/grainSize))+.5;
    const wa=weightAt(k,0)*p.ink1.density;
    const a=wa<.025?0:clamp(wa+(threshold-.5)*.22);
    const sx=x-dx,sy=y-dy,secondK=(sy*w+sx)*4;
    const wb=p.ink2.enabled&&sx>=0&&sx<w&&sy>=0&&sy<h?weightAt(secondK,1)*p.ink2.density:0;
    const b=wb<.025?0:clamp(wb+(n2-.5)*.22);
    for(let c=0;c<3;c++){let v=d.data[k+c];v*=1-a*(1-c1[c]/255);v*=1-b*(1-c2[c]/255);d.data[k+c]=v+(n-.5)*p.noiseLevel*2.55;}
   }
   ctx.putImageData(d,0,0);
   finish();
   return;
  }
  [p.ink1,p.ink2].forEach((v,i)=>{
   if(i===1&&!p.ink2.enabled)return;
   layer.clearRect(0,0,w,h);layer.fillStyle=v.color;layer.beginPath();
   const soft=p.texture==='soft-dots',step=Math.max(1.5,v.dotSize*scale),angle=v.angle*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),diag=Math.hypot(w,h)/2;
   for(let y=-diag;y<diag;y+=step)for(let x=-diag;x<diag;x+=step){
    const sx=w/2+x*c-y*s,sy=h/2+x*s+y*c,ix=Math.floor(sx),iy=Math.floor(sy);
    if(ix<0||iy<0||ix>=w||iy>=h)continue;
    const k=(iy*w+ix)*4,weight=weightAt(k,i);
    const r=Math.sqrt(Math.min(1,weight*v.density))*step*(soft?.56:.61);
    if(r>.12){layer.moveTo(sx+r,sy);layer.arc(sx,sy,r,0,Math.PI*2);}
   }
   layer.fill();ctx.save();ctx.globalCompositeOperation='multiply';if(soft)ctx.filter=`blur(${Math.max(.18,step*.09)}px)`;ctx.drawImage(ink,i?p.offsetX*scale:0,i?p.offsetY*scale:0);ctx.restore();
  });
  ctx.globalCompositeOperation='source-over';
  if(p.noiseLevel){const d=ctx.getImageData(0,0,w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const k=(y*w+x)*4,n=grain(x,y)*p.noiseLevel*2.55;d.data[k]+=n;d.data[k+1]+=n;d.data[k+2]+=n;}ctx.putImageData(d,0,0);}
  finish();
 };
}
