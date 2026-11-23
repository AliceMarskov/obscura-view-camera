import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'

const file=process.argv[2]||'dist/暗箱-大画幅取景台.html'
const bytes=await readFile(file),html=bytes.toString('utf8')
const budget=18_000_000
assert.ok(bytes.length<=budget,`${file} exceeds 18 MB (${bytes.length} bytes)`)
assert.match(html,/<html lang="zh-CN" data-standalone>/)
assert.match(html,/<template id="calibration-screen">/)
const notices=html.match(/id="third-party-notices">([\s\S]*?)<\/script>/)?.[1]??''
for(const name of ['LICENSE','ASSETS.md']){
  const text=(await readFile(name,'utf8')).trim().replaceAll('\r\n','\n')
  assert.ok(notices.replaceAll('\r\n','\n').includes(text),`Missing embedded ${name}`)
}
for(const name of ['react','react-dom','scheduler','three','lucide-react']){
  assert.ok(notices.includes('\n'+name+'\n'),`Missing notice for ${name}`)
}
const assets=JSON.parse(html.match(/id="scenery-assets">([\s\S]*?)<\/script>/)?.[1]??'{}')
for(const required of ['paris-daylight.hdr','paris-bookshop.webp','atelier-carton.webp','leaf-calathea.webp','pbr-walnut-normal.webp']){
  assert.ok(assets['./scenery/'+required],`Missing runtime scene asset: ${required}`)
}
for(const [file,url] of Object.entries(assets)){
  assert.ok(url.startsWith('data:')&&url.includes(';base64,'),`External asset: ${file}`)
}
console.log(`${bytes.length} bytes · ${Object.keys(assets).length} embedded assets · SHA-256 ${createHash('sha256').update(bytes).digest('hex')}`)
