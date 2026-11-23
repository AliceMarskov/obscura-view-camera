import * as T from 'three'
import type {V} from '../optics.ts'
import {marker,surface} from './model.ts'
import {photographic,sceneryTexture} from './photographic.ts'

type Species='calathea'|'ficus'|'fern'|'zinnia'
const vec=(p:V)=>new T.Vector3(...p)
const tuple=(p:T.Vector3)=>p.toArray() as V
const tau=Math.PI*2,golden=2.39996323

function geometry(pos:number[],uv:number[],indices:number[]) {
  const g=new T.BufferGeometry()
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3))
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals()
  return g
}

/** One bent, tapered stalk with a continuous skin and no gaps at nodes. */
export function stalk(g:T.Object3D,mat:T.Material,points:V[],r0:number,r1:number,n=8) {
  const path=new T.CatmullRomCurve3(points.map(vec)),count=Math.max(3,(points.length-1)*4)
  const frames=path.computeFrenetFrames(count,false),pos:number[]=[],uv:number[]=[],ind:number[]=[]
  for(let i=0;i<=count;i++){
    const t=i/count,c=path.getPointAt(t),rad=r0+(r1-r0)*t
    for(let j=0;j<=n;j++){
      const a=tau*j/n,point=c.clone().addScaledVector(frames.normals[i],rad*Math.cos(a)).addScaledVector(frames.binormals[i],rad*Math.sin(a))
      pos.push(...point.toArray());uv.push(j/n,t)
      if(i<count&&j<n){const k=i*(n+1)+j;ind.push(k,k+1,k+n+1,k+1,k+n+2,k+n+1)}
    }
  }
  g.add(new T.Mesh(geometry(pos,uv,ind),mat))
  return path
}

/** A centimetre-scale herbarium specimen. The ray florets of Zinnia elegans
 * reach about 25 × 12 mm; this larger double head is a cultivated form.
 * https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:261331-1/general-information */
export function specimenPlants(g:T.Group){
  const calathea=photographic('leaf-calathea',undefined,.51),ficus=photographic('leaf-rubber',undefined,.37)
  const fern=photographic('leaf-fern',undefined,.81),zinnia=photographic('leaf-fern',undefined,.75)
  calathea.color.setHex(0xcfdbbe);ficus.color.setHex(0xaac0aa);fern.color.setHex(0x97ac84);zinnia.color.setHex(0xaab69b)
  const top={calathea,ficus,fern,zinnia}
  // Pinnules are millimetres wide. At grazing angles their projected
  // texture derivatives collapse; the folded mesh supplies their normals.
  for(const mat of Object.values(top)){
    mat.emissiveMap=mat.map;mat.emissive.setRGB(.07,.091,.038)
  }
  const back=Object.fromEntries(Object.entries(top).map(([key,mat])=>{
    const m=mat.clone();m.roughness=.79;m.side=T.BackSide
    if(key==='calathea'){
      // The same vascular map is visible on the wine-coloured reverse.
      m.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',
        '#include <map_fragment>\nfloat pigment=0.42+3.4*dot(diffuseColor.rgb,vec3(.21,.72,.07)); diffuseColor.rgb=vec3(.145,.050,.071)*pigment;')}
    }else m.color.setHex(key==='ficus'?0xb8c6ac:0xd5d6a9)
    return [key,m]
  })) as Record<Species,T.MeshStandardMaterial>
  const green=surface(0x52693d),petiole=surface(0x617548),twig=surface(0x625443),rib=surface(0x8d9d63)
  const oldSheath=surface(0x967963,.79),sepals=surface(0x56643c),edge=surface(0x72805b)
  const rayMap=sceneryTexture('winter-petal.webp')
  const silk=new T.MeshStandardMaterial({map:rayMap,vertexColors:true,roughness:.65,
    side:T.DoubleSide,emissiveMap:rayMap,emissive:0x453526})
  silk.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',
    '#include <color_fragment>\nif(!gl_FrontFacing){float l=dot(diffuseColor.rgb,vec3(.21,.72,.07));diffuseColor.rgb=mix(diffuseColor.rgb,l*vec3(1.33,1.04,.70),.45);}') }
  const receptacle=photographic('zinnia'),bud=surface(0xad6735),pollen=surface(0xf1b63b,.76),anther=surface(0x754331)

  function blade(start:V,end:V,w:number,kind:Species,roll:number,hero=false,small=false) {
    const a=vec(start),b=vec(end),axis=b.clone().sub(a).normalize(),length=a.distanceTo(b)
    const side=axis.clone().cross(hero?new T.Vector3(0,.10,1):new T.Vector3(.05,.78,1)).normalize()
    if(side.lengthSq()<.2)side.set(1,0,0)
    side.applyAxisAngle(axis,roll)
    const normal=side.clone().cross(axis).normalize()
    const along=hero?34:small?6:14,across=hero?14:small?3:6
    const front:number[]=[],underside:number[]=[],uv:number[]=[],ind:number[]=[]
    const arch=small?.11:kind==='calathea'?.18:.13
    const point=(t:number,s:number)=>{
      const wave=Math.sin(Math.PI*t)
      const spread=Math.pow(Math.max(.00002,wave),kind==='fern'?.91:kind==='calathea'?.74:.81)
      const curl=(hero?.19:.33)*s*s+.052*Math.abs(s)*Math.sin(t*20+s*3+roll)
      const vein=kind==='fern'?0:.026*Math.cos(t*55-Math.abs(s)*5)*Math.abs(s)
      const p=a.clone().lerp(b,t)
      p.y+=length*arch*wave
      p.addScaledVector(side,w*(spread*s+.13*wave*Math.sin(t*3+roll)))
      p.addScaledVector(normal,w*wave*(.06+curl+vein+.25*t*s*Math.sin(roll+1.3)-.035*Math.abs(s)))
      return p
    }
    for(let i=0;i<=along;i++)for(let j=0;j<=across;j++){
      const t=i/along,s=2*j/across-1,p=point(t,s)
      front.push(...p.toArray());underside.push(...p.addScaledVector(normal,hero?-.24:-.13).toArray())
      uv.push(.50+.49*s*(.40+.60*Math.sin(Math.PI*t)),.015+.97*t)
      if(i<along&&j<across){const k=i*(across+1)+j;ind.push(k,k+1,k+across+1,k+1,k+across+2,k+across+1)}
    }
    const geom=geometry(front,uv,ind);g.add(new T.Mesh(geom,top[kind]))
    if(!small)g.add(new T.Mesh(geometry(underside,uv,ind),back[kind]))
    else top[kind].side=T.DoubleSide
    if(hero){
      const midline=Array.from({length:9},(_,i)=>tuple(point(i/8,0).addScaledVector(normal,.13)))
      stalk(g,rib,midline,.65,.11,7)
      // The vascular network below the midrib is recorded in the specimen
      // map: its colour and microscopic bump follow the same curved skin.
      // A barycentric point on the upper skin beside the raised midrib.
      const t=23/along,s=2/across
      const focus=point(t,s).add(point(t,s+2/across)).add(point(t+1/along,s)).multiplyScalar(1/3)
      marker(g,'sphere',focus.x,focus.y,focus.z)
    }
  }

  function prayerPlant(x:number,z:number,soil:number,size:number,phase:number,primary=false){
    const shoots=primary?6:8
    for(let i=0;i<shoots;i++){
      const a=phase+i*golden,dx=Math.cos(a),dz=Math.sin(a),s=size*(.78+.22*Math.sin(i*4.9+1))
      const root:V=[x+4*dx,soil-6,z+4*dz],base:V=[x+dx*s*.36,soil+s*(.40+.16*(i%3)),z+dz*s*.32]
      const tip:V=[x+dx*s*(.89+.28*(i%2)),base[1]+s*(.35+.42*((i+1)%3)/2),z+dz*s*(.68+.21*(i%2))]
      stalk(g,petiole,[root,[x+dx*s*.10,soil+.15*s,z+dz*s*.11],base],1.45,1.0,7)
      blade(base,tip,s*(.16+.018*(i%3)),'calathea',.90*Math.sin(i*1.64+phase))
    }
    if(primary){
      const shoulder:V=[-107,-49,-843]
      stalk(g,petiole,[[x,soil-7,z],[x-1,soil+12,z+5],shoulder],1.6,1.0)
      blade(shoulder,[-62,0,-790],21.4,'calathea',-.32,true)
    }
  }

  function rubber(x:number,z:number,soil:number,s:number,phase:number){
    const path=stalk(g,twig,[[x,soil-7,z],[x-s*.10,soil+s*.48,z+.10*s],[x+s*.07,soil+s*.95,z-.06*s]],s*.024,s*.008)
    for(let i=0;i<8;i++){
      const t=.16+i*.115,p=path.getPointAt(t),a=phase+i*golden,dx=Math.cos(a),dz=Math.sin(a)
      const scale=s*(.61+.16*Math.sin(i*2+.4))*(1-.28*t)
      const base=p.clone().add(new T.Vector3(dx*.15*s,.045*s,dz*.15*s))
      const tip=base.clone().add(new T.Vector3(dx*scale,s*(.18-.25*(i%2)),dz*scale))
      stalk(g,petiole,[tuple(p),tuple(base)],s*.010,s*.007)
      blade(tuple(base),tuple(tip),scale*.23,'ficus',Math.sin(a)*.55)
    }
    const tip=path.getPointAt(1)
    stalk(g,oldSheath,[tuple(tip),[tip.x+s*.06,tip.y+s*.19,tip.z]],s*.029,.2,7)
  }

  function fernPlant(x:number,z:number,soil:number,s:number,phase:number){
    for(let i=0;i<10;i++){
      const a=i*golden+phase,dx=Math.cos(a),dz=Math.sin(a),len=s*(.80+.16*Math.sin(i*3.6))
      const path=stalk(g,petiole,[[x,soil-7,z],[x+.16*len*dx,soil+.54*len,z+.16*len*dz],
        [x+.66*len*dx,soil+.78*len,z+.66*len*dz],[x+len*dx,soil+.53*len,z+len*dz]],1.3,.27,6)
      for(let j=2;j<=15;j++){
        const t=j/16,p=path.getPointAt(t),w=len*.23*Math.pow(Math.sin(Math.PI*t),.76)
        for(const side of [-1,1]){
          const end=p.clone().add(new T.Vector3(-side*dz*w+dx*w*.34,w*(.27-.43*t),side*dx*w+dz*w*.34))
          blade(tuple(p),tuple(end),w*.11,'fern',side*.27,false,true)
        }
      }
    }
  }

  // Individual ray florets twist up from a small attachment at the disc,
  // opening to a rounded, shallowly notched tip with longitudinal pleats.
  function ray(head:T.Group,angle:number,r:number,layer:number,variation:number) {
    const pos:number[]=[],uv:number[]=[],ind:number[]=[],rgb:number[]=[],n=r>25?24:16,m=r>25?9:6
    const unit=[1,.85,.69,.54][layer],base=r*(.24-.035*layer)
    const length=r*unit*(.69+.13*variation),width=length*(.245+.052*(1-variation))
    const patch=(Math.floor(variation*67)+layer)%6
    const edgeColor=new T.Color(variation>.38?0xfff9f0:0xfff0e5)
    const rootColor=new T.Color(variation<.43?0xd8b5a2:0xd8ba95)
    const tint=new T.Color()
    for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){
      // Cosine spacing samples the rounded blade tip and the attachment at
      // higher density. Opposite margins roll independently in the light.
      const t=(1-Math.cos(Math.PI*i/n))/2,s=j/m*2-1
      const spread=.006+Math.sqrt(Math.max(0,1-(2*t-1)**2))*(.44+.88*t)
      const theta=angle+.13*(variation-.4)*Math.sin(t*Math.PI),side=s*width*spread
      const rad=base+length*(t+.009*(s*s-.5)*Math.sin(t*Math.PI)**2)
      const cup=r*(-.18+.115*layer+.09*Math.sin(t*Math.PI)+(.13+.07*variation)*t-.17*(1-layer*.29)*t**4)
      const fold=width*(.20*s*s+.045*Math.cos(s*12)*Math.abs(s)+(.41+.18*variation)*s+.15*s*(variation-.5)*t)*spread
      pos.push(Math.cos(theta)*rad-Math.sin(theta)*side,Math.sin(theta)*rad+Math.cos(theta)*side,cup+fold)
      uv.push((patch%3+.5+s*spread*.47)/3,(1-Math.floor(patch/3)+.015+.97*t)/2)
      tint.copy(rootColor).lerp(edgeColor,Math.min(1,.18+.80*t+.12*Math.abs(s)*t));rgb.push(tint.r,tint.g,tint.b)
      if(i<n&&j<m){const k=i*(m+1)+j;ind.push(k,k+m+1,k+1,k+1,k+m+1,k+m+2)}
    }
    const geo=geometry(pos,uv,ind);geo.setAttribute('color',new T.Float32BufferAttribute(rgb,3))
    head.add(new T.Mesh(geo,silk))
  }

  function discFloret(){
    const p:number[]=[],uv:number[]=[],ind:number[]=[]
    for(let i=0;i<5;i++){
      const a=tau*i/5,ax=Math.cos(a),ay=Math.sin(a)
      for(const [j,[radius,width,z]] of [[.28,.18,0],[.39,.28,.83],[.72,.32,1.39],[1.08,.24,1.70],[1.30,.035,1.54]].entries()){
        for(const s of [-1,0,1]){p.push(ax*radius-ay*s*width,ay*radius+ax*s*width,z+.19*s*s);uv.push((s+1)/2,j/4)}
        if(j){const k=i*15+j*3;ind.push(k-3,k,k+1,k-3,k+1,k-2,k-2,k+1,k+2,k-2,k+2,k-1)}
      }
    }
    return geometry(p,uv,ind)
  }
  const floret=discFloret(),bead=new T.SphereGeometry(1,6,4)
  function headAt(x:number,y:number,z:number,r:number,tilt:number,turn:number,phase:number,primary=false){
    const head=new T.Group();head.rotation.set(tilt,turn,phase);g.add(head)
    // The centre of the actual central disc bead sits at the calibrated
    // conjugate even with the inflorescence leaning forwards.
    const cap=4+r*.265*.55,center=vec([x,y,z+cap])
    const pole=new T.Vector3(0,0,cap).applyQuaternion(head.quaternion)
    head.position.copy(center).sub(pole)
    const mount=new T.Mesh(new T.SphereGeometry(1,22,12),sepals)
    mount.scale.set(r*.31,r*.31,r*.17);mount.position.z=-r*.21;head.add(mount)
    for(let i=0;i<14;i++){
      const a=i*golden
      const bract=new T.Mesh(bead,edge);bract.position.set(r*.25*Math.cos(a),r*.25*Math.sin(a),-r*.21)
      bract.rotation.set(0,0,a);bract.scale.set(r*.12,r*.07,r*.12);head.add(bract)
    }
    for(const [layer,count] of [16,14,12,9].entries())for(let i=0;i<count;i++){
      const v=.5+.5*Math.sin(13.95*i+5.4*layer+phase)
      ray(head,(i+.36*layer)*tau/count+.07*v+phase,r,layer,v)
    }
    const disc=new T.SphereGeometry(1,28,16),points=disc.getAttribute('position'),uv=disc.getAttribute('uv')
    // Pollen-scale pigmentation lives only on the curved receptacle below
    // the raised tubular florets. The photographed entire head is never a card.
    for(let n=0;n<points.count;n++)uv.setXY(n,.489+.114*points.getX(n),.514+.114*points.getY(n))
    const base=new T.Mesh(disc,receptacle)
    base.position.z=cap-r*.09;base.scale.set(r*.218,r*.218,r*.074);head.add(base)
    // Tiny yellow tubular flowers open in a ring; unopened ochre buds form
    // the raised centre. The individual petal tips stand above the disc.
    for(let i=1;i<=132;i++){
      const rr=Math.sqrt(i/132)*r*.228,a=i*golden+.41
      const active=i>53&&i<117&&(i*13)%29<11
      const part=new T.Mesh(active?floret:bead,active?pollen:(i%4?bud:anther))
      part.position.set(rr*Math.cos(a),rr*Math.sin(a),cap-r*.023-(rr/r)**2*r*1.3)
      const scale=r/35*(.54+.39*((i*13)%9)/8)
      part.scale.set(scale*(active?1:.43),scale*(active?1:.40),scale*(active?1:.68))
      part.rotation.set(.29*Math.sin(a),.34*Math.cos(a),a);head.add(part)
    }
    const centerFloret=new T.Mesh(bead,bud);centerFloret.scale.set(.66,.66,.82);centerFloret.position.z=cap-.82
    head.add(centerFloret)
    if(primary)marker(head,'cylinder',0,0,cap)
    return tuple(head.localToWorld(new T.Vector3(0,0,-r*.22)))
  }

  function flowerPlant(x:number,z:number,soil:number) {
    const root:V=[x,soil-9,z],fork:V=[x-2,soil+39,z+3]
    stalk(g,green,[root,[x+1,soil+16,z-.9],fork],2.5,2.1)
    for(const [i,[ex,ey,ez,r,tilt,yaw,phase]] of [[15,22,-969,35,-.26,.15,.12],[-29,48,-1000,23,-.62,-.57,.9],
      [68,5,-1009,20,.09,.98,.4],[14,89,-1029,13,-1.06,-.21,2.6]].entries()){
      const attach=headAt(ex,ey,ez,r,tilt,yaw,phase,i===0)
      const node:V=[(2*x+ex)/3,soil+55+i*4,(2*z+ez)/3]
      const neck:V=[attach[0]-.06*(ex-x),attach[1]-11,attach[2]-5]
      stalk(g,green,[fork,node,neck,attach],1.5+(i===0?.5:0),1.1,7)
      for(const s of [-1,1]){
        const end:V=[node[0]+s*(20+i*2),node[1]+11+i*3,node[2]+s*Math.sin(i+1)*17]
        blade(node,end,6.2+i*.4,'zinnia',s*.65)
      }
    }
    for(let i=0;i<4;i++){
      const a=i*Math.PI/2+.42,t=soil+13+i*4
      blade([x,t,z],[x+Math.cos(a)*39,t+15,z+Math.sin(a)*34],8,'zinnia',Math.sin(a)*.7)
    }
  }
  return {prayerPlant,rubber,fernPlant,flowerPlant}
}
