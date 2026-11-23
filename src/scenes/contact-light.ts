import * as T from 'three'

type Footprint=readonly [x:number,z:number,radiusX:number,radiusZ:number]

/** Bake local loss of indirect light into a single texture sampled by the real
 * receiver. It contributes no extra geometry, shadow pass or depth hits. */
export function contactLight(material:T.MeshStandardMaterial,y:number,feet:Footprint[]){
  const xmin=Math.min(...feet.map(([x,,r])=>x-r)),xmax=Math.max(...feet.map(([x,,r])=>x+r))
  const zmin=Math.min(...feet.map(([,z,,r])=>z-r)),zmax=Math.max(...feet.map(([,z,,r])=>z+r))
  const size=256,pixels=new Uint8Array(size*size).fill(255)
  for(const [cx,cz,rx,rz] of feet){
    const u=(cx-xmin)/(xmax-xmin)*size,v=(cz-zmin)/(zmax-zmin)*size
    const sx=rx/(xmax-xmin)*size,sz=rz/(zmax-zmin)*size
    for(let j=Math.max(0,Math.floor(v-sz));j<Math.min(size,v+sz);j++)
      for(let i=Math.max(0,Math.floor(u-sx));i<Math.min(size,u+sx);i++){
        const q=((i+.5-u)/sx)**2+((j+.5-v)/sz)**2
        if(q<1)pixels[j*size+i]=Math.min(pixels[j*size+i],255*(1-.7*(1-q)**2))
      }
  }
  const map=new T.DataTexture(pixels,size,size,T.RedFormat)
  map.magFilter=map.minFilter=T.LinearFilter;map.needsUpdate=true
  material.addEventListener('dispose',()=>map.dispose())
  const sheet=new T.Vector4(xmin,zmin,1/(xmax-xmin),1/(zmax-zmin))
  material.onBeforeCompile=shader=>{
    shader.uniforms.contactMap={value:map};shader.uniforms.contactSheet={value:sheet}
    shader.uniforms.contactHeight={value:y}
    shader.vertexShader='varying vec3 vContactPosition;\n'+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\nvContactPosition=(modelMatrix*vec4(transformed,1.)).xyz;')
    shader.fragmentShader='varying vec3 vContactPosition; uniform sampler2D contactMap; uniform vec4 contactSheet; uniform float contactHeight;\n'+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>
      vec2 contactUV=(vContactPosition.xz-contactSheet.xy)*contactSheet.zw;
      float contactMask=texture2D(contactMap,clamp(contactUV,0.,1.)).r;
      reflectedLight.indirectDiffuse*=mix(contactMask,1.,smoothstep(1.,4.,abs(vContactPosition.y-contactHeight)));`)
  }
  material.customProgramCacheKey=()=>'contact-receiver-v1'
}
