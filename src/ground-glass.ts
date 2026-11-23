import * as T from 'three'
import {filmPoint, frames, objectRay, sub, type Rig, type V} from './optics.ts'
import {circleCriterion, filmWindow, type FilmPoint, type FilmWindow, type LoupeZoom} from './focus-feedback.ts'
import {neutralStock, type FilmStock} from './film-stock.ts'

const vec = (v: V) => new T.Vector3(...v)
const vertex = 'varying vec2 pos; void main(){pos=uv;gl_Position=vec4(position.xy,0.,1.);}'

/** A ray family through one pupil point is projective, including tilted film.
 * Three reciprocal rays span its off-axis projection onto the measured film window. */
export function pupilCamera(r: Rig, a: number, b: number, w: FilmWindow = filmWindow(r, 1), camera = new T.PerspectiveCamera()) {
  const {lens, film} = frames(r)
  const ray = (x: number, y: number) => objectRay(lens, film, r.focal, x, y, a, b)
  const c = ray(w.x, w.y), h = ray(w.x - w.width / 2, w.y), v = ray(w.x, w.y - w.height / 2)
  const inverse = new T.Matrix4().makeBasis(
    vec(sub(h.direction, c.direction)), vec(sub(v.direction, c.direction)), vec(c.direction).negate()
  ).invert()
  // The reciprocal ray basis is not normalized. Express clipping distances
  // in world millimetres so a telephoto/shift/loupe changes no scene limits.
  const rayScale = vec(c.direction).length()
  const near = 50 / rayScale, far = 20_000_000 / rayScale
  camera.near = near
  camera.far = far
  camera.position.copy(vec(c.origin))
  camera.projectionMatrix.makePerspective(-near, near, near, -near, near, far).multiply(inverse)
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
  camera.updateMatrixWorld()
  return camera
}

/** Progressive equal-area samples. Each prefix explores the whole pupil;
 * no radial rings remain in highlights or high-contrast out-of-focus edges. */
export function pupilSample(i: number, blades = 0) {
  if (i === 0) return {x: 0, y: 0}
  const sx = 2 * ((.5 + i * .7548776662466927) % 1) - 1
  const sy = 2 * ((.5 + i * .5698402909980532) % 1) - 1
  if (blades >= 3) {
    // Partition the iris into equal-area triangles. The sqrt gives uniform
    // area within each triangle. Equal area with the circular pupil preserves
    // the effective f-number, including when the iris is stopped down.
    const u = (sx + 1) * .5 * blades
    const sector = 2 * Math.PI / blades
    const a = .22 + Math.floor(u) * sector, t = u % 1
    const scale = Math.sqrt((1+sy)*.5 * sector / Math.sin(sector))
    return {x:scale*((1-t)*Math.cos(a)+t*Math.cos(a+sector)),
      y:scale*((1-t)*Math.sin(a)+t*Math.sin(a+sector))}
  }
  const horizontal = Math.abs(sx) > Math.abs(sy)
  const r = horizontal ? sx : sy
  const theta = horizontal ? Math.PI / 4 * sy / sx : Math.PI / 2 - Math.PI / 4 * sx / sy
  return {x: r * Math.cos(theta), y: r * Math.sin(theta)}
}

function pixelPhase(i: number, base: number) {
  let fraction = 0, place = 1 / base
  while (i) {
    fraction += (i % base) * place
    i = Math.floor(i / base)
    place /= base
  }
  return fraction - .5
}

// While dragging, estimate the local blur ellipse from the actual lens cone.
// This preview only fills the interval before the aperture integral converges;
// its contribution becomes precisely zero in the finished image.
const previewFragment = `
  varying vec2 pos;
  uniform sampler2D source, depthMap;
  uniform mat4 unproject;
  uniform vec3 lensNormal, pupilX, pupilY, filmNormal, filmX, filmY;
  uniform vec2 size, texel;
  uniform float f, gap, criterion;
  vec2 filmComponents(vec3 v) {
    return vec2(dot(v,filmX),dot(v,filmY));
  }
  float contrastLightness(vec3 color) {
    if(any(isnan(color)) || any(isinf(color))) return 0.;
    float y = dot(color,vec3(.2126,.7152,.0722));
    return y/(.25+y);
  }
  float edgeAt(vec2 neighbor, float centerLuma, float inverseDistance) {
    float z = texture2D(depthMap,neighbor).r;
    if(z>=1.) return 0.;
    float neighborInverse = (unproject*vec4(neighbor*2.-1.,z*2.-1.,1.)).w;
    float jump = abs(neighborInverse-inverseDistance)/max(max(neighborInverse,inverseDistance),1e-8);
    // Ignore a contrast step across unrelated depths. An unfocused background
    // beside a flat foreground surface must not paint a false sharp rim.
    // Paint the dark side of a resolved edge only; marking both sides can
    // flood fine architectural detail on a small ground glass.
    return max(contrastLightness(texture2D(source,neighbor).rgb)-centerLuma,0.)*(1.-smoothstep(.03,.12,jump));
  }
  void main() {
    float depth = texture2D(depthMap,pos).r;
    vec4 eye = unproject*vec4(pos*2.-1.,depth*2.-1.,1.);
    // Use homogeneous eye-relative coordinates. Empty sky has zero vergence,
    // including when the clear depth unprojects to the far clipping plane.
    if(depth>=1.) eye.w=0.;
    vec3 ray = -f*eye.xyz;
    float filmDenominator = max(dot(ray,filmNormal),1e-6);
    float vergenceTerm = (-dot(eye.xyz,lensNormal)-f*eye.w)/filmDenominator;
    vec2 filmTilt = vec2(dot(pupilX,filmNormal),dot(pupilY,filmNormal));
    vec2 tiltTerm = vergenceTerm*filmTilt;
    // For any unit-rim direction v, the exact span between opposite pupil
    // intersections is 2*(basis*v)/(1-dot(tiltTerm,v)^2) on oblique film.
    mat2 basis = (1.-vergenceTerm*gap)*mat2(
      filmComponents(pupilX-ray*filmTilt.x/filmDenominator),
      filmComponents(pupilY-ray*filmTilt.y/filmDenominator));
    vec2 dx = basis[0]/(max(1.-tiltTerm.x*tiltTerm.x,.001)*size);
    vec2 dy = basis[1]/(max(1.-tiltTerm.y*tiltTerm.y,.001)*size);
    vec3 sum = vec3(0.);
    float validTaps = 0.;
    for(int k=0;k<24;k++) {
      float angle = float(k)*2.39996323;
      float radius = sqrt((float(k)+.5)/24.);
      vec3 tap = texture2D(source,clamp(pos+radius*(cos(angle)*dx+sin(angle)*dy),0.,1.)).rgb;
      if(!any(isnan(tap)) && !any(isinf(tap))) {sum+=tap;validTaps+=1.;}
    }
    float mask = 0.;
    if(depth<1. && 2.*max(length(basis[0]),length(basis[1]))<criterion) {
      float diameter = 0.;
      for(int i=0;i<12;i++) {
        float angle = float(i)*.2617993877991494;
        vec2 rim = vec2(cos(angle),sin(angle));
        float tilt = dot(tiltTerm,rim);
        diameter = max(diameter,2.*length(basis*rim)/max(1.-tilt*tilt,.001));
      }
      float centerLuma = contrastLightness(texture2D(source,pos).rgb);
      float gradient = max(max(edgeAt(pos+vec2(texel.x,0.),centerLuma,eye.w),
                               edgeAt(pos-vec2(texel.x,0.),centerLuma,eye.w)),
                           max(edgeAt(pos+vec2(0.,texel.y),centerLuma,eye.w),
                               edgeAt(pos-vec2(0.,texel.y),centerLuma,eye.w)));
      mask = smoothstep(.09,.24,gradient)*(1.-smoothstep(criterion*.70,criterion,diameter));
    }
    // RGB stores the interactive blur preview. Alpha stores the independently
    // computed sharp detail of this exact film window for the viewing overlay.
    gl_FragColor = vec4(sum/max(validTaps,1.),mask);
  }`

const displayFragment = `
  varying vec2 pos;
  uniform sampler2D source, preview;
  uniform float preliminary, cone, peaking, focalSquared;
  uniform vec2 sourceScale, sourceOffset;
  uniform vec3 center, axisX, axisY, n, filmNormal;
  uniform vec4 filmRect;
  uniform float textured, contrast, saturation, temperature;
  uniform vec3 shadows, highlights;
  const vec3 filmLuma = vec3(.2126,.7152,.0722);
  float hash(vec2 p) {
    vec3 q=fract(vec3(p.xyx)*.1031);
    q+=dot(q,q.yzx+33.33);
    return fract((q.x+q.y)*q.z);
  }
  float grainAt(vec2 p) {
    vec2 cell=floor(p), t=fract(p);
    t=t*t*(3.-2.*t);
    return mix(mix(hash(cell),hash(cell+vec2(1.,0.)),t.x),
               mix(hash(cell+vec2(0.,1.)),hash(cell+1.),t.x),t.y)-.5;
  }
  vec3 radiance(vec2 at) {
    vec4 sum=texture2D(source,at);
    vec3 c=sum.rgb/max(sum.a,1e-7);
    if(preliminary>0.) c=mix(c,texture2D(preview,at).rgb,preliminary);
    return c;
  }
  void main(){
    vec3 r = center + (.5-pos.x)*axisX + (.5-pos.y)*axisY;
    float z = dot(n,r);
    float radius = length(r-z*n)/max(z,.001)/cone;
    vec2 sampleAt = (.5+sourceOffset)+(pos-.5)*sourceScale;
    vec3 color = radiance(sampleAt);
    float coverage = 1.-smoothstep(.995,1.005,radius);
    vec2 filmMM=filmRect.xy+(.5-pos)*filmRect.zw;
    float footprint=max(fwidth(filmMM.x),fwidth(filmMM.y));
    if(textured>0.) {
      vec3 unscattered=color;
      vec2 mmUV=sourceScale/filmRect.zw;
      vec2 p=vec2(.49,.21)*mmUV, q=vec2(-.21,.49)*mmUV;
      vec3 halo=.25*(radiance(sampleAt+p)+radiance(sampleAt-p)+radiance(sampleAt+q)+radiance(sampleAt-q));
      color+=.11*max(halo-color,vec3(0.))*smoothstep(.35,1.65,dot(halo,filmLuma));
      if(radius>.78) {
        vec3 offAxis=r-z*n;
        vec2 radial=vec2(dot(offAxis,axisX)/filmRect.z,dot(offAxis,axisY)/filmRect.w);
        radial/=max(length(radial),.001);
        vec2 split=.052*mmUV*radial*smoothstep(.78,1.,radius);
        color.r+=radiance(sampleAt+split).r-unscattered.r;
        color.b+=radiance(sampleAt-split).b-unscattered.b;
      }
      coverage=(1.-.28*smoothstep(.88,1.015,radius))*(1.-smoothstep(.985,1.015,radius));
    }
    // Pupil solid angle times the cosine of incidence on the actual film.
    // The reference is fixed at the infinity-conjugate axis for this lens.
    float distanceSquared = dot(r,r);
    float illumination = focalSquared*max(z,0.)*max(dot(r,filmNormal),0.)/(distanceSquared*distanceSquared);
    color=(color*illumination+vec3(textured*.0015))*coverage;
    gl_FragColor=vec4(color*vec3(1.+temperature*.15,1.,1.-temperature*.15),1.);
    #include <tonemapping_fragment>
    float y=dot(gl_FragColor.rgb,filmLuma);
    gl_FragColor.rgb=max(mix(vec3(y),gl_FragColor.rgb,saturation),vec3(0.));
    gl_FragColor.rgb=.18*pow(gl_FragColor.rgb/.18,vec3(contrast));
    gl_FragColor.rgb*=mix(shadows,highlights,smoothstep(.025,.65,y));
    #include <colorspace_fragment>
    if(textured>0.) {
      float coarse=grainAt(filmMM/.14)*(1.-smoothstep(.10,.30,footprint));
      float fine=grainAt(filmMM/.035+17.)*(1.-smoothstep(.03,.09,footprint));
      gl_FragColor.rgb*=1.+(.057*coarse+.023*fine)*smoothstep(.008,.15,y);
    }
    if(peaking>0.) gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(1.,.29,.19),texture2D(preview,sampleAt).a*.84*coverage);
  }`

type Exposure = {average: T.WebGLRenderTarget; preview: T.WebGLRenderTarget; count: number}
type FocusPin = {canvas:HTMLCanvasElement; ctx:CanvasRenderingContext2D; center:FilmPoint; zoom:LoupeZoom;
  sample:T.WebGLRenderTarget; exposure:Exposure; dirty:boolean}
// Symmetric 2×2 quadrature of the sensor pixel for the zero-pupil reference.
const referenceOffsets = [[-.25,-.25],[.25,.25],[-.25,.25],[.25,-.25]] as const

export class GroundGlass {
  readonly renderer: T.WebGLRenderer
  /** Full, upright film read back only when the shutter is released. */
  readonly fullCanvas = document.createElement('canvas')
  private readonly fullContext: CanvasRenderingContext2D
  private readonly sample: T.WebGLRenderTarget
  private readonly full: Exposure
  private readonly crop: Exposure
  private readonly reference: Exposure
  private sharpReference = false
  private readonly quadScene = new T.Scene()
  private readonly screenCamera = new T.Camera()
  // Three's transmission pass retains a render target per camera identity.
  // Reproject this camera for each pupil sample so refractive glass uses one.
  private readonly opticalCamera = new T.PerspectiveCamera()
  private readonly blend: T.ShaderMaterial
  private readonly estimate: T.ShaderMaterial
  private readonly display: T.ShaderMaterial
  private readonly quad: T.Mesh
  private zoom: LoupeZoom = 1
  private center: FilmPoint = {x: 0, y: 0}
  private state: Rig
  private generation = 0
  private printNumber = 0
  private closed = false
  private tick = 0
  private cssWidth = 0
  private peaking = false
  private lastPan = -Infinity
  private panDisplayed = false
  private readonly floating: boolean
  private textured = false
  private blades = 0
  private wideOpen = Infinity
  private pin: FocusPin | null = null
  private pinTick = 0
  private previousFrame = -Infinity
  private batchLimit = 2
  private readonly maxBatch = matchMedia('(pointer:coarse)').matches ? 4 : 8

  constructor(canvas: HTMLCanvasElement, initial: Rig) {
    this.state = initial
    this.fullContext = this.fullCanvas.getContext('2d', {alpha: false})!
    this.renderer = new T.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true, alpha: false})
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = T.PCFShadowMap
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.shadowMap.needsUpdate = true
    this.renderer.toneMapping = T.AgXToneMapping
    this.floating = this.renderer.extensions.has('EXT_color_buffer_float')
    const type = this.floating ? T.HalfFloatType : T.UnsignedByteType
    const exposure = (): Exposure => ({
      average: new T.WebGLRenderTarget(1, 1, {type, depthBuffer: false}),
      preview: new T.WebGLRenderTarget(1, 1, {type, depthBuffer: false}), count: 0
    })
    this.full = exposure()
    this.crop = exposure()
    // A sharp reference has no blur estimate. One lazy target suffices, and
    // the completed finite-aperture exposure remains available for an A/B.
    const referenceTarget = new T.WebGLRenderTarget(1, 1, {type, depthBuffer:false})
    this.reference = {average:referenceTarget,preview:referenceTarget,count:0}
    this.sample = new T.WebGLRenderTarget(1, 1, {type, depthTexture: new T.DepthTexture(1, 1)})
    // Integrate radiance and its valid pupil coverage with the same weights.
    // A singular PBR sample must not poison a whole exposure or darken it.
    this.blend = new T.ShaderMaterial({
      vertexShader: vertex, fragmentShader: `
        uniform sampler2D source;
        void main(){
          vec3 light=texelFetch(source,ivec2(gl_FragCoord.xy),0).rgb;
          gl_FragColor=any(isnan(light)) || any(isinf(light)) ? vec4(0.) : vec4(light,1.);
        }`,
      uniforms: {source: {value: this.sample.texture}},
      blending:T.CustomBlending,blendSrc:T.ConstantAlphaFactor,blendDst:T.OneMinusConstantAlphaFactor,
      transparent: true, depthTest: false, depthWrite: false
    })
    this.estimate = new T.ShaderMaterial({
      vertexShader: vertex, fragmentShader: previewFragment,
      uniforms: {
        source: {value: this.sample.texture}, depthMap: {value: this.sample.depthTexture},
        unproject: {value: new T.Matrix4()}, lensNormal: {value: new T.Vector3()},
        pupilX: {value: new T.Vector3()}, pupilY: {value: new T.Vector3()},
        filmNormal: {value: new T.Vector3()}, filmX: {value: new T.Vector3()}, filmY: {value: new T.Vector3()},
        size: {value: new T.Vector2()}, texel: {value: new T.Vector2()}, criterion: {value: circleCriterion},
        gap: {value: 1}, f: {value: 150}
      }, depthTest: false, depthWrite: false
    })
    this.display = new T.ShaderMaterial({
      vertexShader: vertex, fragmentShader: displayFragment,
      uniforms: {
        source: {value: this.full.average.texture}, preview: {value: this.full.preview.texture},
        preliminary: {value: 1}, peaking: {value: 0},
        filmRect:{value:new T.Vector4()}, textured:{value:0}, temperature:{value:0},
        contrast:{value:1}, saturation:{value:1}, shadows:{value:new T.Vector3(1,1,1)}, highlights:{value:new T.Vector3(1,1,1)},
        sourceScale: {value: new T.Vector2(1,1)}, sourceOffset: {value: new T.Vector2()},
        center: {value: new T.Vector3()}, axisX: {value: new T.Vector3()},
        axisY: {value: new T.Vector3()}, n: {value: new T.Vector3()}, filmNormal: {value: new T.Vector3()},
        cone: {value: 1}, focalSquared: {value: initial.focal**2}
      }, depthTest: false, depthWrite: false
    })
    this.quad = new T.Mesh(new T.PlaneGeometry(2, 2), this.display)
    this.quad.frustumCulled = false
    this.quadScene.add(this.quad)
    this.setState(initial)
  }

  setAppearance(stock:FilmStock = neutralStock, textured = false) {
    this.textured = textured
    const u=this.display.uniforms
    u.temperature.value=stock.temperature
    u.contrast.value=stock.contrast
    u.saturation.value=stock.saturation
    u.shadows.value.set(...stock.shadows)
    u.highlights.value.set(...stock.highlights)
    if(this.pin) this.pin.dirty=true
    this.panDisplayed=false
    this.renderer.domElement.dataset.converged='false'
  }

  setState(r: Rig, wideOpen = this.wideOpen) {
    const aspectChanged = this.state.width !== r.width || this.state.height !== r.height
    this.state = r
    this.wideOpen = wideOpen
    this.blades = r.aperture > wideOpen ? 7 : 0
    this.generation++
    this.full.count = this.crop.count = this.reference.count = 0
    if(this.pin) this.pin.exposure.count=0
    this.lastPan = -Infinity
    this.renderer.domElement.dataset.converged = 'false'
    if (aspectChanged) {
      const crop = filmWindow(r, this.zoom, this.center)
      this.center = {x: crop.x, y: crop.y}
      if (this.cssWidth) this.resize(this.cssWidth)
    }
  }

  setLoupe(zoom: LoupeZoom, center: FilmPoint = {x: 0, y: 0}) {
    const w = filmWindow(this.state, zoom, center)
    if (this.zoom === zoom && this.center.x === w.x && this.center.y === w.y) return
    this.lastPan = this.zoom === zoom && zoom > 1 ? performance.now() : -Infinity
    this.panDisplayed = false
    this.zoom = zoom
    this.center = {x: w.x, y: w.y}
    this.crop.count = this.reference.count = 0
    // A completed full exposure may only need redisplaying on leaving a loupe.
    this.renderer.domElement.dataset.converged = 'false'
  }

  setPeaking(enabled: boolean) {
    if (this.peaking === enabled) return
    this.peaking = enabled
    if(this.pin) this.pin.dirty=true
    this.panDisplayed = false
    this.renderer.domElement.dataset.converged = 'false'
  }

  setSharpReference(enabled: boolean) {
    if (this.sharpReference === enabled) return
    this.sharpReference = enabled
    this.panDisplayed = false
    this.renderer.domElement.dataset.converged = 'false'
  }

  setFocusPin(canvas:HTMLCanvasElement|null, center:FilmPoint=this.center, zoom:LoupeZoom=this.zoom) {
    const old=this.pin
    if(old && old.canvas===canvas && old.center.x===center.x && old.center.y===center.y && old.zoom===zoom) return
    if(old) {
      old.sample.dispose()
      old.exposure.average.dispose()
      old.exposure.preview.dispose()
      this.pin=null
    }
    if(!canvas) return
    const ctx=canvas.getContext('2d',{alpha:false})
    if(!ctx) return
    // The secondary field is a square cut from the same magnification as B.
    // Its own depth and pupil integrals keep it live even while B is panned.
    const edge=192, type=this.floating ? T.HalfFloatType : T.UnsignedByteType
    const target=()=>new T.WebGLRenderTarget(edge,edge,{type,depthBuffer:false})
    const sample=new T.WebGLRenderTarget(edge,edge,{type,depthTexture:new T.DepthTexture(edge,edge)})
    canvas.width=canvas.height=edge
    this.pin={canvas,ctx,center:{...center},zoom,sample,exposure:{average:target(),preview:target(),count:0},dirty:true}
  }

  resize(w: number) {
    this.cssWidth = w
    // Match the display density up to the render budget. Large desktop screens
    // can resolve the lens' actual crop without allocating large mobile buffers.
    const compact = matchMedia('(pointer:coarse), (max-width:900px)').matches
    const longest = compact ? 1440 : 2048
    const filmAspect = this.state.width / this.state.height
    const maxWidth = Math.min(longest, longest * filmAspect, Math.sqrt((compact ? 1_450_000 : 2_300_000) * filmAspect))
    const width = Math.max(12, Math.min(Math.floor(maxWidth), Math.round(w * Math.min(devicePixelRatio, 2))))
    const height = Math.round(width * this.state.height / this.state.width)
    if (this.sample.width === width && this.sample.height === height) return
    this.renderer.setSize(width, height, false)
    for (const exposure of [this.full, this.crop]) {
      exposure.average.setSize(width, height)
      exposure.preview.setSize(width, height)
      exposure.count = 0
    }
    this.sample.setSize(width, height)
    this.reference.average.setSize(width, height)
    this.reference.count = 0
    const pixelRatio = Math.min(devicePixelRatio, 2)
    this.estimate.uniforms.texel.value.set(pixelRatio / width, pixelRatio / height)
    this.lastPan = -Infinity
    this.fullCanvas.width = width
    this.fullCanvas.height = height
    this.renderer.domElement.dataset.converged = 'false'
    this.generation++
  }

  private goal(zoom: LoupeZoom, sensorWidth=this.sample.width) {
    // The low-dynamic-range fallback stops before small blend weights quantize away.
    if (!this.floating) return 48
    const w = filmWindow(this.state, zoom, this.center)
    const radius = this.state.focal / (2 * this.state.aperture)
    const farDiameter = 2 * radius * Math.abs(1 - this.state.extension / this.state.focal)
    const diameterPx = farDiameter * sensorWidth / w.width
    // A near subject may still be far outside depth of field at infinity focus.
    // Give a loupe its own density floor even when the far conjugate is sharp.
    return Math.min(192, Math.ceil(Math.max(64 * Math.sqrt(zoom), diameterPx * 2)))
  }

  get pending() {
    return !this.closed && (this.renderer.domElement.dataset.converged !== 'true' ||
      !!this.pin && (this.pin.exposure.count < 48 || this.pin.dirty))
  }

  private pass(material: T.ShaderMaterial, output: T.WebGLRenderTarget | null, clear = true) {
    this.renderer.setRenderTarget(output)
    this.renderer.autoClear = clear
    this.quad.material = material
    this.renderer.render(this.quadScene, this.screenCamera)
  }

  private accumulate(scene: T.Scene, exposure: Exposure, w: FilmWindow, sample=this.sample) {
    const r = this.state, radius = r.focal / (2 * r.aperture)
    const i = exposure.count, reference = exposure === this.reference
    const aperture = reference ? {x:0,y:0} : pupilSample(i,this.blades)
    // Each pixel integrates a finite patch of film. Subpixel quadrature also
    // antialiases sharply focused slanted edges that converge for all pupils.
    const [dx,dy] = reference ? referenceOffsets[i] : i === 0 ? [0,0] : [pixelPhase(i,2),pixelPhase(i,3)]
    const pixelWindow = {...w, x:w.x + dx*w.width/sample.width, y:w.y + dy*w.height/sample.height}
    const camera = pupilCamera(r, aperture.x * radius, aperture.y * radius, pixelWindow, this.opticalCamera)
    this.renderer.setRenderTarget(sample)
    this.renderer.autoClear = true
    this.renderer.render(scene, camera)
    if (exposure.preview!==exposure.average && exposure.count === 0) {
      const {lens, film} = frames(r), u = this.estimate.uniforms
      u.source.value=sample.texture
      u.depthMap.value=sample.depthTexture
      const dpr=sample===this.sample ? Math.min(devicePixelRatio,2) : 1
      u.texel.value.set(dpr/sample.width,dpr/sample.height)
      u.unproject.value.copy(camera.projectionMatrixInverse)
      u.lensNormal.value.set(...lens.n)
      u.pupilX.value.set(...lens.x).multiplyScalar(radius)
      u.pupilY.value.set(...lens.y).multiplyScalar(radius)
      u.filmNormal.value.set(...film.n)
      u.filmX.value.set(...film.x)
      u.filmY.value.set(...film.y)
      u.size.value.set(w.width, w.height)
      u.gap.value = vec(sub(film.o, lens.o)).dot(u.filmNormal.value)
      u.f.value = r.focal
      this.pass(this.estimate, exposure.preview)
    }
    exposure.count++
    this.blend.uniforms.source.value=sample.texture
    this.blend.blendAlpha = 1 / exposure.count
    this.pass(this.blend, exposure.average, false)
  }

  private show(exposure: Exposure, w: FilmWindow, peaking = false, sourceWindow = w, screen = true) {
    const {lens, film} = frames(this.state), u = this.display.uniforms
    u.source.value = exposure.average.texture
    u.preview.value = exposure.preview.texture
    u.peaking.value = peaking ? 1 : 0
    u.textured.value = this.textured && screen && exposure!==this.reference ? 1 : 0
    u.filmRect.value.set(w.x,w.y,w.width,w.height)
    u.sourceScale.value.set(w.width / sourceWindow.width, w.height / sourceWindow.height)
    u.sourceOffset.value.set((sourceWindow.x - w.x) / sourceWindow.width, (sourceWindow.y - w.y) / sourceWindow.height)
    u.preliminary.value = exposure === this.reference ? 0 : Math.max(0, 1 - (exposure.count - 1) / 16)
    u.center.value.set(...sub(filmPoint(film,w.x,w.y), lens.o))
    u.axisX.value.set(...film.x).multiplyScalar(w.width)
    u.axisY.value.set(...film.y).multiplyScalar(w.height)
    u.n.value.set(...lens.n)
    u.filmNormal.value.set(...film.n)
    u.focalSquared.value = this.state.focal ** 2
    u.cone.value = this.state.circle / (2 * this.state.focal)
    this.pass(this.display, null)
  }

  private renderPin(scene:T.Scene) {
    const pin=this.pin
    if(!pin || (pin.exposure.count >= 48 && !pin.dirty)) return
    const window=filmWindow(this.state,pin.zoom,pin.center)
    const side=Math.min(window.width,window.height)
    const square={...window,width:side,height:side}
    // Interleave A and B. A fresh depth estimate follows every camera change
    // immediately. Older pin samples are never mixed with the new camera.
    if(pin.exposure.count && !pin.dirty && ++this.pinTick%2) return
    if(pin.exposure.count<48) this.accumulate(scene,pin.exposure,square,pin.sample)
    const count=pin.exposure.count
    if(!pin.dirty && count!==1 && count!==4 && count%8!==0) return
    const main=this.renderer.domElement, edge=Math.min(pin.canvas.width,main.width,main.height)
    this.renderer.setViewport(0,0,edge,edge)
    this.show(pin.exposure,square,this.peaking)
    pin.ctx.drawImage(main,0,main.height-edge,edge,edge,0,0,pin.canvas.width,pin.canvas.height)
    pin.canvas.dataset.samples=String(count)
    pin.dirty=false
    this.renderer.setViewport(0,0,main.width,main.height)
    this.panDisplayed=false
  }

  private advance(scene:T.Scene, exposure:Exposure, w:FilmWindow, goal:number, started:number, sample=this.sample) {
    // CPU submission can finish before the GPU. Combine a hard cap and wall
    // budget with recent presentation intervals for backpressure. Never block
    // waiting for the GPU, and return the first interactive preview immediately.
    const steps=exposure.count===0 ? 1 : this.batchLimit
    for(let i=0;i<steps && exposure.count<goal;i++) {
      this.accumulate(scene,exposure,w,sample)
      if(performance.now()-started>=6.5) break
    }
  }

  render(scene: T.Scene) {
    if (!this.pending) return
    const started=performance.now(), elapsed=started-this.previousFrame
    if(elapsed>28) this.batchLimit=Math.max(1,Math.floor(this.batchLimit*.5))
    else if(elapsed<20) this.batchLimit=Math.min(this.maxBatch,this.batchLimit+1)
    this.previousFrame=started
    this.renderPin(scene)
    const whole = filmWindow(this.state, 1)
    const active = this.zoom === 1 ? this.full : this.crop
    const goal = this.goal(this.zoom), w = filmWindow(this.state, this.zoom, this.center)
    const reference = this.sharpReference && this.zoom > 1
    this.renderer.domElement.dataset.sharpReference = String(reference)
    if (reference) {
      if (this.reference.count < referenceOffsets.length) this.accumulate(scene,this.reference,w)
      this.show(this.reference,w)
      this.renderer.domElement.dataset.samples = String(this.reference.count)
      this.renderer.domElement.dataset.converged = String(this.reference.count === referenceOffsets.length)
      return
    }
    // While the loupe is moving reuse the complete physical exposure, including
    // its registered peaking mask, rather than waiting for another scene pass.
    // A stationary loupe always resolves its own off-axis, full-resolution view.
    if (this.full.count && performance.now() - this.lastPan < 75) {
      if (!this.panDisplayed) {
        this.show(this.full, w, this.peaking, whole)
        this.renderer.domElement.dataset.samples = '0'
        this.panDisplayed = true
      }
      return
    }
    // Keep an overview available for responsive loupe drags even when the
    // camera is adjusted under magnification. All previews remain on the GPU.
    if (this.zoom !== 1 && (!this.full.count || (this.full.count < 8 && ++this.tick % 5 === 0))) {
      this.accumulate(scene, this.full, whole)
    }
    this.advance(scene,active,w,goal,started)
    this.show(active, w, this.peaking)
    this.renderer.domElement.dataset.samples = String(active.count)
    this.renderer.domElement.dataset.converged = String(active.count >= goal)
  }

  async captureFullFrame(scene: T.Scene, check?:()=>void) {
    const generation = this.generation, w = filmWindow(this.state, 1), goal = this.goal(1)
    while (this.full.count < goal) {
      check?.()
      if (this.closed || generation !== this.generation) throw new Error('Film or camera settings changed during capture')
      this.advance(scene, this.full, w, goal, performance.now())
      if (this.zoom === 1) this.show(this.full, w, this.peaking)
      if (this.full.count < goal) await new Promise(requestAnimationFrame)
    }
    check?.()
    if (this.closed || generation !== this.generation) throw new Error('Film or camera settings changed during capture')
    this.show(this.full, w, false, w, false)
    try {
      this.fullContext.drawImage(this.renderer.domElement, 0, 0)
      return this.fullCanvas.toDataURL('image/png')
    } finally { this.restoreView() }
  }

  private restoreView() {
    if (this.zoom !== 1) {
      const window = filmWindow(this.state, this.zoom, this.center)
      if (this.sharpReference && this.reference.count) this.show(this.reference, window)
      else if (this.crop.count) this.show(this.crop, window, this.peaking)
      else this.show(this.full, window, this.peaking, filmWindow(this.state,1))
    } else this.show(this.full,filmWindow(this.state,1),this.peaking)
  }

  async capturePrint(scene:T.Scene, signal?:AbortSignal) {
    const generation=this.generation, number=++this.printNumber
    const check=()=>{
      if(signal?.aborted || this.closed || number!==this.printNumber || generation!==this.generation)
        throw new DOMException('Print exposure cancelled','AbortError')
    }
    check()
    if(Math.max(this.sample.width,this.sample.height)>=1200) return this.captureFullFrame(scene,check)
    const w=filmWindow(this.state,1), scale=1200/Math.max(w.width,w.height)
    const width=Math.round(w.width*scale),height=Math.round(w.height*scale)
    const type=this.floating?T.HalfFloatType:T.UnsignedByteType
    const sample=new T.WebGLRenderTarget(width,height,{type,depthTexture:new T.DepthTexture(width,height)})
    const average=new T.WebGLRenderTarget(width,height,{type,depthBuffer:false})
    const exposure={average,preview:average,count:0},goal=this.goal(1,width)
    try {
      // Reproject the whole gate into print pixels. The displayed window, its
      // grain, preview and all of its accumulated samples remain independent.
      while(exposure.count<goal) {
        check()
        this.advance(scene,exposure,w,goal,performance.now(),sample)
        if(exposure.count<goal) await new Promise(requestAnimationFrame)
      }
      check()
      // Use the same default-framebuffer AgX/sRGB conversion as the glass.
      // Only the final quad and PNG readback borrow its drawing buffer. Restore
      // it synchronously before the browser paints the next UI frame.
      const canvas=this.renderer.domElement, oldWidth=canvas.width,oldHeight=canvas.height
      this.renderer.setSize(width,height,false)
      try {
        this.show(exposure,w,false,w,false)
        return canvas.toDataURL('image/png')
      } finally {
        this.renderer.setSize(oldWidth,oldHeight,false)
        this.restoreView()
      }
    } finally {
      if(!this.closed) this.renderer.setRenderTarget(null)
      sample.dispose()
      average.dispose()
    }
  }

  dispose() {
    this.closed = true
    this.setFocusPin(null)
    this.quad.geometry.dispose()
    this.blend.dispose()
    this.estimate.dispose()
    this.display.dispose()
    for (const e of [this.full, this.crop]) {e.average.dispose(); e.preview.dispose()}
    this.reference.average.dispose()
    this.sample.dispose()
    this.renderer.dispose()
  }
}
