import {build} from 'esbuild'
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises'
import path from 'node:path'

const output=path.resolve(process.argv[2]??'dist/暗箱-大画幅取景台.html')
const text=file=>readFile(file,'utf8')
const mime={'.webp':'image/webp','.hdr':'application/octet-stream'}

async function packScenery(){
  const entries=await readdir('public/scenery',{withFileTypes:true})
  // These source plates are retained with the artwork. The runtime uses the
  // baked carton and the current physically based surface maps.
  const sourceOnly=new Set(['plate-label.webp','stone-courses.webp','granite-setts.webp','studio-plaster.webp','studio-walnut.webp','roof-slate.webp'])
  const runtime=entries.filter(entry=>!entry.isDirectory()&&!sourceOnly.has(entry.name))
  return Object.fromEntries(await Promise.all(runtime.map(async({name})=>{
    const type=mime[path.extname(name)]
    if(!type)throw new Error('Unknown scenery format: '+name)
    const bytes=await readFile(path.join('public/scenery',name))
    return ['./scenery/'+name,'data:'+type+';base64,'+bytes.toString('base64')]
  })))
}

const [bundle,index,calibration,icon,assets,licenses]=await Promise.all([
  build({entryPoints:{main:'src/standalone-workbench.ts',calibration:'src/calibration.ts'},
    outdir:'dist',write:false,bundle:true,format:'iife',platform:'browser',target:'es2022',
    jsx:'automatic',minify:true,legalComments:'inline',define:{'process.env.NODE_ENV':'"production"'}}),
  text('index.html'),text('calibration.html'),readFile('public/aperture.svg'),packScenery(),
  Promise.all([
    text('LICENSE'),text('ASSETS.md'),
    ...['react','react-dom','scheduler','three','lucide-react'].map(async name=>
      name+'\n'+await text('node_modules/'+name+'/LICENSE'))
  ])
])
const files=Object.fromEntries(bundle.outputFiles.map(file=>[path.basename(file.path),file.text]))
const favicon='data:image/svg+xml;base64,'+icon.toString('base64')
function replaceOnce(source,token,replacement){
  if(source.split(token).length!==2)throw new Error('Template changed: '+token)
  return source.replace(token,()=>replacement)
}
const inlineScript=source=>source.replace(/<\/script/gi,'<\\/script')
const calibrationBody=calibration.match(/<body\s+class="cal-page">([\s\S]*?)<\/body>/)?.[1]
if(!calibrationBody)throw new Error('Missing calibration page')
const controls=replaceOnce(calibrationBody,'<script type="module" src="./assets/calibration.js"></script>','')
  .replaceAll('src="./aperture.svg"','src="'+favicon+'"')

const boot=`<template id="calibration-screen"><style>${files['calibration.css']}</style>${controls}</template>
<script type="application/json" id="scenery-assets">${JSON.stringify(assets)}</script>
<script type="text/plain" id="third-party-notices">${inlineScript(licenses.join('\n\n'))}</script>
<script>
if(new URLSearchParams(location.search).get('view')==='calibration'){
  document.title='光路校准台 · 暗箱';
  document.querySelector('meta[name="theme-color"]').content='#f4f1eb';
  document.getElementById('screen-style').remove();
  const content=document.getElementById('calibration-screen').content;
  document.body.className='cal-page';
  document.body.replaceChildren(content);
  const back=new URL(location.href);
  back.searchParams.delete('view');
  for(const link of document.querySelectorAll('a[href="./"]'))link.href=back.href;
  ${inlineScript(files['calibration.js'])}
}else{
  document.getElementById('calibration-screen').remove();
  ${inlineScript(files['main.js'])}
}
</script>`
let html=replaceOnce(index,'<html lang="zh-CN">','<html lang="zh-CN" data-standalone>')
html=replaceOnce(html,'href="./aperture.svg"','href="'+favicon+'"')
html=replaceOnce(html,'<link rel="stylesheet" href="./assets/main.css">',
  '<style id="screen-style">'+files['main.css']+'</style>')
html=replaceOnce(html,'<script type="module" src="./assets/main.js"></script>',boot)
await mkdir(path.dirname(output),{recursive:true})
await writeFile(output,html)
console.log(output+' ('+Object.keys(assets).length+' assets, '+(Buffer.byteLength(html)/1e6).toFixed(2)+' MB)')
