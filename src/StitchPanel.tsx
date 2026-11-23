import {useRef,useState} from 'react'
import type {Rig} from './optics'
import {Dialog} from './FieldManual'

type Exposure={src:string;shift:number;signature:string}
type Props={open:boolean;close:()=>void;sceneId:string;rig:Rig;capture:()=>Promise<string>}
async function combine(a:Exposure,b:Exposure,filmWidth:number){
  const load=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{
    const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src
  })
  const [left,right]=a.shift>b.shift?[a,b]:[b,a]
  const [l,r]=await Promise.all([load(left.src),load(right.src)])
  const w=Math.min(l.width,r.width),h=Math.round(w*l.height/l.width)
  const dx=Math.round((left.shift-right.shift)*w/filmWidth)
  const canvas=document.createElement('canvas');canvas.width=w+dx;canvas.height=h
  const ctx=canvas.getContext('2d')!
  ctx.drawImage(l,0,0,w,h);ctx.drawImage(r,dx,0,w,h)
  return canvas.toDataURL('image/png')
}
export function StitchPanel({open,close,sceneId,rig,capture}:Props){
  const [first,setFirst]=useState<Exposure|null>(null),[pano,setPano]=useState('')
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false)
  const signature=JSON.stringify([sceneId,{...rig,rear:{...rig.rear,shift:0}}])
  const settings=JSON.stringify([signature,rig.rear.shift])
  const current=useRef(settings);current.current=settings
  const matches=first?.signature===signature
  const shift=rig.rear.shift
  const separation=first?Math.abs(shift-first.shift):0
  const hint=rig.rear.swing!==0?'后组摆动调至 0° 后，横移会沿感光面平移。':
    first&&!matches?'两张照片需要相同的镜头、片幅、光圈和其他机构位置。可恢复第一张设置，或重新开始。':
    first&&separation<.1?'第一张已保留。关闭此窗，横移后组，再回来取第二张。':
    first&&separation>=rig.width?'请缩短横移距离，让两张底片有重叠。':''
  async function record(){
    if(busy||hint)return
    setBusy(true);setMessage('')
    try{
      const src=await capture()
      if(current.current!==settings)throw new Error('参数已变动，请重新取片。')
      const shot={src,shift,signature}
      if(!first)setFirst(shot)
      else {const out=await combine(first,shot,rig.width);if(current.current===settings)setPano(out)}
    }catch{setMessage('取样中断，请保持机位和取景窗尺寸稳定后再取片。')}
    finally{setBusy(false)}
  }
  if(!open)return null
  return <Dialog title="移轴接片" close={close}>
    <p>固定镜头和后背方向，用后组横移记录两张有重叠的全幅照片。网格、峰值和放大镜只用于取景。</p>
    {first&&<p>第一张横移 <b>{first.shift.toFixed(1)} mm</b>　当前横移 <b>{shift.toFixed(1)} mm</b></p>}
    {pano&&<img className="stitch-proof" src={pano} alt="移轴接片成片"/>}
    {(hint||message)&&<p role="status">{message||hint}</p>}
    <div className="stitch-buttons">{!pano&&<button disabled={busy||!!hint} onClick={record}>{busy?'正在取样…':first?'记录第二张':'记录第一张'}</button>}
      {pano&&<a download="Obscura-stitch.png" href={pano}>保存接片</a>}
      {first&&<button disabled={busy} onClick={()=>{setFirst(null);setPano('');setMessage('')}}>重新开始</button>}
    </div>
  </Dialog>
}
