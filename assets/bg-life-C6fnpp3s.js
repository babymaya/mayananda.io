import{p as j,a as U,q as K,s as W,f as Y,t as Q,b as Z}from"./site-CO722sUk.js";import"./preload-helper-DD1OZmLC.js";const _=`
float hash11(float n) { return fract(sin(n) * 43758.5453123); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float hash21t(vec2 p, float t) {
  return fract(sin(dot(p + t, vec2(12.9898, 78.233))) * 43758.5453123);
}
`,ee=`
float Bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
#define Bayer4(a) (Bayer2(0.5 * (a)) * 0.25 + Bayer2(a))
#define Bayer8(a) (Bayer4(0.5 * (a)) * 0.25 + Bayer2(a))
`,te=`
float vnoise(vec3 p) {
  vec3 ip = floor(p), fp = fract(p);
  vec3 k = vec3(1.0, 57.0, 113.0);
  float n000 = hash11(dot(ip + vec3(0,0,0), k));
  float n100 = hash11(dot(ip + vec3(1,0,0), k));
  float n010 = hash11(dot(ip + vec3(0,1,0), k));
  float n110 = hash11(dot(ip + vec3(1,1,0), k));
  float n001 = hash11(dot(ip + vec3(0,0,1), k));
  float n101 = hash11(dot(ip + vec3(1,0,1), k));
  float n011 = hash11(dot(ip + vec3(0,1,1), k));
  float n111 = hash11(dot(ip + vec3(1,1,1), k));
  vec3 w = fp * fp * fp * (fp * (fp * 6.0 - 15.0) + 10.0);
  float x00 = mix(n000, n100, w.x), x10 = mix(n010, n110, w.x);
  float x01 = mix(n001, n101, w.x), x11 = mix(n011, n111, w.x);
  return mix(mix(x00, x10, w.y), mix(x01, x11, w.y), w.z) * 2.0 - 1.0;
}

// Real fBm: amplitude halves each octave. The source this came from left the
// gain at 1.0, which sums every octave at full weight and is much noisier.
float fbm(vec3 p, int octaves) {
  float sum = 0.0, amp = 0.5, freq = 1.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    sum += amp * vnoise(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return sum;
}
`,ie=`
float maskSquare(vec2 p, float cov) { return cov; }

float maskCircle(vec2 p, float cov) {
  float r = sqrt(cov) * 0.5;
  float d = length(p - 0.5) - r;
  float aa = 0.5 * fwidth(d);
  return cov * (1.0 - smoothstep(-aa, aa, d));
}

float maskDiamond(vec2 p, float cov) {
  float r = sqrt(cov) * 0.62;
  float d = abs(p.x - 0.5) + abs(p.y - 0.5) - r;
  float aa = 0.5 * fwidth(d);
  return cov * (1.0 - smoothstep(-aa, aa, d));
}
`,oe=`
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
`,a=8,I=9,P=420,C=1/12,re=`#version 300 es
precision highp float;

uniform sampler2D uPrev;
uniform vec2  uGrid;
uniform float uTime;
uniform float uSpawn;
uniform float uAspect;
uniform int   uClickCount;
uniform vec3  uClicks[${a}];
uniform float uRippleSpeed;
uniform float uRippleThickness;

in vec2 vUv;
out vec4 outColor;

${_}

float cellAt(vec2 uv, vec2 off) {
  return texture(uPrev, uv + off / uGrid).r > 0.5 ? 1.0 : 0.0;
}

void main() {
  // Sample at cell centres. Landing on a texel edge with REPEAT wrapping reads
  // the wrong neighbour and the simulation quietly drifts.
  vec2 cell = floor(vUv * uGrid);
  vec2 uv = (cell + 0.5) / uGrid;

  vec4 prev = texture(uPrev, uv);
  float alive = prev.r > 0.5 ? 1.0 : 0.0;

  float n = cellAt(uv, vec2(-1.0, -1.0)) + cellAt(uv, vec2(0.0, -1.0)) + cellAt(uv, vec2(1.0, -1.0))
          + cellAt(uv, vec2(-1.0,  0.0))                               + cellAt(uv, vec2(1.0,  0.0))
          + cellAt(uv, vec2(-1.0,  1.0)) + cellAt(uv, vec2(0.0,  1.0)) + cellAt(uv, vec2(1.0,  1.0));

  // B3/S23.
  float next = alive > 0.5
    ? ((n == 2.0 || n == 3.0) ? 1.0 : 0.0)
    : (n == 3.0 ? 1.0 : 0.0);

  // A finite board settles into still lifes and blinkers within a minute or
  // two. A trickle of spontaneous cells keeps it from becoming wallpaper.
  if (hash21t(cell, floor(uTime * 12.0)) < uSpawn) next = 1.0;

  // The blast ring writes life rather than only drawing light.
  vec2 p = vec2(uv.x * uAspect, uv.y);
  for (int i = 0; i < ${a}; i++) {
    if (i >= uClickCount) break;
    vec3 c = uClicks[i];
    if (c.z < 0.0) continue;
    float age = uTime - c.z;
    if (age < 0.0 || age > 3.0) continue;
    float r = distance(p, vec2(c.x * uAspect, c.y));
    float ring = abs(r - uRippleSpeed * age);
    // Thin the seeding as the ring travels, so a click reads as one sharp
    // shock rather than an expanding disc of noise.
    float fade = exp(-1.6 * age);
    if (ring < uRippleThickness && hash21t(cell, c.z) < 0.55 * fade) next = 1.0;
  }

  float heat = max(next, prev.g * 0.82);
  outColor = vec4(next, heat, 0.0, 1.0);
}
`,le=`#version 300 es
precision highp float;

uniform sampler2D uLife;
uniform vec2  uGrid;
uniform vec2  uResolution;
uniform float uCell;
uniform float uTime;
uniform float uDensity;
uniform float uJitter;
uniform float uEdgeFade;
uniform float uLevel;
uniform float uAspect;
uniform vec3  uDim;
uniform vec3  uLive;
uniform vec3  uBirth;
uniform int   uClickCount;
uniform vec3  uClicks[${a}];
uniform float uRippleSpeed;
uniform float uRippleThickness;

out vec4 fragColor;

${_}
${ee}
${te}
${ie}
${oe}

void main() {
  vec2 fragCoord = gl_FragCoord.xy;

  vec2 cellId  = floor(fragCoord / uCell);
  vec2 cellUV  = fract(fragCoord / uCell);
  vec2 lifeUV  = (cellId + 0.5) / uGrid;

  vec4 life = texture(uLife, lifeUV);
  float alive = life.r;
  float heat  = life.g;

  // The drifting field the dither resolves into cells. Without it a dead
  // region of the board is perfectly empty, which reads as broken.
  vec3 np = vec3(cellId / uGrid * vec2(uAspect, 1.0) * 3.0, uTime * 0.05);
  float base = fbm(np, 4) * 0.5 + 0.5;
  float feed = (base - 0.78) + (uDensity - 0.5) * 0.35;

  // Life sits on top of the field, not blended into it: a living cell should
  // always cross the dither threshold rather than merely raise its odds.
  feed = max(feed, alive * 0.95);
  feed = max(feed, heat * 0.45);

  float ringGlow = 0.0;
  vec2 p = vec2(lifeUV.x * uAspect, lifeUV.y);
  for (int i = 0; i < ${a}; i++) {
    if (i >= uClickCount) break;
    vec3 c = uClicks[i];
    if (c.z < 0.0) continue;
    float age = uTime - c.z;
    if (age < 0.0 || age > 3.0) continue;
    float r = distance(p, vec2(c.x * uAspect, c.y));
    float ring = exp(-pow((r - uRippleSpeed * age) / uRippleThickness, 2.0));
    ringGlow = max(ringGlow, ring * exp(-1.1 * age) * exp(-2.0 * r));
  }
  feed = max(feed, ringGlow);

  float bayer = Bayer8(fragCoord / uCell) - 0.5;
  float bw = step(0.5, feed + bayer);

  float h = hash21(cellId);
  float coverage = bw * (1.0 + (h - 0.5) * uJitter);

  // Square cells for the body of the field, circles for living cells: the
  // simulation stays legible as a simulation instead of dissolving into grain.
  float mSq = maskSquare(cellUV, coverage);
  float mCi = maskCircle(cellUV, coverage);
  float M = mix(mSq, mCi, clamp(heat, 0.0, 1.0));

  if (uEdgeFade > 0.0) {
    vec2 norm = fragCoord / uResolution;
    float edge = min(min(norm.x, norm.y), min(1.0 - norm.x, 1.0 - norm.y));
    M *= smoothstep(0.0, uEdgeFade, edge);
  }

  vec3 col = uDim;
  col = mix(col, uLive, clamp(heat, 0.0, 1.0));
  col = mix(col, uBirth, clamp(alive * 0.12 + ringGlow * 1.2, 0.0, 1.0));

  float a = clamp(M, 0.0, 1.0) * uLevel;
  fragColor = vec4(toSRGB(col) * a, a);
}
`,T=l=>{const d=l.replace("#",""),p=d.length===3?d.split("").map(h=>h+h).join(""):d;return[parseInt(p.slice(0,2),16)/255,parseInt(p.slice(2,4),16)/255,parseInt(p.slice(4,6),16)/255]};function fe(l,d={}){const{dim:p="#3a0d0d",live:h="#c10f0f",birth:q="#ffc94d",density:V=.5,jitter:z=.35,edgeFade:N=.35,level:$=.62,spawn:X=.0016,rippleSpeed:E=.5,rippleThickness:S=.035}=d,e=l.getContext("webgl2",{alpha:!0,antialias:!1,depth:!1,stencil:!1,premultipliedAlpha:!0,powerPreference:"low-power"});if(!e)return null;const O=j();let b,k;try{b=U(e,re),k=U(e,le)}catch(o){return console.warn("[bg-life] disabled:",o.message),null}const L=K(e);e.disable(e.DEPTH_TEST),e.enable(e.BLEND),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.clearColor(0,0,0,0);const f=[null,null],g=[null,null];let c=0,n=[1,1],x=I;const m=new Float32Array(a*3).fill(-1);let v=0,w=0;function H(){const[o,i]=n,r=new Uint8Array(o*i*4);for(let t=0;t<o*i;t++){const s=Math.random()<.32?255:0;r[t*4]=s,r[t*4+1]=s,r[t*4+3]=255}for(let t=0;t<2;t++)f[t]&&e.deleteTexture(f[t]),g[t]&&e.deleteFramebuffer(g[t]),f[t]=Q(e,o,i,{data:t===0?r:null}),g[t]=Z(e,f[t]);c=0}function A(){if(!Y(l))return!1;const o=l.width/Math.max(l.clientWidth,1);return x=I*o,n=[Math.min(P,Math.max(8,Math.ceil(l.width/x))),Math.min(P,Math.max(8,Math.ceil(l.height/x)))],H(),!0}A();function B(o){const[i,r]=n;e.bindFramebuffer(e.FRAMEBUFFER,g[1-c]),e.viewport(0,0,i,r),e.disable(e.BLEND),e.useProgram(b.p),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,f[c]);const t=b.loc;e.uniform1i(t.uPrev,0),e.uniform2f(t.uGrid,i,r),e.uniform1f(t.uTime,o),e.uniform1f(t.uSpawn,X),e.uniform1f(t.uAspect,i/r),e.uniform1i(t.uClickCount,w),e.uniform3fv(t.uClicks,m),e.uniform1f(t.uRippleSpeed,E),e.uniform1f(t.uRippleThickness,S),e.bindVertexArray(L),e.drawArrays(e.TRIANGLES,0,3),e.bindFramebuffer(e.FRAMEBUFFER,null),e.enable(e.BLEND),c=1-c}function M(o){e.viewport(0,0,l.width,l.height),e.clear(e.COLOR_BUFFER_BIT),e.useProgram(k.p),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,f[c]);const i=k.loc;e.uniform1i(i.uLife,0),e.uniform2f(i.uGrid,n[0],n[1]),e.uniform2f(i.uResolution,l.width,l.height),e.uniform1f(i.uCell,x),e.uniform1f(i.uTime,o),e.uniform1f(i.uDensity,V),e.uniform1f(i.uJitter,z),e.uniform1f(i.uEdgeFade,N),e.uniform1f(i.uLevel,$),e.uniform1f(i.uAspect,n[0]/n[1]),e.uniform3fv(i.uDim,T(p)),e.uniform3fv(i.uLive,T(h)),e.uniform3fv(i.uBirth,T(q)),e.uniform1i(i.uClickCount,w),e.uniform3fv(i.uClicks,m),e.uniform1f(i.uRippleSpeed,E),e.uniform1f(i.uRippleThickness,S),e.bindVertexArray(L),e.drawArrays(e.TRIANGLES,0,3)}function G(o,i,r){const t=l.getBoundingClientRect(),s=(o-t.left)/Math.max(t.width,1),y=1-(i-t.top)/Math.max(t.height,1);s<0||s>1||y<0||y>1||(m[v*3]=s,m[v*3+1]=y,m[v*3+2]=r,v=(v+1)%a,w=Math.min(w+1,a))}let F=0;const R=o=>G(o.clientX,o.clientY,F);if(window.addEventListener("pointerdown",R,{passive:!0}),O){const o=()=>{for(let r=0;r<6;r++)B(r*C);M(0)};o(),window.removeEventListener("pointerdown",R);const i=()=>{A()&&o()};return window.addEventListener("resize",i),()=>window.removeEventListener("resize",i)}let u=0,D=4+Math.random()*6;const J=W(l,(o,i)=>{if(F=o,A()&&(u=0),o>D){const t=l.getBoundingClientRect();G(t.left+Math.random()*t.width,t.top+Math.random()*t.height,o),D=o+6+Math.random()*10}u+=i;let r=0;for(;u>=C&&r<3;)B(o),u-=C,r++;u>C&&(u=0),M(o)});return()=>{J(),window.removeEventListener("pointerdown",R)}}export{fe as initLifeBackground};
