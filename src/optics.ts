export type V = [number, number, number]
export type Movement = { shift: number; rise: number; tilt: number; swing: number }
export type Frame = { o: V; x: V; y: V; n: V }
export type Rig = {
  front: Movement; rear: Movement; extension: number; pitch: number; yaw: number
  focal: number; aperture: number; width: number; height: number; circle: number
}
export const neutral = (): Movement => ({shift: 0, rise: 0, tilt: 0, swing: 0})
export const initial = (): Rig => ({
  front: neutral(), rear: neutral(), extension: 174, pitch: 0, yaw: 0,
  focal: 150, aperture: 8, width: 120, height: 96, circle: 180
})
export const tripodPivot: V = [0,-162,90]
export const add = (a: V, b: V): V => [a[0]+b[0],a[1]+b[1],a[2]+b[2]]
export const sub = (a: V, b: V): V => [a[0]-b[0],a[1]-b[1],a[2]-b[2]]
export const mul = (a: V, s: number): V => [a[0]*s,a[1]*s,a[2]*s]
export const dot = (a: V,b: V) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
export const cross = (a: V,b: V): V => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
export const length = (a: V) => Math.hypot(...a)
export const unit = (a: V): V => mul(a,1/length(a))
const rad = Math.PI/180
export function rotate(p: V, tilt: number, swing: number): V {
  const a=tilt*rad,b=swing*rad
  const y=Math.cos(a)*p[1]-Math.sin(a)*p[2], z=Math.sin(a)*p[1]+Math.cos(a)*p[2]
  return [Math.cos(b)*p[0]+Math.sin(b)*z,y,-Math.sin(b)*p[0]+Math.cos(b)*z]
}
export function localFrame(m: Movement, z: number): Frame {
  return {o:[m.shift,m.rise,z],x:rotate([1,0,0],m.tilt,m.swing),y:rotate([0,1,0],m.tilt,m.swing),n:rotate([0,0,1],m.tilt,m.swing)}
}
export function frames(r: Rig) {
  const world=(a: Frame): Frame => {
    const turn=(p: V)=>rotate(p,r.pitch,r.yaw)
    return {o:add(tripodPivot,turn(sub(a.o,tripodPivot))),x:turn(a.x),y:turn(a.y),n:turn(a.n)}
  }
  return {lens:world(localFrame(r.front,0)),film:world(localFrame(r.rear,r.extension))}
}
export function filmPoint(film: Frame,x: number,y: number): V {
  return add(film.o,add(mul(film.x,x),mul(film.y,y)))
}
// Central projection in physical glass coordinates; a real image is inverted.
export function project(p: V,lens: Frame,film: Frame) {
  const d=sub(p,lens.o),den=dot(film.n,d),gap=dot(film.n,sub(film.o,lens.o))
  if(den>=-1e-9 || dot(d,lens.n)>=0) return null
  const hit=sub(add(lens.o,mul(d,gap/den)),film.o)
  return {x:dot(hit,film.x),y:dot(hit,film.y)}
}
// In lens-relative space, (f*m - d*n) dot (P-L) = f*d.
export function focusPlane(lens: Frame,film: Frame,f: number) {
  const d=dot(film.n,sub(film.o,lens.o))
  const a=sub(mul(film.n,f),mul(lens.n,d)),size=length(a)
  if(size<1e-8) return null
  const normal=mul(a,1/size),distance=f*d/size
  return {normal,point:add(lens.o,mul(normal,distance)),distance}
}
// Intersect the optical axis with the focus plane before normalizing it.
// Positive distances are on the subject side. Negative ones are virtual.
export function signedAxisFocus(lens: Frame,film: Frame,f: number) {
  const gap=dot(film.n,sub(film.o,lens.o))
  const delta=gap-f*dot(lens.n,film.n)
  return Math.abs(delta)<1e-10?Infinity:f*gap/delta
}
export function axisFocus(lens: Frame,film: Frame,f: number) {
  const distance=signedAxisFocus(lens,film,f)
  return distance>0?distance:Infinity
}
// For a film sample R relative to the lens and a pupil offset A, the
// reciprocal thin-lens object ray is -R + A*(1 - n·R/f), including infinity.
export function objectRay(lens: Frame,film: Frame,f: number,x: number,y: number,a: number,b: number) {
  const offset=add(mul(lens.x,a),mul(lens.y,b)),r=sub(filmPoint(film,x,y),lens.o)
  return {origin:add(lens.o,offset),direction:add(mul(r,-1),mul(offset,1-dot(lens.n,r)/f))}
}
export function coverage(lens: Frame,film: Frame,r: Rig,x: number,y: number) {
  const p=sub(filmPoint(film,x,y),lens.o),z=dot(p,lens.n)
  return z>0 ? length(sub(p,mul(lens.n,z)))*r.focal/z/(r.circle/2) : Infinity
}
// Intersect the thin-lens image-side ray with the tilted glass. Works at
// object-side focal distance too, without evaluating an infinite conjugate.
export function pupilHit(p: V,lens: Frame,film: Frame,f: number,ax: number,ay: number): V | null {
  const r=sub(p,lens.o),a=add(mul(lens.x,ax),mul(lens.y,ay))
  const u=-dot(r,lens.n),origin=add(lens.o,a)
  const direction=sub(mul(r,-f),mul(a,u-f))
  const denom=dot(film.n,direction)
  if(u<=0 || denom<=1e-10) return null
  return add(origin,mul(direction,dot(film.n,sub(film.o,origin))/denom))
}
// Sample 12 opposing rim pairs for a practical sensor-side blur diameter.
export function blurDiameter(p: V,lens: Frame,film: Frame,r: Rig) {
  const radius=r.focal/(2*r.aperture)
  let diameter=0
  for(let i=0;i<12;i++){
    const a=radius*Math.cos(i*Math.PI/12),b=radius*Math.sin(i*Math.PI/12)
    const h=pupilHit(p,lens,film,r.focal,a,b),k=pupilHit(p,lens,film,r.focal,-a,-b)
    if(!h||!k) return Infinity
    diameter=Math.max(diameter,length(sub(h,k)))
  }
  return diameter
}

// Depth of field measured along the lens axis. Search in reciprocal object
// distance so the far limit may pass continuously through infinity.
export function axisDepthOfField(r:Rig,criterion=.1){
  const {lens,film}=frames(r),focus=axisFocus(lens,film,r.focal)
  const center=Number.isFinite(focus)?1/focus:0
  const acceptable=(vergence:number)=>{
    const p=add(lens.o,mul(lens.n,-1/Math.max(1e-13,vergence)))
    return blurDiameter(p,lens,film,r)<=criterion
  }
  if(!acceptable(center))return null
  const edge=(outside:number)=>{
    if(acceptable(outside))return outside===0?Infinity:1/outside
    let inside=center
    for(let i=0;i<30;i++){
      const mid=(outside+inside)/2
      if(acceptable(mid))inside=mid
      else outside=mid
    }
    return 1/inside
  }
  return {near:edge(1/r.focal),far:edge(0)}
}
