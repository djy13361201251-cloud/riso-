import React,{useEffect,useRef,useState} from 'react';
import {PRESETS,presetParams,RisoParams} from '../riso';
import {blankSlots,createPosterRenderer,cropMetrics,DEFAULT_POSTER,editorialParams,Frame,LAYOUTS,LayoutId,makePosterAsset,PosterAsset,posterFrames,PosterSettings,posterSize,Slot} from '../poster';

type Source={el:CanvasImageSource;w:number;h:number;name:string;kind:string};
type Props={active:boolean;source:Source|null;params:RisoParams;onParams:(p:RisoParams)=>void};
const clamp=(v:number)=>Math.max(-1,Math.min(1,v));

export default function PosterComposer({active,source,params:sourceParams}:Props){
  const [params,onParams]=useState<RisoParams>(editorialParams);
  const [settings,setSettings]=useState<PosterSettings>(DEFAULT_POSTER),[assets,setAssets]=useState<PosterAsset[]>([]),[slots,setSlots]=useState(blankSlots),[selected,setSelected]=useState(0),[crop,setCrop]=useState(false),[status,setStatus]=useState('点选图片，调整裁切；或一次导入多张图片。'),[busy,setBusy]=useState(false),[result,setResult]=useState<{url:string;name:string}|null>(null);
  const canvas=useRef<HTMLCanvasElement>(null),paper=useRef<HTMLDivElement>(null),render=useRef<ReturnType<typeof createPosterRenderer>|null>(null),initialized=useRef(false),resultUrl=useRef(''),assetsRef=useRef(assets),busyRef=useRef(false),alive=useRef(true),drag=useRef<{pointer:number;index:number;clientX:number;clientY:number;x:number;y:number;overflowX:number;overflowY:number;rotate:number}|null>(null);
  assetsRef.current=assets;busyRef.current=busy;
  const dimensions=posterSize(settings.ratio,900),frames=posterFrames(settings.layout,...dimensions),slot=slots[selected],chosen=assets.find(a=>a.id===slot?.assetId);
  function clearResult(){if(resultUrl.current){URL.revokeObjectURL(resultUrl.current);setStatus('海报已更新，请重新导出成品。');}resultUrl.current='';setResult(null);}
  function setting<K extends keyof PosterSettings>(key:K,value:PosterSettings[K]){setSettings(s=>({...s,[key]:value}));}
  function updateSlot(patch:Partial<Slot>,index=selected){setSlots(s=>s.map((v,i)=>i===index?{...v,...patch}:v));}
  function appendCurrent(){
    if(!source||assetsRef.current.length>=6||busyRef.current)return;
    try{const a=makePosterAsset(source.el,source.w,source.h,source.name+(source.kind==='video'?' · 当前帧':''));setAssets(s=>[...s,a]);updateSlot({assetId:a.id,x:0,y:0,zoom:1});setStatus('当前素材已加入，可在任意图片格中重复使用。');}catch{setStatus('当前素材尚未准备好，请稍后重试。');}
  }
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(resultUrl.current)URL.revokeObjectURL(resultUrl.current);};},[]);
  useEffect(()=>{
    if(!active||!source||initialized.current)return;
    try{const a=makePosterAsset(source.el,source.w,source.h,source.name);initialized.current=true;setAssets([a]);setSlots(blankSlots().map((s,i)=>({...s,assetId:a.id,zoom:i===1?1.65:i===2?2:1,ink:i===1?'second':'duo'})));}catch{}
  },[active,source]);
  useEffect(()=>{if(!active||!canvas.current)return;render.current??=createPosterRenderer();render.current(canvas.current,assets,slots,settings,params,900);},[active,assets,slots,settings,params]);
  useEffect(clearResult,[assets,slots,settings,params]);
  useEffect(()=>{setSelected(s=>Math.min(s,frames.length-1));setCrop(false);},[settings.layout]);
  async function importFiles(list:FileList|File[]|null){
    if(!list||busyRef.current)return;const files=Array.from(list),room=6-assetsRef.current.length;if(!room){setStatus('素材库最多 6 张。先删除一张，或用已有素材替换图片格。');return;}
    busyRef.current=true;setBusy(true);setStatus('正在读取拼图素材…');const added:PosterAsset[]=[],errors:string[]=[];
    for(const f of files.slice(0,room)){
      if(!f.type.startsWith('image/')){errors.push(f.name+' 不是图片');continue;}
      if(f.size>50*1024*1024){errors.push(f.name+' 超过 50 MB');continue;}
      const url=URL.createObjectURL(f),image=new Image();
      try{await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('读取超时')),12000);image.onload=()=>{clearTimeout(timer);resolve()};image.onerror=()=>{clearTimeout(timer);reject(Error('无法读取'))};image.src=url;});if(!alive.current)break;if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>50000000)throw Error('尺寸过大');added.push(makePosterAsset(image,image.naturalWidth,image.naturalHeight,f.name));}catch{errors.push(f.name+' 读取失败');}finally{URL.revokeObjectURL(url);image.src='';}
    }
    if(alive.current){
      if(added.length){setAssets(s=>[...s,...added].slice(0,6));setSlots(s=>s.map((v,i)=>{const index=added.length>1?i:i===selected?0:-1;const a=added[index];return a?{...v,assetId:a.id,x:0,y:0,zoom:1}:v;}));if(added.length>1)setSelected(0);}
      setStatus([added.length?`已导入 ${added.length} 张。点击素材缩略图可替换选中的图片格。`:'未导入新图片。',files.length>room?`只处理前 ${room} 张，素材库上限 6 张。`:'',errors.length?errors.join('；'):''].filter(Boolean).join(' '));setBusy(false);
    }busyRef.current=false;
  }
  function removeAsset(){if(!chosen)return;const next=assets.filter(a=>a.id!==chosen.id);setAssets(next);setSlots(s=>s.map(v=>v.assetId===chosen.id?{...v,assetId:next[0]?.id??null,x:0,y:0,zoom:1}:v));setStatus('已从素材库删除，使用它的图片格已同步更新。');}
  function pointerDown(e:React.PointerEvent<HTMLButtonElement>,i:number,frame:Frame){
    setSelected(i);if(!crop||busy)return;const a=assets.find(v=>v.id===slots[i].assetId);if(!a||!paper.current)return;
    const scale=paper.current.getBoundingClientRect().width/dimensions[0],m=cropMetrics(a,frame,slots[i].zoom);
    drag.current={pointer:e.pointerId,index:i,clientX:e.clientX,clientY:e.clientY,x:slots[i].x,y:slots[i].y,overflowX:m.overflowX*scale,overflowY:m.overflowY*scale,rotate:(frame.rotate||0)*Math.PI/180};e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e:React.PointerEvent<HTMLButtonElement>){const d=drag.current;if(!d||d.pointer!==e.pointerId)return;const dx=e.clientX-d.clientX,dy=e.clientY-d.clientY,x=dx*Math.cos(d.rotate)+dy*Math.sin(d.rotate),y=-dx*Math.sin(d.rotate)+dy*Math.cos(d.rotate);updateSlot({x:d.overflowX>1?clamp(d.x-x*2/d.overflowX):d.x,y:d.overflowY>1?clamp(d.y-y*2/d.overflowY):d.y},d.index);}
  async function exportPoster(){
    if(busyRef.current)return;if(frames.some((_,i)=>!assets.some(a=>a.id===slots[i].assetId))){setStatus('还有空的图片格，先选择素材再导出。');return;}
    busyRef.current=true;setBusy(true);setCrop(false);clearResult();setStatus('正在制作完整海报…');
    try{await new Promise(r=>setTimeout(r,30));const out=document.createElement('canvas');createPosterRenderer()(out,assets,slots,settings,params,2400);const blob=await new Promise<Blob|null>(r=>out.toBlob(r,'image/png'));if(!blob)throw Error('PNG 编码失败');if(!alive.current)return;const url=URL.createObjectURL(blob),name=`riso-poster-${settings.layout}.png`;resultUrl.current=url;setResult({url,name});setStatus(`已完成 ${out.width} × ${out.height} px · ${(blob.size/1024/1024).toFixed(1)} MB · 包含文字、图片与印刷细节`);}catch(e){setStatus((e as Error).message);}finally{busyRef.current=false;if(alive.current)setBusy(false);}
  }
  return <main className={active?'poster-mode':'poster-mode is-hidden'}>
    <label className="button poster-upload">＋ 导入拼图照片<input type="file" accept="image/*" multiple disabled={busy} aria-label="导入拼图照片" onChange={e=>{importFiles(e.target.files);e.target.value='';}}/></label>
    <section className="workspace poster-workspace" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();importFiles(e.dataTransfer.files);}}>
      <div className="stage-label"><span>把图像，编排成一张印刷品。</span><span>POSTER / COMPOSER</span></div>
      <div className="artboard poster-artboard"><div className={'paper poster-paper'+(crop?' is-cropping':'')} ref={paper}>
        <canvas ref={canvas} aria-label="Riso 拼图海报预览"/>
        <div className="frame-selectors">{frames.map((f,i)=><button key={i} aria-label={`选中图片 ${i+1}`} aria-pressed={selected===i} disabled={busy} className={'frame-selector'+(selected===i?' selected':'')} style={{left:f.x/dimensions[0]*100+'%',top:f.y/dimensions[1]*100+'%',width:f.w/dimensions[0]*100+'%',height:f.h/dimensions[1]*100+'%',transform:`rotate(${f.rotate||0}deg)`}} onClick={()=>setSelected(i)} onPointerDown={e=>pointerDown(e,i,f)} onPointerMove={pointerMove} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}><span>0{i+1}</span></button>)}</div>
      </div></div>
      <div className="poster-actions"><button aria-pressed={crop} onClick={()=>setCrop(c=>!c)} disabled={busy||!chosen}>{crop?'✓ 完成裁切':'↔ 拖动裁切'}</button><span>{crop?'拖动图片移动取景':'点选图片格 · 编辑后导出'}</span><button className="primary" onClick={exportPoster} disabled={busy||!assets.length}>{busy?'正在处理…':'导出海报 PNG ↗'}</button></div>
      <p role="status" className="status">{status}</p>
      {result&&<a className="download-result" href={result.url} download={result.name}>下载 {result.name} ↗</a>}
      <div className="sample-links"><button disabled={!source||assets.length>=6||busy} onClick={appendCurrent}>{source?.kind==='video'?'加入视频当前帧':'加入当前素材'}</button><span>最长边 2400 px · 素材在本机处理</span></div>
    </section>
    <aside className="poster-panel"><div className="mobile-panel-title">COMPOSE / 海报拼图<button onClick={()=>paper.current?.scrollIntoView({behavior:'smooth',block:'center'})}>预览海报 ↑</button></div><fieldset disabled={busy}>
      <div className="panel-title"><span>01 / 版式与画幅</span><span className="minor">{frames.length} 张图</span></div>
      <div className="layout-grid">{LAYOUTS.map(l=><button key={l.id} aria-pressed={settings.layout===l.id} onClick={()=>setting('layout',l.id)}><LayoutIcon id={l.id}/><b>{l.name}</b><small>{l.note}</small></button>)}</div>
      <div className="ratio-options" role="group" aria-label="海报比例">{(['3:4','4:5','1:1'] as const).map(r=><button key={r} aria-pressed={settings.ratio===r} onClick={()=>setting('ratio',r)}>{r}</button>)}</div>
      <div className="panel-title"><span>02 / 标题与注释</span><select aria-label="海报字体" value={settings.type} onChange={e=>setting('type',e.target.value as PosterSettings['type'])}><option value="editorial">刊物细字</option><option value="sans">粗黑体</option><option value="serif">衬线</option></select></div>
      <label className="poster-field">主标题<textarea aria-label="海报主标题" rows={2} maxLength={48} value={settings.title} onChange={e=>setting('title',e.target.value)}/></label>
      <label className="poster-field">副标题<input aria-label="海报副标题" maxLength={60} value={settings.subtitle} onChange={e=>setting('subtitle',e.target.value)}/></label>
      <div className="poster-meta"><label className="poster-field">期号<input aria-label="海报期号" maxLength={28} value={settings.edition} onChange={e=>setting('edition',e.target.value)}/></label><label className="poster-field">署名<input aria-label="海报署名" maxLength={32} value={settings.credit} onChange={e=>setting('credit',e.target.value)}/></label></div>
      {settings.layout==='editorial'&&<details className="editorial-copy"><summary>编辑刊头与四栏正文</summary><label className="poster-field">左上刊头<textarea aria-label="刊物左上刊头" rows={3} maxLength={40} value={settings.masthead} onChange={e=>setting('masthead',e.target.value.split('\n').slice(0,4).join('\n'))}/></label><label className="poster-field">以单独一行 --- 分隔各栏<textarea aria-label="刊物正文" rows={8} maxLength={5000} value={settings.body} onChange={e=>setting('body',e.target.value)}/></label></details>}
      <div className="panel-title"><span>03 / 图片 {selected+1} 的取景</span><button onClick={()=>updateSlot({zoom:1,x:0,y:0})}>居中复位</button></div>
      <div className="slot-tabs" role="group" aria-label="选择图片格">{frames.map((_,i)=><button key={i} aria-pressed={selected===i} onClick={()=>setSelected(i)}>0{i+1}</button>)}</div>
      <label className="range"><span>图片缩放<output>{slot.zoom.toFixed(2)}×</output></span><input aria-label="拼图图片缩放" type="range" min="1" max="3" step=".01" value={slot.zoom} disabled={!chosen} onChange={e=>updateSlot({zoom:+e.target.value})}/></label>
      {settings.layout==='editorial'&&<label className="range"><span>照片叠印浓度<output>{Math.round(settings.photoOpacity*100)}%</output></span><input aria-label="照片叠印浓度" type="range" min="0" max="1" step=".01" value={settings.photoOpacity} onChange={e=>setting('photoOpacity',+e.target.value)}/></label>}
      <label className="texture-mode">此格用墨<select aria-label="此格用墨" value={slot.ink} onChange={e=>updateSlot({ink:e.target.value as Slot['ink']})}><option value="duo">双墨套印</option><option value="first">只用墨色 1</option><option value="second">只用墨色 2</option><option value="original">保留原片</option></select></label>
      <div className="asset-heading"><span>素材库 {assets.length}/6 · 点选替换</span><button disabled={!chosen} onClick={removeAsset}>删除所选素材</button></div>
      <div className="asset-library">{assets.map((a,i)=><button key={a.id} title={a.name} aria-label={`使用素材 ${i+1}：${a.name}`} aria-pressed={slot.assetId===a.id} onClick={()=>updateSlot({assetId:a.id,x:0,y:0,zoom:1})}><img src={a.thumbnail} alt=""/><span>{String(i+1).padStart(2,'0')}</span></button>)}{assets.length<6&&<label className="asset-add" title="导入更多照片">＋<input type="file" accept="image/*" multiple aria-label="添加更多拼图照片" onChange={e=>{importFiles(e.target.files);e.target.value='';}}/></label>}</div>
      <p className="hint">一张照片也能重复取景。选中图片格后，开启「拖动裁切」调整画面。</p>
      <div className="panel-title"><span>04 / 专色与印刷细节</span><button onClick={()=>onParams(structuredClone(sourceParams))}>复制图像参数</button></div>
      <button className="editorial-palette" onClick={()=>{onParams(editorialParams());setting('accent','#f4e328');}}><i style={{background:'#29c5e8'}}/><i style={{background:'#ff75bb'}}/><i style={{background:'#f4e328'}}/><span>青 / 粉 / 黄 · 刊物套色</span></button>
      <div className="poster-palettes">{PRESETS.map((p,i)=><button key={p.name} title={p.note} onClick={()=>onParams(presetParams(i))}><i style={{background:p.colors[0]}}/><i style={{background:p.colors[1]}}/><span>{p.name}</span></button>)}</div>
      <div className="colors poster-colors">{[['纸张',params.bgColor],['墨色 1',params.ink1.color],['墨色 2',params.ink2.color]].map(([label,value],i)=><label key={label}>{label}<input type="color" aria-label={'海报'+label} value={value} onChange={e=>{const p=structuredClone(params);if(i===0)p.bgColor=e.target.value;else if(i===1)p.ink1.color=e.target.value;else{p.ink2.color=e.target.value;p.ink2.enabled=true;}onParams(p);}}/></label>)}</div>
      {settings.layout==='editorial'&&<label className="accent-ink">图形专色<input aria-label="图形第三专色" type="color" value={settings.accent} onChange={e=>setting('accent',e.target.value)}/></label>}
      <label className="check"><input type="checkbox" checked={settings.shapes} onChange={e=>setting('shapes',e.target.checked)}/>几何图形 / 专色叠印</label>
      <label className="check"><input type="checkbox" checked={settings.marks} onChange={e=>setting('marks',e.target.checked)}/>色标与套准标记</label>
      <p className="hint">拼图的纸墨独立调整，也能复制图像模式的参数。PNG 不包含选框与操作界面。</p>
    </fieldset><footer>RISO / COMPOSE<br/>照片、文字、油墨，一起成形。</footer></aside>
  </main>;
}

function LayoutIcon({id}:{id:LayoutId}){const frames=posterFrames(id,100,128);return <svg viewBox="0 0 100 128" aria-hidden="true"><rect width="100" height="128" fill="#faf7ed"/><path d="M6 5H94 M6 115H94" stroke="currentColor" strokeWidth=".7"/>{id==='editorial'?<><rect x="30" y="13" width="18" height="30" fill="#35b8cf"/><rect x="77" y="51" width="12" height="55" fill="#ee85b5"/><circle cx="32" cy="67" r="17" fill="#eddf43"/><path d="M42 23H89 M42 34H89 M42 45H80" stroke="#222" strokeWidth="2"/>{[7,30,53,76].map(x=><path key={x} d={Array.from({length:13},(_,i)=>`M${x} ${74+i*2.4}h17`).join(' ')} stroke="#555" strokeWidth=".7"/>)}</>:<><rect x="6" y="11" width={id==='contact'?86:62} height="7" fill="currentColor"/>{id!=='contact'&&<rect x="6" y="21" width="53" height="7" fill="currentColor"/>}{frames.map((f,i)=><rect key={i} x={f.x} y={f.y} width={f.w} height={f.h} transform={`rotate(${f.rotate||0} ${f.x+f.w/2} ${f.y+f.h/2})`} fill={i%2?'#f07853':'currentColor'} opacity={i%2?1:.8}/>)}</>}<path d="M6 121H56" stroke="currentColor" strokeWidth="1"/></svg>;}
