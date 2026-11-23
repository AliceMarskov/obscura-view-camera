import {add,cross,dot,filmPoint,length,mul,sub,type Frame,type Rig,type V} from './optics.ts'
import {circleCriterion} from './focus-feedback.ts'
type Bounds={min:V;max:V}
type SpatialLine={point:V;direction:V}

/** The Scheimpflug line is common to lens, film and object planes. The hinge
 * instead lies in the front focal plane and the through-lens plane parallel
 * to the film. Both are infinite lines. J is measured from the lens centre. */
export function opticalLines(lens:Frame,film:Frame,f:number){
  const q=cross(lens.n,film.n),sin=length(q)
  if(sin<1e-10)return null
  const c=dot(lens.n,film.n),d=dot(film.n,sub(film.o,lens.o)),direction=mul(q,1/sin)
  const scheimpflug={point:add(lens.o,mul(sub(film.n,mul(lens.n,c)),d/(sin*sin))),direction}
  const hinge={point:add(lens.o,mul(sub(lens.n,mul(film.n,c)),-f/(sin*sin))),direction}
  return {scheimpflug,hinge,hingeDistance:f/sin}
}

export function clipSpatialLine(line:SpatialLine,b:Bounds):V[]{
  let start=-Infinity,end=Infinity
  for(let i=0;i<3;i++){
    const p=line.point[i],v=line.direction[i]
    if(Math.abs(v)<1e-12){
      if(p<b.min[i]||p>b.max[i])return []
    }else{
      const a=(b.min[i]-p)/v,z=(b.max[i]-p)/v
      start=Math.max(start,Math.min(a,z));end=Math.min(end,Math.max(a,z))
    }
  }
  return start<end?[add(line.point,mul(line.direction,start)),add(line.point,mul(line.direction,end))]:[]
}

/** For chief-ray vector R=(film sample - lens centre), a point P=L-R/w
 * has reciprocal scale w. At focus w0=n·R/f-1. For opposing pupil offsets
 * ±A the exact glass chord is D |h| / [1-a²(1-h)²], where h=w-w0,
 * a=m·A/(m·R), D=2|A-aR|, m=film normal. Solve each chord for c and take
 * the first one to reach it, matching blurDiameter's twelve-pair convention.
 * Nonpositive far w means the accepted range reaches physical infinity. */
function boundarySolver(lens:Frame,film:Frame,r:Rig){
  const gap=dot(film.n,sub(film.o,lens.o)),radius=r.focal/(2*r.aperture)
  const rim=Array.from({length:12},(_,i)=>{
    const angle=i*Math.PI/12
    const offset=add(mul(lens.x,radius*Math.cos(angle)),mul(lens.y,radius*Math.sin(angle)))
    return {offset,a:dot(film.n,offset)/gap}
  })
  return (ray:V,c:number)=>{
    const atFocus=dot(ray,lens.n)/r.focal-1
    let near=Infinity,far=Infinity
    for(const {offset,a} of rim){
      const d=2*length(sub(offset,mul(ray,a))),a2=a*a,b=c*(1-a2)
      for(const sign of [1,-1]){
        const k=d-2*sign*c*a2,v=2*b/(k+Math.sqrt(k*k+4*c*a2*b))
        if(sign===1)near=Math.min(near,v)
        else far=Math.min(far,v)
      }
    }
    return {near:atFocus+near,far:atFocus-far}
  }
}
export function depthAtFilmSample(lens:Frame,film:Frame,r:Rig,x:number,y:number,c=circleCriterion){
  return boundarySolver(lens,film,r)(sub(filmPoint(film,x,y),lens.o),c)
}

type ProjectivePoint={p:V;w:number}
function clippedSegment(a:ProjectivePoint,b:ProjectivePoint,box:Bounds):V[]{
  // Clip before dividing by w. An interval spanning infinity must end at
  // the real side of the box, never connect back from behind the camera.
  let lo=0,hi=1
  const cut=(x:number,y:number)=>{
    if(x<0&&y<0){hi=-1;return}
    if(x<0)lo=Math.max(lo,x/(x-y))
    else if(y<0)hi=Math.min(hi,x/(x-y))
  }
  cut(a.w,b.w)
  for(let i=0;i<3&&lo<=hi;i++){
    cut(a.p[i]-box.min[i]*a.w,b.p[i]-box.min[i]*b.w)
    cut(box.max[i]*a.w-a.p[i],box.max[i]*b.w-b.p[i])
  }
  if(lo>=hi)return []
  const point=(t:number)=>mul(add(a.p,mul(sub(b.p,a.p),t)),1/(a.w+t*(b.w-a.w)))
  return [point(lo),point(hi)]
}

// Intersect a film meridian with the forward circular coverage cone. The
// boundary in the linear film parameter is quadratic, even for tilted backs.
function coveredInterval(start:V,travel:V,lens:Frame,slope:number):[number,number]|null{
  const z=dot(lens.n,start),dz=dot(lens.n,travel),k=1+slope*slope
  const a=dot(travel,travel)-k*dz*dz,b=2*(dot(start,travel)-k*z*dz),c=dot(start,start)-k*z*z
  const cuts=[0,1]
  if(Math.abs(a)>1e-12){
    const disc=b*b-4*a*c
    if(disc>=0)cuts.push((-b-Math.sqrt(disc))/(2*a),(-b+Math.sqrt(disc))/(2*a))
  }else if(b!==0)cuts.push(-c/b)
  if(dz!==0)cuts.push(-z/dz)
  const sorted=cuts.filter(t=>t>=0&&t<=1).sort((x,y)=>x-y)
  for(let i=1;i<sorted.length;i++){
    const l=sorted[i-1],h=sorted[i],t=(l+h)/2
    if(h>l&&z+t*dz>0&&(a*t+b)*t+c<=0)return [l,h]
  }
  return null
}

/** Meridional section through the centre of the film. These are bounded
 * CoC contours; a tilted sensor's worst-case rim chord varies over the field,
 * so two ideal infinite planes would only be an approximation. */
export function depthSection(lens:Frame,film:Frame,r:Rig,box:Bounds,side:'side'|'top'){
  const vertical=side==='side',extent=vertical?r.height:r.width
  const direction=vertical?film.y:film.x,travel=mul(direction,extent)
  const start=sub(sub(film.o,lens.o),mul(travel,.5)),solve=boundarySolver(lens,film,r)
  const limits=coveredInterval(start,travel,lens,r.circle/(2*r.focal))
  const result:{near:V[];far:V[]}={near:[],far:[]}
  if(!limits)return result
  const steps=32
  const sample=(t:number)=>{
    const ray=add(start,mul(travel,t)),w=solve(ray,circleCriterion)
    const point=(w:number)=>({w,p:sub(mul(lens.o,w),ray)})
    return {near:point(w.near),far:point(w.far)}
  }
  let previous=sample(limits[0])
  for(let i=1;i<=steps;i++){
    const next=sample(limits[0]+(limits[1]-limits[0])*i/steps)
    for(const key of ['near','far'] as const)result[key].push(...clippedSegment(previous[key],next[key],box))
    previous=next
  }
  return result
}
