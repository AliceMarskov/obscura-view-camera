import * as T from 'three'
import {batch,beam,bevelBox,box,marker,plaque,surface,turn} from './model.ts'
import {patch,photographic,pbr} from './photographic.ts'
import {contactLight} from './contact-light.ts'
import {daylight} from './daylight.ts'
import {parisFrontage} from './paris-frontage.ts'

export const streetGround=-1550
const streetPitch=19*Math.PI/180
// The bookstore fascia sits 3.47 m above the pavement. Both its depth and
// lens position on a tilted tripod enter the default conjugate distance.
const shopY=streetGround+16700*(1-.791)
export const streetFocus=Math.sin(streetPitch)*(shopY+162)+Math.cos(streetPitch)*(22000-Math.cos(.18)*111+90)-90

export function architecture(){
  const g=new T.Group();g.name='Boulevard du livre'
  const facade=photographic('boulevard-stone')
  const ashlar=pbr('limestone',[3000,1900]),slate=pbr('slate')
  const cobbles=pbr('cobbles',[1080,1370])
  contactLight(cobbles,streetGround-35,[[-2030,-3950,395,395],[8800,-14750,365,365],
    [-10900,-19200,365,365],[-4300,-14200,210,230],[1350,-15060,210,230],[7550,-15400,210,230],[12300,-17600,210,230]])
  const stone=surface(0xc8bbaa),lead=surface(0x6a716e,.7,.18),iron=surface(0x292b26,.55,.45)
  const chimney=surface(0xb27055),recess=surface(0x484b44),rail=surface(0x56584f,.65,.25)
  const lanternGlass=new T.MeshPhysicalMaterial({color:0xc4caca,roughness:.18,metalness:.05,transparent:true,opacity:.31,side:T.DoubleSide,depthWrite:false})
  const burner=surface(0xb3aa90,.39,.23)
  const roofMat=photographic('verdigris',[2200,2000],.69)
  const pavement=ashlar.clone();pavement.color.setHex(0xc6c5c1);pavement.userData.tile=[3400,2350]
  const balustrades=new T.Group(),glazedFrontage=parisFrontage(balustrades,ashlar)
  box(g,cobbles,0,streetGround-190,-18000,128000,310,144000)

  function elevation(x:number,z:number,angle:number,w:number,h:number,detail:'principal'|'street'|'distant'='distant'){
    const marked=detail==='principal',modelWindows=detail!=='distant'
    const block=new T.Group();block.position.set(x,streetGround,z);block.rotation.y=angle;g.add(block)
    // Behind the rectified elevation by 120 mm, also at a distance when
    // the observer's depth buffer cannot resolve millimetre separations.
    box(block,ashlar,0,h/2,modelWindows?-7050:-6360,w,h,modelWindows?11100:12480)
    // Crown, spandrel, stone apron, window recess and projecting window rail
    // take their own portions of the same rectified photograph. Relief stays
    // aligned as either standard moves, even seen obliquely from the street.
    const bands:[number,number,number][]=[
      [0,.035,290],[.035,.059,100],[.059,.186,0],[.186,.216,210],[.216,.239,85],
      [.239,.37,0],[.37,.401,205],[.401,.428,90],[.428,.56,0],
      [.56,.595,200],[.595,.62,90],[.62,.748,0],[.748,.765,155],
      [.765,.813,110],[.813,.965,0],[.965,1,78]
    ]
    for(const [top,bottom,depth] of bands){
      if(modelWindows&&top<.765)continue
      if(modelWindows&&top===.813){
        let left=0
        for(const f of [.220,.281,.338,.392,.450,.568,.623,.682,.741,.799]){
          patch(block,facade,w,h,left,.817,f-.025,.958,depth+1)
          left=f+.025
        }
        patch(block,facade,w,h,left,.817,1,.958,depth+1)
        patch(block,facade,w,h,0,top,1,.817,depth+1)
        patch(block,facade,w,h,0,.958,1,bottom,depth+1)
        continue
      }
      patch(block,facade,w,h,0,top,1,bottom,depth+1)
      if(depth>0)box(block,stone,0,h*(1-bottom)+5,depth/2,w,10,depth)
    }
    if(modelWindows)glazedFrontage(block,w,h,marked)
    else for(const px of [.085,.213,.332,.448,.566,.691,.813,.934]){
      for(const end of [.183,.369,.558,.748]){
        const half=.032
        const top=end-.038
        patch(block,facade,w,h,px-half,top,px+half,end,220)
        box(block,rail,(px-.5)*w,h*(1-top)+12,132,half*2*w+28,27,180)
        box(block,stone,(px-.5)*w,h*(1-end)-17,104,half*2*w+95,55,220)
      }
    }
    // Wrap the corner and run a real sidewalk around the whole building.
    for(const side of [-1,1]){
      const end=new T.Group();end.position.set(side*w/2,0,-6300);end.rotation.y=side*Math.PI/2;block.add(end)
      patch(end,facade,12600,h,0,0,1,1,2)
    }
    box(block,pavement,0,77,1350,w+250,154,3000)
    bevelBox(block,stone,0,68,2870,w+225,152,140,11)
    // Pitched mansard, spaced zinc dormers and chimney stacks.
    const roof=new T.Mesh(new T.PlaneGeometry(w+380,4560),slate)
    roof.rotation.x=-.54;roof.position.set(0,h+1955,-1150);block.add(roof)
    const uv=roof.geometry.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*w/1460,uv.getY(i)*4560/1320)
    box(block,roofMat,0,h+3880,-7140,w,145,10100)
    for(let i=0;i<8;i++){
      const dx=(i-3.5)*w/8
      box(block,roofMat,dx,h+975,-168,1050,1850,750)
      const window=patch(block,facade,815/.056,1300/.112,.055,.059,.111,.171,230)
      window.position.set(dx,h+1100,230)
      box(block,lead,dx,h+430,245,990,90,160)
      for(const side of [-1,1]){
        box(block,lead,dx+side*440,h+1090,216,73,1320,152)
        const brow=box(block,lead,dx+side*265,h+1870,40,615,105,810);brow.rotation.z=-side*.33
      }
    }
    for(const dx of [-.45,-.15,.23,.46]){
      box(block,ashlar,dx*w,h+4300,-3700,890,1300,730)
      for(const offset of [-220,220])
        turn(block,chimney,dx*w+offset,h+4910,-3700,[[110,0],[122,40],[100,73],[102,450],[129,470],[129,516],[93,516]],12)
    }
    if(marked){
      marker(block,'cylinder',0,h*(1-.791),111)
      marker(block,'arch',w*.191,h*(1-.091),-45)
    }
  }
  // The slightly oblique plane and the visible return form a real street
  // corner. A 23.8 m frontage and 16.7 m cornice fill a 90 mm lens at 22 m.
  elevation(1000,-22000,.18,23800,16700,'principal')
  elevation(-21150,-30200,-.77,18700,14400,'street')
  elevation(24200,-22400,-.28,21500,17500,'street')
  elevation(5300,-61200,-.09,26700,19700)
  elevation(-21600,-5100,.92,17800,15600)
  elevation(-42800,-38700,.27,23200,17800)
  elevation(-36200,-62800,-.03,23500,14800)
  elevation(-56400,-30600,.82,27100,16600)
  // Across the street, these row houses sit behind the camera. The local
  // radiance probe can see their rooftops reflected in the shop glazing.
  for(const x of [-9200,13200]){
    const opposite=new T.Group();opposite.position.set(x,streetGround,13700)
    opposite.rotation.y=Math.PI+.06;g.add(opposite)
    patch(opposite,facade,22450,16400,0,0,1,1,0)
    const slope=new T.Mesh(new T.PlaneGeometry(22600,3100),roofMat)
    slope.position.set(0,17680,-740);slope.rotation.x=-.52;opposite.add(slope)
    for(const dx of [-7250,-4830,3680,7600])box(opposite,ashlar,dx,18900,-1540,620,1030,555)
  }

  function lantern(px:number,pz:number,height:number,near=false){
    const foot=streetGround, stemH=height-640
    turn(g,iron,px,foot,pz,[[0,0],[159,0],[162,38],[141,67],[130,210],[100,330],[78,446],[57,480],
      [44,stemH-295],[63,stemH-270],[60,stemH-226],[40,stemH-202],[46,stemH-58],[77,stemH],[0,stemH]],24)
    const lamp=turn(g,lanternGlass,px,foot+stemH,pz,[[100,12],[175,356],[178,395]],4);lamp.rotation.y=Math.PI/4
    turn(g,iron,px,foot+stemH,pz,[[0,0],[104,7],[105,21],[66,41],[32,90],[0,94]],16)
    turn(g,burner,px,foot+stemH+82,pz,[[0,0],[23,0],[23,39],[41,60],[37,110],[23,138],[16,210],[0,215]],22)
    const cap=turn(g,iron,px,foot+stemH+390,pz,[[0,0],[196,0],[205,24],[165,51],[80,107],[42,141],[29,170],[0,219]],4);cap.rotation.y=Math.PI/4
    for(const sx of [-1,1])for(const sz of [-1,1])
      beam(g,iron,[px+sx*70,foot+stemH+15,pz+sz*70],[px+sx*126,foot+stemH+393,pz+sz*126],16)
    if(near){
      const signX=px+140,signY=foot+2260,signZ=pz+89
      plaque(g,signX,signY,signZ,420,206,'RUE DU BAC','VIIᵉ ARRONDISSEMENT','#163a43','#e8e4ce',iron)
      marker(g,'sphere',signX+24,signY,signZ)
    }
  }
  lantern(-2030,-3950,3820,true)
  lantern(8800,-14750,4260)
  lantern(-10900,-19200,4200)
  // Bicycle against the curb: two 700C wire wheels, fork and steel diamond frame.
  const bike=new T.Group();bike.position.set(5280,streetGround+515,-17700);bike.rotation.y=-.39;g.add(bike)
  for(const x of [-538,538]){
    const wheel=new T.Mesh(new T.TorusGeometry(329,23,8,48),iron);wheel.position.x=x;bike.add(wheel)
    const rim=new T.Mesh(new T.TorusGeometry(306,8,5,48),lead);rim.position.x=x;bike.add(rim)
    for(let i=0;i<24;i++){
      const a=i*Math.PI/12
      beam(bike,rail,[x,0,0],[x+306*Math.sin(a),306*Math.cos(a),0],2)
    }
  }
  for(const [a,b] of [[[-538,0],[-140,390]],[[-538,0],[-20,-20]],[[-20,-20],[-140,390]],
    [[-140,390],[270,430]],[[270,430],[-20,-20]],[[270,430],[538,0]],[[270,430],[310,566]],
    [[-140,390],[-163,510]],[[310,566],[415,590]]])beam(bike,rail,[a[0],a[1],0],[b[0],b[1],0],28)
  box(bike,iron,-164,535,0,224,44,132)
  for(const [bx,bz] of [[-4300,-14200],[1350,-15060],[7550,-15400],[12300,-17600]])
    turn(g,iron,bx,streetGround,bz,[[0,0],[90,0],[94,40],[63,80],[56,720],[75,756],[72,803],[0,855]],20)
  for(const [mx,mz] of [[-1100,-5600],[6200,-10650]]){
    turn(g,iron,mx,streetGround-32,mz,[[0,0],[305,0],[305,8],[0,8]],52)
    for(let i=-3;i<=3;i++)box(g,lead,mx+i*58,streetGround-22,mz,7,3,Math.sqrt(280**2-(i*58)**2)*2)
  }
  const city=batch(g);city.add(balustrades)
  return daylight(city,false,350000)
}
