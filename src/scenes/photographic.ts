import * as T from 'three'

// Texture loading belongs to the scene. A completed load invalidates both
// the observer rendering and any aperture samples made before images arrived.
export const sceneryLoading=new T.LoadingManager()
const listeners=new Set<()=>void>()
sceneryLoading.onLoad=()=>{for(const update of listeners)update()}
export function onSceneryReady(update:()=>void){
  listeners.add(update)
  return ()=>{listeners.delete(update)}
}
export function sceneryTexture(file:string,smallScreenLimit?:number) {
  const map=typeof document==='undefined'?new T.Texture():new T.TextureLoader(sceneryLoading).load('./scenery/'+file,texture=>{
    if(!smallScreenLimit || !matchMedia('(pointer: coarse), (max-width: 900px)').matches)return
    const source=texture.image
    if(Math.max(source.width,source.height)<=smallScreenLimit)return
    const scale=smallScreenLimit/Math.max(source.width,source.height)
    const canvas=document.createElement('canvas')
    canvas.width=Math.round(source.width*scale);canvas.height=Math.round(source.height*scale)
    const context=canvas.getContext('2d')
    if(context){context.drawImage(source,0,0,canvas.width,canvas.height);texture.image=canvas}
  })
  map.colorSpace=T.SRGBColorSpace
  map.anisotropy=8
  return map
}

export type Finish='limestone'|'cobbles'|'slate'|'walnut'|'paint'|'plaster'|'terracotta'

/** Maps share a physical UV scale. AO and roughness use R/G of the same linear texture. */
export function pbr(finish:Finish,tile?:[number,number]){
  const load=(channel:'color'|'normal'|'orm')=>{
    const map=sceneryTexture(`pbr-${finish}-${channel}.webp`,512)
    map.name=`${finish}.${channel}`
    map.colorSpace=channel==='color'?T.SRGBColorSpace:T.NoColorSpace
    map.wrapS=map.wrapT=T.RepeatWrapping
    return map
  }
  const orm=load('orm')
  const material=new T.MeshStandardMaterial({map:load('color'),normalMap:load('normal'),
    roughnessMap:orm,aoMap:orm,roughness:1,metalness:0})
  if(tile)material.userData.tile=tile
  return material
}
export function photographic(file:string,tile?:[number,number],roughness=.88) {
  const map=sceneryTexture(file+'.webp')
  const material=new T.MeshStandardMaterial({map,roughness})
  if(tile){
    map.wrapS=map.wrapT=T.MirroredRepeatWrapping
    material.userData.tile=tile
  }
  return material
}
/** Coordinates in a rectified surface image, top left at 0,0. */
export function patch(parent:T.Object3D,material:T.Material,w:number,h:number,
  left:number,top:number,right:number,bottom:number,z:number){
  const geo=new T.PlaneGeometry((right-left)*w,(bottom-top)*h)
  const uv=geo.getAttribute('uv')
  for(let i=0;i<uv.count;i++)uv.setXY(i,left+(right-left)*uv.getX(i),1-bottom+(bottom-top)*uv.getY(i))
  const mesh=new T.Mesh(geo,material)
  mesh.position.set(((left+right)/2-.5)*w,(1-(top+bottom)/2)*h,z)
  parent.add(mesh)
  return mesh
}
