// Regenerate the finished prints with Node, Edge (Georgia/Segoe Script) and
// Python with Pillow. Set PYTHON to a specific interpreter when necessary.
// From the project root run: node artwork/workshop/bake.mjs
import {build} from 'esbuild'
import {chromium} from 'playwright-core'
import {execFileSync} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'

const folder=fileURLToPath(new URL('.',import.meta.url))
const artwork=fileURLToPath(new URL('../../public/scenery/',import.meta.url))
const result=await build({stdin:{resolveDir:folder,contents:`
  import {plateLabel,chemistryLabel,boxSpine,densityWedge,woodenRule,bottleScale} from './atelier-printing.ts'
  import {engravingSource} from './atelier-plate.ts'
  export async function prints(){
    const ready=new Promise(resolve=>{engravingSource.onLoad=resolve})
    const work={
      carton:plateLabel(),
      pyrogallol:chemistryLabel('PYROGALLOL','Révélateur pour plaques','Solution  A    ·    1 + 15'),
      fixateur:chemistryLabel('FIXATEUR','Hyposulfite de soude','Bain nº 2    ·    18 °C'),
      register:boxSpine('REGISTRE   ·   PLAQUES'), bromide:boxSpine('PAPIER AU BROMURE'),
      matte:boxSpine('GRAIN FIN   ·   MAT'), format:boxSpine('9 × 12   ·   N° 2746'),
      proofs:boxSpine('ÉPREUVES'), archives:boxSpine('ARCHIVES'),
      density:densityWedge(), rule:woodenRule(), scale:bottleScale()
    }
    await ready
    return Object.fromEntries(Object.entries(work).map(([name,m])=>[name,m.map.image.toDataURL('image/png').split(',')[1]]))
  }`},format:'esm',bundle:true,write:false})
const b=await chromium.launch({channel:'msedge'})
try{
  const page=await b.newPage()
  await page.route('http://workshop.test/**',async route=>{
    const path=new URL(route.request().url()).pathname
    if(path==='/module.js')return route.fulfill({contentType:'text/javascript',body:result.outputFiles[0].text})
    if(path==='/scenery/plate-label.webp')return route.fulfill({contentType:'image/webp',body:await readFile(artwork+'plate-label.webp')})
    return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8">'})
  })
  await page.goto('http://workshop.test/')
  const images=await page.evaluate(async()=>(await import('./module.js')).prints())
  for(const [name,png] of Object.entries(images)){
    const path=artwork+'atelier-'+name+'.webp'
    execFileSync(process.env.PYTHON??'python',['-c',`
import io, sys
from PIL import Image
original=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('RGBA')
original.save(sys.argv[1],'WEBP',lossless=True,method=6,exact=True)
with Image.open(sys.argv[1]) as check:
    assert check.size==original.size
    assert check.convert('RGBA').tobytes()==original.tobytes(), sys.argv[1]
`,path],{input:Buffer.from(png,'base64')})
    console.log('Verified '+name)
  }
}finally{
  await b.close()
}
