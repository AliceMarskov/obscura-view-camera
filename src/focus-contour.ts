import * as T from 'three'
import {dot,focusPlane,sub,type Frame,type Rig,type V} from './optics'

/** Shade the visible mesh fragment where its actual world position crosses the
 * physical object plane. Shared photographic materials retain their original
 * shader in the ground-glass renderer. Probe captures keep the effect off. */
export class FocusContour {
  private seen=new WeakSet<T.Material>()
  private hasSlice=false
  private uniforms={
    contourOn:{value:false},contourPlane:{value:new T.Vector4()},
    contourLens:{value:new T.Vector3()},contourNormal:{value:new T.Vector3()},
    contourFilm:{value:new T.Vector4()},contourX:{value:new T.Vector3()},contourY:{value:new T.Vector3()},
    contourWindow:{value:new T.Vector4()},contourOptic:{value:new T.Vector2()},
    contourMin:{value:new T.Vector3()},contourMax:{value:new T.Vector3()}
  }
  attach(group:T.Group,observer:T.WebGLRenderer){
    group.traverse(o=>{
      if(!(o instanceof T.Mesh))return
      const materials:T.Material[]=Array.isArray(o.material)?o.material:[o.material]
      for(const mat of materials){
        if(this.seen.has(mat))continue
        this.seen.add(mat)
        const hook=mat.onBeforeCompile,originalKey=mat.customProgramCacheKey()
        mat.onBeforeCompile=(shader,renderer)=>{
          hook.call(mat,shader,renderer)
          if(renderer!==observer||!shader.vertexShader.includes('#include <project_vertex>')||
             !shader.fragmentShader.includes('#include <fog_fragment>'))return
          Object.assign(shader.uniforms,this.uniforms)
          shader.vertexShader='varying vec3 vBenchSurface;\n'+shader.vertexShader.replace('#include <project_vertex>',`
            #include <project_vertex>
            vec4 benchLocal = vec4(transformed,1.);
            #ifdef USE_BATCHING
              benchLocal = batchingMatrix * benchLocal;
            #endif
            #ifdef USE_INSTANCING
              benchLocal = instanceMatrix * benchLocal;
            #endif
            vBenchSurface = (modelMatrix * benchLocal).xyz;
          `)
          shader.fragmentShader=`
            varying vec3 vBenchSurface;
            uniform bool contourOn;
            uniform vec4 contourPlane, contourFilm, contourWindow;
            uniform vec3 contourLens, contourNormal, contourX, contourY, contourMin, contourMax;
            uniform vec2 contourOptic;
          `+shader.fragmentShader.replace('#include <fog_fragment>',`
            #include <fog_fragment>
            if (contourOn) {
              float dist = dot(contourPlane.xyz, vBenchSurface) + contourPlane.w;
              float footprint = fwidth(dist);
              float band = 1. - smoothstep(.40, 1.30, abs(dist) / max(footprint, .001));
              if (band > .001 && all(greaterThanEqual(vBenchSurface,contourMin)) && all(lessThanEqual(vBenchSurface,contourMax))) {
                vec3 ray = contourLens-vBenchSurface;
                float z = dot(ray,contourNormal), denom = dot(ray,contourFilm.xyz);
                if (z > contourOptic.x && denom > 0. && length(ray-z*contourNormal) <= z*contourOptic.y) {
                  vec3 filmRay = ray*(contourFilm.w/denom);
                  vec2 uv = vec2(dot(filmRay,contourX),dot(filmRay,contourY))-contourWindow.xy;
                  if (all(lessThanEqual(abs(uv),contourWindow.zw)))
                    gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.42,1.,.73),band*mix(.18,.98,smoothstep(.001,.015,footprint)));
                }
              }
            }
          `)
        }
        mat.customProgramCacheKey=()=>originalKey+'-bench-surface-1'
        mat.needsUpdate=true
      }
    })
  }
  update(lens:Frame,film:Frame,r:Rig,box:{min:V;max:V},hasSlice:boolean){
    const plane=focusPlane(lens,film,r.focal),u=this.uniforms
    this.hasSlice=!!plane&&hasSlice
    if(!plane||!hasSlice)return
    const offset=sub(film.o,lens.o)
    u.contourPlane.value.set(...plane.normal,-dot(plane.normal,plane.point))
    u.contourLens.value.fromArray(lens.o);u.contourNormal.value.fromArray(lens.n)
    u.contourFilm.value.set(...film.n,dot(film.n,offset))
    u.contourX.value.fromArray(film.x);u.contourY.value.fromArray(film.y)
    u.contourWindow.value.set(dot(film.x,offset),dot(film.y,offset),r.width/2,r.height/2)
    u.contourOptic.value.set(r.focal,r.circle/(2*r.focal))
    u.contourMin.value.fromArray(box.min);u.contourMax.value.fromArray(box.max)
  }
  show(active:boolean){this.uniforms.contourOn.value=active&&this.hasSlice}
}
