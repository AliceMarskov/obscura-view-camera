const standalone=document.documentElement.hasAttribute('data-standalone')

export function preference(key:string):string|null {
  try {return localStorage.getItem('obscura.'+key)} catch {return null}
}

export function rememberPreference(key:string,value:string) {
  try {localStorage.setItem('obscura.'+key,value)} catch { /* Private file origins may disallow storage. */ }
}

export function startsUpright() {
  const requested=new URLSearchParams(location.search).get('upright')
  return requested===null?preference('upright')==='1':requested==='1'
}

export function currentScene() {
  const search=standalone?location.hash.slice(1):location.search
  return new URLSearchParams(search).get('scene')
}

export function rememberScene(id:string) {
  const url=new URL(location.href)
  if(standalone){
    const params=new URLSearchParams(url.hash.slice(1))
    params.set('scene',id)
    url.hash=params.toString()
  }else{
    url.searchParams.set('scene',id)
  }
  history.replaceState(history.state,'',url)
}

export function calibrationLink() {
  return standalone?'?view=calibration'+location.hash:'./calibration.html'
}
