import {createElement as h, Fragment} from 'react'
import {createRoot} from 'react-dom/client'
import {Dial} from './Dial'
import {axisFocus, focusPlane, frames, initial, type V} from './optics'
import {traceFocusBundle} from './focus-rays'
import './calibration.css'

const canvas = document.querySelector('canvas')!
const ctx = canvas.getContext('2d')!
const readout = document.getElementById('cal-read')!
const status = document.getElementById('cal-status')!
const controls = createRoot(document.getElementById('cal-dials')!)
const rig = initial()
const colors = {lens: '#a7743d', film: '#4b7082', focus: '#407b5c'}

function draw() {
  const w = canvas.clientWidth, h = canvas.clientHeight
  if (!(w && h)) return
  const dpr = Math.min(devicePixelRatio, 2)
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0)
  const {lens,film} = frames(rig)
  const focus = focusPlane(lens,film,rig.focal), distance = axisFocus(lens,film,rig.focal)
  const left = 10, right = w - 10, bottom = h - 27, top = 11
  // At a nonzero tilt, the two standard planes meet at z=extension in
  // this side section. Fit that point when it is within the calibration volume.
  const jointY = -rig.extension * lens.n[2] / lens.n[1]
  const showJoint = Number.isFinite(jointY) && Math.abs(jointY) < 2200
  const yMin = showJoint ? Math.min(-150, jointY - 120) : -150
  const yMax = showJoint ? Math.max(150, jointY + 120) : 150
  const scale = Math.min((right - left) / 1825, (bottom - top) / (yMax - yMin))
  const y0 = (top + bottom) / 2 + scale * (yMax + yMin) / 2
  const X = (z: number) => (left + right) / 2 + (z + 607.5) * scale
  const Y = (y: number) => y0 - y * scale

  function line(x1: number,y1: number,x2: number,y2: number,color: string,width = 1) {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(x1,y1)
    ctx.lineTo(x2,y2)
    ctx.stroke()
  }

  const spacing = scale < .3 ? 100 : 50
  ctx.font = '10px Consolas, monospace'
  ctx.fillStyle = '#757568'
  ctx.textAlign = 'center'
  for (let z = Math.ceil((left-X(0))/scale/spacing)*spacing; X(z) <= right; z += spacing) {
    const major = z % 500 === 0
    line(X(z), top, X(z), bottom, major ? '#d1ccbe' : '#e3ded2')
    if (major && X(z) > 27 && X(z) < right-20) ctx.fillText((z / 1000).toFixed(1) + ' m', X(z), h - 8)
  }
  for (let y = Math.ceil((y0-bottom)/scale/spacing)*spacing; Y(y) >= top; y += spacing) {
    line(left,Y(y),right,Y(y),'#e3ded2')
  }
  line(left,Y(0),right,Y(0),'#b2ae9f')
  line(left,bottom,right,bottom,'#c7c1b1')

  // Intersect the exact plane trace with the bounds of the side-view plot.
  // Using a point on the plane also covers tilted focus planes whose axial
  // intercept is outside the displayed distance range.
  function plane(point: V, normal: V, color: string) {
    const x0 = X(point[2]), y0 = Y(point[1])
    const dx = -normal[1], dy = -normal[2]
    let begin = -Infinity, end = Infinity
    for (const [origin,delta,min,max] of [[x0,dx,left,right],[y0,dy,top,bottom]]) {
      if (Math.abs(delta) < 1e-10) {
        if (origin < min || origin > max) return false
      } else {
        const t1 = (min - origin) / delta, t2 = (max - origin) / delta
        begin = Math.max(begin,Math.min(t1,t2))
        end = Math.min(end,Math.max(t1,t2))
      }
    }
    if (end < begin) return false
    line(x0+begin*dx,y0+begin*dy,x0+end*dx,y0+end*dy,color,2.5)
    return true
  }

  const visible = focus && plane(focus.point,focus.normal,colors.focus)
  plane(lens.o,lens.n,colors.lens)
  plane(film.o,film.n,colors.film)
  ctx.save()
  ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip()
  const viewBounds={
    min:[-1,(y0-bottom)/scale,(left-(left+right)/2)/scale-607.5] as V,
    max:[1,(y0-top)/scale,(right-(left+right)/2)/scale-607.5] as V
  }
  for(const sampleY of [-rig.height*.3,0,rig.height*.3]){
    const bundle=traceFocusBundle(lens,film,rig,0,sampleY,viewBounds,Math.PI/2)
    for(const {pupil,end} of bundle.paths){
      line(X(bundle.sensor[2]),Y(bundle.sensor[1]),X(pupil[2]),Y(pupil[1]),'#9b753e',.9)
      line(X(pupil[2]),Y(pupil[1]),X(end[2]),Y(end[1]),'#9b753e',.9)
    }
    if(bundle.focus){
      ctx.beginPath();ctx.arc(X(bundle.focus[2]),Y(bundle.focus[1]),3,0,2*Math.PI)
      ctx.fillStyle='#a8702a';ctx.fill()
    }
  }
  ctx.restore()
  for (const [x,y,color] of [[X(0),Y(0),colors.lens],
    ...(Number.isFinite(distance) ? [[X(-lens.n[2]*distance),Y(-lens.n[1]*distance),colors.focus]] : [])] as [number,number,string][]) {
    if (x < left || x > right || y < top || y > bottom) continue
    ctx.fillStyle=color;ctx.strokeStyle='#f7f4ea';ctx.lineWidth=1.5
    ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();ctx.stroke()
  }
  if (showJoint) {
    const x=X(rig.extension), y=Y(jointY)
    ctx.fillStyle='#f7f4ea';ctx.strokeStyle='#544a37';ctx.lineWidth=1.5
    ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();ctx.stroke()
    ctx.font='600 12px system-ui';ctx.textAlign='right';ctx.fillStyle='#544a37'
    ctx.fillText('三面交线', x-9, y+4)
  }

  readout.textContent = Number.isFinite(distance) ? (distance/1000).toFixed(3) + ' m' : '∞'
  status.textContent = !focus ? '皮腔等于焦距，平行两组对焦于无穷远。'
    : !visible ? '物方焦平面超出当前侧视范围。'
    : rig.front.tilt === 0 ? '两组平行，物方焦平面与感光面平行。'
    : showJoint ? '三平面的共同交线在侧视图中投影为一个点。'
    : '前组已倾斜，三平面的共同交线超出当前侧视范围。'
}

function update() {
  controls.render(h(Fragment, null,
    h(Dial, {name:'皮腔长度',en:'FOCUS',value:rig.extension,unit:'mm',lo:150,hi:210,step:.01,
      resetValue:174,change:v=>{rig.extension=v;update()}}),
    h(Dial, {name:'前组俯仰',en:'TILT',value:rig.front.tilt,unit:'°',lo:-15,hi:15,step:.01,
      resetValue:0,change:v=>{rig.front.tilt=v;update()}})
  ))
  draw()
}

new ResizeObserver(draw).observe(canvas)
update()
