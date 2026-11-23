// A virtual notch consumes equal travel in either direction around zero.
// The raw pointer coordinate stays continuous, so reversing does not accumulate error.
export function zeroDetent(raw:number,halfWidth:number) {
  return Math.sign(raw)*Math.max(0,Math.abs(raw)-halfWidth)
}
