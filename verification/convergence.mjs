import {chromium} from 'playwright-core'
import {pathToFileURL} from 'node:url'
import path from 'node:path'

// Compare the same settled full frame → 4× transition on two local editions.
// Includes presentation stalls from the GPU and display, excludes initial loading.
const [location, screenshot] = process.argv.slice(2)
if (!location) throw Error('Supply an HTML path or running workbench URL')
const url = /^https?:/.test(location) ? location : pathToFileURL(path.resolve(location)).href
const software=process.env.LFC_NATIVE_GPU!=='1'
const browser = await chromium.launch({channel:'msedge', args:software ? ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] : []})
try {
  const page = await browser.newPage({viewport:{width:1024,height:690}, deviceScaleFactor:1})
  await page.goto(url)
  // Hold sensor resolution fixed even if a newer edition changes the workbench layout.
  await page.addStyleTag({content:'.exposure{width:554px!important;height:443px!important;max-width:none!important}.exposure>canvas{width:554px!important;height:443px!important}'})
  await page.waitForFunction(() => !document.querySelector('.loading-scene') &&
    document.querySelector('.exposure canvas')?.dataset.converged==='true', null, {timeout:240000})
  const result = await page.evaluate(async () => {
    const film = document.querySelector('.exposure canvas')
    const button = label=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label)
    const gl=film.getContext('webgl2'), info=gl?.getExtension('WEBGL_debug_renderer_info')
    const runs=[]
    for(let run=0;run<3;run++){
      button('1×').click()
      await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)
      const started = performance.now()
      button('4×').click()
      let frames = 0, previous = started, intervals = []
      do {
        await new Promise(requestAnimationFrame)
        const now = performance.now()
        intervals.push(now-previous)
        previous = now
        frames++
      } while (film.dataset.converged!=='true' || frames<2)
      // The flag marks the end of CPU submission. A single read AFTER the
      // final sample measures arrival on the GPU without stalling each frame.
      gl.readPixels(film.width>>1,film.height>>1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4))
      intervals.sort((a,b)=>a-b)
      runs.push({wallMs:Math.round(performance.now()-started),frames,medianFrameMs:Math.round(intervals[Math.floor(frames/2)]),samples:Number(film.dataset.samples)})
    }
    return {runs, pixels:[film.width,film.height], adapter:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):'undisclosed',browser:navigator.userAgent}
  })
  console.log(JSON.stringify({...result,graphics:software?'SwiftShader':'browser default'}))
  if (screenshot) await page.locator('.exposure').screenshot({path:screenshot})
} finally { await browser.close() }
