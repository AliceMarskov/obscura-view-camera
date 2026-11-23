import * as T from 'three'
import {beam,bevelBox,box,surface,turn} from './model.ts'
import {patch,pbr} from './photographic.ts'
import {atelierPaper} from './atelier-printing.ts'

const floorY=-901, top=-141
function tableWear(p:T.Group){
  if(typeof document==='undefined')return
  const c=document.createElement('canvas');c.width=1024;c.height=640
  const ctx=c.getContext('2d')!
  let seed=571
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
  for(const [x,y,r] of [[163,375,45],[800,402,33],[764,589,43],[208,570,41],[792,425,34]]){
    for(let i=0;i<760;i++){
      const a=random()*Math.PI*2
      if(Math.cos(1.4+a*3)*.28+random()<.33)continue
      const rad=r+(random()+random()-1)*3.5
      ctx.fillStyle=random()>.7?'rgba(206,183,137,.24)':'rgba(36,31,22,.26)'
      ctx.fillRect(x+Math.cos(a)*rad,y+Math.sin(a)*rad,.4+random()*1.6,.75+random()*1.6)
    }
  }
  for(let i=0;i<140;i++){
    const x=random()*1024,y=random()*640,dx=(random()-.53)*49,dy=(random()-.5)*14
    ctx.strokeStyle=random()>.4?'rgba(208,178,126,.29)':'rgba(48,35,28,.23)';ctx.lineWidth=random()*.9+.22
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx*.59,y+dy*.57+.65);ctx.lineTo(x+dx,y+dy);ctx.stroke()
  }
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8
  const wear=new T.Mesh(new T.PlaneGeometry(580,363),new T.MeshStandardMaterial({map,transparent:true,depthWrite:false,
    roughness:.83,polygonOffset:true,polygonOffsetFactor:-1}))
  wear.rotation.x=-Math.PI/2;wear.position.set(38,top+.09,-842);p.add(wear)
}
export function studioRoom(g:T.Group,wood:T.MeshStandardMaterial,metal:T.Material,dark:T.Material,print:T.Material){
  const plaster=pbr('plaster',[1380,1130]);plaster.color.setHex(0xc0bbae)
  const paint=pbr('paint',[1120,430]);paint.color.setHex(0x91938a)
  const floor=wood.clone();floor.color.setHex(0x9d9587);floor.userData.tile=[1150,498]
  const bead=surface(0x50564d), endgrain=surface(0x655341,.9), sash=surface(0xb1a993,.64)
  // The cutaway is open on the camera side. The real window opening admits
  // the same raking daylight as the source reflected by the studio glass.
  box(g,plaster,0,650,-1800,4550,3100,110)
  box(g,plaster,110,2168,120,2960,36,3840)
  box(g,plaster,-1360,-435,120,95,935,3840)
  box(g,plaster,-1360,1950,120,95,570,3840)
  box(g,plaster,-1360,850,-1516,95,1700,572)
  box(g,plaster,-1360,850,1545,95,1700,1010)
  for(let k=0;k<25;k++)box(g,floor,-1500+k*151,floorY-13,150,150,26,4010)
  // Green-grey painted wainscoting, mopboard, cap and vertical beading.
  box(g,paint,0,-527,-1739,4350,746,24)
  for(let x=-2070;x<2070;x+=103)box(g,bead,x,-528,-1726,2,739,3)
  box(g,paint,0,-859,-1717,4350,84,28);box(g,paint,0,-149,-1722,4350,24,40)
  box(g,paint,-1306,-493,20,16,815,3710);box(g,paint,-1293,-84,20,33,37,3710)
  const window=new T.Group();window.position.set(-1307,850,-96);window.rotation.y=Math.PI/2;g.add(window)
  for(const x of [-1135,1135])box(window,sash,x,0,4,82,1684,95)
  for(const y of [-820,820])box(window,sash,0,y,4,2330,72,95)
  for(const x of [-735,-360,38,414,774])box(window,sash,x,0,-9,19,1630,48)
  for(const y of [-360,225])box(window,sash,0,y,-9,2250,20,47)
  box(window,wood,0,-864,59,2430,59,218)
  // Old board top, breadboard ends and a working drawer with a cup pull.
  for(let i=0;i<6;i++)bevelBox(g,wood,0,top-19,-1510+i*157,1790,38,156.4,1.4)
  tableWear(g)
  for(const x of [-916,916])box(g,wood,x,top-19,-1117,42,38,946)
  for(const x of [-855,-423,423,855])for(const z of [-1510,-1353,-1196,-1039,-882,-725]){
    turn(g,bead,x,top,z,[[0,0],[1.7,0],[1.65,.05],[0,.11]],12)
  }
  for(const x of [-845,845])for(const z of [-1518,-709])box(g,wood,x,-523,z,68,748,65)
  for(const x of [-844,844]){
    box(g,wood,x,-217,-1113,41,122,781)
    box(g,wood,x,-706,-1110,35,55,804)
  }
  box(g,wood,0,-705,-1515,1670,54,43)
  box(g,wood,0,-217,-691,1730,117,32)
  for(const x of [-541,0,541]){
    box(g,wood,x,-221,-669,505,93,19)
    beam(g,metal,[x-29,-220,-657],[x-23,-231,-645],5)
    beam(g,metal,[x+29,-220,-657],[x+23,-231,-645],5)
    beam(g,metal,[x-23,-231,-645],[x+23,-231,-645],6)
  }
  // Shelves, brackets, stock bottles and a row of bound plate registers.
  const spine=atelierPaper('register'), glass=new T.MeshPhysicalMaterial({color:0x393c27,roughness:.22,clearcoat:.8})
  for(const [x,y,width] of [[-632,243,710],[693,215,458],[-576,556,542]]){
    box(g,wood,x,y,-1630,width,22,206)
    for(const px of [x-width*.36,x+width*.36]){
      box(g,dark,px,y-61,-1731,13,131,10)
      beam(g,dark,[px,y-112,-1724],[px,y-11,-1545],10)
    }
  }
  for(const [i,x] of [-926,-846,-752,-414,-318,548,623,717,805].entries()){
    const y=i>=5?226:254, r=20+(i%3)*5, h=84+(i%4)*15
    turn(g,glass,x,y,-1625,[[0,0],[r*.86,0],[r,3],[r,h*.65],[r*.97,h*.72],[r*.41,h*.84],[r*.41,h],[r*.48,h],[r*.48,h+5],[0,h+5]],28)
    turn(g,endgrain,x,y+h+5,-1625,[[r*.37,0],[r*.41,11],[0,11]],20)
  }
  for(let i=0;i<7;i++){
    const x=-753+i*39,h=142+i%3*16,w=35+i%2*3
    box(g,i%3===0?paint:wood,x,567+h/2,-1620,w,h,111)
    for(const dy of [17,25,h-16])box(g,metal,x,567+dy,-1563,w-4,1.6,1)
  }
  const register=patch(g,spine,145,22,0,0,1,1,-1519);register.position.set(-565,236,-1518)
  // Two trial proofs on a drying line; folded wooden pegs cast separate shadows.
  beam(g,dark,[-463,368,-1706],[397,333,-1706],1.4)
  const proof=new T.Group();proof.position.set(-117,240,-1701);proof.rotation.z=.035;g.add(proof)
  box(proof,sash,0,48,0,125,98,1.2);patch(proof,print,113,83,0,0,1,1,1).position.y+=6
  box(proof,endgrain,14,99,3,6,19,5)
  const wedge=new T.Group();wedge.position.set(43,297,-1701);wedge.rotation.z=-.07;g.add(wedge)
  patch(wedge,atelierPaper('density'),149,42,0,0,1,1,1)
  box(wedge,endgrain,-29,42,3,6,19,5)
  const pane=new T.Mesh(new T.PlaneGeometry(2265,1638),new T.MeshBasicMaterial({color:new T.Color(5.8,6.45,7.1),side:T.DoubleSide}))
  pane.position.copy(window.position);pane.quaternion.copy(window.quaternion);pane.translateZ(-64)
  return pane
}
