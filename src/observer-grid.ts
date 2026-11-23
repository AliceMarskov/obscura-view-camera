import * as T from 'three'
import type {SceneSpec} from './scenes.ts'

// World coordinates stay in millimetres. Fade each line family separately:
// when looking along the ground, one axis can remain legible long after the
// other has compressed below the size of a screen pixel.
export class ObserverGroundGrid extends T.Mesh<T.PlaneGeometry,T.ShaderMaterial>{
  constructor(pixelRatio:number){
    const material=new T.ShaderMaterial({
      transparent:true,depthTest:true,depthWrite:false,toneMapped:false,
      polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2,
      uniforms:{
        pixelRatio:{value:pixelRatio},
        fineInk:{value:new T.Color('#9bbcad')},majorInk:{value:new T.Color('#c7d9cd')},
        outlineInk:{value:new T.Color('#193a37')}
      },
      vertexShader:`
        varying vec2 ground;
        varying vec2 edge;
        void main(){
          vec4 world=modelMatrix*vec4(position,1.);
          ground=world.xz; edge=uv;
          gl_Position=projectionMatrix*viewMatrix*world;
        }`,
      fragmentShader:`
        uniform float pixelRatio;
        uniform vec3 fineInk,majorInk,outlineInk;
        varying vec2 ground;
        varying vec2 edge;
        vec2 stripe(float spacing, float halfWidth) {
          vec2 coord=ground/spacing;
          vec2 footprint=max(fwidth(coord),vec2(.000001));
          vec2 px=abs(fract(coord+.5)-.5)/footprint/pixelRatio;
          vec2 visible=1.-smoothstep(vec2(1./14.),vec2(1./7.),footprint*pixelRatio);
          vec2 core=(1.-smoothstep(vec2(halfWidth-.45),vec2(halfWidth+.45),px))*visible;
          vec2 rim=(1.-smoothstep(vec2(halfWidth+.25),vec2(halfWidth+1.25),px))*visible;
          return vec2(max(core.x,core.y),max(rim.x,rim.y));
        }
        void main(){
          vec2 fine=stripe(100.,.44),metres=stripe(1000.,.66),fiveMetres=stripe(5000.,.86);
          float fineLine=.54*fine.x,majorLine=max(.68*metres.x,.80*fiveMetres.x);
          float line=max(fineLine,majorLine);
          float rim=max(.27*fine.y,max(.42*metres.y,.50*fiveMetres.y));
          float opacity=line+(1.-line)*rim;
          vec2 boundary=min(edge,1.-edge);
          float fade=smoothstep(0.,.025,min(boundary.x,boundary.y));
          if(opacity*fade<.005)discard;
          vec3 ink=mix(fineInk,majorInk,majorLine/max(line,.001));
          gl_FragColor=vec4(mix(outlineInk,ink,line/opacity),opacity*fade);
          #include <colorspace_fragment>
        }`
    })
    super(new T.PlaneGeometry(1,1).rotateX(-Math.PI/2),material)
    this.name='Observer ground grid'
    // Draw between the opaque world and other translucent diagrams/glazing.
    this.renderOrder=-1
  }
  fit(spec:SceneSpec){
    // Bounds of the physical floor in each set. Clip the overlay at the
    // greenhouse glazing and at the cutaway edge of the workshop floorboards.
    const {x,z,width,depth,height}={
      architecture:{x:0,z:-18000,width:128000,depth:144000,height:-35},
      'still-life':{x:312,z:150,width:3774,depth:4010,height:0},
      greenhouse:{x:0,z:-2310,width:4700,depth:7300,height:0}
    }[spec.id]
    this.position.set(x,(spec.groundY??-1550)+height,z)
    this.scale.set(width,1,depth)
  }
}
