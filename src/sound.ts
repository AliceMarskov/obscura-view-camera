import {preference,rememberPreference} from './navigation'

export type MechanicalSound='coarse'|'fine'|'detent'|'back'|'shutter'
let enabled=preference('sound')==='1'
let context:AudioContext|undefined
let lastTick=-Infinity
export const soundEnabled=()=>enabled
export function setSoundEnabled(value:boolean) {
  enabled=value
  rememberPreference('sound',value?'1':'0')
  if(value)mechanicalSound('detent')
}
export function mechanicalSound(kind:MechanicalSound) {
  if(!enabled||typeof AudioContext==='undefined')return
  const tick=kind==='coarse'||kind==='fine'
  if(tick&&performance.now()-lastTick<42)return
  if(tick)lastTick=performance.now()
  try {
    context??=new AudioContext()
    if(context.state==='suspended')void context.resume().catch(()=>{})
    const start=context.currentTime
    const [pitch,duration]=({coarse:[890,.009],fine:[1750,.007],detent:[485,.025],back:[295,.045],shutter:[1360,.037]})[kind]
    const oscillator=context.createOscillator(),gain=context.createGain()
    oscillator.type=tick?'sine':'triangle'
    oscillator.frequency.setValueAtTime(pitch,start)
    oscillator.frequency.exponentialRampToValueAtTime(pitch*.48,start+duration)
    gain.gain.setValueAtTime(.0001,start)
    gain.gain.exponentialRampToValueAtTime(tick?.036:.07,start+.0015)
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration)
    oscillator.connect(gain).connect(context.destination)
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect()}
    oscillator.start(start);oscillator.stop(start+duration)
  } catch { /* Audio is optional on embedded and file-origin browsers. */ }
}
