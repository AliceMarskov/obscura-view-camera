import * as T from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type {V} from '../optics.ts'

export type TargetKey = 'sphere' | 'cylinder' | 'arch'
export type Targets = Record<TargetKey,V>
export const surface = (color: number, roughness = .83, metalness = 0) =>
  new T.MeshStandardMaterial({color,roughness,metalness})

export function patina(color:number,kind:'plaster'|'wood'|'ceramic') {
  const w=128,h=128,bytes=new Uint8Array(w*h*4)
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const u=x/w*Math.PI*2,v=y/h*Math.PI*2
    const grain=((Math.imul(x+23,5381)^Math.imul(y+27,733))>>>6)%19-9
    const cloud=Math.cos(u*2+Math.cos(v*2))*Math.sin(v+Math.sin(u))
    const streak=kind==='wood'?Math.cos(11*u+.7*Math.sin(v+Math.sin(u*2)))*12
      :kind==='ceramic'?Math.cos(v*8+.2*Math.sin(u))*4:Math.cos(u*12+Math.sin(v))*.9
    const value=Math.max(0,Math.min(255,238+grain+cloud*5+streak))
    const i=4*(x+y*w);bytes[i]=bytes[i+1]=bytes[i+2]=value;bytes[i+3]=255
  }
  const map=new T.DataTexture(bytes,w,h);map.colorSpace=T.SRGBColorSpace
  map.wrapS=map.wrapT=T.RepeatWrapping;map.minFilter=T.LinearMipmapLinearFilter
  map.magFilter=T.LinearFilter;map.generateMipmaps=true;map.needsUpdate=true
  const m=new T.MeshStandardMaterial({color,map,bumpMap:map,bumpScale:.15,roughness:kind==='ceramic'?.62:.88})
  m.userData.tile=kind==='wood'?[52,99]:[45,45];return m
}

export function box(parent:T.Object3D, material:T.Material, x:number,y:number,z:number,w:number,h:number,d:number) {
  const mesh = new T.Mesh(new T.BoxGeometry(w,h,d), material)
  mesh.position.set(x,y,z); parent.add(mesh)
  return mesh
}
/** Small edge radii in millimetres catch the actual key light. */
export function bevelBox(parent:T.Object3D,material:T.Material,x:number,y:number,z:number,w:number,h:number,d:number,r:number){
  const mesh=new T.Mesh(new RoundedBoxGeometry(w,h,d,1,r),material)
  mesh.position.set(x,y,z);parent.add(mesh);return mesh
}
export function turn(parent:T.Object3D, material:T.Material, x:number,y:number,z:number,
  profile:number[][], segments=48) {
  const mesh = new T.Mesh(new T.LatheGeometry(profile.map(([r,h])=>new T.Vector2(r,h)),segments),material)
  mesh.position.set(x,y,z);parent.add(mesh)
  return mesh
}
export function beam(parent:T.Object3D, material:T.Material, a:V,b:V,width:number,depth=width) {
  const delta=new T.Vector3(...b).sub(new T.Vector3(...a))
  const mesh=box(parent,material,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,width,delta.length(),depth)
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize())
  return mesh
}
export function marker(parent:T.Object3D,key:TargetKey,x:number,y:number,z:number) {
  const object=new T.Object3D()
  object.position.set(x,y,z);object.name='focus.'+key;parent.add(object)
}
export function measure(group:T.Group):Targets {
  group.updateWorldMatrix(true,true)
  return Object.fromEntries((['sphere','cylinder','arch'] as const).map(k=>
    [k,group.getObjectByName('focus.'+k)!.getWorldPosition(new T.Vector3()).toArray()])) as Targets
}

// Bake only static geometry, by material. The display and film can share
// these buffers while keeping independent scene graphs and cameras.
export function batch(source:T.Group) {
  source.updateMatrixWorld(true)
  const parts=new Map<T.Material,T.BufferGeometry[]>(), original=new Set<T.BufferGeometry>()
  const group=new T.Group();group.name=source.name
  source.traverse(obj=>{
    if(obj.name.startsWith('focus.')){
      const target=new T.Object3D();target.name=obj.name
      obj.getWorldPosition(target.position);group.add(target)
    }
    if(!(obj instanceof T.Mesh))return
    const material=obj.material as T.Material
    const g=obj.geometry.index?obj.geometry.toNonIndexed():obj.geometry.clone()
    g.applyMatrix4(obj.matrixWorld);g.clearGroups()
    // Physical tiling keeps mortar courses and wood grain to the same scale.
    const tile=material.userData.tile as [number,number]|undefined
    if(tile){
      const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv')
      for(let i=0;i<p.count;i++){
        const nx=Math.abs(n.getX(i)), ny=Math.abs(n.getY(i)), nz=Math.abs(n.getZ(i))
        if(ny>nx&&ny>nz)uv.setXY(i,p.getX(i)/tile[0],p.getZ(i)/tile[1])
        else uv.setXY(i,(nx>nz?p.getZ(i):p.getX(i))/tile[0],p.getY(i)/tile[1])
      }
    }
    if(!parts.has(material))parts.set(material,[])
    parts.get(material)!.push(g);original.add(obj.geometry)
  })
  for(const [material,buffers] of parts){
    const merged=mergeGeometries(buffers)!
    const mesh=new T.Mesh(merged,material)
    mesh.castShadow=!material.transparent;mesh.receiveShadow=true;group.add(mesh)
    buffers.forEach(g=>g.dispose())
  }
  original.forEach(g=>g.dispose())
  return group
}

// Linear geometry remains independent of DOM, including under node --test.
export function signMap(width:number,height:number,label:string,small:string,face:string,ink:string) {
  if(typeof document==='undefined')return null
  const c=document.createElement('canvas');c.width=width;c.height=height
  const ctx=c.getContext('2d')!
  ctx.fillStyle=face;ctx.fillRect(0,0,width,height)
  const inset=Math.max(3,height*.06)
  ctx.lineWidth=Math.max(1,height*.017);ctx.strokeStyle=ink
  ctx.strokeRect(inset,inset,width-2*inset,height-2*inset)
  ctx.fillStyle=ink;ctx.textAlign='center';ctx.textBaseline='middle'
  const spacing=label.split('').join('\u2009')
  ctx.font='600 '+Math.floor(height*(small?.49:.68))+'px Georgia,serif'
  ctx.fillText(spacing,width/2,height*(small?.41:.52),width*.88)
  if(small){
    ctx.font='600 '+Math.floor(height*.14)+'px Arial,sans-serif'
    ctx.fillText(small.split('').join('\u200a'),width/2,height*.76,width*.82)
  }
  const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4
  return texture
}
export function plaque(parent:T.Object3D,x:number,y:number,z:number,w:number,h:number,
  label:string,small:string,face:string,ink:string,edge:T.Material) {
  box(parent,edge,x,y,z-1.6,w+2,h+2,3)
  const map=signMap(768,Math.max(80,Math.round(768*h/w)),label,small,face,ink)
  const material=new T.MeshStandardMaterial({color:map?'#ffffff':face,map,roughness:.66,metalness:.1})
  const plate=new T.Mesh(new T.PlaneGeometry(w,h),material)
  plate.position.set(x,y,z);parent.add(plate)
}

export function masonry(base:[number,number,number],mortar:[number,number,number],width:number,height:number) {
  const w=256,h=128,bytes=new Uint8Array(w*h*4)
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const row=Math.floor(y/16),stagger=x+32*(row%2),col=Math.floor(stagger/64)
    const joint=stagger%64<2.4||y%16<1.6
    const grain=((Math.imul(x+21,4231)^Math.imul(y+9,2569))>>>3)%15-7
    const tone=(Math.sin(col*11.8+row*17.3)*7+grain)*(joint?.32:1)
    const rgb=joint?mortar:base
    for(let k=0;k<3;k++)bytes[(y*w+x)*4+k]=Math.max(0,Math.min(255,rgb[k]+tone))
    bytes[(y*w+x)*4+3]=255
  }
  const texture=new T.DataTexture(bytes,w,h)
  texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.colorSpace=T.SRGBColorSpace
  texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter
  texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true
  const material=new T.MeshStandardMaterial({map:texture,bumpMap:texture,bumpScale:.36,roughness:.93})
  material.userData.tile=[width,height]
  return material
}
