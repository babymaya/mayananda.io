const ue={feed:.029,kill:.057,cell:3,size:1.5,speed:3,lasts:10,lifeCell:6,bg:2,maxRed:30,trail:6.5,takeover:.35,killEnd:.5,start:.05,lifeFeed:.04},le=.15,J=.22,ce=5,U=1/3,fe=.12,Z=5,se=.15,de=.6,ve=4e3,me=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5].map(n=>(n+.5)/16),he=1,ge=.5,pe=160,Ee=[1,1,1],Te=[.028,.162,.745],xe=[.527,.005,.005],Re=`#version 300 es
in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`,be=`#version 300 es
precision highp float;
uniform sampler2D uPrev, uLife; uniform vec2 uGrid; uniform float uFeed, uKill, uDecay, uLifeFeed, uStart;
uniform vec3 uSeed;      // x, y in uv, radius in cells; radius < 0 = no seed
in vec2 vUv; out vec4 o;
// Outside the screen = empty rest state, so nothing wraps to the opposite edge.
vec3 at(vec2 uv, vec2 off) {
  vec2 p = uv + off / uGrid;
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return vec3(1.0, 0.0, 0.0);
  return texture(uPrev, p).rgb;
}
// Coupling to the Game of Life: straight line from 0 at uStart to 1 at the end.
float coupling(float life) {
  return life > 0.0 ? clamp((1.0 - life - uStart) / max(1.0 - uStart, 0.001), 0.0, 1.0) : 0.0;
}
void main() {
  vec2 cell = floor(vUv * uGrid); vec2 uv = (cell + 0.5) / uGrid;
  vec3 c = at(uv, vec2(0));
  vec3 n = at(uv, vec2(0,1)), s = at(uv, vec2(0,-1)), e = at(uv, vec2(1,0)), w = at(uv, vec2(-1,0));
  vec2 lap = -c.rg + 0.2 * (n.rg + s.rg + e.rg + w.rg)
           + 0.05 * (at(uv, vec2(1,1)).rg + at(uv, vec2(-1,1)).rg + at(uv, vec2(1,-1)).rg + at(uv, vec2(-1,-1)).rg);
  float u = c.r, v = c.g, uvv = u * v * v;
  u += lap.r - uvv + uFeed * (1.0 - u);
  v += 0.5 * lap.g + uvv - (uFeed + uKill) * v;
  v += uLifeFeed * texture(uLife, uv).r * coupling(c.b);

  // Lifetime travels with the pattern; where it reaches 0 the cell rests.
  float life = max(c.b, max(max(n.b, s.b), max(e.b, w.b)) * step(0.002, v)) - uDecay;
  life = max(life, 0.0);
  float keep = smoothstep(0.0, 0.15, life);
  u = mix(1.0, u, keep);
  v *= keep;

  // Seed: an irregular, noisy blob (a perfect circle grows a mirror image).
  if (uSeed.z > 0.0) {
    vec2 d = (cell + 0.5) - uSeed.xy * uGrid;
    float h = fract(sin(dot(cell + uSeed.xy * 977.0, vec2(127.1, 311.7))) * 43758.5453);
    float h2 = fract(h * 91.7);
    float edgeR = uSeed.z * (0.6 + 0.8 * fract(sin(dot(floor(d / 2.0) + uSeed.xy * 31.0, vec2(12.9898, 78.233))) * 43758.5453));
    if (length(d) < edgeR && h < 0.6) { u = 0.4 + 0.2 * h2; v = 0.15 + 0.2 * fract(h2 * 13.3); life = 1.0; }
  }
  o = vec4(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0), life, 1.0);
}`,Ae=`#version 300 es
precision highp float;
uniform sampler2D uPrev, uRd; uniform vec2 uGrid, uRdGrid;
uniform int uRule; uniform float uTime, uConvert, uThresh, uDeath, uSpawnP, uHeatDecay, uStart, uKillEnd;
in vec2 vUv; out vec4 o;
float hash21t(vec2 p, float t) { return fract(sin(dot(p + t, vec2(12.9898, 78.233))) * 43758.5453123); }
// Outside the screen = dead, so nothing wraps.
float at(vec2 uv, vec2 off) {
  vec2 p = uv + off / uGrid;
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return 0.0;
  return texture(uPrev, p).r > 0.5 ? 1.0 : 0.0;
}
void main() {
  vec2 cell = floor(vUv * uGrid); vec2 uv = (cell + 0.5) / uGrid;
  vec4 prev = texture(uPrev, uv);
  float alive = prev.r > 0.5 ? 1.0 : 0.0, next = alive, heat = prev.g;
  if (uRule == 1) {
    float n = at(uv, vec2(-1,-1)) + at(uv, vec2(0,-1)) + at(uv, vec2(1,-1)) + at(uv, vec2(-1,0))
            + at(uv, vec2(1,0)) + at(uv, vec2(-1,1)) + at(uv, vec2(0,1)) + at(uv, vec2(1,1));
    next = alive > 0.5 ? ((n == 2.0 || n == 3.0) ? 1.0 : 0.0) : (n == 3.0 ? 1.0 : 0.0);
    // Faint background: gliders at random places while too little is alive.
    float tick = floor(uTime * 3.0);
    vec2 tile = floor(cell / 3.0);
    if (uSpawnP > 0.0 && hash21t(tile, tick) < uSpawnP) {
      vec2 l = mod(cell, 3.0);
      float h = hash21t(tile, tick + 5.0);
      if (h > 0.5) l.x = 2.0 - l.x;
      if (fract(h * 7.0) > 0.5) l.y = 2.0 - l.y;
      bool g = (l.x == 1.0 && l.y == 0.0) || (l.x == 2.0 && l.y == 1.0) || l.y == 2.0;
      next = g ? 1.0 : 0.0;
    }
    // Red cap: random die-off near the maximum.
    if (next > 0.5 && hash21t(cell, tick + 11.0) < uDeath) next = 0.0;
    heat = prev.g * uHeatDecay;
  }
  vec4 rd = texture(uRd, uv);
  float k = rd.b > 0.0 ? clamp((1.0 - rd.b - uStart) / max(1.0 - uStart, 0.001), 0.0, 1.0) : 0.0;
  if (rd.g > uThresh && hash21t(cell, floor(uTime * 8.0)) < uConvert * k) next = 1.0;

  // While young, a pattern clears life in its whole area (within 2 pattern cells).
  float regionB = 0.0;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++)
    regionB = max(regionB, texture(uRd, uv + vec2(x, y) / uRdGrid).b);
  if (regionB > 0.0 && 1.0 - regionB < uKillEnd) next = 0.0;

  // Pattern edges always kill life.
  if (rd.b > 0.0) {
    vec2 px = 1.0 / uRdGrid;
    bool on = rd.g > uThresh;
    bool edge = ((texture(uRd, uv + vec2(px.x, 0.0)).g > uThresh) != on)
             || ((texture(uRd, uv - vec2(px.x, 0.0)).g > uThresh) != on)
             || ((texture(uRd, uv + vec2(0.0, px.y)).g > uThresh) != on)
             || ((texture(uRd, uv - vec2(0.0, px.y)).g > uThresh) != on);
    if (edge) next = 0.0;
  }
  o = vec4(next, max(next, heat), 0.0, 1.0);
}`,we=`#version 300 es
precision highp float;
uniform sampler2D uRd, uLife; uniform vec2 uResolution;
uniform float uCell, uLifeCell, uPixel, uGap, uThresh, uLevel, uBase, uSpot;
uniform vec2 uMouse;     // device px, origin bottom left; far away when there is no mouse
uniform vec3 uWhite, uBlue, uRed;
out vec4 o;
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float Bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
#define Bayer4(a) (Bayer2(0.5 * (a)) * 0.25 + Bayer2(a))
#define Bayer8(a) (Bayer4(0.5 * (a)) * 0.25 + Bayer2(a))
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec4 rd = texture(uRd, (floor(fc / uCell) + 0.5) * uCell / uResolution);
  vec4 life = texture(uLife, (floor(fc / uLifeCell) + 0.5) * uLifeCell / uResolution);
  bool rdGap = any(lessThan(fract(fc / uCell), vec2(uGap)));
  bool lifeGap = any(lessThan(fract(fc / uLifeCell), vec2(uGap)));
  vec3 col = vec3(0.0);
  float a = 0.0;
  if (rd.g > uThresh && !rdGap) {
    col = mix(uBlue, uWhite, smoothstep(0.35, 1.0, rd.b));
    a = 0.9;
  } else if (life.r > 0.5 && !lifeGap) {
    col = uRed; a = 0.85;
  } else if (life.g > 0.02) {
    col = uRed; a = 0.55 * step(Bayer8(fc / uPixel), life.g * 0.9);
  }
  // 50% everywhere, 100% in a soft circle around the mouse.
  float spot = 1.0 - smoothstep(uSpot * 0.5, uSpot, distance(fc, uMouse));
  a *= uLevel * mix(uBase, 1.0, spot);
  o = vec4(toSRGB(col) * a, a);
}`;function Se(){const n=ue,a=document.createElement("canvas");a.className="fx-overlay",a.setAttribute("aria-hidden","true"),document.body.appendChild(a);const e=a.getContext("webgl2",{alpha:!0,antialias:!1,depth:!1,stencil:!1,premultipliedAlpha:!0,powerPreference:"low-power"});if(!e||!e.getExtension("EXT_color_buffer_float"))return a.remove(),null;function P(r){const t=(u,l)=>{const d=e.createShader(u);if(e.shaderSource(d,l),e.compileShader(d),!e.getShaderParameter(d,e.COMPILE_STATUS))throw new Error(e.getShaderInfoLog(d));return d},i=e.createProgram();if(e.attachShader(i,t(e.VERTEX_SHADER,Re)),e.attachShader(i,t(e.FRAGMENT_SHADER,r)),e.bindAttribLocation(i,0,"aPos"),e.linkProgram(i),!e.getProgramParameter(i,e.LINK_STATUS))throw new Error(e.getProgramInfoLog(i));const c={},s=e.getProgramParameter(i,e.ACTIVE_UNIFORMS);for(let u=0;u<s;u++){const l=e.getActiveUniform(i,u).name;c[l]=e.getUniformLocation(i,l)}return{p:i,loc:c}}let B,D,L;try{B=P(be),D=P(Ae),L=P(we)}catch(r){return console.warn("[overlay] disabled:",r.message),a.remove(),null}e.bindVertexArray(e.createVertexArray()),e.bindBuffer(e.ARRAY_BUFFER,e.createBuffer()),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.clearColor(0,0,0,0);function w(r,t,i,c){const s=e.createTexture();e.bindTexture(e.TEXTURE_2D,s),c?e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,r,t,0,e.RGBA,e.UNSIGNED_BYTE,i):e.texImage2D(e.TEXTURE_2D,0,e.RGBA32F,r,t,0,e.RGBA,e.FLOAT,i),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE);const u=e.createFramebuffer();return e.bindFramebuffer(e.FRAMEBUFFER,u),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.bindFramebuffer(e.FRAMEBUFFER,null),{t:s,fb:u}}const O=r=>{for(const t of r.a)e.deleteTexture(t.t),e.deleteFramebuffer(t.fb)},f={a:[],src:0,grid:[1,1]},o={a:[],src:0,grid:[1,1]};let v=1;function $(){O(f);const r=Math.max(8,Math.ceil(a.width/(n.size*v))),t=Math.max(8,Math.ceil(a.height/(n.size*v)));f.grid=[r,t];const i=new Float32Array(r*t*4);for(let l=0;l<r*t;l++)i[l*4]=1,i[l*4+3]=1;f.a=[w(r,t,i),w(r,t,null)],f.src=0,O(o);const c=Math.max(8,Math.ceil(a.width/(n.lifeCell*v))),s=Math.max(8,Math.ceil(a.height/(n.lifeCell*v)));o.grid=[c,s];const u=new Uint8Array(c*s*4);for(let l=0;l<c*s;l++){const d=Math.random()<fe?255:0;u[l*4]=d,u[l*4+1]=d,u[l*4+3]=255}o.a=[w(c,s,u,!0),w(c,s,null,!0)],o.src=0}function G(){v=Math.min(window.devicePixelRatio||1,2);const r=Math.max(1,Math.round(a.clientWidth*v)),t=Math.max(1,Math.round(a.clientHeight*v));r===a.width&&t===a.height||(a.width=r,a.height=t,$())}let H=0,S=0,W=0,K=0;function ee(r){const[t,i]=o.grid,c=new Uint8Array(t*i*4);e.bindFramebuffer(e.FRAMEBUFFER,o.a[o.src].fb),e.readPixels(0,0,t,i,e.RGBA,e.UNSIGNED_BYTE,c),e.bindFramebuffer(e.FRAMEBUFFER,null);let s=0,u=0;for(let h=0;h<t*i;h++)c[h*4]>127?(s++,u++):c[h*4+1]>64&&u++;const l=100*s/(t*i),d=100*u/(t*i);H=.0015*Math.max(0,n.bg-l)/Math.max(n.bg,.01);const X=n.maxRed-Z;S=se*Math.min(1,Math.max(0,(d-X)/Z)),r<K&&(S=0)}let x=null;window.addEventListener("pointermove",r=>{if(r.pointerType!=="mouse")return;const t=a.getBoundingClientRect();x=[r.clientX-t.left,r.clientY-t.top]},{passive:!0}),document.documentElement.addEventListener("pointerleave",()=>{x=null});let p=null;window.addEventListener("pointerdown",r=>{if(r.button!==0||!R)return;const t=a.getBoundingClientRect();p=[(r.clientX-t.left)/t.width,1-(r.clientY-t.top)/t.height]},{capture:!0,passive:!0});const te=Math.pow(.02,U/n.trail);let Y=0,F=0;function V(r){e.useProgram(D.p);const t=D.loc;e.bindFramebuffer(e.FRAMEBUFFER,o.a[1-o.src].fb),e.viewport(0,0,o.grid[0],o.grid[1]),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,o.a[o.src].t),e.uniform1i(t.uPrev,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,f.a[f.src].t),e.uniform1i(t.uRd,1),e.uniform2f(t.uGrid,o.grid[0],o.grid[1]),e.uniform2f(t.uRdGrid,f.grid[0],f.grid[1]),e.uniform1i(t.uRule,r),e.uniform1f(t.uTime,Y),e.uniform1f(t.uConvert,n.takeover),e.uniform1f(t.uStart,n.start),e.uniform1f(t.uKillEnd,n.killEnd),e.uniform1f(t.uDeath,S),e.uniform1f(t.uSpawnP,H),e.uniform1f(t.uHeatDecay,te),e.uniform1f(t.uThresh,J),e.drawArrays(e.TRIANGLES,0,3),o.src=1-o.src}function re(r,t){e.disable(e.BLEND),e.useProgram(B.p);const i=B.loc;for(let c=0;c<n.speed;c++)e.bindFramebuffer(e.FRAMEBUFFER,f.a[1-f.src].fb),e.viewport(0,0,f.grid[0],f.grid[1]),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,f.a[f.src].t),e.uniform1i(i.uPrev,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,o.a[o.src].t),e.uniform1i(i.uLife,1),e.uniform2f(i.uGrid,f.grid[0],f.grid[1]),e.uniform1f(i.uFeed,n.feed),e.uniform1f(i.uKill,n.kill),e.uniform1f(i.uDecay,1/(n.lasts*60*n.speed)),e.uniform1f(i.uLifeFeed,n.lifeFeed/n.speed),e.uniform1f(i.uStart,n.start),e.uniform3f(i.uSeed,p?p[0]:0,p?p[1]:0,p&&c===0?ce:-1),e.drawArrays(e.TRIANGLES,0,3),f.src=1-f.src;p=null,Y+=r,F+=r,t>W&&(W=t+500,ee(t)),F>=U&&(F=Math.min(F-U,U),V(1)),V(0),e.bindFramebuffer(e.FRAMEBUFFER,null)}function ie(r){e.enable(e.BLEND),e.viewport(0,0,a.width,a.height),e.clear(e.COLOR_BUFFER_BIT),e.useProgram(L.p);const t=L.loc;e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,f.a[f.src].t),e.uniform1i(t.uRd,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,o.a[o.src].t),e.uniform1i(t.uLife,1),e.uniform2f(t.uResolution,a.width,a.height),e.uniform1f(t.uCell,n.cell*v),e.uniform1f(t.uLifeCell,n.lifeCell*v),e.uniform1f(t.uPixel,2*v),e.uniform1f(t.uGap,le),e.uniform1f(t.uThresh,J),e.uniform1f(t.uLevel,r),e.uniform1f(t.uBase,ge),e.uniform1f(t.uSpot,pe*v),x?e.uniform2f(t.uMouse,x[0]*v,a.height-x[1]*v):e.uniform2f(t.uMouse,-1e5,-1e5),e.uniform3fv(t.uWhite,Ee),e.uniform3fv(t.uBlue,Te),e.uniform3fv(t.uRed,xe),e.drawArrays(e.TRIANGLES,0,3)}const ae=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;let R=!1,b=0,y=0,C=0;function z(r){const t=Math.min((r-C)/1e3,.05);C=r,b=Math.max(0,Math.min(1,b+(R?t:-t)/de)),G(),!ae&&document.visibilityState!=="hidden"&&re(t,r),ie(b*he),R||b>0?y=requestAnimationFrame(z):(y=0,e.clear(e.COLOR_BUFFER_BIT))}const I=document.createElement("canvas");function oe(r,t){if(!R||!t||t.width<1||t.height<1)return!1;G();const i=a.getBoundingClientRect(),[c,s]=o.grid,u=c/i.width,l=s/i.height,d=Math.max(0,Math.floor((t.left-i.left)*u)),X=Math.min(c,Math.ceil((t.left+t.width-i.left)*u)),h=Math.max(0,Math.floor((t.top-i.top)*l)),q=Math.min(s,Math.ceil((t.top+t.height-i.top)*l)),m=X-d,g=q-h;if(m<1||g<1)return!1;I.width=m,I.height=g;const T=I.getContext("2d",{willReadFrequently:!0});T.imageSmoothingEnabled=!0,T.imageSmoothingQuality="high",T.fillStyle="#000",T.fillRect(0,0,m,g);let _;try{T.drawImage(r,(t.left-i.left)*u-d,(t.top-i.top)*l-h,t.width*u,t.height*l),_=T.getImageData(0,0,m,g).data}catch(E){return console.warn("[overlay] imprint skipped:",E.message),!1}const M=new Uint8Array(m*g*4);for(let E=0;E<g;E++){const ne=g-1-E;for(let A=0;A<m;A++){const N=(E*m+A)*4,k=(ne*m+A)*4,j=(.2126*_[N]+.7152*_[N+1]+.0722*_[N+2])/255,Q=j>me[(h+E&3)*4+(d+A&3)]?255:0;M[k]=Q,M[k+1]=Math.max(Q,Math.round(j*255)),M[k+3]=255}}return e.bindTexture(e.TEXTURE_2D,o.a[o.src].t),e.pixelStorei(e.UNPACK_ALIGNMENT,1),e.texSubImage2D(e.TEXTURE_2D,0,d,s-q,m,g,e.RGBA,e.UNSIGNED_BYTE,M),K=performance.now()+ve,S=0,!0}return G(),{imprint:oe,setActive(r){R=r,a.classList.toggle("active",r),!y&&(r||b>0)&&(C=performance.now(),y=requestAnimationFrame(z))}}}export{Se as createOverlay};
