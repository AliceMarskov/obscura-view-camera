import {useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent} from 'react'
import {createRoot} from 'react-dom/client'
import {Aperture, BookOpen, Box, Check, ChevronDown, Focus, Frame, GalleryHorizontalEnd, Grid2X2, Maximize2, Minus, Mountain, Plus, RotateCcw, RectangleHorizontal, RectangleVertical, Scan, Waves, Image as PrintIcon, Pin, X, Volume2, VolumeX} from 'lucide-react'
import {Bench, type Layers, type Standard, type View} from './bench'
import {scenePresets, lensPresets, type SceneId, type LensId} from './scenes'
import {onSceneryReady} from './scenes/photographic'
import {sceneRig, swapLens, extensionLimits, clampStep, lensFor, turnFilmBack, movementStep} from './equipment'
import {frames, focusPlane, signedAxisFocus, axisDepthOfField, coverage, cross, dot, length, type Movement, type Rig} from './optics'
import {filmWindow, screenToFilm, panFilmWindow, type FilmPoint, type FilmWindow, type LoupeZoom} from './focus-feedback'
import {InstrumentPanel, type ControlTab} from './InstrumentPanel'
import {FieldManual} from './FieldManual'
import {StitchPanel} from './StitchPanel'
import {ScreenGrid} from './ScreenGrid'
import {calibrationLink,currentScene,rememberScene,startsUpright,preference,rememberPreference} from './navigation'
import {ContactProof} from './ContactProof'
import {opticalLines} from './depth-geometry'
import {soundEnabled,setSoundEnabled,mechanicalSound} from './sound'
import './style.css'

const requestedScene=currentScene()
const startingScene:SceneId=scenePresets.find(scene=>scene.id===requestedScene)?.id??'architecture'
const zero:FilmPoint={x:0,y:0}
const viewNames:Record<View,string>={perspective:'环境全景',detail:'相机特写',side:'光路侧视',top:'俯视'}
const meters=(v:number)=>Number.isFinite(v)?(v/1000).toFixed(v<10000?2:1):'∞'
type Drag={id:number; x:number; y:number; width:number; height:number; start:FilmWindow; moved:boolean}

function App(){
  const [sceneId,setSceneId]=useState<SceneId>(startingScene)
  const [rig,setRig]=useState(()=>sceneRig(startingScene))
  const lens=lensFor(rig)
  const [tab,setTab]=useState<ControlTab>('front'),[axis,setAxis]=useState<keyof Movement>('tilt')
  const [mechanismPick,setMechanismPick]=useState(0)
  const [view,setView]=useState<View>('perspective'),[layers,setLayers]=useState<Layers>({planes:true,rays:false,grid:true})
  const [largeStage,setLargeStage]=useState(false),[panel,setPanel]=useState<'help'|'stitch'|null>(null)
  const [loading,setLoading]=useState(true)
  const [upright,setUpright]=useState(startsUpright),[grid,setGrid]=useState(false),[peaking,setPeaking]=useState(false)
  const [hint,setHint]=useState(()=>!startsUpright()&&!preference('seenInversion'))
  const [audible,setAudible]=useState(soundEnabled)
  const [proof,setProof]=useState<{exposure:Promise<string>;rig:Rig;scene:string;controller:AbortController}|null>(null)
  const [pin,setPin]=useState<{center:FilmPoint;zoom:LoupeZoom}|null>(null)
  const pinCanvas=useRef<HTMLCanvasElement>(null)
  const [wideOpen,setWideOpen]=useState(false),[zoom,setZoom]=useState<LoupeZoom>(1)
  const [sharpReference,setSharpReference]=useState(false)
  const [center,setCenter]=useState<FilmPoint>(zero),[dragging,setDragging]=useState(false),[error,setError]=useState('')
  const canvas=useRef<HTMLCanvasElement>(null),glass=useRef<HTMLCanvasElement>(null),tags=useRef<HTMLDivElement>(null)
  const bench=useRef<Bench|null>(null),drag=useRef<Drag|null>(null),activeAxis=useRef(axis)
  activeAxis.current=axis
  const effective=useMemo(()=>wideOpen?{...rig,aperture:lens.apertures[0]}:rig,[rig,wideOpen,lens])
  const model=useMemo(()=>{
    const {lens,film}=frames(effective)
    const used=Math.max(...[-1,1].flatMap(x=>[-1,1].map(y=>coverage(lens,film,effective,x*effective.width/2,y*effective.height/2))))
    const plane=focusPlane(lens,film,effective.focal)
    const angle=plane?Math.atan2(length(cross(plane.normal,lens.n)),Math.abs(dot(plane.normal,lens.n)))*180/Math.PI:null
    return {distance:signedAxisFocus(lens,film,effective.focal),depth:axisDepthOfField(effective),used,angle,lines:opticalLines(lens,film,effective.focal)}
  },[effective])
  const crop=filmWindow(rig,zoom,center)
  const neutral=useMemo(()=>sceneRig(sceneId),[sceneId])
  const resetExtension=neutral.focal===rig.focal?neutral.extension:swapLens(neutral,lens.id).extension

  function move(side:Standard,key:keyof Movement,value:number){
    const limit=key==='tilt'||key==='swing'?18:48
    setRig(r=>({...r,[side]:{...r[side],[key]:clampStep(value,-limit,limit,movementStep(key))}}))
  }
  function body(key:'extension'|'pitch'|'yaw'|'aperture',v:number){
    setRig(r=>({...r,[key]:key==='extension'?clampStep(v,...extensionLimits(r.focal),.01):v}))
    if(key==='aperture')setWideOpen(false)
  }
  useEffect(()=>{
    const stopListening=onSceneryReady(()=>setLoading(false))
    try{
      const e=new Bench(canvas.current!,glass.current!,tags.current!,{
        axis:()=>activeAxis.current,select:side=>{setTab(side);setMechanismPick(n=>n+1)},move,focus:v=>body('extension',v)
      },startingScene)
      bench.current=e
      return ()=>{stopListening();e.dispose();bench.current=null}
    }catch(err){stopListening();setLoading(false);setError('三维取景未能启动。请打开浏览器硬件加速后重新载入。');console.error(err)}
  },[])
  useEffect(()=>{bench.current?.setRig(effective)},[effective])
  useEffect(()=>{bench.current?.setLayers(layers)},[layers])
  useEffect(()=>{bench.current?.setLoupe(zoom,center)},[zoom,center.x,center.y])
  useEffect(()=>{bench.current?.setPeaking(peaking)},[peaking])
  useEffect(()=>{bench.current?.setSharpReference(sharpReference)},[sharpReference])
  useEffect(()=>{bench.current?.setFocusPin(pin?pinCanvas.current:null,pin?.center,pin?.zoom)},[pin])
  useEffect(()=>{
    if(!hint||loading)return
    rememberPreference('seenInversion','1')
    const id=window.setTimeout(()=>setHint(false),4500)
    return ()=>clearTimeout(id)
  },[loading,hint])

  function flip(){setUpright(!upright);rememberPreference('upright',upright?'0':'1');setHint(false)}
  function expose(){
    if(!bench.current||loading)return
    mechanicalSound('shutter')
    const controller=new AbortController()
    setProof({exposure:bench.current.capturePrint(controller.signal),controller,rig:effective,scene:scenePresets.find(s=>s.id===sceneId)!.name})
  }

  function magnify(next:LoupeZoom,at:FilmPoint=center){
    drag.current=null;setDragging(false)
    if(next===1){setSharpReference(false);setPin(null)}
    setZoom(next);setCenter(next===1?zero:filmWindow(rig,next,at))
  }
  function changeScene(id:SceneId){
    if(id===sceneId)return
    setLoading(true)
    const next={...sceneRig(id),width:rig.width,height:rig.height}
    bench.current?.setScene(id,next);bench.current?.setView('perspective')
    setView('perspective');setSceneId(id);setRig(next);setWideOpen(false);magnify(1)
    rememberScene(id)
    setTab('front');setAxis('tilt')
  }
  function changeLens(id:LensId){setWideOpen(false);setRig(r=>swapLens(r,id))}
  function reset(){setRig(r=>({...neutral,width:r.width,height:r.height}));setWideOpen(false);setTab('front');setAxis('tilt');magnify(1);bench.current?.setView('perspective');setView('perspective')}
  const portrait=rig.height>rig.width
  function turnBack(){mechanicalSound('back');setPin(null);setRig(turnFilmBack);setCenter(c=>filmWindow(turnFilmBack(rig),zoom,c));drag.current=null;setDragging(false)}
  function pointerDown(e:ReactPointerEvent<HTMLDivElement>){
    if(!e.isPrimary||e.button!==0||drag.current)return
    const rect=e.currentTarget.getBoundingClientRect()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,width:rect.width,height:rect.height,start:crop,moved:false}
  }
  function pointerMove(e:ReactPointerEvent<HTMLDivElement>){
    const d=drag.current;if(!d||e.pointerId!==d.id)return
    const dx=e.clientX-d.x,dy=e.clientY-d.y
    if(!d.moved&&Math.hypot(dx,dy)<3)return
    d.moved=true
    if(zoom>1){setDragging(true);setCenter(panFilmWindow(rig,zoom,d.start,dx/d.width,dy/d.height,upright))}
  }
  function endPointer(e:ReactPointerEvent<HTMLDivElement>,cancel=false){
    const d=drag.current;if(!d||e.pointerId!==d.id)return
    drag.current=null;setDragging(false)
    if(cancel||d.moved)return
    const r=e.currentTarget.getBoundingClientRect()
    const point=screenToFilm(d.start,(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height,upright)
    magnify(zoom===1?2:zoom,point)
  }

  return <div className={'studio'+(largeStage?' stage-first':'')}>
    <header className="studio-head">
      <h1 className="studio-brand"><Aperture/><span>暗箱</span><em>Obscura</em></h1>
      <div className="view-switch" role="group" aria-label="主观察窗">
        <button aria-pressed={!largeStage} onClick={()=>setLargeStage(false)}><Scan/>毛玻璃</button>
        <button aria-pressed={largeStage} onClick={()=>setLargeStage(true)}><Box/>机位</button>
      </div>
      <div className="kit">
        <label><Mountain/><select aria-label="场景" value={sceneId} onChange={e=>changeScene(e.target.value as SceneId)}>{scenePresets.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><ChevronDown/></label>
        <label><Aperture/><select aria-label="镜头" value={lens.id} onChange={e=>changeLens(e.target.value as LensId)}>{lensPresets.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select><ChevronDown/></label>
      </div>
      <div className="head-actions">
        <button title="拍摄接触印样" aria-label="拍摄接触印样" disabled={loading||!!error} onClick={expose}><PrintIcon/><span>印样</span></button>
        <button title="移轴接片" aria-label="移轴接片" onClick={()=>setPanel('stitch')}><GalleryHorizontalEnd/><span>接片</span></button>
        <button title="实验手册" aria-label="实验手册" onClick={()=>setPanel('help')}><BookOpen/><span>手册</span></button>
      </div>
    </header>
    {error&&<div className="error" role="alert">{error} <a href={calibrationLink()}>光路校准台</a></div>}
    <main className="studio-desk">
      <section className="glass-panel" aria-label="实时毛玻璃">
        <div className="panel-head glass-head"><h2><Frame/>毛玻璃取景</h2><span className="format">4 × 5 in</span>
          <button className="back-orientation" aria-pressed={portrait} aria-label="旋转后背" title="将片夹转动 90°" onClick={turnBack}>{portrait?<RectangleVertical/>:<RectangleHorizontal/>}{portrait?'竖幅':'横幅'}</button>
          <button className="open-aperture" aria-label="全开对焦" aria-pressed={wideOpen} onClick={()=>{mechanicalSound('shutter');setWideOpen(!wideOpen)}}><Aperture/>全开对焦</button>
        </div>
        <div className="glass-hood">
          <div className="film-frame" style={{'--film-ratio':rig.width/rig.height} as React.CSSProperties}>
            <div className="imprint" aria-hidden="true"><span>{rig.width} × {rig.height} mm</span><span>{rig.focal} mm　f/{effective.aperture}</span></div>
            <div className="exposure" role="region" tabIndex={0} aria-label="放大取景区" title={zoom===1?'点取局部放大':'拖动画面平移放大镜，点按重新居中'}
              data-zoom={zoom} data-center-x={crop.x} data-center-y={crop.y} data-dragging={dragging||undefined}
              onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={endPointer} onPointerCancel={e=>endPointer(e,true)} onLostPointerCapture={e=>endPointer(e,true)}
              onKeyDown={e=>{
                if(e.key==='Home'){e.preventDefault();setCenter(zero);return}
                if(e.key==='Enter'){e.preventDefault();magnify(zoom===1?2:zoom===2?4:1);return}
                if(zoom===1)return
                const offsets:Record<string,[number,number]>={ArrowLeft:[-.1,0],ArrowRight:[.1,0],ArrowUp:[0,-.1],ArrowDown:[0,.1]}
                const xy=offsets[e.key];if(xy){e.preventDefault();setCenter(panFilmWindow(rig,zoom,crop,xy[0],xy[1],upright))}
              }}>
              <canvas ref={glass} aria-label={sharpReference?'同一构图的清晰度参照':'物理毛玻璃成像'} style={{transform:upright?'none':'rotate(180deg)'}}/>
              {loading&&<div className="loading-scene" role="status">正在载入场景…</div>}
              {hint&&!loading&&!upright&&<div className="inversion-hint" role="status">毛玻璃呈上下、左右倒像，可点「正像」翻转。</div>}
              {grid&&<ScreenGrid crop={crop} width={rig.width} height={rig.height} upright={upright}/>}
              {zoom>1&&<div className="loupe-map" style={{aspectRatio:rig.width/rig.height}} aria-hidden="true"><i style={{width:100/zoom+'%',height:100/zoom+'%',left:50+(upright?-1:1)*crop.x/rig.width*100+'%',top:50+(upright?1:-1)*crop.y/rig.height*100+'%'}}/></div>}
            </div>
            {pin&&<figure className="pinned-loupe"><canvas ref={pinCanvas} aria-label="测点 A 实时毛玻璃" style={{transform:upright?'none':'rotate(180deg)'}}/>
              <figcaption>A · {pin.zoom}×</figcaption><button aria-label="移除测点 A" title="移除测点 A" onClick={()=>setPin(null)}><X size={12}/></button></figure>}
            {zoom>1&&<button className="pin-control" aria-label={pin?'重新钉住测点 A':'钉住测点 A'} title="固定此处，同时观察另一处的焦点" onClick={()=>setPin({center:{x:crop.x,y:crop.y},zoom})}><Pin size={12}/>{pin?'重定位 A':'钉住 A'}</button>}
            {zoom>1&&<button className="sharp-reference" type="button" aria-label="清晰度参照" aria-pressed={sharpReference}
              title={sharpReference?'返回当前光圈的毛玻璃成像':'查看相同位置仅用镜头中心光线成像时的细节'}
              onClick={()=>setSharpReference(v=>!v)}><Focus/><span>{sharpReference?'参照中 · 返回取景':'清晰度参照'}</span></button>}
            <div className="engraving" aria-hidden="true"/>
          </div>
        </div>
        <div className="glass-tools"><div className="zoom-buttons" role="group" aria-label="放大倍率">{([1,2,4] as const).map(n=><button key={n} aria-pressed={zoom===n} onClick={()=>magnify(n)}>{n}×</button>)}</div>
          <div className="glass-toggles">
            <button className="peaking" aria-label="峰值对焦" aria-pressed={peaking&&!sharpReference} disabled={sharpReference} title={sharpReference?'返回光学取景后可查看峰值':'标出合焦纹理边缘'} onClick={()=>setPeaking(!peaking)}><Waves/><span>峰值</span></button>
            <button aria-label="构图网格" aria-pressed={grid} onClick={()=>setGrid(!grid)}><Grid2X2/><span>网格</span></button>
            <button aria-label="正像辅助" aria-pressed={upright} onClick={flip}><RotateCcw/><span>正像</span></button>
          </div>
        </div>
        <div className="readings" aria-label="光学读数">
          <div><span>轴上合焦距离</span><b data-reading="focus">{model.distance<0?'无实焦':<>{meters(model.distance)} <small>m</small></>}</b></div>
          <div><span>轴上景深</span><b>{model.depth?meters(model.depth.near)+' – '+meters(model.depth.far):'—'} <small>m</small></b></div>
          <div><span>像场利用率</span><b className={model.used>1?'warning':''}>{Math.round(100*model.used)}<small>%</small></b></div>
        </div>
      </section>
      <section className="stage-panel" aria-label="三维观察区">
        <div className="panel-head"><h2><Box/>机位观察</h2>
          <select className="stage-select" aria-label="观察视图" value={view} onChange={e=>{const v=e.target.value as View;setView(v);bench.current?.setView(v)}}>{Object.entries(viewNames).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select>
          <button className="stage-expand" aria-label={largeStage?'返回毛玻璃':'放大机位'} onClick={()=>setLargeStage(!largeStage)}>{largeStage?<Scan/>:<Maximize2/>}</button>
        </div>
        <div className="viewport"><canvas ref={canvas} className="scene-canvas" aria-label="可旋转的三维机位与焦平面"/><div className="object-tags" ref={tags}><span data-tag="camera">相机</span><span data-tag="focus">焦平面</span></div>
          {layers.planes&&(view==='side'||view==='top')&&<div className="plane-reading" title="取两平面之间较小的夹角，平行时为 0°">
            {model.angle===null?'焦平面在无穷远':<>焦面与镜头板夹角 <b>{model.angle.toFixed(2)}°</b></>}
          </div>}
          {layers.depth&&(view==='side'||view==='top')&&<div className="depth-key" aria-label="景深示意图例"><span>近界</span><span>远界</span>{model.lines&&<><span>铰链 J {meters(model.lines.hingeDistance)} m</span><span>沙姆交线</span></>}</div>}
          <div className="scene-tools">{([[Plus,'放大观察视图',()=>bench.current?.zoom(.82)],[Minus,'缩小观察视图',()=>bench.current?.zoom(1.22)],[Focus,'视图归位',()=>bench.current?.home()]] as const).map(([Icon,t,fn])=><button key={t} aria-label={t} title={t} onClick={fn}><Icon/></button>)}</div>
        </div>
        <div className="layers">{([['planes','光学平面'],['rays','光线'],['grid','地面网格'],['depth','景深']] as const).filter(([k])=>k!=='depth'||view==='side'||view==='top').map(([k,n])=><button key={k} aria-pressed={!!layers[k]} onClick={()=>setLayers(l=>({...l,[k]:!l[k]}))}><i>{layers[k]&&<Check/>}</i>{n}</button>)}</div>
      </section>
      <InstrumentPanel key={sceneId+':'+mechanismPick} rig={rig} tab={tab} axis={axis} defaultExtension={resetExtension} defaultAperture={neutral.aperture}
        onTab={setTab} onAxis={setAxis} move={move} body={body} reset={reset}/>
    </main>
    {panel==='help'&&<FieldManual close={()=>setPanel(null)} soundSwitch={<button className="manual-sound" aria-label="机械声效" aria-pressed={audible} onClick={()=>{setSoundEnabled(!audible);setAudible(!audible)}}>{audible?<Volume2 size={15}/>:<VolumeX size={15}/>}机械声效 · {audible?'开':'关'}</button>}/>}
    {proof&&<ContactProof {...proof} close={()=>{proof.controller.abort();setProof(null)}}/>}
    <StitchPanel open={panel==='stitch'} close={()=>setPanel(null)} sceneId={sceneId} rig={effective} capture={()=>{if(!bench.current)throw new Error('取景尚未就绪');return bench.current.capture()}}/>
  </div>
}
createRoot(document.getElementById('root')!).render(<App/>)
