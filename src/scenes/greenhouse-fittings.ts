import * as T from 'three'
import type {V} from '../optics.ts'
import {beam,bevelBox,box,marker,surface,turn} from './model.ts'
import {photographic,pbr} from './photographic.ts'
import {contactLight} from './contact-light.ts'

export const benchTop=-146
function glassQuad(g:T.Object3D,mat:T.Material,corners:V[]) {
  const geo=new T.BufferGeometry()
  geo.setAttribute('position',new T.Float32BufferAttribute(corners.flat(),3))
  geo.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,1,0,1],2))
  geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals()
  g.add(new T.Mesh(geo,mat))
}
export function conservatory(g:T.Group,frame:T.Material,brass:T.Material){
  const half=2070,zBack=-4710,length=5400,floor=-1130,eave=1450,ridge=2680
  const seal=surface(0x637367),zinc=surface(0x969e91,.56,.4)
  const tile=pbr('limestone',[1450,670]),slats=pbr('paint',[410,830])
  slats.color.setHex(0xb5c0ac)
  contactLight(slats,benchTop,[[-108,-865,59,59],[15,-1021,63,63],[160,-1110,57,57],
    [-152,-1214,73,73],[-258,-1490,94,94],[190,-1485,101,101],[-357,-1955,126,126],
    [370,-2100,116,116],[-79,-1865,90,90]])
  const pane=new T.MeshPhysicalMaterial({color:0xdaeae1,roughness:.12,metalness:.34,transparent:true,
    opacity:.087,depthWrite:false,side:T.DoubleSide})
  const paving=pbr('cobbles',[1360,1140]);paving.color.setHex(0xe9be9c)
  box(g,paving,0,floor-45,-2310,4700,90,7300)
  for(const x of [-550,550])for(const z of [-2720,-802]){
    box(g,frame,x,(floor+benchTop)/2,z,32,benchTop-floor,32)
    box(g,zinc,x,floor+15,z,54,25,55)
    box(g,frame,x,benchTop-31,z,71,56,51)
  }
  for(const x of [-533,533]){
    box(g,frame,x,benchTop-46,-1758,46,57,1970)
    beam(g,frame,[x,floor+200,-2655],[x,benchTop-65,-990],14,21)
  }
  for(let i=0;i<15;i++)bevelBox(g,slats,-560+i*80,benchTop-12,-1740,75,24,2020,2.6)
  for(const side of [-1,1]){
    const x=side*half
    box(g,tile,x,floor+210,zBack+length/2,143,420,length)
    box(g,zinc,x,floor+423,zBack+length/2,179,18,length)
    for(let b=0;b<10;b++){
      const z=zBack+b*540
      glassQuad(g,pane,[[x,-701,z+8],[x,-701,z+535],[x,eave,z+535],[x,eave,z+8]])
      box(g,seal,x,-35,z,28,1400,25)
    }
    for(const y of [-695,370,eave])box(g,frame,x,y,zBack+length/2,59,44,length)
  }
  box(g,tile,0,floor+210,zBack,half*2,420,138)
  glassQuad(g,pane,[[-half,-704,zBack],[half,-704,zBack],[half,eave,zBack],[-half,eave,zBack]])
  glassQuad(g,pane,[[-half,eave,zBack],[half,eave,zBack],[0,ridge,zBack],[0,ridge,zBack]])
  for(let i=-3;i<=3;i++){
    const x=i*half/3,top=ridge-Math.abs(x)/half*(ridge-eave)
    box(g,frame,x,(floor+top)/2,zBack,38,top-floor,61)
    box(g,zinc,x,(floor+eave)/2,zBack+30,7,eave-floor,10)
  }
  for(const y of [-690,170,895,eave])box(g,frame,0,y,zBack,half*2,41,72)
  const roofPoint=(side:number,u:number,z:number,gap=0):V=>[side*half*u,ridge+(eave-ridge)*u+gap,z]
  for(const side of [-1,1]){
    for(let i=0;i<=10;i++){
      const z=zBack+i*540
      beam(g,i%2?seal:frame,roofPoint(side,1,z),roofPoint(side,0,z),i%2?22:45,i%2?33:66)
      if(i%2===0){
        box(g,frame,side*half,(floor+eave)/2,z,61,eave-floor,67)
        beam(g,frame,[side*half,eave-340,z],roofPoint(side,.77,z),32)
      }
    }
    for(let row=0;row<3;row++)for(let col=0;col<10;col++){
      const u0=row/3+.004,u1=(row+1)/3+.004,z=zBack+col*540
      const opening=side===1&&row===0&&(col===3||col===4)
      const lift=opening?270:row*.9
      const c=[roofPoint(side,u0,z+9),roofPoint(side,u1,z+9,lift),roofPoint(side,u1,z+535,lift),roofPoint(side,u0,z+535)]
      glassQuad(g,pane,c)
      if(opening){
        for(let i=0;i<4;i++)beam(g,frame,c[i],c[(i+1)%4],28,28)
        const f=roofPoint(side,u1,z+300),high=roofPoint(side,u1,z+300,lift)
        beam(g,brass,[f[0]-130,f[1]-130,f[2]],high,13,19)
      }
    }
    for(const u of [1/3,2/3])beam(g,zinc,roofPoint(side,u,zBack),roofPoint(side,u,zBack+length),25,26)
    beam(g,zinc,[side*half,eave+15,zBack],[side*half,eave+15,zBack+length],88,61)
  }
  box(g,zinc,0,ridge,zBack+length/2,92,76,length)
  // A gable tie, a longitudinal vent shaft and the crank at its pillar.
  for(const z of [zBack,zBack+2160,zBack+4320]){
    beam(g,frame,[-half,eave-40,z],[half,eave-40,z],21)
    beam(g,zinc,[0,eave-40,z],[0,ridge-38,z],15)
    for(const side of [-1,1])beam(g,zinc,[0,eave-36,z],roofPoint(side,.53,z),13)
  }
  beam(g,brass,[half*.37,1870,-4030],[half*.37,1870,-1550],17)
  beam(g,brass,[half-82,-220,-2550],[half-82,eave-90,-2550],15)
  box(g,frame,half-82,-226,-2550,87,98,128)
  const wheel=new T.Mesh(new T.TorusGeometry(77,8,8,28),brass)
  wheel.rotation.y=Math.PI/2;wheel.position.set(half-135,-226,-2550);g.add(wheel)
  for(let i=0;i<3;i++){
    const a=i*Math.PI*2/3
    beam(g,brass,[half-135,-226,-2550],[half-135,-226+77*Math.cos(a),-2550+77*Math.sin(a)],8)
  }
  // The distant garden image is a final backing, behind actual sashes,
  // terrace edging and two levels of real staging.
  const distant=photographic('winter-garden')
  distant.emissiveMap=distant.map;distant.emissive.setScalar(.58);distant.roughness=.96
  const garden=new T.Mesh(new T.PlaneGeometry(18500,12334),distant)
  garden.position.set(0,1640,-11600);g.add(garden)
  box(g,tile,-1690,-794,-6270,2210,670,730)
  box(g,zinc,-1690,-451,-6270,2290,43,790)
  for(const x of [-1840,1730]){
    box(g,slats,x,-296,-3230,550,44,2470)
    for(const z of [-4270,-2230])for(const dx of [-194,194])box(g,frame,x+dx,-710,z,29,830,28)
    box(g,frame,x,-710,-3230,454,27,2240)
  }
}

export function pots(g:T.Group){
  const clay=pbr('terracotta')
  // Lathe UVs wrap once around the pot. A thin glaze smooths the underlying
  // irregular body, while unglazed clay has measurable salt and grain relief.
  clay.vertexColors=true
  const celadon=new T.MeshPhysicalMaterial({color:0x9baea0,roughness:.27,clearcoat:.72,
    clearcoatRoughness:.17,ior:1.48,normalMap:clay.normalMap,normalScale:new T.Vector2(.13,.13)})
  const wet=surface(0x3e3027),grit=[surface(0x4d3827),surface(0x72604b),surface(0x30271f),surface(0x97826a)]
  const bead=new T.IcosahedronGeometry(1,0)
  return (x:number,z:number,r:number,h:number,glazed=false)=>{
    const m=glazed?celadon:clay
    // The closed saucer touches the table. The foot touches the 2.4 mm
    // saucer floor; the separately modelled soil sits below the open lip.
    const saucer=turn(g,m,x,benchTop,z,[[0,0],[r*.72,0],[r*1.13,3],[r*1.18,7],[r*1.17,8.2],[r*1.10,8.8],[r*.98,4],[r*.71,2.4],[0,2.4]],40)
    const foot=benchTop+2.4
    const pot=turn(g,m,x,foot,z,[[0,0],[r*.61,0],[r*.69,2.4],[r*.685,4.2],[r*.71,5.2],
      [r*.91,h-11],[r*.95,h-10],[r*1.013,h-9],[r*1.033,h-7],[r*1.035,h-3],
      [r*1.01,h-.5],[r*.968,h],[r*.917,h-1],[r*.885,h-3.1],[r*.86,h-9],[r*.68,7]],48)
    const vertices=pot.geometry.getAttribute('position')
    for(let i=0;i<vertices.count;i++){
      const a=Math.atan2(vertices.getZ(i),vertices.getX(i))
      const uneven=1+.008*Math.cos(3*a+x*.02)+.005*Math.sin(7*a+z*.03)
      vertices.setXYZ(i,vertices.getX(i)*uneven,vertices.getY(i)+.3*Math.sin(5*a+x),vertices.getZ(i)*uneven)
    }
    pot.geometry.computeVertexNormals()
    if(!glazed)for(const [geometry,height] of [[pot.geometry,h],[saucer.geometry,9]] as const){
      const v=geometry.getAttribute('position'),colors=new Float32Array(v.count*3)
      for(let i=0;i<v.count;i++){
        const t=v.getY(i)/height
        const tone=.76+.24*T.MathUtils.smoothstep(t,.03,.24)+.09*T.MathUtils.smoothstep(t,.84,.96)
        colors.set([tone,tone,tone],i*3)
      }
      geometry.setAttribute('color',new T.BufferAttribute(colors,3))
    }
    const soil=foot+h-3.7
    turn(g,wet,x,soil-2,z,[[0,0],[r*.90,0],[r*.90,1.4],[r*.58,3.1],[0,3.8]],36)
    const total=Math.round(r*1.7)
    for(let i=0;i<total;i++){
      const a=i*2.39996+x,rr=r*.84*Math.sqrt((i+.3)/total),size=(.6+((i*17)%13)*.13)*Math.min(1.5,r/34)
      const clod=new T.Mesh(bead,grit[i%4]);clod.position.set(x+rr*Math.cos(a),soil+1.4-(rr/r)**2*2.2,z+rr*Math.sin(a))
      clod.scale.set(size*1.6,size*.71,size);clod.rotation.set(i*.59,a,i*1.02);g.add(clod)
    }
    return soil+1.6
  }
}

function dialFace(){
  if(typeof document==='undefined')return null
  const c=document.createElement('canvas');c.width=c.height=768
  const ctx=c.getContext('2d')!;ctx.fillStyle='#e4dcc5';ctx.fillRect(0,0,768,768)
  ctx.translate(384,384);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#383a32'
  const angle=(v:number)=>(v/100*1.52-.76)*Math.PI
  for(let i=0;i<=100;i+=2){
    const a=angle(i),r=324,major=i%10===0
    ctx.save();ctx.rotate(a);ctx.fillRect(major?-2.8:-1.2,-r,major?5.6:2.4,major?30:i%4?14:19);ctx.restore()
    if(major){ctx.font='39px Georgia,serif';ctx.fillText(String(i),Math.sin(a)*264,-Math.cos(a)*264)}
  }
  ctx.strokeStyle='#857b65';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,340,0,Math.PI*2);ctx.stroke()
  ctx.font='small-caps 35px Georgia,serif';ctx.fillText('Hygromètre',0,-86)
  ctx.font='19px Georgia,serif';ctx.fillText('HUMIDITÉ RELATIVE',0,-47)
  ctx.font='28px Georgia,serif';ctx.fillText('%',0,85)
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;return map
}

export function hygrometer(g:T.Group,frame:T.Material,brass:T.Material){
  const gauge=new T.Group();gauge.position.set(94,78,-1234);g.add(gauge)
  const dark=surface(0x31332e),satin=surface(0xccbb8d,.49,.49)
  beam(g,frame,[94,benchTop+2,-1246],[94,80,-1246],6.5)
  box(g,brass,94,benchTop+2,-1246,35,5,25)
  beam(g,brass,[94,78,-1247],[94,78,-1236],8)
  const disk=(mat:T.Material,r:number,z:number,depth:number)=>{
    const m=new T.Mesh(new T.CylinderGeometry(r,r,depth,72),mat);m.rotation.x=Math.PI/2;m.position.z=z;gauge.add(m)
  }
  disk(dark,28.7,-1,8);disk(brass,29.1,2.9,1.5);disk(satin,28.5,4.3,2)
  const enamel=new T.MeshStandardMaterial({color:0xffffff,map:dialFace(),roughness:.69})
  const face=new T.Mesh(new T.CircleGeometry(25.4,80),enamel);face.position.z=5.75;gauge.add(face)
  const bezel=new T.Mesh(new T.TorusGeometry(26.6,1.55,10,80),brass);bezel.position.z=5.45;gauge.add(bezel)
  const needleShape=new T.Shape();needleShape.moveTo(-.95,-4.3);needleShape.lineTo(.2,21.2);needleShape.lineTo(.82,2.1)
  needleShape.lineTo(.82,-4.3);needleShape.closePath()
  const needle=new T.Mesh(new T.ShapeGeometry(needleShape),dark);needle.position.z=6.7
  needle.rotation.z=-(.72*1.52-.76)*Math.PI;gauge.add(needle)
  for(const dx of [-10.2,10.2]){
    const screw=new T.Mesh(new T.SphereGeometry(.78,10,6),satin)
    screw.scale.z=.34;screw.position.set(dx,-14.5,5.95);gauge.add(screw)
    const slot=box(gauge,dark,dx,-14.5,6.19,1.01,.16,.09);slot.rotation.z=.49
  }
  disk(satin,1.91,7.65,1.7);marker(gauge,'arch',0,0,8.5)
  const cover=new T.Mesh(new T.CircleGeometry(25.5,64),new T.MeshPhysicalMaterial({color:0xc6dbd2,
    metalness:.65,roughness:.14,transparent:true,opacity:.08,depthWrite:false}))
  cover.position.z=8.8;gauge.add(cover)
}
