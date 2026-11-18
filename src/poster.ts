import {createRenderer, grain, presetParams, RisoParams, sizeFor} from './riso';

export type LayoutId = 'editorial' | 'edition' | 'duet' | 'contact' | 'collage';
export type InkMode = 'duo' | 'first' | 'second' | 'original';
export type PosterAsset = {id:string; name:string; el:HTMLCanvasElement; w:number; h:number; thumbnail:string};
export type Slot = {assetId:string|null; x:number; y:number; zoom:number; ink:InkMode};
export type Frame = {x:number; y:number; w:number; h:number; rotate?:number};
export type PosterSettings = {layout:LayoutId; ratio:'3:4'|'4:5'|'1:1'; title:string; subtitle:string; credit:string; edition:string; masthead:string; body:string; accent:string; photoOpacity:number; type:'editorial'|'sans'|'serif'; shapes:boolean; marks:boolean};
export const LAYOUTS = [
  {id:'editorial',name:'套印刊物',note:'跨栏细字 / 三色叠印'},
  {id:'edition',name:'封面研究',note:'大标题 / 主次构图'},
  {id:'duet',name:'双图对页',note:'并置 / 留白'},
  {id:'contact',name:'四格印样',note:'矩阵 / 图像节奏'},
  {id:'collage',name:'错位拼贴',note:'叠放 / 几何套色'},
] as const;
export const DEFAULT_POSTER:PosterSettings = {layout:'editorial',ratio:'3:4',title:'A Place\nfor New\nIdeas.',subtitle:'Between image, colour & paper.',credit:'AN EXERCISE IN OVERPRINT',edition:'PRINT LAB / NO. 01',masthead:'Print\nSomething\nNew.',accent:'#f4e328',photoOpacity:.68,type:'editorial',shapes:true,marks:true,body:[
  '01 / A SECOND LOOK\nAn image is never quite finished. Move closer and a familiar object becomes a shape; move away and its colour becomes a rhythm. These pages collect small observations and let them meet on paper.\n\nStart with something ordinary. A folded ribbon, a reflection, the curve of a stem. A change in scale can turn a detail into the main event. The photograph stays the same. The way we see it does not.',
  '02 / COLOUR IN COMMON\nCyan, pink and yellow are printed as separate thoughts. Where they overlap, another colour appears. The page carries the memory of each layer: a soft edge, a darker intersection, a little space where the paper shines through.\n\nA limited palette leaves room for unexpected relationships. The most interesting colour may be the one that was never chosen, but happened between two others.',
  '03 / ROOM FOR CHANCE\nPerfect alignment is only one possibility. A small shift can make a quiet edge vibrate. A repeated image can feel entirely new when its frame changes. A line of type can move between pictures and connect them.\n\nComposition is a conversation between what is placed and what is left open. Look at the gaps. Give the image enough room to breathe, and the words enough room to become an image.',
  '04 / ON PAPER\nThis is a study in seeing, making and looking again. Collect fragments. Try a different order. Allow a colour to cross a boundary. Follow the useful accident, then make a deliberate choice.\n\nThere is no final arrangement, only a version worth keeping. A small edition of something that did not exist a moment ago. Image, colour, type and paper: four simple ingredients, many possible outcomes.'
].join('\n---\n')};
export function editorialParams(){const p=presetParams(1);p.bgColor='#faf9f3';p.ink1.color='#29c5e8';p.ink2.color='#ff75bb';p.contrast=1.45;p.gamma=.85;p.ink1.density=1.3;p.ink2.density=1.15;p.noiseLevel=2;p.offsetX=1.2;return p;}
export const blankSlots = ():Slot[] => Array.from({length:4},()=>({assetId:null,x:0,y:0,zoom:1,ink:'duo'}));
export function posterSize(ratio:PosterSettings['ratio'],longest:number):[number,number]{const r=ratio==='3:4'?.75:ratio==='4:5'?.8:1;return [Math.round(longest*r),longest];}
export function posterFrames(layout:LayoutId,w:number,h:number):Frame[]{
  const f=(x:number,y:number,fw:number,fh:number,rotate=0)=>({x:x*w,y:y*h,w:fw*w,h:fh*h,rotate});
  switch(layout){
    case 'editorial': return [f(.065,.25,.44,.235),f(.50,.385,.43,.235),f(.11,.65,.37,.235)];
    case 'edition': return [f(.055,.315,.6,.49),f(.68,.315,.265,.29),f(.68,.625,.265,.18)];
    case 'duet': return [f(.055,.275,.43,.53),f(.515,.275,.43,.53)];
    case 'contact':return [f(.055,.24,.43,.275),f(.515,.24,.43,.275),f(.055,.55,.43,.275),f(.515,.55,.43,.275)];
    case 'collage':return [f(.08,.285,.53,.40,-7),f(.49,.44,.43,.36,7),f(.09,.71,.30,.15,-4)];
  }
}
export function cropMetrics(asset:{w:number;h:number},frame:Frame,zoom:number){const scale=Math.max(frame.w/asset.w,frame.h/asset.h)*zoom;return {w:asset.w*scale,h:asset.h*scale,overflowX:Math.max(0,asset.w*scale-frame.w),overflowY:Math.max(0,asset.h*scale-frame.h)};}
export function makePosterAsset(source:CanvasImageSource,w:number,h:number,name:string):PosterAsset{
  const [aw,ah]=sizeFor(w,h,2000),el=document.createElement('canvas');el.width=aw;el.height=ah;el.getContext('2d')!.drawImage(source,0,0,aw,ah);
  const thumb=document.createElement('canvas');thumb.width=100;thumb.height=Math.max(1,Math.round(ah/aw*100));thumb.getContext('2d')!.drawImage(el,0,0,thumb.width,thumb.height);
  return {id:crypto.randomUUID(),name,el,w:aw,h:ah,thumbnail:thumb.toDataURL('image/jpeg',.75)};
}

// The preview and PNG use this exact compositor. Selection handles are separate DOM elements.
export function createPosterRenderer(){
  let fingerprint='';const cache=new Map<string,HTMLCanvasElement>(),renderInk=createRenderer();
  const texture=document.createElement('canvas');texture.width=texture.height=180;
  const tc=texture.getContext('2d')!,pixels=tc.createImageData(180,180);
  for(let y=0;y<180;y++)for(let x=0;x<180;x++){const k=(y*180+x)*4;pixels.data[k]=pixels.data[k+1]=pixels.data[k+2]=30;pixels.data[k+3]=Math.round((grain(x,y)+.5)*13)}tc.putImageData(pixels,0,0);
  return (target:HTMLCanvasElement,assets:PosterAsset[],slots:Slot[],settings:PosterSettings,params:RisoParams,longest=900)=>{
    const [w,h]=posterSize(settings.ratio,longest),unit=w/1000;
    target.width=w;target.height=h;const ctx=target.getContext('2d')!;
    const key=JSON.stringify({...params,splitPosition:100});if(key!==fingerprint){cache.clear();fingerprint=key;}
    const validIds=new Set(assets.map(a=>a.id));for(const k of cache.keys())if(!validIds.has(k.split('|')[0]))cache.delete(k);
    ctx.fillStyle=params.bgColor;ctx.fillRect(0,0,w,h);
    const first=params.ink1.color,second=params.ink2.enabled?params.ink2.color:first,editorial=settings.layout==='editorial',textInk=editorial?'#242823':first;
    const sans='Arial,"PingFang SC",sans-serif',serif='Georgia,"Songti SC",serif',mono='"Courier New",monospace';
    const label=(text:string,x:number,y:number,size=11,align:CanvasTextAlign='left',color=textInk)=>{ctx.fillStyle=color;ctx.font=`${size*unit}px ${mono}`;ctx.textAlign=align;ctx.textBaseline='top';ctx.fillText(text,x*w,y*h);};
    const textBox=(text:string,x:number,y:number,bw:number,bh:number,maxSize:number,color=textInk)=>{
      const lines=text.trim().split('\n');if(!lines[0])return;
      const family=settings.type==='serif'?serif:sans,weight=settings.type==='sans'?'900':'normal';
      ctx.font=`${weight} 100px ${family}`;
      const measured=Math.max(...lines.map(line=>ctx.measureText(line).width),1);
      const size=Math.min(maxSize*unit,bw*w/measured*100,bh*h/(lines.length*1.02));
      ctx.fillStyle=color;ctx.font=`${weight} ${size}px ${family}`;ctx.textBaseline='top';ctx.textAlign='left';
      lines.forEach((line,i)=>ctx.fillText(line,x*w,y*h+i*size*.99));
    };
    const rule=(y:number)=>{ctx.strokeStyle=textInk;ctx.lineWidth=unit;ctx.beginPath();ctx.moveTo(.055*w,y*h);ctx.lineTo(.945*w,y*h);ctx.stroke()};
    const circle=(x:number,y:number,r:number,color:string)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(x*w,y*h,r*w,0,Math.PI*2);ctx.fill()};
    const burst=(x:number,y:number,r:number,color:string)=>{ctx.fillStyle=color;ctx.beginPath();for(let i=0;i<32;i++){const a=i*Math.PI/16,rr=(i%2?.55:1)*r*w;const px=x*w+Math.cos(a)*rr,py=y*h+Math.sin(a)*rr;i?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.closePath();ctx.fill()};
    label(settings.edition,.055,.033,11);label(settings.credit,.945,.033,11,'right');rule(.058);
    if(editorial){
      ctx.fillStyle=textInk;ctx.textAlign='left';ctx.textBaseline='top';ctx.font=`${25*unit}px ${sans}`;
      settings.masthead.split('\n').slice(0,4).forEach((line,i)=>ctx.fillText(line,.055*w,.085*h+i*24*unit));
      if(settings.shapes){
        ctx.save();ctx.globalCompositeOperation='multiply';ctx.globalAlpha=.82;
        ctx.fillStyle=first;ctx.fillRect(.295*w,.105*h,.17*w,.245*h);ctx.fillRect(.525*w,.69*h,.13*w,.205*h);
        ctx.fillStyle=second;ctx.fillRect(.775*w,.41*h,.11*w,.445*h);circle(.18,.38,.12,second);
        circle(.37,.51,.12,settings.accent);circle(.87,.23,.055,settings.accent);
        ctx.fillStyle=settings.accent;for(let y=0;y<7;y++)for(let x=0;x<6;x++)if((x+y)%2===0)ctx.fillRect((.055+x*.052)*w,(.68+y*.032)*h,.052*w,.032*h);
        ctx.restore();
      }
    }else if(settings.layout==='edition'){
      textBox(settings.title,.045,.073,.90,.215,160);
      if(settings.shapes){ctx.save();ctx.globalCompositeOperation='multiply';circle(.862,.23,.078,second);ctx.restore();}
    }else if(settings.layout==='duet'){
      textBox(settings.title,.055,.085,.69,.16,115);
      if(settings.shapes){ctx.save();ctx.globalCompositeOperation='multiply';circle(.83,.17,.09,second);circle(.79,.17,.09,first);ctx.restore();}
    }else if(settings.layout==='contact'){
      textBox(settings.title.replace(/\n/g,' '),.05,.087,.89,.105,110);rule(.205);
    }else{
      textBox(settings.title,.055,.085,.89,.20,148);
      if(settings.shapes){ctx.save();ctx.globalCompositeOperation='multiply';circle(.80,.36,.16,second);burst(.78,.345,.125,first);ctx.restore();}
    }
    const frames=posterFrames(settings.layout,w,h);
    frames.forEach((frame,i)=>{
      const slot=slots[i],asset=assets.find(a=>a.id===slot.assetId);
      ctx.save();ctx.translate(frame.x+frame.w/2,frame.y+frame.h/2);ctx.rotate((frame.rotate||0)*Math.PI/180);ctx.translate(-frame.w/2,-frame.h/2);
      if(settings.layout==='collage'){ctx.fillStyle=params.bgColor;ctx.fillRect(-7*unit,-7*unit,frame.w+14*unit,frame.h+14*unit);}
      ctx.beginPath();ctx.rect(0,0,frame.w,frame.h);ctx.clip();
      if(editorial){ctx.globalAlpha=settings.photoOpacity;ctx.globalCompositeOperation='multiply';}
      if(asset){
        let bitmap:HTMLCanvasElement=asset.el;
        if(slot.ink!=='original'){
          const max=longest>1000?2400:850,ck=asset.id+'|'+slot.ink+'|'+max;
          if(!cache.has(ck)){
            const p=structuredClone(params);if(slot.ink==='first'||slot.ink==='second'){p.ink2.enabled=false;p.ink1.color=slot.ink==='first'?first:second;}
            const c=document.createElement('canvas'),[iw,ih]=sizeFor(asset.w,asset.h,max);renderInk(c,asset.el,iw,ih,p,100);cache.set(ck,c);
            if(cache.size>20)cache.delete(cache.keys().next().value!);
          }bitmap=cache.get(ck)!;
        }
        const m=cropMetrics(asset,frame,slot.zoom);
        ctx.drawImage(bitmap,-m.overflowX*(slot.x+1)/2,-m.overflowY*(slot.y+1)/2,m.w,m.h);
      }else{
        ctx.fillStyle=first;ctx.globalAlpha=.07;ctx.fillRect(0,0,frame.w,frame.h);ctx.globalAlpha=1;
        ctx.strokeStyle=first;ctx.lineWidth=unit;ctx.strokeRect(unit,unit,frame.w-2*unit,frame.h-2*unit);
        ctx.fillStyle=first;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${12*unit}px ${mono}`;ctx.fillText(`IMAGE ${String(i+1).padStart(2,'0')}`,frame.w/2,frame.h/2);
      }ctx.restore();
      if(settings.layout==='contact'){label(`0${i+1} / ${slot.ink==='original'?'ORIGINAL':'INK STUDY'}`,frame.x/w,(frame.y+frame.h)/h+.009,9);}
    });
    if(editorial){
      // Large light-weight type crosses the image columns, with readable editorial notes below.
      textBox(settings.title,.405,.155,.54,.33,112,textInk);
      const sections=settings.body.includes('\n---\n')?settings.body.split('\n---\n'):settings.body.split(/\n\s*\n/);
      const columns=Array.from({length:4},(_,i)=>sections.filter((_,j)=>j%4===i).join('\n\n'));
      const wrap=(text:string,width:number)=>{const lines:string[]=[];for(const para of text.split('\n')){let line='';for(const char of para){if(ctx.measureText(line+char).width>width&&line){const space=line.lastIndexOf(' ');if(space>line.length*.4){lines.push(line.slice(0,space));line=line.slice(space+1)+char;}else{lines.push(line);line=char;}}else line+=char;}lines.push(line);}return lines;};
      columns.forEach((text,i)=>{
        const x=(.055+i*.23)*w,cw=.20*w,maxHeight=.35*h;
        let fontSize=15*unit,lines:string[]=[];for(let k=0;k<30;k++){ctx.font=`${fontSize}px ${sans}`;lines=wrap(text,cw);if(lines.length*fontSize*1.22<=maxHeight)break;fontSize*=.94;}
        ctx.fillStyle=textInk;ctx.textAlign='left';ctx.textBaseline='top';
        lines.forEach((line,j)=>ctx.fillText(line,x,.555*h+j*fontSize*1.22));
      });
      ctx.save();ctx.strokeStyle=textInk;ctx.lineWidth=.7*unit;ctx.beginPath();ctx.moveTo(.055*w,.524*h);ctx.lineTo(.945*w,.524*h);ctx.stroke();ctx.restore();
      label('COLLECT / COMPOSE / OVERPRINT',.055,.531,10);label('01—04',.945,.531,10,'right');
    }
    if(settings.shapes&&settings.layout==='collage'){
      ctx.save();ctx.globalCompositeOperation='multiply';burst(.44,.73,.11,second);circle(.42,.745,.065,first);ctx.restore();
      ctx.save();ctx.strokeStyle=second;ctx.lineWidth=3*unit;ctx.translate(.845*w,.80*h);ctx.rotate(-.15);for(let i=0;i<7;i++){ctx.beginPath();ctx.moveTo(i*9*unit,0);ctx.lineTo(i*9*unit,65*unit);ctx.stroke()}ctx.restore();
    }
    const foot=editorial?.925:settings.layout==='collage'?.895:.86;rule(foot);
    textBox(settings.subtitle,.055,foot+.012,.70,editorial?.025:.05,editorial?16:22);
    label('PRINT / '+String(frames.length).padStart(2,'0'),.945,foot+.02,11,'right');
    if(settings.marks){
      ctx.save();ctx.globalCompositeOperation='multiply';
      (editorial?[first,second,settings.accent]:[first,second]).forEach((c,i)=>{ctx.fillStyle=c;ctx.fillRect((.055+i*.027)*w,.966*h,.023*w,.012*h)});
      ctx.restore();
      label('SPOT COLOUR · OVERPRINT',editorial?.15:.12,.968,9);
      ctx.strokeStyle=first;ctx.lineWidth=unit;const cx=.94*w,cy=.96*h;ctx.beginPath();ctx.moveTo(cx-8*unit,cy);ctx.lineTo(cx+8*unit,cy);ctx.moveTo(cx,cy-8*unit);ctx.lineTo(cx,cy+8*unit);ctx.stroke();ctx.beginPath();ctx.arc(cx,cy,4*unit,0,Math.PI*2);ctx.stroke();
    }
    ctx.fillStyle=ctx.createPattern(texture,'repeat')!;ctx.fillRect(0,0,w,h);
    return frames;
  };
}
