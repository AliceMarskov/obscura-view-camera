import * as T from 'three'
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js'
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js'
import {createCameraModel} from './camera-model'
import {createScenePreset,lensPresets,type SceneId} from './scenes'
import {filmStocks,neutralStock} from './film-stock'
import {focusSlice} from './focus-slice'
import {FocusOutline} from './focus-outline'
import {FocusContour} from './focus-contour'
import {DepthGuide} from './depth-guide'
import {focusGuideBundles} from './focus-rays'
import {type LoupeZoom,type FilmPoint} from './focus-feedback'
import {GroundGlass} from './ground-glass'
import {ProbeSurfaces} from './probe-surfaces'
import {onSceneryReady} from './scenes/photographic'
import {streetSun} from './scenes/daylight'
import {ObserverGroundGrid} from './observer-grid'
import {frames,localFrame,objectRay,initial,rotate,sub,tripodPivot,type Frame,type Rig,type V,type Movement} from './optics'

export type Standard='front'|'rear'
export type View='perspective'|'detail'|'side'|'top'
export type Layers={planes:boolean;rays:boolean;grid:boolean;depth?:boolean}
export type Targets=Record<'sphere'|'cylinder'|'arch',V>
const vec=(p:V)=>new T.Vector3(...p)
const mat=(b:Frame)=>new T.Matrix4().makeBasis(vec(b.x),vec(b.y),vec(b.n)).setPosition(vec(b.o))
const clearGroup=(group:T.Group)=>{
  group.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line||o instanceof T.Points){o.geometry.dispose();o.material.dispose()}})
  group.clear()
}
function segment(points:T.Vector3[],color:number){
  const geometry=new T.BufferGeometry().setFromPoints(points)
  return new T.Line(geometry,new T.LineBasicMaterial({color,transparent:true,opacity:.85}))
}
function polygon(points:T.Vector3[],color:number,opacity:number){
  const g=new T.Group(),vertices:number[]=[]
  for(let i=1;i<points.length-1;i++)vertices.push(...points[0].toArray(),...points[i].toArray(),...points[i+1].toArray())
  const shape=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(vertices,3))
  g.add(new T.Mesh(shape,new T.MeshBasicMaterial({color,side:T.DoubleSide,transparent:true,opacity,depthWrite:false,polygonOffset:true,polygonOffsetFactor:1})))
  g.add(segment([...points,points[0]],color))
  return g
}
function illuminate(scene:T.Scene) {
  const sun=new T.DirectionalLight(), fill=new T.DirectionalLight()
  const skylight=new T.HemisphereLight()
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048)
  scene.add(sun,sun.target,fill,fill.target,skylight)
  return (id:SceneId,probeReady=false)=>{
    const street=id==='architecture',indoor=id==='still-life',glass=id==='greenhouse'
    const center=new T.Vector3(street?800:0,street?3500:-90,street?-18000:-900)
    const span=street?18500:glass?3600:1650
    // Direction, sky bounce and shadow volume are tied to the actual
    // subject scale. A 20 m facade cannot fit the tabletop shadow camera.
    sun.color.setHex(indoor?0xffead5:street?0xffe6c7:0xfff2d4)
    sun.intensity=indoor?3.45:street?4.5:3.6
    const toLight=street?streetSun.clone().multiplyScalar(2.5):indoor?new T.Vector3(-1.7,.92,.55):new T.Vector3(-.65,1.35,-1.35)
    sun.position.copy(center).addScaledVector(toLight,span)
    sun.target.position.copy(center)
    Object.assign(sun.shadow.camera,{left:-span,right:span,top:span,bottom:-span,near:span*.08,far:span*5})
    sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=street?3:.36;sun.shadow.bias=street?-.000025:-.00013
    sun.shadow.radius=street?1.15:2
    fill.position.copy(center).addScaledVector(new T.Vector3(.82,.65,glass?1:-1),span);fill.target.position.copy(center)
    fill.color.setHex(indoor?0xc2cfdf:0xc2d4dc);fill.intensity=indoor?.29:street?0:.48
    skylight.color.setHex(indoor?0xffe9cf:street?0xbdd6f3:0xe7f2ff);skylight.groundColor.setHex(indoor?0x7c6352:0x9a8e7c)
    skylight.intensity=probeReady?(indoor?.16:street?.14:.24):(indoor?.61:street?.56:.84)
  }
}
export class Bench {
  private scene=new T.Scene()
  private photoScene=new T.Scene()
  private camera=new T.PerspectiveCamera(34,1,4,480000)
  private gl:T.WebGLRenderer
  private film:GroundGlass
  private controls:OrbitControls
  private cameraModel=createCameraModel()
  private floor:ObserverGroundGrid
  private lightObserver=illuminate(this.scene)
  private lightFilm=illuminate(this.photoScene)
  private helpers=new T.Group()
  private planeFaces=new T.Group()
  private focusAnchor:T.Vector3|null=null
  private constructionOutline=new FocusOutline()
  private contour=new FocusContour()
  private depthGuide=new DepthGuide()
  private rays=new T.Group()
  private environmentMap:T.WebGLRenderTarget
  private subjectRadiance:T.WebGLRenderTarget[]=[]
  private rig=initial()
  private dirty=true
  private observerVisible=false
  private filmVisible=false
  private animation=0
  private observer:ResizeObserver
  private drag:{side:Standard|'body';x:number;y:number;axis:keyof Movement;value:number;id:number}|null=null
  private clean: (()=>void)[]=[]
  private view:View='perspective'
  private layers:Layers={planes:true,rays:true,grid:true}
  private subject:ReturnType<typeof createScenePreset>
  private photoSubject:T.Group
  private surfaces:ProbeSurfaces
  get targets():Targets{return this.subject.targets}
  constructor(private canvas:HTMLCanvasElement,private filmCanvas:HTMLCanvasElement,private tags:HTMLElement,
    private actions:{axis:()=>keyof Movement;select:(s:Standard|'body')=>void;move:(s:Standard,k:keyof Movement,v:number)=>void;focus:(v:number)=>void},sceneId:SceneId='architecture'){
    this.gl=new T.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true})
    this.gl.setPixelRatio(Math.min(devicePixelRatio,1.6));this.gl.shadowMap.enabled=true
    this.gl.shadowMap.type=T.PCFShadowMap;this.gl.shadowMap.autoUpdate=false
    this.gl.toneMapping=T.AgXToneMapping
    this.scene.background=new T.Color('#e4e5da')
    this.scene.fog=new T.FogExp2('#e4e5da',.00024)
    const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(this.gl)
    this.environmentMap=pmrem.fromScene(room,.03)
    this.cameraModel.group.traverse(object=>{
      if(object instanceof T.Mesh && object.material instanceof T.MeshStandardMaterial){
        object.material.envMap=this.environmentMap.texture
        object.material.envMapIntensity=.65
      }
    })
    room.dispose();pmrem.dispose()
    this.subject=createScenePreset(sceneId)
    this.contour.attach(this.subject.group,this.gl)
    this.photoSubject=this.subject.group.clone(true)
    this.surfaces=new ProbeSurfaces(this.photoSubject)
    this.photoScene.background=new T.Color(this.subject.spec.background)
    this.floor=new ObserverGroundGrid(this.gl.getPixelRatio())
    this.scene.add(this.subject.group,this.floor);this.photoScene.add(this.photoSubject)
    this.helpers.add(this.planeFaces,this.constructionOutline)
    this.scene.add(this.cameraModel.group,this.helpers,this.rays,this.depthGuide)
    this.film=new GroundGlass(filmCanvas,this.rig)
    this.configureEnvironment()
    this.clean.push(onSceneryReady(()=>{
      if(!this.subjectRadiance.length)this.captureSubjectLight()
      this.film.setState(this.rig);this.film.renderer.shadowMap.needsUpdate=true
      this.gl.shadowMap.needsUpdate=true;this.dirty=true
    }))
    this.controls=new OrbitControls(this.camera,canvas)
    this.controls.enablePan=true;this.controls.minDistance=230;this.controls.maxDistance=125000
    this.controls.maxPolarAngle=Math.PI*.489;this.controls.zoomSpeed=.85
    this.controls.addEventListener('change',()=>{this.dirty=true})
    this.setView('perspective');this.setRig(this.rig)
    const resize=()=>{
      const w=canvas.clientWidth,h=canvas.clientHeight
      this.observerVisible=w>0&&h>0
      this.filmVisible=filmCanvas.clientWidth>0&&filmCanvas.clientHeight>0
      if(this.observerVisible){
        this.camera.aspect=w/h;this.adaptFieldOfView();this.camera.updateProjectionMatrix()
        this.gl.setSize(w,h,false);this.dirty=true
      }
      if(this.filmVisible)this.film.resize(filmCanvas.clientWidth)
    }
    this.observer=new ResizeObserver(resize)
    this.observer.observe(canvas);this.observer.observe(filmCanvas);resize()
    const on=<K extends keyof HTMLElementEventMap>(type:K,fn:(e:HTMLElementEventMap[K])=>void)=>{
      canvas.addEventListener(type,fn,true);this.clean.push(()=>canvas.removeEventListener(type,fn,true))
    }
    on('pointerdown',e=>{
      if(e.button!==0||e.shiftKey||!e.isPrimary)return
      const rect=canvas.getBoundingClientRect(),ray=new T.Raycaster()
      ray.setFromCamera(new T.Vector2(2*(e.clientX-rect.left)/rect.width-1,1-2*(e.clientY-rect.top)/rect.height),this.camera)
      let obj:T.Object3D|null=ray.intersectObject(this.cameraModel.group,true)[0]?.object??null
      while(obj&&!obj.userData.standard&&!obj.userData.control)obj=obj.parent
      if(!obj)return
      const side:Standard|'body'=obj.userData.control==='extension'?'body':obj.userData.standard,axis=this.actions.axis()
      this.drag={side,axis,value:side==='body'?this.rig.extension:this.rig[side][axis],x:e.clientX,y:e.clientY,id:e.pointerId}
      this.controls.enabled=false;e.stopImmediatePropagation();canvas.setPointerCapture(e.pointerId);this.actions.select(side)
    })
    on('pointermove',e=>{
      if(!this.drag||this.drag.id!==e.pointerId)return
      const d=this.drag,vertical=d.axis==='tilt'||d.axis==='rise'
      if(d.side==='body'){this.actions.focus(d.value+(e.clientX-d.x)*.22);return}
      this.actions.move(d.side,d.axis,d.value+(vertical?d.y-e.clientY:e.clientX-d.x)*(d.axis==='tilt'||d.axis==='swing'?.12:.32))
    })
    const stop=()=>{if(this.drag){this.drag=null;this.controls.enabled=true}}
    on('pointerup',stop);on('pointercancel',stop);on('lostpointercapture',stop)
    const render=()=>{
      if(this.dirty&&this.observerVisible){
        this.contour.show(this.layers.planes)
        try{this.gl.render(this.scene,this.camera)}finally{this.contour.show(false)}
        this.updateTags();this.dirty=false
      }
      if(this.filmVisible&&this.film.pending)this.film.render(this.photoScene)
      this.animation=requestAnimationFrame(render)
    }
    render()
  }
  private configureEnvironment(){
    const {id,groundY=-1550}=this.subject.spec
    this.lightObserver(id);this.lightFilm(id)
    this.floor.fit(this.subject.spec)
    this.floor.visible=this.layers.grid
    this.cameraModel.setGround(groundY)
    this.scene.fog=new T.FogExp2(this.subject.spec.background,id==='architecture'?.000008:.00011)
    const flags=new URLSearchParams(location.search), raw=flags.get('raw')==='1'
    this.film.renderer.toneMapping=raw ? T.NoToneMapping : T.AgXToneMapping
    this.film.setAppearance(raw ? neutralStock : filmStocks[id],!raw && flags.get('grain')!=='0')
    this.scene.environment=null
    this.photoScene.environment=null
    this.subjectRadiance.forEach(target=>target.dispose());this.subjectRadiance=[]
    this.photoScene.environmentIntensity=id==='greenhouse'?.70:id==='still-life'?.82:.72
    this.scene.environmentIntensity=this.photoScene.environmentIntensity
    this.film.renderer.toneMappingExposure=id==='greenhouse'?1.3:1.36
  }
  private captureSubjectLight(){
    // Capture one local radiance probe after all scene images have decoded.
    // Windows, foliage, paving and sky become diffuse bounce and reflections
    // at the material roughness. The two WebGL contexts own their maps.
    const excluded:(T.Object3D|T.Material)[]=[this.cameraModel.group,this.floor,this.helpers,this.rays,this.depthGuide]
    // A local probe describes light incident on the glass. Exclude the glass
    // itself from that capture, which also avoids a transmission buffer for
    // the disposable cube camera. The two scene copies share their materials.
    this.subject.group.traverse(object=>{
      if(object instanceof T.Mesh && object.material instanceof T.MeshPhysicalMaterial && object.material.transmission>0)
        excluded.push(object.material)
    })
    const visible=excluded.map(item=>item.visible)
    // 128 retains the roughness mip chain at both desktop and mobile sizes.
    const size=128
    const street=this.subject.spec.id==='architecture',indoor=this.subject.spec.id==='still-life'
    const position=street?new T.Vector3(-800,3100,-12300):indoor?new T.Vector3(30,115,-780):new T.Vector3(-55,120,-842)
    try {
      excluded.forEach(item=>{item.visible=false})
      for(const [renderer,scene] of [[this.film.renderer,this.photoScene],[this.gl,this.scene]] as const){
        scene.environment=null
        renderer.shadowMap.needsUpdate=true
        const pmrem=new T.PMREMGenerator(renderer)
        try {
          const env=pmrem.fromScene(scene,0,street?80:6,street?550000:65000,{size,position})
          this.subjectRadiance.push(env);scene.environment=env.texture
        }finally{pmrem.dispose()}
      }
      this.lightObserver(this.subject.spec.id,true);this.lightFilm(this.subject.spec.id,true)
    }finally{
      excluded.forEach((item,i)=>{item.visible=visible[i]})
    }
  }
  private updateTags(){
    const {film}=frames(this.rig)
    const tag=(name:string,p:T.Vector3,show:boolean)=>{
      const el=this.tags.querySelector<HTMLElement>('[data-tag="'+name+'"]');if(!el)return
      p.project(this.camera)
      el.hidden=!show||p.z>1||p.z< -1||Math.abs(p.x)>.95||p.y>.96||p.y<-.90
      el.style.left=(p.x*.5+.5)*100+'%';el.style.top=(-p.y*.5+.5)*100+'%'
    }
    tag('camera',vec(film.o).addScaledVector(vec(film.y),95),true)
    tag('focus',this.focusAnchor?.clone()??new T.Vector3(),this.layers.planes&&!!this.focusAnchor)
  }
  private adaptFieldOfView(){
    const fov={perspective:36,detail:33,side:28,top:29}[this.view]
    const scale=Math.max(1,(this.view==='detail'?1.35:1.86)/this.camera.aspect)
    this.camera.fov=2*Math.atan(Math.tan(T.MathUtils.degToRad(fov/2))*scale)*180/Math.PI
  }
  private updateRayDepth(){
    const diagram=this.view==='side'||this.view==='top'
    for(const ray of this.rays.children){
      if(ray instanceof T.LineSegments||ray instanceof T.Points)ray.material.depthTest=!diagram
    }
  }
  setView(view:View){
    this.constructionOutline.visible=view==='side'||view==='top'
    this.view=view;this.updateRayDepth();const c=this.camera
    this.updateDepthGuide()
    if(view==='perspective'){
      const pose=this.subject.spec.observer
      c.position.set(...pose.position);this.controls.target.set(...pose.target)
    }else if(view==='detail'){
      c.position.set(350,155,-275);this.controls.target.set(0,-16,85)
    }else if(view==='side'){
      const z=this.subject.spec.bounds.min[2]*.4
      c.position.set(-z*3.6,80,z);this.controls.target.set(0,-56,z)
    }else{
      const z=this.subject.spec.bounds.min[2]*.4
      c.position.set(0,-z*3.6,z);this.controls.target.set(0,-80,z-1)
    }
    this.controls.enableRotate=true;this.adaptFieldOfView();c.updateProjectionMatrix();this.controls.update();this.dirty=true
  }
  zoom(scale:number){
    this.camera.position.sub(this.controls.target).multiplyScalar(scale).clampLength(this.controls.minDistance,this.controls.maxDistance).add(this.controls.target);this.controls.update();this.dirty=true
  }
  home(){this.setView(this.view)}
  setScene(id:SceneId,startingRig=this.rig){
    if(this.subject.spec.id===id)return
    const next=createScenePreset(id)
    this.scene.remove(this.subject.group);this.photoScene.remove(this.photoSubject)
    disposeObjects(this.subject.group)
    this.subject=next;this.photoSubject=next.group.clone(true)
    this.contour.attach(next.group,this.gl)
    this.surfaces=new ProbeSurfaces(this.photoSubject)
    this.scene.add(next.group);this.photoScene.add(this.photoSubject)
    this.photoScene.background=new T.Color(next.spec.background)
    this.configureEnvironment()
    this.film.renderer.shadowMap.needsUpdate=true;this.gl.shadowMap.needsUpdate=true
    this.film.setLoupe(1)
    this.setView(this.view);this.setRig(startingRig)
  }
  setPeaking(enabled:boolean){this.film.setPeaking(enabled)}
  setSharpReference(enabled:boolean){this.film.setSharpReference(enabled)}
  setFocusPin(canvas:HTMLCanvasElement|null,center?:FilmPoint,zoom?:LoupeZoom){this.film.setFocusPin(canvas,center,zoom)}
  setLoupe(zoom:LoupeZoom,center?:FilmPoint){this.film.setLoupe(zoom,center)}
  probeOccluded(key:string,lensOrigin:V,point:V){return this.surfaces.occluded(key,lensOrigin,point)}
  pickFilm(p:FilmPoint):V|null{
    const {lens,film}=frames(this.rig)
    const ray=objectRay(lens,film,this.rig.focal,p.x,p.y,0,0)
    return this.surfaces.pick(ray.origin,ray.direction)
  }
  setLayers(layers:Layers){
    const depthChanged=!!this.layers.depth!==!!layers.depth
    this.layers=layers;this.helpers.visible=layers.planes;this.rays.visible=layers.rays
    if(depthChanged)this.updateDepthGuide()
    this.floor.visible=layers.grid
    this.dirty=true
  }
  setRig(r:Rig){
    this.rig=r
    this.cameraModel.update(mat(localFrame(r.front,0)),mat(localFrame(r.rear,r.extension)),r.height>r.width)
    this.cameraModel.bodyAssembly.rotation.set(r.pitch*Math.PI/180,r.yaw*Math.PI/180,0,'YXZ')
    this.cameraModel.bodyAssembly.position.set(...sub(tripodPivot,rotate(tripodPivot,r.pitch,r.yaw)))
    const {lens,film}=frames(r)
    clearGroup(this.planeFaces);clearGroup(this.rays)
    const corners=[[-1,-1],[1,-1],[1,1],[-1,1]]
    for(const [frame,w,h,color] of [[lens,176,172,0xc98c4e],[film,r.width,r.height,0x4d8081]] as const){
      const points=corners.map(([x,y])=>vec(frame.o).addScaledVector(vec(frame.x),x*w/2).addScaledVector(vec(frame.y),y*h/2))
      this.planeFaces.add(polygon(points,color,.048))
    }
    const slice=focusSlice(lens,film,r,this.subject.spec.bounds)
    const patch=slice.vertices.map(vec)
    const bounds=this.subject.spec.bounds
    this.contour.update(lens,film,r,bounds,slice.vertices.length>=3)
    this.updateDepthGuide()
    this.constructionOutline.setSlice(slice.vertices,Math.max(...sub(bounds.max,bounds.min)))
    this.focusAnchor=null
    if(patch.length){
      this.planeFaces.add(polygon(patch,0x297a59,.14))
      this.focusAnchor=slice.axisPoint?vec(slice.axisPoint):patch.reduce((sum,p)=>sum.add(p),new T.Vector3()).divideScalar(patch.length)
    }
    const label=this.tags.querySelector<HTMLElement>('[data-tag="focus"]')
    if(label){
      label.textContent=slice.axisPoint?'轴上合焦点':'焦平面'
      label.classList.toggle('axis-focus',!!slice.axisPoint)
      label.title=slice.axisPoint?'镜头光轴与物方焦平面的交点':'片幅内的物方焦平面'
    }
    const rayVertices:T.Vector3[]=[],focusPoints:T.Vector3[]=[]
    for(const bundle of focusGuideBundles(lens,film,r,this.subject.spec.bounds,slice.vertices)){
      for(const ray of bundle.paths)rayVertices.push(vec(bundle.sensor),vec(ray.pupil),vec(ray.pupil),vec(ray.end))
      if(bundle.focus&&!bundle.center)focusPoints.push(vec(bundle.focus))
    }
    if(rayVertices.length){
      const material=new T.LineBasicMaterial({color:0xee9139,fog:false,toneMapped:false,
        transparent:true,opacity:.92,depthTest:false,depthWrite:false})
      const lines=new T.LineSegments(new T.BufferGeometry().setFromPoints(rayVertices),material)
      lines.renderOrder=10;this.rays.add(lines)
    }
    if(focusPoints.length){
      const markers=new T.Points(new T.BufferGeometry().setFromPoints(focusPoints),new T.ShaderMaterial({
        uniforms:{pixelRatio:{value:this.gl.getPixelRatio()}},depthTest:false,depthWrite:false,transparent:true,
        vertexShader:'uniform float pixelRatio; void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=7.*pixelRatio;}',
        fragmentShader:`void main(){
          float r=length(gl_PointCoord-.5);
          vec3 color=mix(vec3(1.,.78,.33),vec3(.32,.16,.06),smoothstep(.26,.36,r));
          gl_FragColor=vec4(color,1.-smoothstep(.40,.50,r));
        }`
      }))
      markers.renderOrder=11;this.rays.add(markers)
    }
    this.updateRayDepth()
    this.cameraModel.setLens(r.focal)
    this.film.setState(r,lensPresets.find(lens=>lens.focal===r.focal)?.apertures[0]??Infinity)
    if(this.filmCanvas.clientWidth)this.film.resize(this.filmCanvas.clientWidth)
    this.gl.shadowMap.needsUpdate=true;this.dirty=true
  }
  private updateDepthGuide(){
    const view=this.view
    this.depthGuide.visible=!!this.layers.depth&&(view==='side'||view==='top')
    if(!this.depthGuide.visible||(view!=='side'&&view!=='top'))return
    const {lens,film}=frames(this.rig)
    this.depthGuide.update(lens,film,this.rig,this.subject.spec.bounds,view)
  }
  capture(){return this.film.captureFullFrame(this.photoScene)}
  capturePrint(signal?:AbortSignal){return this.film.capturePrint(this.photoScene,signal)}
  dispose(){
    cancelAnimationFrame(this.animation);this.observer.disconnect();this.controls.dispose();this.clean.forEach(f=>f())
    disposeObjects(this.scene)
    this.subjectRadiance.forEach(target=>target.dispose())
    this.environmentMap.dispose();this.film.dispose();this.gl.dispose()
  }
}
function disposeObjects(group:T.Object3D){
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>()
  group.traverse(o=>{
    if(!(o instanceof T.Mesh||o instanceof T.Line||o instanceof T.Points))return
    geometries.add(o.geometry)
    for(const m of Array.isArray(o.material)?o.material:[o.material]){
      materials.add(m)
      for(const value of Object.values(m))if(value instanceof T.Texture)textures.add(value)
    }
  })
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose())
}
