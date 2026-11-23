import assert from 'node:assert/strict'
import {copyFile, mkdtemp, readFile, rmdir, unlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {chromium} from 'playwright-core'

const source = process.argv[2] ?? fileURLToPath(new URL('../../暗箱-大画幅取景台.html', import.meta.url))
const folder = await mkdtemp(path.join(tmpdir(), '暗箱 离线验收 '))
const standalone = path.join(folder, '改名后的 本地取景台.html')
const png = path.join(folder, '接片.png')
const shot = path.join(folder, '银盐工作间.png')
const url = pathToFileURL(standalone)
await copyFile(source, standalone)
const errors = [], forbidden = new Set()

function allowed(request) {
  const raw = request.url()
  if (raw.startsWith('data:') || raw.startsWith('blob:') || raw === 'about:blank') return true
  const target = new URL(raw)
  return request.isNavigationRequest() && target.protocol === 'file:' && target.pathname === url.pathname
}

const button = (page, name) => page.getByRole('button', {name, exact:true})
const selectScene = page => page.getByRole('combobox', {name:'场景'})
const film = page => page.locator('.exposure canvas')

async function waitForGlass(page) {
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))))
  await page.waitForFunction(() => !document.querySelector('.loading-scene') &&
    document.querySelector('.exposure canvas')?.dataset.converged === 'true', null, {timeout:240000})
}

async function photograph(page) {
  await waitForGlass(page)
  const pixels = await film(page).evaluate(canvas => {
    const scaled = document.createElement('canvas')
    scaled.width = 96
    scaled.height = 72
    const ctx = scaled.getContext('2d', {willReadFrequently:true})
    ctx.drawImage(canvas, 0, 0, 96, 72)
    return Array.from(ctx.getImageData(0, 0, 96, 72).data)
  })
  const reds = pixels.filter((_, i) => i % 4 === 0)
  assert.ok(new Set(reds).size > 65, 'the converged photograph is blank or lacks scene detail')
  return pixels
}

function difference(a, b) {
  let sum = 0
  for (let i = 0; i < a.length; i++) if (i % 4 !== 3) sum += Math.abs(a[i] - b[i])
  return sum / (a.length * .75)
}

async function setField(page, name, value) {
  await button(page, '选择' + name).click()
  const input = page.getByRole('spinbutton', {name:name + '数值', exact:true})
  await input.fill(String(value))
  await input.press('Enter')
  assert.equal(Number(await input.inputValue()), value)
}

async function verifyStitch(page, context) {
  await button(page, '后组').click()
  const [width, height] = await film(page).evaluate(c => [c.width, c.height])
  for (const shift of [-12, 12]) {
    await setField(page, '横移', shift)
    await waitForGlass(page)
    await button(page, '移轴接片').click()
    await button(page, shift < 0 ? '记录第一张' : '记录第二张').click()
    if (shift < 0) {
      await button(page, '记录第二张').waitFor()
      await button(page, '关闭').click()
    }
  }
  const save = page.getByRole('link', {name:'保存接片'})
  await save.waitFor({timeout:180000})
  const [download] = await Promise.all([page.waitForEvent('download'), save.click()])
  assert.ok(download.suggestedFilename().endsWith('.png'))
  await download.saveAs(png)
  const bytes = await readFile(png)
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  // Decode what was actually downloaded, on a fresh page independent of the simulator.
  const reader = await context.newPage()
  const decoded = await reader.evaluate(async encoded => {
    const bytes = Uint8Array.from(atob(encoded), ch => ch.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], {type:'image/png'}))
    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 72
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, 96, 72)
    const reds = ctx.getImageData(0, 0, 96, 72).data.filter((_, i) => i % 4 === 0)
    const result = {width:bitmap.width, height:bitmap.height, levels:new Set(reds).size}
    bitmap.close()
    return result
  }, bytes.toString('base64'))
  assert.equal(decoded.width, width + Math.round(width * 24 / 120))
  assert.equal(decoded.height, height)
  assert.ok(decoded.levels > 65, 'downloaded panorama has no usable pixels')
  await reader.close()
  console.log('PASS independent PNG download', decoded.width, '×', decoded.height)
}

let browser, passed = false
try {
  browser = await chromium.launch({channel:'msedge', headless:true,
    args:process.env.LFC_NATIVE_GPU==='1'?[]:['--use-angle=swiftshader', '--enable-unsafe-swiftshader']})
  const context = await browser.newContext({offline:true, serviceWorkers:'block', viewport:{width:1024, height:720}})
  context.on('request', request => {
    if (!allowed(request)) forbidden.add(request.url())
  })
  await context.route('**/*', route => {
    if (allowed(route.request())) return route.continue()
    forbidden.add(route.request().url())
    return route.abort('blockedbyclient')
  })
  const page = await context.newPage()
  page.on('pageerror', err => errors.push(err.message))
  page.on('console', log => {if (log.type() === 'error') errors.push(log.text().slice(0, 480))})
  await page.goto(url.href)
  assert.equal(await page.evaluate(() => navigator.onLine), false)
  const menu = selectScene(page)
  await menu.waitFor()
  assert.equal(await button(page,'正像辅助').getAttribute('aria-pressed'),'false')
  assert.equal(await menu.inputValue(), 'architecture')
  assert.deepEqual(await menu.locator('option').evaluateAll(list => list.map(o => o.value).sort()),
    ['architecture', 'greenhouse', 'still-life'])
  const images = []
  for (const id of ['architecture', 'still-life', 'greenhouse']) {
    await menu.selectOption(id)
    if (id !== 'architecture') assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('scene'), id)
    const image = await photograph(page)
    for (const other of images) assert.ok(difference(image, other) > 10, 'scene switch must change the photograph')
    images.push(image)
    if (id === 'still-life') {
      await page.screenshot({path:shot})
      await setField(page, '皮腔长度', 192.47)
      const refocused = await photograph(page)
      assert.ok(difference(image, refocused) > 2, 'focus change must affect the image')
      await button(page, '4×').click()
      const magnified = await photograph(page)
      assert.equal(await page.locator('.exposure').getAttribute('data-zoom'), '4')
      assert.ok(difference(refocused, magnified) > 3, 'loupe must magnify the actual image')
    }
    console.log('PASS local scene', id)
  }
  await page.reload()
  await waitForGlass(page)
  assert.equal(await menu.inputValue(), 'greenhouse')
  await button(page, '实验手册').click()
  await page.getByRole('link', {name:'打开光路校准台'}).click()
  await page.getByRole('heading', {name:'光路校准台', exact:true}).waitFor()
  assert.equal(new URL(page.url()).searchParams.get('view'), 'calibration')
  await page.getByRole('slider', {name:'皮腔长度', exact:true}).press('Home')
  assert.equal(await page.locator('#cal-read').textContent(), '∞')
  await page.getByRole('link', {name:'返回取景台', exact:false}).click()
  await waitForGlass(page)
  assert.equal(await menu.inputValue(), 'greenhouse')
  console.log('PASS file reload and calibration round-trip')
  await verifyStitch(page, context)
  assert.deepEqual([...forbidden], [], 'standalone attempted to load an external dependency')
  assert.deepEqual(errors, [], 'standalone emitted browser errors')
  passed = true
  console.log('PASS standalone: no external network or adjacent-file dependencies')
} finally {
  await browser?.close()
  if (passed && !process.env.KEEP_STANDALONE_QA) {
    for (const file of [png, shot, standalone]) await unlink(file)
    await rmdir(folder)
  } else {
    console.log('QA files:', folder)
    if (forbidden.size || errors.length) console.error({forbidden:[...forbidden], errors})
  }
}
