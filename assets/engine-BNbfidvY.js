import{f as e,o as t}from"./store-wRI6Fh65.js";import{n}from"./engine-uUqkL-Lv.js";import{l as r}from"./library-DahSRnSw.js";import{a as i}from"./library-Ct1lkvYf.js";import{a,t as o}from"./sections-DvObWf0S.js";import{t as s}from"./heartbeat-B5JoCuc3.js";import{i as c}from"./model-XnlyqFKF.js";import{t as l}from"./data-B--aKAZo.js";import{a as u}from"./relations-BUE7b5rq.js";import{$ as d,C as f,D as p,E as m,F as h,H as g,J as _,K as v,M as y,N as b,P as x,Q as S,R as C,S as w,T,U as E,V as D,W as ee,Y as O,Z as te,_ as ne,a as k,b as A,c as j,d as M,et as N,f as re,g as ie,h as P,i as ae,it as F,j as oe,k as se,l as ce,n as le,nt as I,o as L,p as ue,q as de,r as fe,rt as R,t as pe,tt as z,u as me,v as B,w as he,y as ge,z as V}from"./three.module-C4nrqxQG.js";var _e=[`movies`,`music`,`sports`,`gaming`,`news`,`fashion`,`culture`,`kids`,`live`],H=1900,ve=2029,ye=Array.from({length:13},(e,t)=>H+t*10),be=1965,xe=.42,Se=2.5,Ce=De([.88,.06,-.47]),we=12,Te=1.75,Ee=.17;function De(e){let t=Math.hypot(e[0],e[1],e[2])||1;return[e[0]/t,e[1]/t,e[2]/t]}var U=(e,t)=>[e[0]+t[0],e[1]+t[1],e[2]+t[2]],W=(e,t)=>[e[0]*t,e[1]*t,e[2]*t],Oe=(e,t)=>[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],ke=(e,t)=>e[0]*t[0]+e[1]*t[1]+e[2]*t[2],Ae=(e,t,n)=>Math.min(n,Math.max(t,e));function je(e,t){if(t===0)return e;let n=Math.cos(t),r=Math.sin(t);return[e[0]*n+e[2]*r,e[1],-e[0]*r+e[2]*n]}function G(e,t,n=1){let r=e*Math.PI/180,i=t*Math.PI/180;return[n*Math.cos(r)*Math.sin(i),n*Math.sin(r),n*Math.cos(r)*Math.cos(i)]}function Me(e){let t=Math.hypot(e[0],e[1],e[2])||1;return{lat:Math.asin(Ae(e[1]/t,-1,1))*180/Math.PI,lon:Math.atan2(e[0],e[2])*180/Math.PI}}function K(e,t=0){let n=2166136261^t;for(let t=0;t<e.length;t++)n^=e.charCodeAt(t),n=Math.imul(n,16777619);return n^=n>>>13,n=Math.imul(n,1540483477),n^=n>>>15,(n>>>0)/4294967296}function Ne(e,t,n){let r=U(e.center,je(e.offset,e.spin*n));return e.fixed?r:je(r,t.spin*n)}function Pe(e,t,n){return e.fixed?e.pos:je(e.pos,t.spin*n)}function Fe(e,t,n=``){if(t<=1)return 0;let r=e/(t-1)*.3;return Math.min(.42,r+K(n,7)*.12)}var Ie=1.15,Le=e=>e<.5?4*e*e*e:1-(-2*e+2)**3/2;function Re(e,t,n={}){let r=n.perRing??10,i=n.gap??1.15,a=n.tilt??.32,o=[];for(let s=0;s<e;s++){let c=Math.floor(s/r),l=Math.min(r,e-c*r),u=(s-c*r)/l*Math.PI*2+(n.phase??0)+c*.7,d=t+c*i,f=(c%2==0?1:-1)*a;o.push([Math.cos(u)*d,Math.sin(u)*d*f,Math.sin(u)*d])}return o}function ze(e,t,n=0){let r=K(e,11+n)*2-1,i=K(e,23+n)*2-1,a=K(e,37+n)*2-1;return[r*t[0],i*t[1],a*t[2]]}function Be(e,t=.14){return{id:e.id,role:`recede`,center:[0,0,-38],offset:ze(e.id,[34,15,12]),spin:.006,scale:.55,presence:t}}var Ve=e=>(e??1.6)<.9,q=e=>Ve(e)?0:Ee,He={spine:0,globe:0,helix:0,core:0,haze:1};function Ue(e){for(let t of _e)if(e.sections.includes(t))return t;return null}function We(){return _e.map((e,t)=>{let n=t/_e.length*Math.PI*2+.35;return{section:e,pos:[Math.sin(n)*we,Math.sin(t*1.7)*2.4,Math.cos(n)*we],radius:Te,presence:1}})}function Ge(e){let t=We(),n=new Map,r=e.arrangement.featured;for(let t of e.seeds){if(t.id===r)continue;let e=Ue(t),i=n.get(e);i?i.push(t):n.set(e,[t])}let i=new Map;t.forEach((e,t)=>{let r=n.get(e.section)??[],a=Re(r.length,e.radius+1.25,{perRing:8,gap:.95,tilt:.42,phase:t*.9});r.forEach((n,r)=>{i.set(n.id,{id:n.id,role:`member`,center:e.pos,offset:a[r],spin:(t%2?-1:1)*.16,scale:.62,presence:.95})})});let a=n.get(null)??[],o=Re(a.length,5.4,{perRing:12,gap:1.2,tilt:.12});a.forEach((e,t)=>{i.set(e.id,{id:e.id,role:`member`,center:[0,-.5,0],offset:o[t],spin:.05,scale:.6,presence:.85})});let s=Ve(e.aspect);return{kind:`home`,seeds:e.seeds.map(e=>e.id===r?{id:e.id,role:`featured`,center:s?[.4,3.2,13]:[3.6,.8,13.5],offset:[0,0,0],spin:0,fixed:!0,scale:1.55,presence:1}:i.get(e.id)),organs:t,camera:{pos:[0,3.6,31],target:[0,.6,0],fov:40,bias:q(e.aspect)},spin:.022,filaments:[],furniture:{...He,spine:1},energy:1,tint:null,orbit:`yaw`}}function Ke(e){let{place:t,route:n}=e.arrangement,r=e.scope??null,i=new Map;for(let t of e.seeds){if(!t.place)continue;let e=i.get(t.place.id);e?e.push(t):i.set(t.place.id,[t])}let a=new Map;for(let[e,n]of i){let{lat:i,lon:o}=n[0].place,s=G(i,o),c=Oe([0,1,0],s),l=Math.hypot(c[0],c[1],c[2])<1e-6?[1,0,0]:De(c),u=Oe(s,l),d=!!r?.has(e);n.forEach((i,o)=>{let c=[0,0,0];if(n.length>1){let e=Math.floor(o/7),t=Math.min(7,n.length-e*7),r=(o-e*7)/t*Math.PI*2+e*.45,i=.34+e*.3;c=U(W(l,Math.cos(r)*i),W(u,Math.sin(r)*i))}let f=5*(1.075+(n.length>1?.012*Math.floor(o/7):0));a.set(i.id,{id:i.id,role:`member`,center:U(W(s,f),c),offset:[0,0,0],spin:0,scale:d?.42:.3,presence:r?d?1:.55:.95,selected:d&&n.length===1&&t===e})})}let o=e.seeds.filter(e=>!e.place),s=Re(o.length,8.75,{perRing:14,gap:.8,tilt:.08});o.forEach((e,t)=>a.set(e.id,{id:e.id,role:`pool`,center:[0,-5*.72,0],offset:s[t],spin:.03,scale:.34,presence:.32}));let c,l=17.5,u=t?e.places?.get(t):void 0,d=n?e.routes?.find(e=>e.id===n):void 0;if(d){let e=G(...d.from),t=G(...d.to),n=Me(De(U(e,t)));c=[n.lat,n.lon],l=12.5+Math.acos(Ae(ke(e,t),-1,1))*4.2}else u&&(c=u,l=12.2);let f=c??[22,-52],p=G(f[0],f[1]),m=Ve(e.aspect),h=U(W(p,l*(m?1.25:1)),[0,.6,0]),g=c?W(p,1.1):[0,0,0];return{kind:`world`,seeds:e.seeds.map(e=>a.get(e.id)),organs:[],camera:{pos:h,target:g,fov:38,bias:q(e.aspect)},spin:0,filaments:[],furniture:{...He,globe:1,haze:.6},energy:.8,tint:null,orbit:`free`,world:{place:t,route:n,latLon:c}}}function qe(e){return W(Ce,(e-be)*xe)}var Je=De(Oe(Ce,[0,1,0])),Ye=Oe(Je,Ce);function Xe(e,t=Se,n=0){let r=(e-H)/10*Math.PI*2+n;return U(qe(e),U(W(Je,Math.cos(r)*t),W(Ye,Math.sin(r)*t)))}function Ze(e,t,n){let r;if(t===`setting`){let t=e.years.setting;if(!t)return null;r=t.from,n&&t.from<=n.to&&n.from<=t.to&&(r=Ae((n.from+n.to)/2,t.from,t.to))}else r=t===`made`?e.years.made:e.years.published;return r==null||!Number.isFinite(r)||r<1900||r>2029.999?null:r}function Qe(e){let{decade:t,year:n}=e.arrangement,r=e.arrangement.lens??`setting`,i=n==null?t==null?void 0:{from:t,to:t+9}:{from:n,to:n},a=new Map;for(let t of e.seeds)a.set(t.id,Ze(t,r,i));let o=new Map,s=[],c=new Map,l=[...e.seeds].sort((e,t)=>(a.get(e.id)??0)-(a.get(t.id)??0)||e.id.localeCompare(t.id));for(let e of l){let t=a.get(e.id);if(t==null){s.push(e);continue}let n=Math.round(t),r=o.get(n)??0;o.set(n,r+1);let l=!i||t>=i.from&&t<=i.to+.999,u=Se+Math.floor(r/3)*.95,d=Xe(t+.5,u,r%3*2.1);c.set(e.id,{id:e.id,role:`member`,center:d,offset:[0,0,0],spin:0,scale:i?l?.72:.46:.6,presence:i?l?1:.42:.9})}let u=U(qe(1894),[0,-6.2,2.5]),d=Re(s.length,2.2,{perRing:9,gap:.8,tilt:.1});s.forEach((e,t)=>c.set(e.id,{id:e.id,role:`pool`,center:u,offset:d[t],spin:.04,scale:.42,presence:.26}));let f=Ve(e.aspect),p;if(i){let r=qe(n==null?t+5:n+.5);p={pos:U(r,U(W(De(U(Je,W(Ye,.32))),(n==null?16.5:12)*(f?1.45:1)),W(Ce,-1.6))),target:U(r,W(Ce,.4)),fov:40,bias:q(e.aspect)}}else p={pos:[-7,6.5,38*(f?1.45:1)],target:[1.5,0,-1],fov:40,bias:q(e.aspect)};return{kind:`time`,seeds:e.seeds.map(e=>c.get(e.id)),organs:[],camera:p,spin:0,filaments:[],furniture:{...He,helix:1,haze:.7},energy:.8,tint:null,orbit:`yaw`,time:{decade:t,year:n,lens:r}}}function $e(e){let t=e.arrangement.section,n=_e.includes(t),r=e.seeds.filter(e=>e.sections.includes(t)),i=n?3.5:1.6,a=Re(r.length,i+2.6,{perRing:9,gap:1.35,tilt:.22}),o=new Map;r.forEach((e,t)=>o.set(e.id,{id:e.id,role:`member`,center:[0,0,0],offset:a[t],spin:.075,scale:.78,presence:1}));let s=Ve(e.aspect);return{kind:`category`,seeds:e.seeds.map(e=>o.get(e.id)??Be(e)),organs:n?[{section:t,pos:[0,0,0],radius:i,presence:1,fixed:!0}]:[],camera:{pos:[0,1.6,19*(s?1.5:1)],target:[0,0,0],fov:40,bias:q(e.aspect)},spin:0,filaments:[],furniture:{...He},energy:1,tint:t,orbit:`yaw`}}function et(e){let t=e.arrangement,n=e.members??[],r=t.video??n[0],i=new Set(e.seeds.map(e=>e.id)),a=[...new Set([...n,...t.related??e.related??[]])].filter(e=>e!==r&&i.has(e)).slice(0,18),o=new Map(a.map((e,t)=>[e,t])),s=Ve(e.aspect),c=4.8+Math.max(0,a.length-8)*.22;return{kind:`focus`,seeds:e.seeds.map(e=>{if(e.id===r)return{id:e.id,role:`focus`,center:s?[0,2.2,4]:[.4,.4,4],offset:[0,0,0],spin:0,fixed:!0,scale:2,presence:1,selected:!0};let t=o.get(e.id);if(t!==void 0){let n=t/Math.max(1,a.length)*Math.PI*2+Math.PI/2;return{id:e.id,role:`related`,center:[Math.cos(n)*c,Math.sin(n)*c*.78,.6+Math.sin(n*2)*.6],offset:[0,0,0],spin:0,fixed:!0,scale:.78,presence:.95}}return Be(e,.12)}),organs:[],camera:{pos:[0,.8,17*(s?1.45:1)],target:[0,.4,0],fov:40,bias:q(e.aspect)},spin:0,filaments:r&&i.has(r)?a.map(e=>({from:r,to:e})):[],furniture:{...He},energy:.9,tint:null,orbit:`none`}}function tt(e){let t=e.arrangement.video;return{kind:`watch`,seeds:e.seeds.map(e=>e.id===t?{id:e.id,role:`focus`,center:[0,0,-22],offset:[0,0,0],spin:0,fixed:!0,scale:1.6,presence:.3,selected:!0}:{id:e.id,role:`recede`,center:[0,0,-60],offset:ze(e.id,[44,20,10]),spin:0,scale:.6,presence:.06}),organs:[],camera:{pos:[0,0,20],target:[0,0,-10],fov:40,bias:0},spin:0,filaments:[],furniture:{...He,haze:.25},energy:0,tint:null,orbit:`none`}}function nt(e){let t=new Set(e.seeds.map(e=>e.id)),n=(e.saved??[]).filter(e=>t.has(e)),r=Re(n.length,3.9,{perRing:9,gap:1.25,tilt:.3}),i=new Map(n.map((e,t)=>[e,t])),a=Ve(e.aspect);return{kind:`personal`,seeds:e.seeds.map(e=>{let t=i.get(e.id);return t===void 0?{id:e.id,role:`recede`,center:[0,0,-30],offset:ze(e.id,[30,14,10]),spin:.005,scale:.5,presence:.1}:{id:e.id,role:`saved`,center:[0,0,0],offset:r[t],spin:.09,scale:.72,presence:1}}),organs:[],camera:{pos:[0,1.8,17*(a?1.5:1)],target:[0,0,0],fov:40,bias:q(e.aspect)},spin:0,filaments:[],furniture:{...He,core:1},energy:.9,tint:null,orbit:`yaw`}}function rt(e){return{kind:`quiet`,seeds:e.seeds.map(e=>({id:e.id,role:`ambient`,center:[0,0,-14],offset:ze(e.id,[28,10,9],3),spin:0,scale:.55,presence:.32})),organs:[],camera:{pos:[0,0,22],target:[0,0,-6],fov:42,bias:0},spin:.01,filaments:[],furniture:{...He,haze:.8},energy:.5,tint:null,orbit:`none`}}function it(e){let t=e.arrangement;switch(t.kind){case`home`:return Ge({...e,arrangement:t});case`world`:return Ke({...e,arrangement:t});case`time`:return Qe({...e,arrangement:t});case`category`:return $e({...e,arrangement:t});case`focus`:return et({...e,arrangement:t});case`watch`:return tt({...e,arrangement:t});case`personal`:return nt({...e,arrangement:t});default:return rt(e)}}function at(e,t){return t?(t instanceof Set?t.has(e):t.includes(e))?{presence:1,scale:1.08}:{presence:.24,scale:.9}:{presence:1,scale:1}}var ot=e=>{let t=Number(e.published.slice(0,4));return Number.isFinite(t)&&t>0?t:null};function st(e,t=new Date){let n=new Map;for(let t of o)if(t.kind===`category`||t.kind===`live`)for(let r of a(e,t)){let e=n.get(r.id);e?e.push(t.id):n.set(r.id,[t.id])}return e.videos.map(r=>{let i=r.places.map(t=>e.get(t)).find(e=>e&&Array.isArray(e.coords));return{id:r.id,sections:n.get(r.id)??[],place:i?{id:i.id,lat:i.coords[0],lon:i.coords[1]}:null,years:{setting:r.setting?{from:r.setting.from,to:r.setting.to}:null,made:r.made??null,published:ot(r)},programme:r.programme,planned:!e.isPlayable(r,t),premium:r.access===`premium`||e.effectiveAccess(r,t)===`premium`}})}function ct(e){return new Map(e.places.filter(e=>Array.isArray(e.coords)).map(e=>[e.id,[e.coords[0],e.coords[1]]]))}function lt(e,t=ct(e)){let n=[];for(let r of e.routes){let e=t.get(r.from),i=t.get(r.to);e&&i&&n.push({id:r.id,from:e,to:i})}return n}function ut(e,t,n){let r={...n,arrangement:t};if(t.kind===`focus`){t.programme&&(r.members=e.videosForProgramme(t.programme).map(e=>e.id));let n=t.video??r.members?.[0];if(!t.related&&n&&e.get(n))try{r.related=u(e,n,10).map(e=>e.video.id)}catch{r.related=[]}}return t.kind===`world`&&t.place&&e.get(t.place)&&(r.scope=e.placeScope(t.place)),r}var dt=`
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,ft=`
uniform vec3 uNight; uniform vec3 uDeep; uniform vec3 uTint; uniform vec2 uGlow; uniform float uAspect; uniform float uLevel; uniform float uWarm; uniform vec3 uGold;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 p = vUv - uGlow; p.x *= uAspect;
  float d = length(p);
  float bloom = exp(-d * d * 3.4) * 0.4 * uLevel;
  float under = exp(-pow(length((vUv - vec2(0.5, -0.15)) * vec2(uAspect * 0.6, 1.0)), 2.0) * 3.0) * 0.25;
  vec3 col = uNight;
  col += uDeep * bloom;
  col += uTint * bloom * 0.35;
  col += uGold * under * uWarm * 0.12;
  vec2 v = vUv - 0.5; v.x *= uAspect * 0.8;
  col *= 1.0 - smoothstep(0.35, 1.1, length(v)) * 0.55;
  col += (hash(vUv * 913.0) - 0.5) * 0.012; // dither against banding
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`,pt=`
attribute float aSeed;
uniform float uTime; uniform float uPixelRatio; uniform float uLevel; uniform float uMotion;
varying float vA; varying float vSeed;
void main() {
  vec3 p = position;
  float t = uTime * uMotion;
  p.x += sin(t * 0.05 + aSeed * 31.0) * 1.4;
  p.y += sin(t * 0.07 + aSeed * 17.0) * 0.9 + t * 0.02 * (aSeed - 0.5);
  p.z += cos(t * 0.04 + aSeed * 11.0) * 1.2;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float depth = -mv.z;
  gl_PointSize = clamp((1.2 + aSeed * 2.4) * uPixelRatio * 26.0 / max(depth, 1.0), 0.0, 6.0 * uPixelRatio);
  float twinkle = 0.65 + 0.35 * sin(t * (0.6 + aSeed) + aSeed * 40.0);
  vA = uLevel * twinkle * smoothstep(1.0, 6.0, depth) * (1.0 - smoothstep(60.0, 120.0, depth));
  vSeed = aSeed;
  gl_Position = projectionMatrix * mv;
}`,mt=`
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC;
varying float vA; varying float vSeed;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q);
  float a = smoothstep(0.5, 0.0, d) * vA;
  if (a < 0.003) discard;
  vec3 col = vSeed < 0.6 ? uA : (vSeed < 0.86 ? uB : uC);
  gl_FragColor = vec4(col * a * 0.55, 1.0);
  #include <colorspace_fragment>
}`,ht=class{bg;dust;bgMat;dustMat;tint=new M(0,0,0);tintTarget=new M(0,0,0);glowX=.66;glowTarget=.66;full;constructor(e,t,n){let r=new L;r.setAttribute(`position`,new B([-1,-1,0,3,-1,0,-1,3,0],3)),this.bgMat=new O({vertexShader:dt,fragmentShader:ft,uniforms:{uNight:{value:e.night.clone()},uDeep:{value:e.irisDeep.clone().multiplyScalar(.36)},uTint:{value:this.tint},uGold:{value:e.gold.clone()},uGlow:{value:new R(.66,.56)},uAspect:{value:1.6},uLevel:{value:1},uWarm:{value:1}},depthTest:!1,depthWrite:!1}),this.bg=new x(r,this.bgMat),this.bg.frustumCulled=!1,this.bg.renderOrder=-1e3,this.full=n===`lite`?650:1500;let i=new Float32Array(this.full*3),a=new Float32Array(this.full),o=1234567,s=()=>(o=o*16807%2147483647)/2147483647;for(let e=0;e<this.full;e++)i[e*3]=(s()-.5)*150,i[e*3+1]=(s()-.5)*80,i[e*3+2]=-95+s()*120,a[e]=s();let c=new L;c.setAttribute(`position`,new k(i,3)),c.setAttribute(`aSeed`,new k(a,1)),this.dustMat=new O({vertexShader:pt,fragmentShader:mt,uniforms:{uTime:t.uTime,uMotion:t.uMotion,uPixelRatio:t.uPixelRatio,uLevel:{value:1},uA:{value:e.lilac.clone()},uB:{value:e.gold.clone()},uC:{value:e.frost.clone()}},transparent:!0,depthWrite:!1,blending:2}),this.dust=new g(c,this.dustMat),this.dust.frustumCulled=!1,this.dust.renderOrder=-10}setLite(e){this.dust.geometry.setDrawRange(0,e?Math.round(this.full*.45):this.full)}setTint(e){e?this.tintTarget.set(e).multiplyScalar(.5):this.tintTarget.setRGB(0,0,0)}setGlow(e,t,n,r){this.glowTarget=.5+e*.95,this.bgMat.uniforms.uLevel.value=t,this.bgMat.uniforms.uWarm.value=r,this.dustMat.uniforms.uLevel.value=n}setAspect(e){this.bgMat.uniforms.uAspect.value=e}snap(){this.tint.copy(this.tintTarget),this.glowX=this.glowTarget,this.bgMat.uniforms.uGlow.value.set(this.glowX,.56)}update(e){let t=1-Math.exp(-2.2*e),n=this.tint.r+this.tint.g+this.tint.b+this.glowX;this.tint.lerp(this.tintTarget,t),this.glowX+=(this.glowTarget-this.glowX)*t,this.bgMat.uniforms.uGlow.value.set(this.glowX,.56);let r=this.tint.r+this.tint.g+this.tint.b+this.glowX;return Math.abs(r-n)>1e-4}dispose(){this.bg.geometry.dispose(),this.bgMat.dispose(),this.dust.geometry.dispose(),this.dustMat.dispose()}};function gt(e,t=!1){let n=e[0].index!==null,r=new Set(Object.keys(e[0].attributes)),i=new Set(Object.keys(e[0].morphAttributes)),a={},o={},s=e[0].morphTargetsRelative,c=new L,l=0;for(let u=0;u<e.length;++u){let d=e[u],f=0;if(n!==(d.index!==null))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.`),null;for(let e in d.attributes){if(!r.has(e))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. All geometries must have compatible attributes; make sure "`+e+`" attribute exists among all geometries, or in none of them.`),null;a[e]===void 0&&(a[e]=[]),a[e].push(d.attributes[e]),f++}if(f!==r.size)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. Make sure all geometries have the same number of attributes.`),null;if(s!==d.morphTargetsRelative)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. .morphTargetsRelative must be consistent throughout all geometries.`),null;for(let e in d.morphAttributes){if(!i.has(e))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`.  .morphAttributes must be consistent throughout all geometries.`),null;o[e]===void 0&&(o[e]=[]),o[e].push(d.morphAttributes[e])}if(t){let e;if(n)e=d.index.count;else if(d.attributes.position!==void 0)e=d.attributes.position.count;else return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. The geometry must have either an index or a position attribute`),null;c.addGroup(l,e,u),l+=e}}if(n){let t=0,n=[];for(let r=0;r<e.length;++r){let i=e[r].index;for(let e=0;e<i.count;++e)n.push(i.getX(e)+t);t+=e[r].attributes.position.count}c.setIndex(n)}for(let e in a){let t=_t(a[e]);if(!t)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the `+e+` attribute.`),null;c.setAttribute(e,t)}for(let e in o){let t=o[e][0].length;if(t!==0){c.morphAttributes=c.morphAttributes||{},c.morphAttributes[e]=[];for(let n=0;n<t;++n){let t=[];for(let r=0;r<o[e].length;++r)t.push(o[e][r][n]);let r=_t(t);if(!r)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the `+e+` morphAttribute.`),null;c.morphAttributes[e].push(r)}}}return c}function _t(e){let t,n,r,i=-1,a=0;for(let o=0;o<e.length;++o){let s=e[o];if(t===void 0&&(t=s.array.constructor),t!==s.array.constructor)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.`),null;if(n===void 0&&(n=s.itemSize),n!==s.itemSize)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.`),null;if(r===void 0&&(r=s.normalized),r!==s.normalized)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.`),null;if(i===-1&&(i=s.gpuType),i!==s.gpuType)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.`),null;a+=s.count*n}let o=new t(a),s=new k(o,n,r),c=0;for(let t=0;t<e.length;++t){let r=e[t];if(r.isInterleavedBufferAttribute){let e=c/n;for(let t=0,i=r.count;t<i;t++)for(let i=0;i<n;i++){let n=r.getComponent(t,i);s.setComponent(t+e,i,n)}}else o.set(r.array,c);c+=r.count*n}return i!==void 0&&(s.gpuType=i),s}function J(e,t=.06,n=`both`){let r=typeof e==`number`?()=>e:e,i=e=>Math.sqrt(Math.max(0,1-(1-Math.min(1,e))**2));return e=>{let a=1;return n!==`end`&&(a*=i(e/t)),n!==`start`&&(a*=i((1-e)/t)),r(e)*Math.max(a,1e-4)}}var vt=(e,t)=>n=>e+(t-e)*n;function Y(e,t){let{segments:n,radial:r}=t,i=typeof t.radius==`number`?()=>t.radius:t.radius,a=e.computeFrenetFrames(n,!!t.closed),o=(n+1)*(r+1),s=new Float32Array(o*3),c=new Float32Array(o*3),l=new Float32Array(o*2),u=new F,d=new F,f=0;for(let t=0;t<=n;t++){let o=t/n;e.getPointAt(o,u);let p=i(o),m=a.normals[t],h=a.binormals[t];for(let e=0;e<=r;e++){let t=e/r*Math.PI*2,n=Math.sin(t),i=-Math.cos(t);d.set(i*m.x+n*h.x,i*m.y+n*h.y,i*m.z+n*h.z).normalize(),s[f*3]=u.x+p*d.x,s[f*3+1]=u.y+p*d.y,s[f*3+2]=u.z+p*d.z,c[f*3]=d.x,c[f*3+1]=d.y,c[f*3+2]=d.z,l[f*2]=o,l[f*2+1]=e/r,f++}}let p=[];for(let e=1;e<=n;e++)for(let t=1;t<=r;t++){let n=(r+1)*(e-1)+(t-1),i=(r+1)*e+(t-1),a=(r+1)*e+t,o=(r+1)*(e-1)+t;p.push(n,i,o,i,a,o)}let m=new L;return m.setAttribute(`position`,new k(s,3)),m.setAttribute(`normal`,new k(c,3)),m.setAttribute(`uv`,new k(l,2)),m.setIndex(p),m}function yt(e,t){let n=typeof t.width==`number`?()=>t.width:t.width,r=t.up??new F(0,0,1),i=[],a=[],o=[],s=new F,c=new F,l=new F,u=new F;for(let d=0;d<=t.segments;d++){let f=d/t.segments;e.getPointAt(f,s),e.getTangentAt(f,c),l.crossVectors(c,r).normalize(),t.twist&&l.applyAxisAngle(c,t.twist(f)),u.crossVectors(l,c).normalize();let p=n(f)/2;for(let e of[-1,1])i.push(s.x+l.x*p*e,s.y+l.y*p*e,s.z+l.z*p*e),a.push(u.x,u.y,u.z),o.push(f,e<0?0:1)}let d=[];for(let e=0;e<t.segments;e++){let t=e*2;d.push(t,t+2,t+1,t+1,t+2,t+3)}let f=new L;return f.setAttribute(`position`,new B(i,3)),f.setAttribute(`normal`,new B(a,3)),f.setAttribute(`uv`,new B(o,2)),f.setIndex(d),f}function bt(e,t,n){let r=[],i=[],a=new F;for(let o=0;o<=n;o++)for(let s=0;s<=t;s++){let c=s/t,l=o/n;e(c,l,a),r.push(a.x,a.y,a.z),i.push(c,l)}let o=[];for(let e=0;e<n;e++)for(let n=0;n<t;n++){let r=e*(t+1)+n,i=r+t+1;o.push(r,i,r+1,r+1,i,i+1)}let s=new L;return s.setAttribute(`position`,new B(r,3)),s.setAttribute(`uv`,new B(i,2)),s.setIndex(o),s.computeVertexNormals(),s}function xt(e,t,n){let r=e.getAttribute(`position`).count,i=new Float32Array(r),a=e.getAttribute(`uv`),o=new R;for(let e=0;e<r;e++)typeof n==`number`?i[e]=n:(a&&o.fromBufferAttribute(a,e),i[e]=n(e,o));return e.setAttribute(t,new k(i,1)),e}function X(e){if(e.length===1)return e[0];let t=gt(e,!1);for(let t of e)t.dispose();if(!t)throw Error(`organs: geometries could not be merged (attribute mismatch)`);return t}function St(e){for(let t of Object.keys(e.attributes))t!==`position`&&t!==`normal`&&t!==`uv`&&e.deleteAttribute(t);if(!e.index){let t=e.getAttribute(`position`).count;e.setIndex([...Array(t).keys()])}return e}function Ct(e){let t=e===`full`?[[.24,-.5],[.4,-.5],[.5,-.44],[.52,-.33],[.44,-.15],[.41,0],[.44,.15],[.52,.33],[.5,.44],[.4,.5],[.24,.5],[.18,.38],[.16,0],[.18,-.38],[.24,-.5]]:[[.22,-.5],[.46,-.46],[.52,-.3],[.42,0],[.52,.3],[.46,.46],[.22,.5],[.16,0],[.22,-.5]],n=e===`full`?14:e===`simple`?10:7,r=St(new m(t.map(([e,t])=>new R(e,t)),n));if(e!==`full`)return r;let i=[r];for(let e of[-1,1]){let t=St(new j(.075,.34,2,6));t.rotateZ(Math.PI/2*e+e*.35),t.translate(.56*e,.12,-.06),i.push(t)}let a=St(new j(.07,.36,2,6));return a.rotateX(Math.PI/2+.55),a.translate(0,-.1,-.56),i.push(a),X(i)}function wt(e,t,n={},r=[]){let i=new F,a=new F,o=new E,s=new E,c=new F(0,1,0),l=new F;for(let u=0;u<t;u++){let d=n.at?n.at(u):t===1?.5:u/(t-1),f=Math.min(1,Math.max(0,d));e.getPointAt(f,i),e.getTangentAt(f,a),o.setFromUnitVectors(c,a.normalize()),n.roll&&o.multiply(s.setFromAxisAngle(c,n.roll(u,f)));let p=n.scale?n.scale(u,f):1;typeof p==`number`?l.setScalar(p):l.copy(p),(r[u]??=new b).compose(i,o,l)}return r}function Tt(e,t){let n=Math.min(e.count,t.length);for(let r=0;r<n;r++)e.setMatrixAt(r,t[r]);e.instanceMatrix.needsUpdate=!0}function Et(e){let t=0;return e.traverse(e=>{let n=e;if(!n.isMesh||!n.geometry)return;let r=n.geometry,i=(r.index?r.index.count:r.getAttribute(`position`).count)/3;t+=i*(e.isInstancedMesh?e.count:1)}),Math.round(t)}var Dt=`
varying vec3 vN; varying vec3 vV; varying vec3 vL; varying vec3 vP; varying vec2 vUv; varying float vI; varying float vA; varying vec3 vTint;
`,Ot=`
float oHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float oNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(oHash(i), oHash(i + vec3(1, 0, 0)), f.x), mix(oHash(i + vec3(0, 1, 0)), oHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(oHash(i + vec3(0, 0, 1)), oHash(i + vec3(1, 0, 1)), f.x), mix(oHash(i + vec3(0, 1, 1)), oHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;function kt(e=``,t=``){return`
#include <common>
#include <fog_pars_vertex>
uniform float uTime; uniform float uEnergy;
${Dt}
${Ot}
${e}
void main() {
  vec3 p = position; vec3 n = normal; vUv = uv; vA = 0.0; vTint = vec3(1.0);
  float iid = 0.0;
  #ifdef USE_INSTANCING
    iid = float(gl_InstanceID);
  #endif
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #endif
  ${t}
  vP = p; vI = iid;
  vec4 lp = vec4(p, 1.0);
  #ifdef USE_INSTANCING
    lp = instanceMatrix * lp;
    n = mat3(instanceMatrix) * n;
  #endif
  vL = lp.xyz;
  vec4 mvPosition = modelViewMatrix * lp;
  vN = normalize(normalMatrix * n);
  vV = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`}var At=`
#include <common>
#include <fog_pars_fragment>
uniform float uTime; uniform float uEnergy;
${Dt}
${Ot}
const vec3 KEY = vec3(-0.4355, 0.7259, 0.5323);
float fogAmount() {
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      return 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      return smoothstep(fogNear, fogFar, vFogDepth);
    #endif
  #else
    return 0.0;
  #endif
}
`,jt=`
#include <tonemapping_fragment>
#include <colorspace_fragment>
`,Mt=`
#ifdef USE_FOG
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogAmount());
#endif
`,Nt=`
#ifdef USE_FOG
  float fogF = fogAmount();
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogF);
  gl_FragColor.a *= 1.0 - 0.85 * fogF;
#endif
`,Pt=`
#ifdef USE_FOG
  gl_FragColor.rgb *= 1.0 - fogAmount();
#endif
`,Ft=(e,t)=>`
${At}
uniform vec3 uBone; uniform vec3 uShade; uniform vec3 uHue; uniform float uRim; uniform float uPorous;
${e}
void main() {
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(vV);
  float ndl = dot(N, KEY);
  float wrap = clamp((ndl + 0.55) / 1.55, 0.0, 1.0);
  wrap = wrap * wrap * (3.0 - 2.0 * wrap);
  float g = oNoise(vL * 7.0) * 0.6 + oNoise(vL * 21.0) * 0.4;
  vec3 base = uBone * (1.0 - uPorous * 0.22 + uPorous * 0.22 * g) * vTint;
  vec3 hue = uHue;
  ${t}
  vec3 col = mix(uShade, base, wrap);
  col += vec3(0.95, 0.46, 0.34) * 0.10 * (1.0 - abs(ndl)) * wrap;
  vec3 H = normalize(KEY + V);
  col += vec3(1.0, 0.95, 0.88) * pow(max(dot(N, H), 0.0), 42.0) * 0.24;
  float fr = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  col += hue * fr * uRim * (0.65 + 0.9 * uEnergy);
  col += hue * 0.07 * clamp(0.5 - 0.5 * N.y, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
  ${Mt}
  ${jt}
}`,It=(e,t)=>`
${At}
uniform vec3 uHue; uniform vec3 uDeep; uniform float uOpacity; uniform float uIrid; uniform float uCore; uniform float uRimPow;
${e}
void main() {
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(vV);
  float d = clamp(dot(N, V), 0.0, 1.0);
  float fr = pow(1.0 - d, uRimPow);
  vec3 hue = uHue * vTint;
  vec3 film = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + fr * 1.3 + vL.y * 0.7 + uTime * 0.02));
  vec3 col = mix(uDeep * 0.4, hue, fr) * (0.22 + 1.25 * fr);
  col += film * fr * uIrid * 0.4;
  float core = pow(d, 5.0) * uCore;
  col += hue * core;
  vec3 H = normalize(KEY + V);
  float sp = pow(max(dot(N, H), 0.0), 90.0);
  col += vec3(1.0) * sp * 0.9;
  float a = (0.035 + 0.9 * fr) * uOpacity + sp * 0.6 + core * 0.45;
  ${t}
  col *= 0.85 + 0.55 * uEnergy;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  ${Nt}
  ${jt}
}`,Lt=(e,t)=>`
${At}
uniform vec3 uHue; uniform float uIntensity; uniform float uFreq; uniform float uSpeed; uniform float uPulse; uniform float uFade;
${e}
void main() {
  vec3 N = normalize(vN); vec3 V = normalize(vV);
  float core = pow(abs(dot(N, V)), 1.3);
  float s = vUv.x;
  float w = 0.5 + 0.5 * sin((s * uFreq - uTime * uSpeed + vI * 0.37 + vA * 3.1) * 6.28318);
  float pulse = pow(w, 10.0);
  float ends = mix(1.0, smoothstep(0.0, 0.07, s) * smoothstep(1.0, 0.93, s), uFade);
  float i = uIntensity * (0.25 + 0.75 * core) * (0.55 + uPulse * pulse * (0.6 + 1.4 * uEnergy)) * ends * (0.75 + 0.5 * uEnergy);
  vec3 hue = uHue * vTint;
  ${t}
  vec3 col = hue * i + vec3(1.0) * pulse * uPulse * 0.18 * i;
  gl_FragColor = vec4(col, 1.0);
  ${Pt}
  ${jt}
}`,Rt=`
#include <common>
#include <fog_pars_vertex>
uniform float uSize;
varying vec2 vUv; varying float vI; varying vec3 vTint;
void main() {
  vUv = uv; vI = 0.0; vTint = vec3(1.0);
  vec4 c = vec4(0.0, 0.0, 0.0, 1.0);
  float s = uSize * length(modelMatrix[0].xyz);
  #ifdef USE_INSTANCING
    c = instanceMatrix * c;
    s *= length(instanceMatrix[0].xyz);
    vI = float(gl_InstanceID);
  #endif
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #endif
  vec4 mvPosition = modelViewMatrix * c;
  mvPosition.xy += position.xy * s;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,zt=`
#include <common>
#include <fog_pars_fragment>
uniform float uTime; uniform float uEnergy;
uniform vec3 uHue; uniform float uIntensity; uniform float uTwinkle; uniform float uFalloff;
varying vec2 vUv; varying float vI; varying vec3 vTint;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = exp(-r * r * uFalloff) * (1.0 - smoothstep(0.7, 1.0, r));
  float core = exp(-r * r * 60.0);
  float tw = 1.0 + uTwinkle * 0.5 * sin(uTime * 2.3 + vI * 1.7);
  vec3 col = (uHue * vTint * a + vec3(1.0) * core * 0.5) * uIntensity * tw * (0.7 + 0.6 * uEnergy);
  gl_FragColor = vec4(col, 1.0);
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      gl_FragColor.rgb *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      gl_FragColor.rgb *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
    #endif
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,Bt=()=>{};function Vt(e){let t={uTime:{value:0},uEnergy:{value:0}},n=new Set,r=new Set,i=null,a=e=>({...z.clone(pe.fog),uTime:t.uTime,uEnergy:t.uEnergy,...e}),o=e=>({value:new M(e)}),s=e=>(r.add(e),e),c={quality:e,lite:e===`lite`,shared:t,geo(e){return n.add(e),e},bone(e){return s(new O({name:`organ-bone`,uniforms:a({uBone:o(e.bone??`#e4d9c7`),uShade:o(`#231b31`),uHue:o(e.hue),uRim:{value:e.rim??.9},uPorous:{value:e.porous??.6},...e.uniforms}),vertexShader:kt(`${e.pars??``}\n${e.vpars??``}`,e.displace),fragmentShader:Ft(e.pars??``,e.tint??``),side:e.side??0,fog:!0}))},glass(e){return s(new O({name:`organ-glass`,uniforms:a({uHue:o(e.hue),uDeep:o(e.deep??`#17121f`),uOpacity:{value:e.opacity??.8},uIrid:{value:e.irid??.35},uCore:{value:e.core??0},uRimPow:{value:e.rimPow??2.2},...e.uniforms}),vertexShader:kt(`${e.pars??``}\n${e.vpars??``}`,e.displace),fragmentShader:It(e.pars??``,e.extra??``),transparent:!0,depthWrite:!1,side:2,blending:e.additive?2:1,fog:!0}))},filament(e){return s(new O({name:`organ-filament`,uniforms:a({uHue:o(e.hue),uIntensity:{value:e.intensity??1.2},uFreq:{value:e.freq??2},uSpeed:{value:e.speed??.35},uPulse:{value:e.pulse??.8},uFade:{value:e.fade??1},...e.uniforms}),vertexShader:kt(`${e.pars??``}\n${e.vpars??``}`,e.displace),fragmentShader:Lt(e.pars??``,e.extra??``),transparent:!0,depthWrite:!1,blending:2,fog:!0}))},glow(e){return s(new O({name:`organ-glow`,uniforms:a({uHue:o(e.hue),uSize:{value:e.size},uIntensity:{value:e.intensity??1},uTwinkle:{value:e.twinkle??0},uFalloff:{value:e.falloff??5}}),vertexShader:Rt,fragmentShader:zt,transparent:!0,depthWrite:!1,blending:2,fog:!0}))},mesh(e,t,i){n.add(e),r.add(t);let a=new x(e,t);return i&&(a.name=i),a},instanced(e,t,i,a){n.add(e),r.add(t);let o=new T(e,t,i);return o.instanceMatrix.setUsage(P),o.frustumCulled=!1,a&&(o.name=a),o},halo(e,t){i??=c.geo(new D(1,1));let n=new x(i,c.glow(e));return n.frustumCulled=!1,n.raycast=Bt,n.renderOrder=2,t&&(n.name=t),n},halos(e,t,n){i??=c.geo(new D(1,1));let r=new T(i,c.glow({...e}),t);return r.instanceMatrix.setUsage(P),r.frustumCulled=!1,r.raycast=Bt,r.renderOrder=2,n&&(r.name=n),r},dispose(){for(let e of n)e.dispose();for(let e of r)e.dispose();n.clear(),r.clear(),i=null}};return c}function Ht(e,t,n){let r=e.uniforms?.[t];r&&(r.value=n)}var Ut=e=>e<0?0:e>1?1:Number.isFinite(e)?e:0,Wt=(e,t,n)=>e+(t-e)*n;function Gt(e,t,n,r=5){let i=Ut(t);return!(n>0)||n>.5||!Number.isFinite(e)?i:e+(i-e)*(1-Math.exp(-n*r))}function Kt(e,t){let n=60/Math.max(1,t),r=(e%n+n)%n/n,i=(e,t)=>Math.exp(-(((r-e)/t)**2));return Math.min(1,i(.08,.05)+.6*i(.28,.06))}function qt(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let e=t;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}}var Jt=e=>Wt(.04,.62,Ut(e));function Yt(e,t,n,r){let i=e/t+n/Math.max(1,r);return i-Math.floor(i)}var Xt={movies:{hue:`#ffb45e`,deep:`#a8501c`},music:{hue:`#b3a3ff`,deep:`#5b44d6`},sports:{hue:`#ff8d84`,deep:`#b8364a`},gaming:{hue:`#86e3ff`,deep:`#2a7fb8`},news:{hue:`#f3effc`,deep:`#8f93b8`},fashion:{hue:`#f2b8a2`,deep:`#a8585a`},culture:{hue:`#72d8bd`,deep:`#1f7c6c`},kids:{hue:`#ffd0e6`,deep:`#b39cff`,accents:[`#ffc4df`,`#c9b8ff`,`#a9e4ff`,`#fff0b0`,`#b8f2d2`]},live:{hue:`#ff5468`,deep:`#5c1622`},home:{hue:`#f2d6a2`,deep:`#8a6a3a`},world:{hue:`#b3a3ff`,deep:`#3a2a86`},"time-machine":{hue:`#9fdcff`,deep:`#2f6f99`},"my-world":{hue:`#f2d6a2`,deep:`#8a6a3a`}},Z=(e,t,n)=>new F(e,t,n),Q=(e,t=!1)=>new ce(e.map(([e,t,n])=>Z(e,t,n)),t,`centripetal`);function Zt(e,t=48,n=`xy`){let r=[];for(let i=0;i<t;i++){let a=i/t*Math.PI*2;r.push(n===`xy`?[Math.cos(a)*e,Math.sin(a)*e,0]:[Math.cos(a)*e,0,Math.sin(a)*e])}return Q(r,!0)}function Qt(e,t,n,r,i=new b){let a=n.clone().normalize(),o=t.clone().sub(a.clone().multiplyScalar(t.dot(a))).normalize(),s=new F().crossVectors(a,o),c=typeof r==`number`?Z(r,r,r):r;return i.makeBasis(o.multiplyScalar(c.x),s.multiplyScalar(c.y),a.multiplyScalar(c.z)),i.setPosition(e),i}function $t(e,t,n,r=new b){let i=new E().setFromUnitVectors(Z(0,0,1),t.clone().normalize()),a=typeof n==`number`?Z(n,n,n):n;return r.compose(e,i,a)}function en(e,t,n,r,i){let a=e.lite?`lite`:i.detail??`full`,o=e.instanced(Ct(a),r,n,`vertebrae`);return Tt(o,wt(t,n,{at:e=>i.closed?e/n:n===1?.5:e/(n-1),scale:(e,t)=>i.size(t),roll:i.roll?e=>e*(i.roll??0):void 0})),o}var tn=e=>{let t=Math.sin(e*127.1+311.7)*43758.5453;return t-Math.floor(t)};function nn(e,t=11){let n=qt(t),r=[],i=[],a=Z(0,1,0),o=e=>{let t=Math.abs(e.y)<.9?a:Z(1,0,0);return new F().crossVectors(e,t).normalize()},s=(t,c,l,u,d)=>{let f=o(c).applyAxisAngle(c,n()*Math.PI*2),p=t.clone().addScaledVector(c,l*.5).addScaledVector(f,l*.12*(n()-.5)),m=t.clone().addScaledVector(c,l);if(r.push({points:[t,p,m],r0:u,r1:u*.7,depth:d}),d>=e){i.push(m);return}let h=d===0||n()<.3?3:2,g=n()*Math.PI*2;for(let e=0;e<h;e++){let t=o(c).applyAxisAngle(c,g+e/h*Math.PI*2),r=c.clone().applyAxisAngle(t,.42+n()*.38);r.addScaledVector(a,.18).normalize(),s(m,r,l*(.72+n()*.1),u*.68,d+1)}};return s(Z(0,-.88,0),Z(0,1,0),.42,.075,0),{branches:r,tips:i}}function rn(e,t){let n=new A,r=new A;n.add(r);let i=e.lite,a=t.hue,o=i?4:5,{branches:s,tips:c}=nn(o),l=s.map(e=>xt(Y(Q(e.points.map(e=>e.toArray())),{segments:i?5:8,radial:i?4:6,radius:t=>e.r0+(e.r1-e.r0)*t}),`aDepth`,(t,n)=>(e.depth+n.x)/(o+1))),u=e.bone({hue:a,rim:1,vpars:`attribute float aDepth;`,displace:`vA = aDepth;`,tint:`
      base = mix(base, hue * 0.75 + vec3(0.06), smoothstep(0.55, 1.0, vA) * 0.45);
      float sig = pow(0.5 + 0.5 * sin((vA * 3.2 - uTime * 0.45) * 6.28318), 14.0);
      base += hue * sig * (0.35 + 0.9 * uEnergy) * smoothstep(0.05, 0.3, vA);`});r.add(e.mesh(X(l),u,`branches`));let d=e.mesh(Ct(i?`simple`:`full`),e.bone({hue:a,rim:.9}),`socket`);d.scale.setScalar(.2),d.position.set(0,-.9,0),r.add(d);let f=e.instanced(new w(1,1),e.glass({hue:a,deep:t.deep,opacity:1,core:.9,irid:.4}),c.length,`polyps`),p=e.halos({hue:a,size:1,intensity:.5,twinkle:.6,falloff:6},c.length,`polyp-glow`),m=new b,h=new E;c.forEach((e,t)=>{let n=.026+.018*(t*7%5)/4;f.setMatrixAt(t,m.compose(e,h,Z(n,n,n))),p.setMatrixAt(t,m.compose(e,h,Z(n*6,n*6,n*6)))}),r.add(f,p);let g=[],_=qt(29),v=i?5:10;for(let e=0;g.length<v&&e<400;e++){let e=c[Math.floor(_()*c.length)],t=c[Math.floor(_()*c.length)],n=e.distanceTo(t);if(n<.3||n>.75)continue;let r=e.clone().add(t).multiplyScalar(.5);r.add(Z(r.x,.4,r.z).normalize().multiplyScalar(n*.35)),g.push(xt(Y(Q([e.toArray(),r.toArray(),t.toArray()]),{segments:24,radial:3,radius:.0032}),`aSeed`,g.length))}let y=e.filament({hue:a,intensity:1.2,freq:1.5,speed:.55,pulse:1,vpars:`attribute float aSeed;`,displace:`vA = aSeed * 0.173;`});return g.length&&r.add(e.mesh(X(g),y,`synapses`)),{object:n,view:{yaw:.2,pitch:.12},animate(e,t){r.rotation.y=e*.06,r.rotation.z=Math.sin(e*.3)*.025,Ht(y,`uIntensity`,.9+.9*t)}}}var an=[[.9,.055],[.74,.075],[.63,.25],[.46,.29],[.32,.245],[.16,.185],[-.02,.26],[-.3,.41],[-.6,.56],[-.88,.66]],on=.84;function sn(e){if(e>=an[0][0])return an[0][1];for(let t=1;t<an.length;t++){let[n,r]=an[t],[i,a]=an[t-1];if(e>=n){let t=(i-e)/(i-n),o=t*t*(3-2*t);return a+(r-a)*o}}return an[an.length-1][1]}function cn(e,t){let n=new A,r=e.lite,i=t.hue,a=e.bone({hue:i,rim:1});n.add(e.mesh(Y(new se(Z(0,-.88,0),Z(0,.02,0)),{segments:4,radial:8,radius:.016}),a,`stand`));let o=Q([[0,-.02,-.02],[0,.3,-.05],[0,.6,-.02],[0,.84,0]]);n.add(en(e,o,11,a,{size:e=>.1-.025*e}));let s=new m([new R(1e-4,.86),new R(.06,.87),new R(.075,.9),new R(.05,.94),new R(1e-4,.955)],r?10:18);n.add(e.mesh(s,a,`neck-cap`));let c=Q([[-.31,.6,-.02],[-.14,.66,.06],[0,.68,.08],[.14,.66,.06],[.31,.6,-.02]]);n.add(e.mesh(Y(c,{segments:40,radial:7,radius:J(.022,.07)}),a,`clavicle`));let l=r?[.44,.16,-.12,-.44,-.72]:[.46,.32,.16,.02,-.16,-.34,-.52,-.7,-.86],u=[];for(let e of l){let t=sn(e),n=new d(t,e<-.1?.013:.01,r?4:6,r?32:64);n.rotateX(Math.PI/2),n.scale(1,1,on),n.translate(0,e,0),u.push(n)}let f=r?8:14;for(let e=0;e<f;e++){let t=e/f*Math.PI*2,n=[];for(let e=0;e<=16;e++){let r=.58-e/16*1.46,i=sn(r);n.push([Math.cos(t)*i,r,Math.sin(t)*i*on])}u.push(Y(Q(n),{segments:r?24:48,radial:r?3:4,radius:J(.0055,.03)}))}n.add(e.mesh(X(u),a,`crinoline`));let p=r?4:8,h=[];for(let e of[-1,1])for(let t=0;t<p;t++){let n=t/p*Math.PI*2,i=[];for(let t=0;t<=40;t++){let r=t/40,a=.6-r*.66,o=n+e*r*Math.PI*1.25,s=sn(a)*1.03;i.push([Math.cos(o)*s,a,Math.sin(o)*s*on])}h.push(xt(Y(Q(i),{segments:r?30:60,radial:3,radius:.0035}),`aSeed`,t+(e>0?p:0)))}n.add(e.mesh(X(h),e.filament({hue:i,intensity:1.2,freq:2,speed:.22,pulse:.9,vpars:`attribute float aSeed;`,displace:`vA = aSeed * 0.137;`}),`woven-bodice`));let g=Q([[.27,.62,.1],[.12,.42,.3],[-.16,.12,.3],[-.42,-.24,.3],[-.62,-.58,.12],[-.72,-.86,-.3]]),_=new F,v=new F,y=new F,b=new F,x=bt((e,t,n)=>{g.getPointAt(t,_),g.getTangentAt(t,v),y.set(_.x,0,_.z/on).normalize(),b.crossVectors(v,y).normalize();let r=.2+.62*t**1.1,i=Math.sin(e*Math.PI*(3+5*t)+t*3)*.04*t**.7;n.copy(_).addScaledVector(b,(e-.5)*r).addScaledVector(y,i);let a=Math.hypot(n.x,n.z/on),o=sn(n.y)+.035;if(a<o){let e=o/Math.max(a,1e-4);n.x*=e,n.z*=e}},r?10:20,r?24:56),S=e.glass({hue:i,deep:t.deep,opacity:1.05,irid:.65,core:.3,rimPow:1.8,displace:`
      p += n * sin(uTime * 0.8 + uv.y * 5.0 + uv.x * 3.0) * (0.01 + 0.025 * uEnergy) * uv.y;`,extra:`
      float weave = 0.5 + 0.5 * sin(vUv.x * 240.0) * sin(vUv.y * 420.0);
      col = (col + hue * 0.22) * (0.8 + 0.32 * weave);
      float hem = smoothstep(0.9, 1.0, vUv.y) + smoothstep(0.06, 0.0, vUv.x) + smoothstep(0.94, 1.0, vUv.x);
      col += hue * hem * 0.6;
      a = clamp(a + 0.3 + hem * 0.3, 0.0, 1.0);`});n.add(e.mesh(x,S,`drape`));let C=e.halo({hue:i,size:.35,intensity:.8},`shoulder-glow`);return C.position.set(.27,.62,.1),n.add(C),{object:n,view:{yaw:.3,pitch:.1},animate(e){n.rotation.y=Math.sin(e*.14)*.32+.1}}}var ln=.15,un=3.25;function dn(e){let t=[],n=e?2.55:2.3;for(let e=-3;e<=3;e++)for(let r=-3;r<=3;r++)for(let i=-3;i<=3;i++){let a=Math.hypot(e,r,i),o=a<=un&&a>=n,s=a<=1;if(!o&&!s)continue;let c=tn(e*49+r*7+i+400),l=s?a===0?`lit`:`glass`:c<.09?`lit`:c<.34?`glass`:`bone`;t.push({base:Z(e*ln,r*ln,i*ln),r:a/un,kind:l,axis:Z(tn(c*91)-.5,tn(c*53)-.5,tn(c*17)-.5).normalize()})}return t}function fn(e,t){let n=new A,r=new A;r.rotation.x=.42,n.add(r);let i=t.hue,a=dn(e.lite),o=new ae(1,1,1),s=`
    vec3 q = abs(vP) * 2.0;
    float mx = max(q.x, max(q.y, q.z));
    float mn = min(q.x, min(q.y, q.z));
    float mid = q.x + q.y + q.z - mx - mn;
    float edge = smoothstep(0.78, 0.96, mid);`,c=e.bone({hue:i,rim:.8,porous:.3,tint:`${s} base = mix(base, hue * 1.6, edge * 0.85);`}),l=e.glass({hue:i,deep:t.deep,opacity:.9,core:.12,irid:.3,extra:`${s} col += hue * edge * 0.6; a = max(a, edge * 0.7); float scan = 0.5 + 0.5 * sin(vL.y * 140.0 - uTime * 3.0); col *= 0.85 + 0.25 * scan;`}),u=e.glass({hue:`#e8fbff`,deep:i,opacity:1,core:1,irid:.1,extra:`${s} col += hue * edge * 0.6; a = max(a, 0.6);`}),d={bone:[],glass:[],lit:[]};for(let e of a)d[e.kind].push(e);let f=[`bone`,`glass`,`lit`].map(t=>{let n=t===`bone`?c:t===`glass`?l:u,i=t===`bone`?o:o.clone(),a=e.instanced(i,n,d[t].length,`voxels-${t}`);return r.add(a),{mesh:a,list:d[t]}}),p=e.halos({hue:i,size:1,intensity:.45,twinkle:.8,falloff:6},d.lit.length,`voxel-sparks`);r.add(p);let m=[];for(let e of[-1,0,1])for(let t of[-1,0,1])for(let n of[-1,0,1]){let r=Math.abs(e)+Math.abs(t)+Math.abs(n);(r===1||r===3)&&m.push(Z(e,t,n).normalize())}let h=X(m.map(e=>Y(new se(e.clone().multiplyScalar(.06),e.clone().multiplyScalar(.62)),{segments:10,radial:4,radius:vt(.006,.002)}))),g=e.mesh(h,e.filament({hue:i,intensity:1.1,freq:2,speed:.6,pulse:1}),`lattice-filaments`);r.add(g);let _=e.halo({hue:i,size:.7,intensity:.55,falloff:5},`core-glow`);r.add(_);let v=new b,y=new E,x=new F,S=new F,C=Z(0,1,0);return{object:n,view:{yaw:.5,pitch:.22},animate(e,t){for(let{mesh:n,list:r}of f)r.forEach((r,i)=>{let a=Math.sin(e*.9-r.r*4.5),o=r.r<.4?.04*a:.08+.45*t+.05*a;x.copy(r.base).multiplyScalar(1+o*(.35+.65*r.r)),x.applyAxisAngle(C,o*.7*r.r),y.setFromAxisAngle(r.axis,o*1.4),S.setScalar(ln*(.8-.12*o*r.r)),n.setMatrixAt(i,v.compose(x,y,S)),r.kind===`lit`&&p.setMatrixAt(i,v.compose(x,y.identity(),S.setScalar(.22+.1*t)))}),n.instanceMatrix.needsUpdate=!0;p.instanceMatrix.needsUpdate=!0,g.scale.setScalar(1+.6*t+.03*Math.sin(e*.9)),r.rotation.y=e*.12,r.rotation.z=Math.sin(e*.21)*.08}}}function pn(e,t){let n=new A,r=e.lite,i=t.hue,a=t.accents??[i],o=[];for(let e=0;e<=120;e++){let t=e/120,n=t*2.6*Math.PI*2,r=.5*(1-t)**.85+.04;o.push([Math.cos(n)*r,-.56+1.16*t**.92,Math.sin(n)*r])}let s=e.bone({hue:i,rim:.9,porous:.15,tint:`
      vec3 pastel = 0.8 + 0.2 * cos(6.28318 * (vUv.x * 2.4 + vec3(0.0, 0.33, 0.67)));
      base = mix(base, pastel, 0.6);
      hue = pastel;`});n.add(e.mesh(Y(Q(o),{segments:r?110:240,radial:r?8:14,radius:J(vt(.1,.05),.03)}),s,`spiral`));let c=e.halo({hue:`#fff3c4`,size:.42,intensity:1.1,twinkle:.4},`spiral-star`);c.position.set(o[120][0],o[120][1]+.07,o[120][2]),n.add(c);let l=[[0,-.7,0,.2],[.24,-.74,.08,.15],[-.25,-.73,.04,.16],[.1,-.76,-.2,.14],[-.12,-.77,.22,.13]],u=e.instanced(new S(1,r?14:22,r?10:16),e.bone({hue:i,rim:1.1,porous:.1}),l.length,`cloud`),d=new b,f=new E;l.forEach(([e,t,n,r],i)=>u.setMatrixAt(i,d.compose(Z(e,t,n),f,Z(r,r*.82,r)))),n.add(u);let p=r?9:16,m=e.instanced(new S(1,r?16:28,r?12:20),e.glass({hue:`#ffffff`,deep:`#3a2a56`,opacity:.8,irid:1,core:.08,rimPow:2.6}),p,`bubbles`),h=Array.from({length:p},(e,t)=>({a:t*2.399+.3,r:.42+.4*tn(t+3),y:-.5+1.25*tn(t+17),s:.05+.11*tn(t+31)**1.4,ph:tn(t+47)*Math.PI*2})),g=new M;h.forEach((e,t)=>m.setColorAt(t,g.set(a[t%a.length]))),m.instanceColor&&(m.instanceColor.needsUpdate=!0),n.add(m);let _=r?4:7,v=e.halos({hue:`#ffffff`,size:1,intensity:1,twinkle:.9,falloff:7},_,`sparks`);for(let e=0;e<_;e++){let t=e*1.9+.8,n=.55+.35*tn(e+71);v.setMatrixAt(e,d.compose(Z(Math.cos(t)*n,-.3+1.1*tn(e+83),Math.sin(t)*n),f,Z(.12,.12,.12))),v.setColorAt(e,g.set(a[(e+2)%a.length]))}v.instanceColor&&(v.instanceColor.needsUpdate=!0),n.add(v);let y=new F,x=new F;return{object:n,view:{yaw:.2,pitch:.16},animate(e,t){let r=1+1.2*t;h.forEach((t,n)=>{let i=t.a+e*.06*r;y.set(Math.cos(i)*t.r,t.y+Math.sin(e*(.55+n%3*.12)*r+t.ph)*.05*r,Math.sin(i)*t.r);let a=1+.03*Math.sin(e*1.3+t.ph);x.set(t.s*a,t.s/a,t.s),m.setMatrixAt(n,d.compose(y,f,x))}),m.instanceMatrix.needsUpdate=!0,n.rotation.y=e*.05}}}function mn(e){let t=Math.sin(Math.PI*Math.min(1,e*1.35))*(1-e)**.35;return .36*Math.max(0,t)+.002}function hn(e,t){let n=new A,r=e.lite,i=t.hue,a=e.bone({hue:i,rim:.6}),o=-.32;n.add(en(e,Q([[0,-.96,0],[.01,-.66,.01],[0,-.3,0]]),7,a,{size:e=>.13-.04*e}));let s=new d(.17,.028,6,r?24:40);s.rotateX(Math.PI/2),s.translate(0,-.97,0),n.add(e.mesh(s,a,`foot`));let c=[],l=r?18:36;for(let e=0;e<=l;e++){let t=e/l;c.push(new R(mn(t),o+t*1.18))}let u=e.glass({hue:i,deep:t.deep,opacity:.95,irid:0,core:0,rimPow:2.8});n.add(e.mesh(St(new m(c,r?28:56)),u,`beacon-membrane`));let f=r?4:7,p=[];for(let e=0;e<f;e++){let t=e/f*Math.PI*2,n=[];for(let e=1;e<24;e++){let r=e/24,i=mn(r)*.9;n.push([Math.cos(t)*i,o+r*1.18,Math.sin(t)*i])}p.push(Y(Q(n),{segments:r?20:40,radial:4,radius:J(.008,.05)}))}let h=new d(.2,.026,6,r?24:40);h.rotateX(Math.PI/2),h.translate(0,-.25,0),p.push(St(h)),n.add(e.mesh(X(p),a,`lantern-cage`));let g=e.mesh(new w(.1,r?2:3),e.bone({hue:i,rim:.7,porous:.8}),`core-unlit`);g.position.y=.03999999999999998,n.add(g);let _=e.filament({hue:i,intensity:.5,pulse:0,speed:0,fade:0}),v=new A;v.position.y=.020000000000000018,v.rotation.set(Math.PI/2-.32,.2,0);for(let t of[.5,.63])v.add(e.mesh(Y(Zt(t,72),{segments:r?72:144,radial:4,radius:.0038,closed:!0}),_,`outline-ring`));return n.add(v),{object:n,view:{yaw:.25,pitch:.16},animate(e,t){Ht(_,`uIntensity`,Wt(.5,.9,t)),Ht(u,`uOpacity`,Wt(.95,1.2,t))}}}var gn=.6,_n=1.25;function vn(e){let t=new R(gn,0),n=new R(gn*Math.cos(_n),gn*Math.sin(_n)),r=new R(.12*Math.cos(_n/2),.12*Math.sin(_n/2)),i=n.x,a=n.y,o=r.x,s=r.y,c=t.x,l=t.y,u=2*(i*(s-l)+o*(l-a)+c*(a-s)),d=((i*i+a*a)*(s-l)+(o*o+s*s)*(l-a)+(c*c+l*l)*(a-s))/u,f=((i*i+a*a)*(c-o)+(o*o+s*s)*(i-c)+(c*c+l*l)*(o-i))/u,p=Math.hypot(i-d,a-f),m=(e,t)=>Math.atan2(t-f,e-d),h=m(i,a),g=m(c,l),_=m(o,s),v=e=>(e%(Math.PI*2)+Math.PI*2)%(Math.PI*2),y=v(_-h)<v(g-h)?v(g-h):-v(h-g),b=new te;b.moveTo(t.x,t.y);for(let t=1;t<=e;t++){let n=t/e*_n;b.lineTo(gn*Math.cos(n),gn*Math.sin(n))}for(let t=1;t<e*2;t++){let n=h+t/(e*2)*y;b.lineTo(d+p*Math.cos(n),f+p*Math.sin(n))}return b.closePath(),b}function yn(e){let t=.76,n=new te;n.moveTo(-1/2,-.76/2),n.lineTo(1/2,-.76/2),n.lineTo(1/2,t/2),n.lineTo(-1/2,t/2),n.closePath();let r=(e,t,n,r)=>{let i=new C;return i.moveTo(e,t),i.lineTo(e,r),i.lineTo(n,r),i.lineTo(n,t),i.closePath(),i};if(n.holes.push(r(-.4,-.22,.4,.22)),e)for(let e of[-.31,.31])for(let t of[-.33,-.11,.11,.33])n.holes.push(r(t-.045,e-.03,t+.045,e+.03));return n}function bn(e,t){let n=new A,r=e.lite,i=t.hue,a=e.bone({hue:i,rim:1.1}),o=en(e,Zt(.63,64),34,a,{size:()=>.125,detail:`simple`,closed:!0});n.add(o);let s={value:.3},c=e.bone({hue:i,rim:1.3,porous:.35,side:2,uniforms:{uAperture:s},pars:`uniform float uAperture;`,displace:`
      float phi = atan(p.y, p.x);
      p.z += 0.004 + 0.034 * clamp(phi / ${_n.toFixed(3)}, 0.0, 1.0);
      vec2 q = p.xy - vec2(${gn.toFixed(3)}, 0.0);
      float c = cos(uAperture), s = sin(uAperture);
      q = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);
      p.xy = q + vec2(${gn.toFixed(3)}, 0.0);
      n.xy = vec2(c * n.x + s * n.y, -s * n.x + c * n.y);
      vA = length(p.xy);`,tint:`
      if (vA > 0.615) discard;
      base *= 0.82 + 0.18 * smoothstep(0.2, 0.6, vA);`}),l=r?7:9,u=new ne(vn(r?8:14),{depth:.012,bevelEnabled:!1,curveSegments:4}),d=e.instanced(u,c,l,`iris`),f=new b;for(let e=0;e<l;e++)d.setMatrixAt(e,f.makeRotationZ(e/l*Math.PI*2));d.position.z=.012,n.add(d);let p=new S(.55,r?24:40,r?14:24),h=e.mesh(p,e.glass({hue:i,deep:t.deep,opacity:.7,core:.7,irid:.25}),`lens`);h.scale.set(1,1,.32),h.position.z=-.05,n.add(h);let g=e.halo({hue:i,size:1,intensity:.6,falloff:5},`pupil`);g.position.z=-.02,n.add(g);let _=[],v=r?6:12;_.push(new R(.5,-.02));for(let e=0;e<=v;e++){let t=-.06-e/v*.36;_.push(new R(.6,t),new R(.575,t-.015))}_.push(new R(.42,-.46),new R(.36,-.42));let y=St(new m(_,r?24:48));y.rotateX(Math.PI/2);let x=e.mesh(y,e.bone({hue:i,rim:.8,side:2}),`barrel`);n.add(x);let C=[],w=r?0:8;for(let e=0;e<w;e++){let t=e/w*Math.PI*2+.2,n=Z(Math.cos(t)*.62,Math.sin(t)*.62,1).normalize(),r=new se(Z(0,0,.02),n.multiplyScalar(.95));C.push(Y(r,{segments:12,radial:4,radius:vt(.007,.0015)}))}w&&n.add(e.mesh(X(C),e.filament({hue:i,intensity:.55,freq:1.5,speed:.6,pulse:1}),`rays`));let T=new A;T.rotation.set(-.5,.32,.12);let E=new A;T.add(E),n.add(T);let ee=r?22:34,O=.95,te=new ne(yn(!r),{depth:.05,bevelEnabled:!1,curveSegments:1});te.translate(0,0,-.025);let k=e.instanced(te,e.bone({hue:i,rim:1,porous:.4}),ee,`film`),j=e.instanced(new D(.8,.44),e.glass({hue:i,deep:t.deep,opacity:1,core:.9,irid:.1,extra:`
        float img = oNoise(vec3(vUv * vec2(3.0, 2.0), vI * 1.7)) * 0.7 + oNoise(vec3(vUv * 9.0, vI)) * 0.3;
        col = mix(col, hue * (0.35 + 1.1 * img), 0.7);
        a = max(a, 0.55 + 0.35 * img);`}),ee,`film-cells`),M=Math.PI*2/ee;for(let e=0;e<ee;e++){let t=e*M;Qt(Z(Math.cos(t)*O,Math.sin(t)*O,0),Z(-Math.sin(t),Math.cos(t),0),Z(0,0,1),Z(.165,.165,1),f),k.setMatrixAt(e,f),j.setMatrixAt(e,f)}E.add(k,j);let N=e.mesh(Y(Zt(O,96),{segments:r?96:192,radial:4,radius:.004,closed:!0}),e.filament({hue:i,intensity:.9,freq:9,speed:.12,fade:0}),`film-thread`);E.add(N);let re=e.mesh(Y(Zt(.72,96),{segments:r?64:128,radial:4,radius:J(.005,1e-4),closed:!0}),e.filament({hue:i,intensity:.7,freq:5,speed:-.08,fade:0}),`collar-filament`);return n.add(re),{object:n,view:{yaw:-.3,pitch:.14},animate(e,t){s.value=Jt(.22+.62*t+.04*Math.sin(e*.7)),E.rotation.z=-e*Wt(.05,.3,t),n.rotation.y=Math.sin(e*.17)*.22,n.rotation.x=Math.sin(e*.13+1)*.06,Ht(g.material,`uIntensity`,.45+.6*t)}}}function xn(e,t){let n=new A,r=e.lite,i=t.hue,a=e.bone({hue:i,rim:1}),o=Q([[0,-.92,0],[.03,-.45,.02],[-.02,0,0],[.02,.45,-.02],[0,.8,0]]);n.add(en(e,o,14,a,{size:e=>.13-.035*e}));let s=Q([[.02,.84,0],[.34,.97,.02],[.7,.84,.03],[.93,.42,.02],[.9,-.12,0],[.68,-.6,-.02],[.32,-.88,-.02],[.05,-.95,0]]);n.add(e.mesh(Y(s,{segments:r?60:140,radial:r?6:9,radius:J(vt(.052,.03),.03)}),a,`harp-arm`)),r||n.add(en(e,new ce(s.getSpacedPoints(40).slice(5,36)),9,a,{size:()=>.085,detail:`simple`}));let c=r?6:9,l=[];for(let e=0;e<c;e++){let t=e/(c-1),n=o.getPointAt(.12+.76*t).add(Z(.035,0,0)),i=s.getPointAt(.84-.7*t);l.push(xt(Y(new se(n,i),{segments:r?16:32,radial:4,radius:.0055}),`aSeed`,e))}let u=e.filament({hue:i,intensity:1.5,freq:1.2,speed:.5,pulse:.9,fade:.4,vpars:`attribute float aSeed;`,displace:`
      float env = sin(3.14159 * uv.x);
      p.z += env * (0.003 + 0.028 * uEnergy) * sin(uTime * (7.0 + aSeed * 2.3) + aSeed * 1.9);
      vA = aSeed * 0.21;`});n.add(e.mesh(X(l),u,`strings`));let f=(e,t,n)=>{let r=[];for(let i=0;i<=90;i++){let a=i/90,s=a*t*Math.PI*2+n,c=o.getPointAt(.06+.86*a);r.push([c.x+Math.cos(s)*e,c.y,c.z+Math.sin(s)*e])}return Q(r)};r||n.add(e.mesh(Y(f(.1,6,0),{segments:300,radial:5,radius:J(.011,.02)}),a,`sinew`)),n.add(e.mesh(Y(f(.115,6,Math.PI),{segments:r?160:300,radial:4,radius:.005}),e.filament({hue:i,intensity:1.1,freq:4,speed:.25}),`sinew-light`));let p=r?[{c:Z(-.48,.38,.12),r:.27},{c:Z(-.5,-.32,.16),r:.3}]:[{c:Z(-.46,.44,.1),r:.25},{c:Z(-.58,-.06,.18),r:.31},{c:Z(-.4,-.56,.08),r:.21}],m=Z(-.55,.08,.83).normalize(),h=e.instanced(new v(1e-4,1,r?28:48,r?6:12),e.glass({hue:i,deep:t.deep,opacity:.85,core:.5,irid:.5,displace:`
        float r = length(p.xy);
        float w = uTime * (2.2 + 3.5 * uEnergy) + iid * 2.1;
        float k = 17.0;
        float amp = 0.035 + 0.11 * uEnergy;
        float env = 1.0 - r * r;
        float z = sin(r * k - w) * env * amp;
        float dz = (k * cos(r * k - w) * env - 2.0 * r * sin(r * k - w)) * amp;
        p.z += z;
        vec2 dir = r > 0.0001 ? p.xy / r : vec2(0.0);
        n = normalize(vec3(-dz * dir, 1.0));
        vA = r;`,extra:`
        float ring = pow(0.5 + 0.5 * cos(vA * 17.0 - uTime * (2.2 + 3.5 * uEnergy) - vI * 2.1), 6.0);
        col += hue * ring * (0.12 + 0.35 * uEnergy);
        a += ring * 0.1;`}),p.length,`membranes`),g=e.instanced(new d(1,.045,r?6:10,r?32:56),a,p.length,`hoops`),_=e.halos({hue:i,size:1,intensity:.75,falloff:6},p.length,`membrane-glow`),y=[],x=new b;return p.forEach((e,t)=>{$t(e.c,m,e.r,x),h.setMatrixAt(t,x),g.setMatrixAt(t,x),_.setMatrixAt(t,x.compose(e.c.clone().addScaledVector(m,-.02),new E,Z(e.r*1.6,e.r*1.6,1)));let n=o.getPointAt(.5+e.c.y*.5).add(Z(0,0,-.02)),r=e.c.clone().addScaledVector(m,-.05);y.push(Y(Q([r.toArray(),r.clone().lerp(n,.5).add(Z(0,.06,-.05)).toArray(),n.toArray()]),{segments:16,radial:6,radius:J(vt(.022,.016),.08)}))}),n.add(h,g,_),n.add(e.mesh(X(y),a,`struts`)),{object:n,view:{yaw:.28,pitch:.12},animate(e){n.rotation.y=Math.sin(e*.19)*.28,n.rotation.z=Math.sin(e*.23+2)*.025}}}function Sn(e,t){let n=new A,r=t.hue,i=e.mesh(new j(.3,.55,e.lite?6:10,e.lite?16:28),e.glass({hue:r,deep:t.deep,opacity:.8,core:.7,irid:.4}),`seed`);n.add(i),n.add(e.halo({hue:r,size:1.1,intensity:.8},`seed-glow`));let a=new A;return a.rotation.x=Math.PI/2-.25,a.add(en(e,Zt(.42,48),22,e.bone({hue:r,rim:1}),{size:()=>.12,detail:`simple`,closed:!0})),n.add(a),{object:n,animate(e,t){a.rotation.z=e*(.08+.2*t),i.rotation.y=e*.1}}}function Cn(e,t){let n=new A,r=e.lite,i=t.hue,a=e.bone({hue:i,rim:.9}),o=-.32,s=new A;s.position.y=o,n.add(s);let c=[new R(.08,-.46),new R(.3,-.46),new R(.31,-.42)],l=r?8:16;for(let e=0;e<l;e++){let t=-.38+e/(l-1)*.76;c.push(new R(.272,t-.012),new R(.262,t),new R(.272,t+.012))}c.push(new R(.31,.42),new R(.3,.46),new R(.08,.46));let u=St(new m(c,r?20:44));u.rotateZ(Math.PI/2);let f=new A;s.add(f),f.add(e.mesh(u,e.bone({hue:i,rim:.9,porous:.5,side:2}),`drum`));let p=r?12:20,h=e.instanced(new ae(.035,.07,.05),a,p*2,`gear-teeth`),g=new b,_=new E;for(let t=0;t<2;t++){let n=t?.49:-.49;for(let e=0;e<p;e++){let r=e/p*Math.PI*2;_.setFromAxisAngle(Z(1,0,0),r),h.setMatrixAt(t*p+e,g.compose(Z(n,Math.cos(r)*.345,Math.sin(r)*.345),_,Z(1,1,1)))}let i=new d(.31,.03,6,r?24:40);i.rotateY(Math.PI/2),i.translate(n,0,0),f.add(e.mesh(i,a,`gear-ring`))}f.add(h);for(let t of[-1,1]){let n=Q([[.5*t,0,0],[.68*t,0,0],[.86*t,0,0]]);s.add(en(e,n,4,a,{size:e=>.11-.03*e,detail:`simple`}))}let v=r?2:4,y=[];for(let e=0;e<v;e++){let t=v===1?0:-.27+e/(v-1)*.54,n=(e-(v-1)/2)*.07,i=Q([[t,-.04999999999999999,-.06],[t,.06,-.28],[t+n,.36000000000000004,-.38],[t+n*2,.7,-.22],[t+n*3,.8799999999999999,.08+.05*e],[t+n*3.6,.8599999999999999,.32+.04*e]]);y.push(xt(yt(i,{segments:r?30:60,width:.15,up:Z(0,.3,1).normalize()}),`aSeed`,e))}let x=e.glass({hue:i,deep:t.deep,opacity:.55,irid:.3,core:0,vpars:`attribute float aSeed;`,displace:`
      float lift = uv.x;
      p += n * sin(uv.x * 9.0 - uTime * (1.4 + 2.2 * uEnergy) + aSeed * 1.7) * (0.02 + 0.045 * uEnergy) * lift;
      vA = aSeed;`,extra:`
      float along = vUv.x * 54.0;
      float line = smoothstep(0.25, 0.4, fract(along)) * smoothstep(0.9, 0.75, fract(along));
      float cw = fract(vUv.y * 2.0);
      float colMask = step(0.1, cw) * step(cw, 0.9);
      float head = step(0.8, fract(vUv.x * 3.0 + vA * 0.37));
      float ink = line * colMask * mix(0.35 + 0.65 * oNoise(vec3(vUv.x * 120.0, vUv.y * 12.0, vA)), 1.0, head);
      col = col * 0.42 + hue * ink * 0.5;
      a = clamp(a * 0.55 + 0.1 + ink * 0.45, 0.0, 1.0);`});n.add(e.mesh(X(y),x,`ribbons`));let C=-.66,w=Q([[C,-.26,.02],[-.67,.18,0],[-.65,.54,0],[C,.8199999999999998,0]]);n.add(e.mesh(Y(w,{segments:r?20:40,radial:7,radius:J(vt(.032,.012),.04)}),a,`mast`)),n.add(en(e,w,6,a,{size:e=>.09-.04*e,detail:`simple`}));let T=[];[.5,.74,.94].forEach((e,t)=>{let n=.2-t*.05,r=o+e,i=Z(1,0,-.9).normalize().multiplyScalar(n);T.push(Y(new se(Z(C,r,0).sub(i),Z(C,r,0).add(i)),{segments:8,radial:5,radius:J(.009,.08)}))}),n.add(e.mesh(X(T),a,`dipoles`));let D=Z(C,.8599999999999999,0),ee=e.mesh(new S(.055,16,12),e.glass({hue:i,deep:t.deep,opacity:1,core:1.4}),`bulb`);ee.position.copy(D),n.add(ee);let O=e.halo({hue:i,size:.5,intensity:1.1,falloff:5},`bulb-glow`);O.position.copy(D),n.add(O);let te=r?2:3,ne=Y(Q(Array.from({length:40},(e,t)=>[Math.cos(t/40*Math.PI*2),0,Math.sin(t/40*Math.PI*2)]),!0),{segments:r?48:96,radial:4,radius:.022,closed:!0}),k=Array.from({length:te},(t,r)=>{let i=e.mesh(ne,e.filament({hue:`#dfe6ff`,intensity:1.6,freq:6,speed:.2,fade:0}),`broadcast-${r}`);return i.position.copy(D),i.rotation.x=.28,n.add(i),i});return{object:n,view:{yaw:.42,pitch:.14},animate(e,t){f.rotation.x=-e*Wt(.35,1.6,t);let r=Wt(3.4,1.8,t);k.forEach((n,i)=>{let a=Yt(e,r,i,te);n.scale.setScalar(.08+.5*a),Ht(n.material,`uIntensity`,2*(1-a)**1.4*(.7+.5*t))}),n.rotation.y=Math.sin(e*.15)*.2}}}function wn(e,t=.68,n=new F){let r=1-t,i=2*Math.sqrt(t*r);return n.set(t*Math.cos(e)+r*Math.cos(3*e),t*Math.sin(e)-r*Math.sin(3*e),i*Math.sin(2*e))}function Tn(e,t){let n=new A,r=e.lite,i=t.hue,a=e.bone({hue:i,rim:1}),o=new A;o.position.y=.2,n.add(o);let s=e.mesh(new S(.235,r?24:40,r?16:28),e.bone({hue:i,rim:1.2,porous:.8}),`ball`);o.add(s);let c=[];for(let e=0;e<96;e++)c.push(wn(e/96*Math.PI*2,.68).multiplyScalar(.243).toArray());let l=e.mesh(Y(Q(c,!0),{segments:r?120:220,radial:5,radius:.011,closed:!0}),e.filament({hue:i,intensity:1.6,freq:3,speed:.4,fade:0}),`seam`);l.rotation.set(.4,.3,.2),o.add(l);let u=e.mesh(new S(.31,r?24:36,r?16:24),e.glass({hue:i,deep:t.deep,opacity:.75,core:.35,irid:.3}),`membrane`);o.add(u);let f=e.halo({hue:i,size:1.25,intensity:.8,falloff:5},`heart-glow`);o.add(f);let p=r?3:5,m=[],h=e.filament({hue:i,intensity:1.4,freq:1,speed:.9,pulse:1});for(let t=0;t<p;t++){let i=.44+.055*t,o=3.5+.35*t,s=r?1:3,c=[];for(let e=0;e<s;e++){let t=[];for(let n=0;n<=64;n++){let r=n/64,a=r*o,c=r*7*Math.PI*2+e/s*Math.PI*2,l=s===1?0:.02*Math.sin(Math.PI*Math.min(1,r*6,(1-r)*6)),u=i+Math.cos(c)*l;t.push([Math.cos(a)*u,Math.sin(a)*u,Math.sin(c)*l])}c.push(Y(Q(t),{segments:r?40:90,radial:5,radius:J(vt(.016,.007),.05)}))}let l=new A,u=new A;u.rotation.set(.9+t*.62,t*1.13,t*.41),u.position.y=.2,u.add(l),l.add(e.mesh(X(c),a,`tendon-${t}`));let d=[];for(let e=0;e<=40;e++){let t=e/40*o*.92;d.push([Math.cos(t)*(i+.035),Math.sin(t)*(i+.035),0])}l.add(e.mesh(Y(Q(d),{segments:60,radial:4,radius:vt(.0015,.006)}),h,`trail-${t}`)),n.add(u),m.push({g:l,speed:(.22+.07*t)*(t%2?-1:1)})}let g=r?12:20,_=[];for(let e=0;e<g;e++){let t=e/g*Math.PI*2,n=Math.cos(t),i=Math.sin(t);_.push(Y(Q([[.3,-.86],[.46,-.79],[.64,-.66],[.8,-.48],[.86,-.38]].map(([e,t])=>[n*e,t,i*e])),{segments:r?10:20,radial:5,radius:J(vt(.022,.012),.08)}))}n.add(e.mesh(X(_),a,`arena-ribs`));let v=new d(.3,.026,6,r?32:48);v.rotateX(Math.PI/2),v.translate(0,-.86,0),n.add(e.mesh(v,a,`arena-base`));let y=Y(Q(Array.from({length:48},(e,t)=>[Math.cos(t/48*Math.PI*2)*.855,-.43,Math.sin(t/48*Math.PI*2)*.855]),!0),{segments:r?64:128,radial:4,radius:.006,closed:!0});return n.add(e.mesh(y,e.filament({hue:i,intensity:1.2,freq:10,speed:.15,fade:0}),`arena-rim`)),{object:n,view:{yaw:.35,pitch:.26},animate(e,t){let r=Kt(e,Wt(52,104,t));o.scale.setScalar(1+(.035+.035*t)*r),Ht(f.material,`uIntensity`,.6+(.5+.5*t)*r);let i=Wt(1,2.6,t);for(let t of m)t.g.rotation.z=e*t.speed*i;o.rotation.y=e*.3,n.rotation.y=Math.sin(e*.11)*.2}}}var En={live:hn,movies:bn,music:xn,sports:Tn,gaming:fn,news:Cn,fashion:cn,culture:rn,kids:pn},Dn={yaw:.3,pitch:.15};function On(e){e.updateMatrixWorld(!0);let t=new b().copy(e.matrixWorld).invert(),n=[],r=new fe,i=new F,a=new b,o=new b;e.traverse(e=>{let s=e;if(!s.isMesh||!s.visible||s.material?.name===`organ-glow`)return;let c=s.geometry.getAttribute(`position`);if(!c)return;let l=Math.max(1,Math.floor(c.count/1500)),u=e.isInstancedMesh?e:null,d=new b().multiplyMatrices(t,s.matrixWorld),f=u?u.count:1;for(let e=0;e<f;e++){u?(u.getMatrixAt(e,a),o.multiplyMatrices(d,a)):o.copy(d);for(let e=0;e<c.count;e+=l)i.fromBufferAttribute(c,e).applyMatrix4(o),r.expandByPoint(i),n.push(i.clone())}});let s=r.isEmpty()?new F:r.getCenter(new F),c=0;for(let e of n)c=Math.max(c,e.distanceToSquared(s));return{center:s,radius:Math.sqrt(c)||1}}function kn(e,t){let n=Vt(t.quality===`lite`?`lite`:`webgl`),r=Xt[e]??Xt.home,i=(En[e]??Sn)(n,r),a=new A;a.name=`organ:${e}`;let o=new A;o.name=`organ-fit`,o.add(i.object),a.add(o),i.animate(0,0);let s=On(o);i.animate(0,1);let c=On(o),l=s.center.clone().lerp(c.center,.5),u=Math.max(s.radius+s.center.distanceTo(l),c.radius+c.center.distanceTo(l))*1.02;o.scale.setScalar(1/u),o.position.copy(l).multiplyScalar(-1/u),a.userData={section:e,view:i.view??Dn,triangles:Et(a)};let d=0,f=NaN,p=!1,m=(e,t)=>{if(p)return;let r=Number.isFinite(e)?e:0;d=Gt(d,t,Number.isNaN(f)?0:r-f),f=r,n.shared.uTime.value=r,n.shared.uEnergy.value=d,i.animate(r,d)};return m(0,0),{object:a,radius:1,update:m,dispose(){p||(p=!0,a.removeFromParent(),a.traverse(e=>{let t=e;if(t.isMesh){t.geometry?.dispose();let n=t.material;Array.isArray(n)?n.forEach(e=>e.dispose()):n?.dispose(),e.isInstancedMesh&&e.dispose()}}),n.dispose(),a.clear())}}}var An=4,jn=class{group=new A;hosted=new Map;quality;hovered=null;form=null;failed=new Set;constructor(e){this.quality=e}setQuality(e){this.quality=e}setForm(e,t,n){this.form=e;let r=new Map(e.organs.map(e=>[e.section,e]));for(let[e,i]of r){let r=this.hosted.get(e);if(r)r.from.copy(r.pos),r.start=n?-1e9:t;else{if(this.failed.has(e))continue;try{let t=kn(e,{quality:this.quality}),n=new A;n.name=`organ-holder:${e}`,n.add(t.object),this.group.add(n),r={section:e,organ:t,holder:n,slot:i,level:0,energy:0,pos:new F(...i.pos),from:new F(...i.pos),start:-1e9,goneFor:0,base:i.radius/Math.max(.01,t.radius||1)},this.hosted.set(e,r)}catch(t){this.failed.add(e),console.warn(`[stage] organ ${e} unavailable`,t);continue}}r.slot=i,n&&(r.level=i.presence)}for(let[e,t]of this.hosted)r.has(e)||(t.slot=null)}setHovered(e){this.hovered=e}update(e,t,n,r){let i=!1,a=this.form;for(let[o,s]of this.hosted){let c=s.slot?s.slot.presence:0,l=s.level;if(s.level=c+(s.level-c)*Math.exp(-2.8*e),Math.abs(s.level-c)<.002&&(s.level=c),s.level!==l&&(i=!0),s.slot&&a){let e=Pe(s.slot,a,n.t),r=Math.min(1,Math.max(0,(t-s.start)/1.2));if(r<1){i=!0;let t=r<.5?4*r*r*r:1-(-2*r+2)**3/2;s.pos.set(s.from.x+(e[0]-s.from.x)*t,s.from.y+(e[1]-s.from.y)*t,s.from.z+(e[2]-s.from.z)*t)}else s.pos.set(e[0],e[1],e[2])}let u=Math.max(.01,s.organ.radius||1);s.slot&&(s.base=s.slot.radius/u);let d=s.base*(.25+.75*s.level);s.holder.scale.setScalar(Math.max(1e-4,d)),s.holder.position.copy(s.pos),s.holder.visible=s.level>.01;let f=o===this.hovered?1:o===r?.6:.2;if(s.energy=f+(s.energy-f)*Math.exp(-5*e),Math.abs(s.energy-f)>.003&&(i=!0),s.holder.visible)try{s.organ.update(n.t,s.energy*s.level)}catch{}s.level<=.01&&!s.slot?(s.goneFor+=e,s.goneFor>An&&this.release(o)):s.goneFor=0}return i}sweep(){for(let[e,t]of[...this.hosted])!t.slot&&t.level<=.01&&this.release(e)}pick(e,t,n){let r=n.camera,i=new F,a=r.getWorldDirection(new F),o=n.view.h/2/Math.tan(r.fov*Math.PI/360),s=null;for(let[c,l]of this.hosted){if(!l.slot||l.level<.5)continue;let u=i.copy(l.pos).sub(r.position).dot(a);if(u<.5)continue;i.copy(l.pos).project(r);let d=(i.x+1)/2*n.view.w,f=(1-i.y)/2*n.view.h,p=l.slot.radius*.9*(o/u);(e-d)**2+(t-f)**2>p*p||(!s||u<s.depth)&&(s={kind:`organ`,id:c,depth:u})}return s}positionOf(e){return this.hosted.get(e)?.pos??null}release(e){let t=this.hosted.get(e);if(t){this.hosted.delete(e),t.holder.removeFromParent();try{t.organ.dispose()}catch{}}}dispose(){for(let e of[...this.hosted.keys()])this.release(e);this.group.removeFromParent()}},Mn=14,Nn=4,Pn=`
attribute float aK;
uniform float uPixelRatio; uniform float uSize;
varying float vK;
void main() {
  vK = aK;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uPixelRatio * uSize * (1.0 - aK * 0.85) * clamp(14.0 / -mv.z, 0.4, 3.0);
  gl_Position = projectionMatrix * mv;
}`,Fn=`
uniform vec3 uColor; uniform float uAlpha;
varying float vK;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = exp(-d * d * 14.0) * (1.0 - vK) * uAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a * 1.6, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,In=class{group=new A;flights=[];constructor(e,t){for(let n=0;n<Nn;n++){let n=new L,r=new Float32Array(42),i=new Float32Array(Mn);for(let e=0;e<Mn;e++)i[e]=e/13;n.setAttribute(`position`,new k(r,3).setUsage(P)),n.setAttribute(`aK`,new k(i,1));let a=new O({vertexShader:Pn,fragmentShader:Fn,uniforms:{uColor:{value:e.gold.clone().lerp(e.pearl,.25)},uAlpha:{value:1},uSize:{value:64},uPixelRatio:t.uPixelRatio},transparent:!0,depthWrite:!1,depthTest:!1,blending:2}),o=new g(n,a);o.frustumCulled=!1,o.renderOrder=50,o.visible=!1,this.group.add(o),this.flights.push({points:o,geo:n,mat:a,pos:r,from:new F,ctrl:new F,to:()=>new F,t:0,dur:1,burst:0,active:!1,history:[]})}}launch(e,t,n){let r=this.flights.find(e=>!e.active)??this.flights[0];r.from.copy(e);let i=t(),a=e.distanceTo(i);r.ctrl.copy(e).add(i).multiplyScalar(.5).addScaledVector(n.up,a*.35),r.to=t,r.t=0,r.dur=.95,r.burst=0,r.active=!0,r.onArrive=n.onArrive,r.history=Array.from({length:Mn},()=>e.clone()),r.points.visible=!0,r.mat.uniforms.uAlpha.value=1,r.mat.uniforms.uSize.value=64}update(e){let t=!1;for(let n of this.flights)if(n.active){if(t=!0,n.t<1){n.t=Math.min(1,n.t+e/n.dur);let t=n.t<.5?2*n.t*n.t:1-(-2*n.t+2)**2/2,r=n.to(),i=1-t,a=new F().addScaledVector(n.from,i*i).addScaledVector(n.ctrl,2*i*t).addScaledVector(r,t*t);n.history.unshift(a),n.history.length=Mn,n.t>=1&&(n.onArrive?.(),n.onArrive=void 0)}else{n.burst=Math.min(1,n.burst+e/.45);let t=n.to();n.history.unshift(t.clone()),n.history.length=Mn,n.mat.uniforms.uSize.value=64+n.burst*140,n.mat.uniforms.uAlpha.value=1-n.burst,n.burst>=1&&(n.active=!1,n.points.visible=!1)}for(let e=0;e<Mn;e++){let t=n.history[e]??n.history[n.history.length-1];n.pos[e*3]=t.x,n.pos[e*3+1]=t.y,n.pos[e*3+2]=t.z}n.geo.getAttribute(`position`).needsUpdate=!0}return t}dispose(){for(let e of this.flights)e.geo.dispose(),e.mat.dispose();this.group.removeFromParent()}},Ln=`
uniform float uSize;
varying vec2 vUv; varying float vDepth;
void main() {
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uSize;
  vUv = position.xy * 2.0; vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,Rn=`
uniform vec3 uColor; uniform float uIntensity; uniform float uFalloff; uniform float uFogDensity; uniform float uRing;
varying vec2 vUv; varying float vDepth;
void main() {
  float d = length(vUv);
  float g = exp(-d * d * uFalloff) * uIntensity;
  g += uRing * smoothstep(0.05, 0.0, abs(d - 0.62)) * 0.6;
  float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  gl_FragColor = vec4(uColor * g * (1.0 - fog), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;function zn(e,t,n,r=5){let i=new D(1,1),a=new O({vertexShader:Ln,fragmentShader:Rn,uniforms:{uColor:{value:e.clone()},uSize:{value:t},uIntensity:{value:1},uFalloff:{value:r},uRing:{value:0},uFogDensity:n.uFogDensity},transparent:!0,depthWrite:!1,blending:2}),o=new x(i,a);return o.frustumCulled=!1,o.renderOrder=8,o.raycast=()=>void 0,{mesh:o,mat:a,geo:i}}function Bn(e){return{uTime:{value:0},uMotion:{value:1},uFogColor:{value:e.clone()},uFogDensity:{value:.012},uPixelRatio:{value:1}}}var Vn=class{level=0;target=0;hiddenFor=0;step(e,t=2.6){let n=this.level;return this.level=this.target+(this.level-this.target)*Math.exp(-t*e),Math.abs(this.level-this.target)<.002&&(this.level=this.target),this.level<=.001?this.hiddenFor+=e:this.hiddenFor=0,this.level!==n}snap(){this.level=this.target}},Hn=`
uniform float uTime; uniform float uMotion; uniform float uFlash;
varying vec3 vN; varying vec3 vW; varying float vDepth; varying float vD;
void main() {
  vec3 n = normalize(normal);
  float t = uTime * uMotion;
  float d = sin(n.x * 4.0 + t * 0.9) * sin(n.y * 5.0 - t * 0.7) * sin(n.z * 3.0 + t * 0.6);
  vD = d;
  vec3 p = position + n * (d * 0.09 + uFlash * 0.12);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vN = normalize(mat3(modelMatrix) * n); vW = wp.xyz;
  vec4 mv = viewMatrix * wp; vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,Un=`
uniform vec3 uInner; uniform vec3 uRim; uniform vec3 uDeep; uniform float uLevel; uniform float uFlash; uniform vec3 uFogColor; uniform float uFogDensity;
varying vec3 vN; varying vec3 vW; varying float vDepth; varying float vD;
void main() {
  vec3 v = normalize(cameraPosition - vW);
  float facing = max(dot(normalize(vN), v), 0.0);
  float fres = pow(1.0 - facing, 2.2);
  vec3 col = mix(uDeep, uInner * 1.25, pow(facing, 5.0)) * (0.9 + vD * 0.6);
  col += uRim * fres * 1.5;
  col += vec3(1.0, 0.95, 0.85) * uFlash * 0.8;
  float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  col = mix(col, uFogColor, fog * 0.9);
  gl_FragColor = vec4(col, uLevel * (0.82 + 0.18 * fres));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,Wn=class{group=new A;presence=new Vn;geo;mat;halo;rings=[];flash=0;constructor(e,t,n){this.geo=new w(1.3,n?12:24),this.mat=new O({vertexShader:Hn,fragmentShader:Un,uniforms:{uInner:{value:e.iris.clone().lerp(e.pearl,.15)},uRim:{value:e.gold.clone()},uDeep:{value:e.irisDeep.clone().multiplyScalar(.35)},uLevel:{value:1},uFlash:{value:0},uTime:t.uTime,uMotion:t.uMotion,uFogColor:t.uFogColor,uFogDensity:t.uFogDensity},transparent:!0});let r=new x(this.geo,this.mat);r.renderOrder=6,this.halo=zn(e.iris.clone().lerp(e.gold,.3),8,t,6),this.group.add(this.halo.mesh,r);for(let[t,r]of[[3.9,.3],[5.2,-.22]]){let i=new d(t,.012,4,n?96:160),a=new h({color:e.gold,transparent:!0,opacity:.22,blending:2,depthWrite:!1}),o=new x(i,a);o.rotation.x=Math.PI/2+r,this.group.add(o),this.rings.push({mesh:o,geo:i,mat:a})}}receive(){this.flash=1}update(e,t){let n=this.presence.step(e),r=this.presence.level;return this.group.visible=r>.004,this.group.scale.setScalar(.5+.5*r+this.flash*.12),this.flash>0&&(this.flash=Math.max(0,this.flash-e/.7),n=!0),this.mat.uniforms.uLevel.value=r,this.mat.uniforms.uFlash.value=this.flash,this.halo.mat.uniforms.uIntensity.value=r*(.32+.08*Math.sin(t.t*1.3)+this.flash*.9),this.rings.forEach((e,n)=>{e.mat.opacity=.2*r,e.mesh.rotation.z=t.t*(n?-.04:.05)}),n}dispose(){this.geo.dispose(),this.mat.dispose(),this.halo.geo.dispose(),this.halo.mat.dispose();for(let e of this.rings)e.geo.dispose(),e.mat.dispose();this.group.removeFromParent()}},Gn=e=>({value:e,velocity:0});function Kn(e,t,n,r){if(r<=0)return;let i=2/Math.max(1e-4,n),a=i*r,o=1/(1+a+.48*a*a+.235*a*a*a),s=e.value-t,c=(e.velocity+i*s)*r;e.velocity=(e.velocity-i*c)*o,e.value=t+(s+c)*o}function $(e,t){e.value=t,e.velocity=0}function qn(e,t){let n=(t-e)%(Math.PI*2);return n>Math.PI&&(n-=Math.PI*2),n<=-Math.PI&&(n+=Math.PI*2),n}function Jn(e,t,n,r){Kn(e,e.value+qn(e.value,t),n,r)}var Yn=(e,t,n=.001)=>Math.abs(e.value-t)<n&&Math.abs(e.velocity)<n*4,Xn=(e,t,n,r)=>t+(e-t)*Math.exp(-n*r);function Zn(e,t,n){let r=Math.hypot(e,t,n)||1e-6;return{r,theta:Math.atan2(e,n),phi:Math.asin(Math.max(-1,Math.min(1,t/r)))}}function Qn(e,t,n){let r=Math.cos(n);return[e*r*Math.sin(t),e*Math.sin(n),e*r*Math.cos(t)]}function $n(e){if(!e.length)return 0;let t=[...e].sort((e,t)=>e-t),n=t.length>>1;return t.length%2?t[n]:(t[n-1]+t[n])/2}function er(e,t=36,n=34){return e.length>=t&&$n(e)>n}var tr=28,nr=24,rr=`
attribute vec2 aUv; attribute float aAlpha;
varying vec2 vUv; varying float vA; varying float vDepth;
void main() { vUv = aUv; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,ir=`
uniform vec3 uA; uniform vec3 uB; uniform float uTime; uniform float uMotion; uniform float uFogDensity;
varying vec2 vUv; varying float vA; varying float vDepth;
void main() {
  float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float core = pow(across, 2.5);
  float travel = pow(fract(vUv.x * 1.4 - uTime * 0.35 * uMotion), 6.0);
  float ends = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
  vec3 col = mix(uA, uB, vUv.x) * core * (0.45 + 1.4 * travel) * ends * vA;
  float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  gl_FragColor = vec4(col * (1.0 - fog), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,ar=class{mesh;geo=new L;mat;pos;alpha;pairs=[];a=new F;b=new F;c=new F;p=new F;t=new F;side=new F;q=new F;view=new F;constructor(e,t){let n=1392;this.pos=new Float32Array(n*3),this.alpha=new Float32Array(n);let r=new Float32Array(n*2),i=[];for(let e=0;e<nr;e++){let t=e*29*2;for(let e=0;e<=tr;e++)if(r[(t+e*2)*2]=e/tr,r[(t+e*2)*2+1]=0,r[(t+e*2+1)*2]=e/tr,r[(t+e*2+1)*2+1]=1,e<tr){let n=t+e*2;i.push(n,n+1,n+2,n+1,n+3,n+2)}}this.geo.setAttribute(`position`,new k(this.pos,3).setUsage(P)),this.geo.setAttribute(`aAlpha`,new k(this.alpha,1).setUsage(P)),this.geo.setAttribute(`aUv`,new k(r,2)),this.geo.setIndex(i),this.geo.setDrawRange(0,0),this.mat=new O({vertexShader:rr,fragmentShader:ir,uniforms:{uA:{value:e.iris.clone()},uB:{value:e.gold.clone()},uTime:t.uTime,uMotion:t.uMotion,uFogDensity:t.uFogDensity},transparent:!0,depthWrite:!1,blending:2,side:2}),this.mesh=new x(this.geo,this.mat),this.mesh.frustumCulled=!1,this.mesh.renderOrder=7}set(e){let t=new Map(this.pairs.map(e=>[`${e.from}>${e.to}`,e.level]));this.pairs=e.slice(0,nr).map(e=>({...e,level:t.get(`${e.from}>${e.to}`)??0}))}update(e,t,n,r){let i=!1,a=0;for(let o of this.pairs){let s=n(o.from),c=n(o.to);if(!s||!c)continue;o.level=Math.min(1,o.level+e/.9),o.level<1&&(i=!0),this.a.copy(s),this.b.copy(c),this.c.copy(this.a).add(this.b).multiplyScalar(.5),this.view.copy(t.position).sub(this.c).normalize(),this.c.addScaledVector(this.view,this.a.distanceTo(this.b)*.18);let l=Math.min(r(o.from),r(o.to))*o.level,u=o.level,d=a*29*2;for(let e=0;e<=tr;e++){let n=e/tr*u,r=1-n;this.p.set(0,0,0).addScaledVector(this.a,r*r).addScaledVector(this.c,2*r*n).addScaledVector(this.b,n*n),this.q.copy(this.b).sub(this.c),this.t.copy(this.c).sub(this.a).multiplyScalar(2*r).addScaledVector(this.q,2*n).normalize(),this.view.copy(t.position).sub(this.p).normalize(),this.side.crossVectors(this.t,this.view).normalize().multiplyScalar(.05);let i=d+e*2;this.pos[i*3]=this.p.x-this.side.x,this.pos[i*3+1]=this.p.y-this.side.y,this.pos[i*3+2]=this.p.z-this.side.z,this.pos[(i+1)*3]=this.p.x+this.side.x,this.pos[(i+1)*3+1]=this.p.y+this.side.y,this.pos[(i+1)*3+2]=this.p.z+this.side.z,this.alpha[i]=l,this.alpha[i+1]=l}a++}return this.geo.setDrawRange(0,a*tr*6),this.geo.getAttribute(`position`).needsUpdate=!0,this.geo.getAttribute(`aAlpha`).needsUpdate=!0,this.mesh.visible=a>0,i}dispose(){this.geo.dispose(),this.mat.dispose(),this.mesh.removeFromParent()}};function or(e,t){try{let n=getComputedStyle(document.documentElement).getPropertyValue(e).trim();return/^#[0-9a-f]{6}$/i.test(n)?n:t}catch{return t}}function sr(){if(typeof document<`u`&&document.querySelector(`.ms-app`))return{night:new M(`#f3f1e9`),night2:new M(`#252b24`),plum:new M(`#343c31`),pearl:new M(`#d3d4c7`),lilac:new M(`#9ca58f`),iris:new M(`#d4472a`),irisDeep:new M(`#635344`),frost:new M(`#d4472a`),gold:new M(`#d4472a`),rose:new M(`#d4472a`),bone:new M(`#e9e8dc`),warm:new M(`#bb7a56`)};let e=(e,t)=>new M(or(e,t));return{night:e(`--night`,`#0a0811`),night2:e(`--night-2`,`#100c1a`),plum:e(`--plum`,`#17121f`),pearl:e(`--pearl`,`#f3effc`),lilac:e(`--lilac`,`#cdc5e4`),iris:e(`--iris`,`#b3a3ff`),irisDeep:e(`--iris-deep`,`#3a2a86`),frost:e(`--frost`,`#9fdcff`),gold:e(`--gold`,`#f2d6a2`),rose:e(`--rose`,`#ff9fc8`),bone:new M(`#ece2d1`),warm:new M(`#d98a5e`)}}var cr={movies:`#ffb45e`,music:`#b3a3ff`,sports:`#ff8d84`,gaming:`#86e3ff`,news:`#f3effc`,fashion:`#f2b8a2`,culture:`#72d8bd`,kids:`#ffd0e6`,live:`#ff5468`},lr={migration:`#b3a3ff`,influence:`#9fdcff`,exchange:`#f2d6a2`,programme:`#f3effc`},ur=5,dr=`
varying vec3 vN; varying vec3 vW; varying float vDepth;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal); vW = wp.xyz;
  vec4 mv = viewMatrix * wp; vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,fr=`
uniform vec3 uBase; uniform vec3 uRim; uniform float uLevel; uniform vec3 uFogColor; uniform float uFogDensity;
varying vec3 vN; varying vec3 vW; varying float vDepth;
void main() {
  vec3 v = normalize(cameraPosition - vW);
  float f = 1.0 - max(dot(normalize(vN), v), 0.0);
  vec3 col = uBase * (0.75 + 0.5 * pow(1.0 - f, 2.0)) + uRim * pow(f, 3.2) * 0.45;
  float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  col = mix(col, uFogColor, clamp(fog + (1.0 - uLevel), 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,pr=`
uniform vec3 uColor; uniform float uLevel;
varying vec3 vN; varying vec3 vW; varying float vDepth;
void main() {
  vec3 v = normalize(cameraPosition - vW);
  float i = pow(smoothstep(0.0, 0.7, -dot(normalize(vN), v)), 1.6);
  gl_FragColor = vec4(uColor * i * 0.2 * uLevel, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,mr=`
attribute float aSeed;
uniform float uSize; uniform float uTime; uniform float uMotion; uniform vec3 uFocus; uniform float uFocusOn; uniform float uPixelRatio; uniform float uLevel;
varying float vA; varying float vF;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(wp.xyz);
  float facing = dot(n, normalize(cameraPosition - wp.xyz));
  vA = smoothstep(-0.05, 0.45, facing) * (0.78 + 0.22 * sin(uTime * 0.8 + aSeed * 6.2831) * uMotion) * uLevel;
  vF = uFocusOn * smoothstep(0.93, 0.995, dot(n, uFocus));
  vec4 mv = viewMatrix * wp;
  gl_PointSize = uSize * uPixelRatio * (0.55 + 0.45 * max(facing, 0.0)) * (1.0 + vF * 0.45) * clamp(16.0 / -mv.z, 0.7, 1.8);
  gl_Position = projectionMatrix * mv;
}`,hr=`
uniform vec3 uColor; uniform vec3 uHot;
varying float vA; varying float vF;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = (1.0 - smoothstep(0.15, 0.5, d)) * vA;
  gl_FragColor = vec4(mix(uColor, uHot, vF), a * (0.8 + vF * 0.4));
  #include <colorspace_fragment>
}`,gr=`
attribute float aSize; attribute vec3 aColor; attribute float aKind; attribute float aPhase; attribute float aState;
uniform float uPixelRatio; uniform float uLevel;
varying vec3 vColor; varying float vKind; varying float vPhase; varying float vA; varying float vState;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(wp.xyz);
  vA = smoothstep(0.05, 0.3, dot(n, normalize(cameraPosition - wp.xyz))) * uLevel;
  vec4 mv = viewMatrix * wp;
  gl_PointSize = aSize * uPixelRatio * (1.0 + aState * 0.45) * clamp(16.0 / -mv.z, 0.75, 1.9);
  vColor = aColor; vKind = aKind; vPhase = aPhase; vState = aState;
  gl_Position = projectionMatrix * mv;
}`,_r=`
uniform float uTime; uniform float uMotion; uniform vec3 uPearl;
varying vec3 vColor; varying float vKind; varying float vPhase; varying float vA; varying float vState;
float band(float r, float at, float w) { return 1.0 - smoothstep(w * 0.5, w, abs(r - at)); }
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  float a; vec3 col = vColor;
  if (vKind > 0.5 && vKind < 1.5) {
    a = band(r, 0.3, 0.09) * 0.95; // expanding: hollow frost ring
  } else {
    float core = 1.0 - smoothstep(0.22, 0.3, r);
    float t = fract(uTime * (vKind > 1.5 ? 0.42 : 0.26) + vPhase);
    float pulse = band(r, 0.3 + t * 0.62, 0.08) * (1.0 - t) * 0.75 * uMotion;
    a = max(core, exp(-r * r * 8.0) * 0.45) + pulse;
    col = mix(col, uPearl, (1.0 - smoothstep(0.0, 0.14, r)) * 0.85);
  }
  a += vState * band(r, 0.8, 0.07) * 0.9;
  a *= vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, min(a, 1.0));
  #include <colorspace_fragment>
}`,vr=`
varying float vU; varying float vDepth;
void main() { vU = uv.x; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,yr=`
uniform vec3 uColor; uniform float uTime; uniform float uMotion; uniform float uState; uniform float uLevel;
varying float vU; varying float vDepth;
void main() {
  float base = mix(0.16, 0.85, uState);
  float x = fract(vU * 2.5 - uTime * 0.22);
  float pulse = pow(x, 8.0) * uMotion * mix(0.35, 1.2, uState);
  float ends = smoothstep(0.0, 0.04, vU) * smoothstep(1.0, 0.96, vU);
  gl_FragColor = vec4(uColor * (base + pulse) * ends * uLevel, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,br=`
uniform vec3 uColor; uniform float uTime; uniform float uMotion; uniform float uLevel;
varying vec2 vUv;
void main() {
  float h = vUv.y;
  float a = pow(1.0 - h, 1.8) * (0.75 + 0.25 * sin(uTime * 2.1) * uMotion);
  gl_FragColor = vec4(uColor * a * uLevel, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,xr=`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;function Sr(e,t,n=64){let r=new F(...G(e[0],e[1])),i=new F(...G(t[0],t[1])),a=Math.acos(Math.max(-1,Math.min(1,r.dot(i)))),o=.03+a/Math.PI*.26,s=[];for(let e=0;e<=n;e++){let t=e/n,c=a<1e-6?r.clone():r.clone().multiplyScalar(Math.sin((1-t)*a)/Math.sin(a)).add(i.clone().multiplyScalar(Math.sin(t*a)/Math.sin(a)));s.push(c.normalize().multiplyScalar(ur*(1.006+o*Math.sin(Math.PI*t))))}return s}var Cr=class{group=new A;presence=new Vn;disposables=[];sphereMat;atmosMat;dotsMat=null;nodesMat;nodesState;nodes=[];routes=[];beaconMat=null;focus={};hovered=null;disposed=!1;onChange;constructor(e,t,n,r,i){this.onChange=i;let a=new S(ur,r?48:72,r?32:48);this.sphereMat=new O({vertexShader:dr,fragmentShader:fr,uniforms:{uBase:{value:t.night2.clone().multiplyScalar(1.25)},uRim:{value:t.iris.clone()},uLevel:{value:1},uFogColor:n.uFogColor,uFogDensity:n.uFogDensity}});let o=new x(a,this.sphereMat);o.renderOrder=1;let s=new S(ur*1.07,r?40:64,r?28:40);this.atmosMat=new O({vertexShader:dr,fragmentShader:pr,uniforms:{uColor:{value:t.iris.clone().lerp(t.irisDeep,.35)},uLevel:{value:1}},side:1,transparent:!0,depthWrite:!1,blending:2});let u=new x(s,this.atmosMat);this.group.add(u,o),this.disposables.push(a,this.sphereMat,s,this.atmosMat);let d=c(e).nodes.filter(e=>e.level===`city`),f=[],p=[],m=[],h=[],_=[],v=null;d.forEach((e,n)=>{let r=new F(...G(e.lat,e.lon)),i=r.clone().multiplyScalar(ur*1.012);f.push(i.x,i.y,i.z);let a=e.gateway?t.pearl:e.expanding?t.frost:t.iris;m.push(a.r,a.g,a.b),h.push(e.gateway?2:+!!e.expanding),p.push(e.gateway?22:e.expanding?13:12+Math.min(8,e.count*1.5)),_.push(n*.37%1);let o={id:e.id,pos:i,normal:r};this.nodes.push(o),e.gateway&&(v=o)});let y=new L;y.setAttribute(`position`,new B(f,3)),y.setAttribute(`aSize`,new B(p,1)),y.setAttribute(`aColor`,new B(m,3)),y.setAttribute(`aKind`,new B(h,1)),y.setAttribute(`aPhase`,new B(_,1)),this.nodesState=new B(new Float32Array(d.length),1),y.setAttribute(`aState`,this.nodesState),this.nodesMat=new O({vertexShader:gr,fragmentShader:_r,uniforms:{uTime:n.uTime,uMotion:n.uMotion,uPixelRatio:n.uPixelRatio,uPearl:{value:t.pearl.clone()},uLevel:{value:1}},transparent:!0,depthWrite:!1});let b=new g(y,this.nodesMat);b.renderOrder=4,this.group.add(b),this.disposables.push(y,this.nodesMat);let C=new Map(e.places.map(e=>[e.id,e.coords]));for(let t of e.routes){let e=C.get(t.from),i=C.get(t.to);if(!e||!i)continue;let a=new ce(Sr(e,i,64)),o=new N(a,r?48:96,.022,r?4:6,!1),s=new O({vertexShader:vr,fragmentShader:yr,uniforms:{uColor:{value:new M(lr[t.kind]??`#b3a3ff`)},uTime:n.uTime,uMotion:n.uMotion,uState:{value:0},uLevel:{value:1}},transparent:!0,depthWrite:!1,blending:2}),c=new x(o,s);c.renderOrder=3,this.group.add(c),this.routes.push({id:t.id,mesh:c,mat:s,state:0}),this.disposables.push(o,s)}if(v){let e=v,r=new re(.03,.12,1.3,16,1,!0);r.translate(0,.65,0),this.beaconMat=new O({vertexShader:xr,fragmentShader:br,uniforms:{uColor:{value:t.pearl.clone().lerp(t.gold,.35)},uTime:n.uTime,uMotion:n.uMotion,uLevel:{value:1}},transparent:!0,depthWrite:!1,blending:2,side:2});let i=new x(r,this.beaconMat);i.position.copy(e.normal.clone().multiplyScalar(ur*1)),i.quaternion.setFromUnitVectors(new F(0,1,0),e.normal),i.renderOrder=6,this.group.add(i),this.disposables.push(r,this.beaconMat)}l().then(e=>{if(this.disposed)return;let i=r?2:1,a=[],o=[];for(let t=0;t<e.points.length;t+=2*i){let n=G(e.points[t],e.points[t+1],ur*1.003);a.push(n[0],n[1],n[2]),o.push((t*.618%1+1)%1)}let s=new L;s.setAttribute(`position`,new B(a,3)),s.setAttribute(`aSeed`,new B(o,1)),this.dotsMat=new O({vertexShader:mr,fragmentShader:hr,uniforms:{uSize:{value:r?3.8:3.3},uTime:n.uTime,uMotion:n.uMotion,uPixelRatio:n.uPixelRatio,uFocus:{value:new F(0,0,1)},uFocusOn:{value:0},uLevel:{value:this.presence.level},uColor:{value:t.lilac.clone()},uHot:{value:t.gold.clone()}},transparent:!0,depthWrite:!1});let c=new g(s,this.dotsMat);c.renderOrder=2,this.group.add(c),this.disposables.push(s,this.dotsMat),this.applyFocus(),this.onChange()}).catch(()=>void 0)}setFocus(e){this.focus=e,this.applyFocus()}setHovered(e){this.hovered!==e&&(this.hovered=e,this.applyFocus())}applyFocus(){let e=this.nodesState.array;this.nodes.forEach((t,n)=>{e[n]=t.id===this.focus.place?1:t.id===this.hovered?.7:this.focus.scope?.has(t.id)?.35:0}),this.nodesState.needsUpdate=!0;for(let e of this.routes)e.mat.uniforms.uState.value=+(e.id===this.focus.route);if(this.dotsMat){let e=this.nodes.find(e=>e.id===this.focus.place);e?(this.dotsMat.uniforms.uFocus.value.copy(e.normal),this.dotsMat.uniforms.uFocusOn.value=1):this.dotsMat.uniforms.uFocusOn.value=0}}update(e,t){let n=this.presence.step(e,2.4),r=this.presence.level;this.group.visible=r>.004,this.group.scale.setScalar(.6+.4*r),this.sphereMat.uniforms.uLevel.value=r,this.atmosMat.uniforms.uLevel.value=r,this.nodesMat.uniforms.uLevel.value=r,this.dotsMat&&(this.dotsMat.uniforms.uLevel.value=r),this.beaconMat&&(this.beaconMat.uniforms.uLevel.value=r);for(let e of this.routes)e.mat.uniforms.uLevel.value=r;return n}pick(e,t,n){if(this.presence.level<.6)return null;let r=n.camera,i=new F,a=new F,o=r.getWorldDirection(new F),s=null,c=this.group.scale.x;for(let l of this.nodes){let u=i.copy(l.pos).multiplyScalar(c);if(a.copy(r.position).sub(u).normalize(),a.dot(l.normal)<.15)continue;let d=u.clone().sub(r.position).dot(o);u.project(r);let f=(u.x+1)/2*n.view.w,p=(1-u.y)/2*n.view.h;(e-f)**2+(t-p)**2>196||(!s||d<s.depth)&&(s={kind:`place`,id:l.id,depth:d})}return s}nodePosition(e){let t=this.nodes.find(t=>t.id===e);return t?[t.pos.x,t.pos.y,t.pos.z]:null}dispose(){this.disposed=!0;for(let e of this.disposables)e.dispose();this.disposables.length=0,this.group.removeFromParent()}};function wr(e,t,n){let r=[[0,0],[t,0],[t*.92,e*.22],[t*.62,e*.55],[t*.42,e*.82],[t*.3,e*.95],[0,e]].map(([e,t])=>new R(e,t));return new m(r,n?7:12)}function Tr(e){let t=e?18:30,n=[[0,-.26],[.5,-.29],[.66,-.24],[.6,-.08],[.58,0],[.6,.08],[.66,.24],[.5,.29],[0,.26]].map(([e,t])=>new R(e,t)),r=new m(n,t);r.translate(0,0,.98);let i=new d(.36,.085,e?6:10,e?16:28);i.rotateX(Math.PI/2);let a=[r,i];for(let t of[-1,1]){let n=wr(.95,.14,e);n.rotateZ(t*-Math.PI/2),n.rotateY(t*.38),n.translate(t*.34,.02,.08),a.push(n);let r=new re(.075,.09,.62,e?6:8);r.rotateX(Math.PI/2),r.translate(t*.3,0,.52),a.push(r)}let o=wr(.78,.13,e);o.rotateX(-Math.PI/2-.42),o.translate(0,.06,-.3),a.push(o);for(let e of a)e.deleteAttribute(`uv`);let s=gt(a,!1)??r;for(let e of a)e!==s&&e.dispose();return s.computeBoundingSphere(),s}var Er=`
attribute float aGlow;
varying vec3 vN; varying vec3 vW; varying float vGlow; varying vec3 vLocal; varying float vDepth;
void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = modelMatrix * instanceMatrix;
  #endif
  vec4 wp = m * vec4(position, 1.0);
  vN = normalize(mat3(m) * normal);
  vW = wp.xyz;
  vGlow = aGlow;
  vLocal = position;
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,Dr=`
uniform vec3 uBone; uniform vec3 uWarm; uniform vec3 uShade; uniform vec3 uRim; uniform vec3 uCore; uniform vec3 uGlowColor;
uniform vec3 uAxisPoint; uniform vec3 uAxisDir; uniform float uLevel; uniform float uTime; uniform float uMotion;
uniform vec3 uFogColor; uniform float uFogDensity;
varying vec3 vN; varying vec3 vW; varying float vGlow; varying vec3 vLocal; varying float vDepth;
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vW);
  vec3 key = normalize(vec3(-0.5, 0.75, 0.45));
  float ndl = dot(n, key);
  float wrap = clamp((ndl + 0.5) / 1.5, 0.0, 1.0);
  // shadow side sinks to violet with a warm subsurface band at the terminator
  vec3 col = mix(uShade, uBone, wrap * wrap);
  col += uWarm * exp(-pow((ndl + 0.05) * 3.2, 2.0)) * 0.2;
  // porous grain
  col *= 0.9 + 0.1 * h3(floor(vLocal * 38.0));
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col += uRim * fres * 0.55;
  // the canal's light: surfaces facing the axis glow
  vec3 d = vW - uAxisPoint;
  vec3 radial = d - uAxisDir * dot(d, uAxisDir);
  float rd = length(radial);
  float faces = clamp(dot(n, -radial / max(rd, 1e-3)), 0.0, 1.0);
  float pulse = 0.75 + 0.25 * sin(dot(d, uAxisDir) * 0.9 - uTime * 1.6 * uMotion);
  col += uCore * faces * exp(-rd * 1.6) * 1.4 * pulse;
  col += uGlowColor * vGlow * (0.35 + fres * 1.2);
  col *= 0.92;
  float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  col = mix(col, uFogColor, clamp(fog * 0.95 + (1.0 - uLevel), 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;function Or(e,t,n){return new O({vertexShader:Er,fragmentShader:Dr,uniforms:{uBone:{value:e.bone.clone().multiplyScalar(.74)},uWarm:{value:e.warm.clone()},uShade:{value:new M(`#231b31`)},uRim:{value:e.iris.clone()},uCore:{value:n.core.clone()},uGlowColor:{value:n.glow.clone()},uAxisPoint:{value:new F},uAxisDir:{value:n.axisDir.clone().normalize()},uLevel:{value:1},uTime:t.uTime,uMotion:t.uMotion,uFogColor:t.uFogColor,uFogDensity:t.uFogDensity}})}var kr=`
varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vDepth;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vW = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,Ar=`
uniform vec3 uColor; uniform float uLevel; uniform float uTime; uniform float uMotion; uniform float uLength; uniform float uFogDensity; uniform float uSoft;
varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vDepth;
void main() {
  vec3 v = normalize(cameraPosition - vW);
  float facing = abs(dot(normalize(vN), v));
  float core = mix(pow(facing, 2.0), pow(facing, 6.0), uSoft);
  float y = vUv.y * uLength;
  float travel = pow(0.5 + 0.5 * sin(y * 0.7 - uTime * 2.2 * uMotion), 10.0);
  float ends = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
  float a = core * ends * (0.55 + 0.9 * travel) * uLevel;
  float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  gl_FragColor = vec4(uColor * a * (1.0 - fog), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;function jr(e,t,n,r,i=0){let a=new re(n,n,t,12,1,!0),o=new O({vertexShader:kr,fragmentShader:Ar,uniforms:{uColor:{value:e.clone()},uLevel:{value:1},uLength:{value:t},uSoft:{value:i},uTime:r.uTime,uMotion:r.uMotion,uFogDensity:r.uFogDensity},transparent:!0,depthWrite:!1,blending:2,side:2}),s=new x(a,o);return s.renderOrder=5,{mesh:s,mat:o,geo:a}}var Mr=`
attribute float aYear;
uniform float uFocusFrom; uniform float uFocusTo; uniform float uLevel;
varying float vA; varying float vDepth; varying float vF;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  vF = (aYear >= uFocusFrom && aYear <= uFocusTo) ? 1.0 : 0.0;
  vA = uLevel;
  gl_Position = projectionMatrix * mv;
}`,Nr=`
uniform vec3 uColor; uniform float uFogDensity;
varying float vA; varying float vDepth; varying float vF;
void main() {
  float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  gl_FragColor = vec4(uColor * vA * (0.28 + 0.6 * vF) * (1.0 - fog), 1.0);
  #include <colorspace_fragment>
}`,Pr=`
attribute float aYear;
uniform float uPixelRatio; uniform float uFocusFrom; uniform float uFocusTo; uniform float uLevel;
varying float vA; varying float vDepth; varying float vDecade;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  float f = (aYear >= uFocusFrom && aYear <= uFocusTo) ? 1.0 : 0.0;
  vDecade = mod(aYear, 10.0) < 0.5 ? 1.0 : 0.0;
  gl_PointSize = uPixelRatio * (vDecade > 0.5 ? 7.0 : 3.6) * (1.0 + f * 0.6) * clamp(28.0 / vDepth, 0.5, 2.0);
  vA = uLevel * (0.45 + 0.55 * f);
  gl_Position = projectionMatrix * mv;
}`,Fr=`
uniform vec3 uColor; uniform float uFogDensity;
varying float vA; varying float vDepth; varying float vDecade;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.25, d) * vA;
  if (a < 0.004) discard;
  float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  gl_FragColor = vec4(uColor * a * (1.0 - fog), 1.0);
  #include <colorspace_fragment>
}`,Ir=class{group=new A;presence=new Vn;geo;mat;bones;glow;glowLevels;beam;strand;beads;strandMat;beadMat;centres=[];focusDecade=null;hovered=null;constructor(e,t,n){let r=ye.length;this.geo=Tr(n),this.glow=new f(new Float32Array(r),1),this.geo.setAttribute(`aGlow`,this.glow),this.glowLevels=Array(r).fill(0);let i=new F(...Ce);this.mat=Or(e,t,{core:e.frost,glow:e.frost,axisDir:i}),this.bones=new T(this.geo,this.mat,r);let a=new E().setFromUnitVectors(new F(0,1,0),i),o=new F(...Ye).negate(),s=new F().crossVectors(i,o),c=new E().setFromRotationMatrix(new b().makeBasis(s,i,o)),l=new b;ye.forEach((e,t)=>{let n=new F(...qe(e+5));this.centres.push(n);let r=new E().setFromAxisAngle(new F(0,1,0),Math.sin(t*1.3)*.12),i=c.clone().multiply(r),a=.95;l.compose(n,i,new F(a,a,a)),this.bones.setMatrixAt(t,l)}),this.bones.instanceMatrix.needsUpdate=!0,this.bones.computeBoundingSphere();let u=(ve+1-H)*.42+6;this.beam=jr(e.frost,u,.07,t,0),this.beam.mesh.quaternion.copy(a),this.beam.mesh.position.set(...qe((H+ve+1)/2));let d=[],m=[];for(let e=H;e<=ve+1;e+=n?.25:.125)d.push(...Xe(e)),m.push(e);let h=new L;h.setAttribute(`position`,new B(d,3)),h.setAttribute(`aYear`,new B(m,1));let _={uFocusFrom:{value:-1},uFocusTo:{value:-1},uLevel:{value:1}};this.strandMat=new O({vertexShader:Mr,fragmentShader:Nr,uniforms:{..._,uColor:{value:e.frost.clone()},uFogDensity:t.uFogDensity},transparent:!0,depthWrite:!1,blending:2}),this.strand=new p(h,this.strandMat);let v=[],y=[];for(let e=H;e<=ve;e++)v.push(...Xe(e+.5)),y.push(e);let x=new L;x.setAttribute(`position`,new B(v,3)),x.setAttribute(`aYear`,new B(y,1)),this.beadMat=new O({vertexShader:Pr,fragmentShader:Fr,uniforms:{uFocusFrom:_.uFocusFrom,uFocusTo:_.uFocusTo,uLevel:{value:1},uColor:{value:e.frost.clone()},uPixelRatio:t.uPixelRatio,uFogDensity:t.uFogDensity},transparent:!0,depthWrite:!1,blending:2}),this.beads=new g(x,this.beadMat),this.group.add(this.bones,this.beam.mesh,this.strand,this.beads)}setFocus(e,t){this.focusDecade=e;let n=t??e??-1,r=t??(e==null?-1:e+9);this.strandMat.uniforms.uFocusFrom.value=n,this.strandMat.uniforms.uFocusTo.value=r}setHovered(e){this.hovered=e}update(e,t){let n=this.presence.step(e),r=this.presence.level;this.group.visible=r>.004,this.mat.uniforms.uLevel.value=r,this.beam.mat.uniforms.uLevel.value=r*.9,this.strandMat.uniforms.uLevel.value=r,this.beadMat.uniforms.uLevel.value=r;let i=this.glow.array;return ye.forEach((t,r)=>{let a=t===this.focusDecade?1:t===this.hovered?.6:0,o=a+(this.glowLevels[r]-a)*Math.exp(-6*e);Math.abs(o-a)>.002&&(n=!0),this.glowLevels[r]=Math.abs(o-a)<.002?a:o,i[r]=this.glowLevels[r]}),this.glow.needsUpdate=!0,n}pick(e,t,n){if(this.presence.level<.5)return null;let r=n.camera,i=new F,a=r.getWorldDirection(new F),o=n.view.h/2/Math.tan(r.fov*Math.PI/360),s=null;return this.centres.forEach((c,l)=>{let u=i.copy(c).sub(r.position).dot(a);if(u<.5)return;i.copy(c).project(r);let d=(i.x+1)/2*n.view.w,f=(1-i.y)/2*n.view.h,p=o/u*1.2;(e-d)**2+(t-f)**2>p*p||(!s||u<s.depth)&&(s={kind:`decade`,id:String(ye[l]),depth:u})}),s}dispose(){this.geo.dispose(),this.mat.dispose(),this.bones.dispose(),this.beam.geo.dispose(),this.beam.mat.dispose(),this.strand.geometry.dispose(),this.strandMat.dispose(),this.beads.geometry.dispose(),this.beadMat.dispose(),this.group.removeFromParent()}},Lr=1e3/30,Rr=class{raf=0;timer=0;disposed=!1;frame;canRun;constructor(e,t){this.frame=e,this.canRun=t}wake(){this.disposed||this.raf||(this.timer&&=(window.clearTimeout(this.timer),0),this.canRun()&&(this.raf=requestAnimationFrame(this.tick)))}get running(){return!!(this.raf||this.timer)}tick=e=>{if(this.raf=0,this.disposed||!this.canRun())return;let t=this.frame(e);if(!this.disposed&&this.canRun()){if(t===`busy`)this.raf=requestAnimationFrame(this.tick);else if(t===`ambient`){let t=performance.now()-e;this.timer=window.setTimeout(()=>{this.timer=0,!this.disposed&&this.canRun()&&(this.raf=requestAnimationFrame(this.tick))},Math.max(0,Lr-t-4))}}};stop(){this.raf&&cancelAnimationFrame(this.raf),this.timer&&window.clearTimeout(this.timer),this.raf=0,this.timer=0}dispose(){this.stop(),this.disposed=!0}},zr=`a.button.input.select.textarea.label.summary.video.audio.iframe.canvas.img.picture.svg.dialog.h1.h2.h3.h4.h5.h6.p.li.dt.dd.figcaption.blockquote.pre.code.table.[role=button].[role=slider].[role=link].[role=tab].[role=menu].[role=menuitem].[role=listbox].[role=option].[role=switch].[role=checkbox].[role=radio].[role=dialog].[contenteditable=""].[contenteditable="true"].[data-stage-block]`.split(`.`).join(`, `);function Br(e){if(!e||e===`transparent`)return 0;let t=/rgba?\(([^)]+)\)/.exec(e);if(!t)return 1;let n=t[1].split(/[\s,/]+/).filter(Boolean);if(n.length<4)return 1;let r=n[3];return r.endsWith(`%`)?Number(r.slice(0,-1))/100:Number(r)}function Vr(e){let t;try{t=getComputedStyle(e)}catch{return!1}let n=t.backdropFilter||t.webkitBackdropFilter||`none`;return n!==`none`&&n!==``||Br(t.backgroundColor)>.35}function Hr(e){if(!e||typeof e.closest!=`function`)return!1;let t=e,n=t.ownerDocument;if(t===n.documentElement||t===n.body)return!0;if(t.closest(zr))return!1;if(t.closest(`.atlas-porthole`)||t.classList.contains(`body-plan`))return!0;let r=t.closest(`#main, main`);if(!r)return!1;for(let e=t;e&&e!==r;e=e.parentElement)if(Vr(e))return!1;return!0}var Ur=6;function Wr(e){let t=0,n=0,r=0,i=!1,a=null,o=!1,s=0,c=null,l=!1,u=document.documentElement,d=()=>{r=0,!i||o||!e.enabled()?e.hover(null):e.hover(e.pick(t,n))},f=s=>{if(t=s.clientX,n=s.clientY,a&&s.pointerId===a.id){let t=s.clientX-a.lx,n=s.clientY-a.ly;if(!o&&Math.hypot(s.clientX-a.x,s.clientY-a.y)>Ur&&e.canDrag()){o=!0,e.hover(null),e.dragStart(),u.dataset.stageDrag=``;try{a.target.setPointerCapture(s.pointerId)}catch{}window.getSelection()?.removeAllRanges()}if(o){let r=performance.now();e.drag(t,n,Math.max(.001,(r-a.t)/1e3)),a.t=r,a.lx=s.clientX,a.ly=s.clientY,s.preventDefault();return}}s.pointerType!==`touch`&&(s.target!==c&&(c=s.target,l=Hr(s.target)),i=l,r||=requestAnimationFrame(d))},p=t=>{t.isPrimary&&t.button===0&&e.enabled()&&Hr(t.target)&&(a={id:t.pointerId,x:t.clientX,y:t.clientY,lx:t.clientX,ly:t.clientY,t:performance.now(),target:t.target})},m=t=>{if(a&&t.pointerId===a.id){if(o){o=!1,e.dragEnd(),delete u.dataset.stageDrag,s=performance.now();try{a.target.releasePointerCapture(t.pointerId)}catch{}}a=null}},h=t=>{if(performance.now()-s<250||t.button!==0||!e.enabled()||!Hr(t.target)||window.getSelection()?.toString())return;let n=e.pick(t.clientX,t.clientY);n&&e.activate(n)},g=t=>{t.relatedTarget||(i=!1,e.hover(null))},_=e=>{o&&e.preventDefault()};return window.addEventListener(`pointermove`,f,{passive:!1}),window.addEventListener(`pointerdown`,p),window.addEventListener(`pointerup`,m),window.addEventListener(`pointercancel`,m),window.addEventListener(`click`,h),document.addEventListener(`pointerout`,g),document.addEventListener(`selectstart`,_),()=>{r&&cancelAnimationFrame(r),window.removeEventListener(`pointermove`,f),window.removeEventListener(`pointerdown`,p),window.removeEventListener(`pointerup`,m),window.removeEventListener(`pointercancel`,m),window.removeEventListener(`click`,h),document.removeEventListener(`pointerout`,g),document.removeEventListener(`selectstart`,_),delete u.dataset.stageDrag}}var Gr=.4,Kr=1.25,qr=class{camera;tx=Gn(0);ty=Gn(0);tz=Gn(0);r=Gn(30);th=Gn(0);ph=Gn(.1);fov=Gn(40);bias=Gn(0);goal={target:[0,0,0],r:30,th:0,ph:.1,fov:40,bias:0};yaw=Gn(0);pitch=Gn(0);yawVel=0;pitchVel=0;dragging=!1;keepOrbit=!1;orbitMode=`none`;shotRadius=30;w=1;h=1;constructor(){this.camera=new V(40,1,.1,400)}setShot(e,t){let n=Zn(e.pos[0]-e.target[0],e.pos[1]-e.target[1],e.pos[2]-e.target[2]);this.goal={target:e.target,r:n.r,th:n.theta,ph:n.phi,fov:e.fov,bias:e.bias},this.shotRadius=n.r,this.orbitMode=t.orbit,t.keepOrbit||(this.yawVel=0,this.pitchVel=0),t.instant&&($(this.tx,e.target[0]),$(this.ty,e.target[1]),$(this.tz,e.target[2]),$(this.r,n.r),$(this.th,n.theta),$(this.ph,n.phi),$(this.fov,e.fov),$(this.bias,e.bias),t.keepOrbit||($(this.yaw,0),$(this.pitch,0))),this.keepOrbit=!!t.keepOrbit}setBias(e){this.goal.bias=e}canOrbit(){return this.orbitMode!==`none`}beginDrag(){this.dragging=!0,this.yawVel=0,this.pitchVel=0,this.keepOrbit=!0}drag(e,t,n){if(this.orbitMode===`none`)return;let r=.0034,i=-e*r,a=this.orbitMode===`free`?t*r*.8:t*r*.25;this.yaw.value+=i,this.pitch.value=this.clampPitch(this.pitch.value+a),this.yaw.velocity=0,this.pitch.velocity=0,n>0&&(this.yawVel=i/n,this.pitchVel=a/n)}endDrag(){this.dragging=!1}orbitBy(e,t=0){this.orbitMode!==`none`&&(this.keepOrbit=!0,this.yawVel=this.pitchVel=0,this.yaw.value+=e,this.pitch.value=this.clampPitch(this.pitch.value+t))}zoomBy(e,t=!1){!Number.isFinite(e)||e<=0||(this.goal.r=Math.max(this.shotRadius*.72,Math.min(this.shotRadius*1.45,this.goal.r*e)),t&&$(this.r,this.goal.r))}clampPitch(e){let t=this.orbitMode===`free`?Kr:.35,n=this.ph.value;return Math.max(-t-n,Math.min(t-n,e))}resize(e,t){this.w=Math.max(1,e),this.h=Math.max(1,t),this.camera.aspect=this.w/this.h}update(e){let t=this.goal;Kn(this.tx,t.target[0],Gr,e),Kn(this.ty,t.target[1],Gr,e),Kn(this.tz,t.target[2],Gr,e),Kn(this.r,t.r,Gr*1.05,e),Jn(this.th,t.th,Gr*1.1,e),Kn(this.ph,t.ph,Gr,e),Kn(this.fov,t.fov,Gr,e),Kn(this.bias,t.bias,Gr*1.2,e);let n=!1;if(!this.dragging){if(this.keepOrbit&&(Math.abs(this.yawVel)>.001||Math.abs(this.pitchVel)>.001)){this.yaw.value+=this.yawVel*e,this.pitch.value=this.clampPitch(this.pitch.value+this.pitchVel*e);let t=Math.exp(-3.2*e);this.yawVel*=t,this.pitchVel*=t,n=!0}else this.keepOrbit||(Jn(this.yaw,0,Gr*1.2,e),Kn(this.pitch,0,Gr*1.2,e),n=!Yn(this.yaw,0)||!Yn(this.pitch,0))}return this.apply(),!Yn(this.tx,t.target[0])||!Yn(this.ty,t.target[1])||!Yn(this.tz,t.target[2])||!Yn(this.r,t.r)||!Yn(this.th,this.th.value+Jr(this.th,t.th))||!Yn(this.ph,t.ph)||!Yn(this.fov,t.fov,.01)||!Yn(this.bias,t.bias,1e-4)||n||this.dragging}apply(){let e=this.camera,t=Math.max(-1.45,Math.min(1.45,this.ph.value+this.pitch.value)),[n,r,i]=Qn(this.r.value,this.th.value+this.yaw.value,t);e.position.set(this.tx.value+n,this.ty.value+r,this.tz.value+i),e.up.set(0,1,0),e.lookAt(this.tx.value,this.ty.value,this.tz.value),e.fov=this.fov.value;let a=this.bias.value;Math.abs(a)>1e-4?e.setViewOffset(this.w,this.h,-a*this.w,0,this.w,this.h):e.clearViewOffset(),e.updateProjectionMatrix(),e.updateMatrixWorld()}};function Jr(e,t){let n=(t-e.value)%(Math.PI*2);return n>Math.PI&&(n-=Math.PI*2),n<=-Math.PI&&(n+=Math.PI*2),n}var Yr=3,Xr=class{texture;width;height;layers;data;sources=[];ctx;pending=new Set;active=0;primed=!1;disposed=!1;onChange;constructor(e,t){this.width=t.width,this.height=t.height,this.layers=Math.max(1,e),this.onChange=t.onChange;let n=this.width*this.height*4;this.data=new Uint8Array(n*this.layers);let r=Math.round(t.base.r*255),i=Math.round(t.base.g*255),a=Math.round(t.base.b*255);for(let e=0;e<this.data.length;e+=4)this.data[e]=r,this.data[e+1]=i,this.data[e+2]=a,this.data[e+3]=255;this.texture=new ue(this.data,this.width,this.height,this.layers),this.texture.format=ee,this.texture.type=I,this.texture.colorSpace=de,this.texture.minFilter=oe,this.texture.magFilter=oe,this.texture.generateMipmaps=!1,this.texture.wrapS=me,this.texture.wrapT=me,this.texture.needsUpdate=!0;let o=document.createElement(`canvas`);o.width=this.width,o.height=this.height,this.ctx=o.getContext(`2d`,{willReadFrequently:!0});for(let e=0;e<this.layers;e++)this.sources.push({level:0,loading:!1,failed:!1,priority:0})}markPrimed(){this.primed=!0}setSource(e,t,n){let r=this.sources[e];r&&(r.lqip=t&&t.startsWith(`data:image/`)&&t.length>40?t:void 0,r.full=n||void 0,r.lqip&&r.level===0&&this.load(e,r.lqip,1))}setPriority(e,t){let n=this.sources[e];n&&(n.priority=t)}pump(){if(!this.disposed)for(;this.active<Yr;){let e=-1,t=0;for(let n=0;n<this.sources.length;n++){let r=this.sources[n];r.level<2&&!r.loading&&!r.failed&&r.full&&r.priority>t&&(e=n,t=r.priority)}if(e<0)return;this.load(e,this.sources[e].full,2)}}load(e,t,n){let r=this.sources[e];r.loading=!0,n===2&&this.active++;let i=new Image;i.decoding=`async`,this.pending.add(i);let a=!1,o=t=>{a||(a=!0,i.onload=null,i.onerror=null,this.pending.delete(i),r.loading=!1,n===2&&this.active--,this.disposed?i.src=``:(t&&r.level<n?(this.draw(e,i),r.level=n):!t&&n===2&&(r.failed=!0),i.src=``,this.pump()))};i.onload=()=>{typeof i.decode==`function`?i.decode().then(()=>o(!0),()=>o(!0)):o(!0)},i.onerror=()=>o(!1),i.src=t}draw(e,t){let n=this.ctx;if(!n||!t.naturalWidth||!t.naturalHeight)return;let r=this.width,i=this.height,a=Math.max(r/t.naturalWidth,i/t.naturalHeight),o=t.naturalWidth*a,s=t.naturalHeight*a;try{n.clearRect(0,0,r,i),n.drawImage(t,(r-o)/2,(i-s)/2,o,s);let a=n.getImageData(0,0,r,i).data;this.data.set(a,e*r*i*4)}catch{return}this.primed&&this.texture.addLayerUpdate(e),this.texture.needsUpdate=!0,this.onChange()}level(e){return this.sources[e]?.level??0}dispose(){this.disposed=!0;for(let e of this.pending)e.onload=null,e.onerror=null,e.src=``;this.pending.clear(),this.texture.dispose()}},Zr=1.7,Qr=1,$r=`
attribute vec3 aPos;
attribute vec4 aData;   // scale, presence, hover, layer
attribute vec4 aFlags;  // planned, premium, selected, rand
uniform float uTime; uniform float uMotion;
varying vec3 vN; varying vec2 vL; varying vec4 vData; varying vec4 vFlags; varying float vDepth;
void main() {
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  float roll = sin(uTime * 0.45 + aFlags.w * 6.2831) * 0.06 * uMotion;
  float c = cos(roll); float s = sin(roll);
  vec3 p = position; p.xy = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  vec3 n = normal; n.xy = vec2(c * n.x - s * n.y, s * n.x + c * n.y);
  mv.xyz += p * aData.x;
  vN = n; vL = position.xy; vData = aData; vFlags = aFlags; vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,ei=`
precision highp sampler2DArray;
uniform sampler2DArray uPosters;
uniform vec3 uGold; uniform vec3 uIris; uniform vec3 uGlass;
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uTime;
varying vec3 vN; varying vec2 vL; varying vec4 vData; varying vec4 vFlags; varying float vDepth;
void main() {
  float presence = vData.y;
  if (presence < 0.004) discard;
  float lit = max(vData.z, vFlags.z);
  float planned = vFlags.x;
  vec3 n = normalize(vN);
  float facing = clamp(n.z, 0.0, 1.0);
  float fres = pow(1.0 - facing, 2.3);
  // the poster, refracted slightly at the membrane's edge; the iris opens it wider when lit
  vec2 uv = vec2(vL.x / ${Zr.toFixed(2)} + 0.5, vL.y / ${Qr.toFixed(2)} + 0.5);
  uv -= n.xy * 0.035;
  uv = (uv - 0.5) * (0.93 - 0.05 * lit) + 0.5;
  vec3 poster = vData.w >= 0.0 ? texture(uPosters, vec3(uv.x, 1.0 - uv.y, vData.w)).rgb : uGlass;
  float inner = smoothstep(0.16, 0.58, facing);
  float r = length(vec2(vL.x / ${(Zr/2).toFixed(3)}, vL.y / ${(Qr/2).toFixed(3)}));
  float aperture = smoothstep(0.035, 0.0, abs(r - mix(1.08, 0.84, lit))) * lit;
  vec3 col = poster * (0.74 + 0.38 * lit) * inner * (1.0 - planned * 0.9);
  col += uGlass * (1.0 - inner) * 0.55;
  vec3 L = normalize(vec3(-0.45, 0.62, 0.64));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), 56.0);
  vec3 rim = mix(uGold, uIris, lit);
  float dash = planned > 0.5 ? step(0.45, fract(atan(vL.y, vL.x) * 3.8197 + uTime * 0.03)) : 1.0;
  col += rim * fres * (1.1 + 1.4 * lit) * dash;
  col += uIris * aperture * 1.3;
  col += vec3(1.0, 0.97, 0.92) * spec * 0.5;
  vec2 sp = vL - vec2(0.6, 0.25);
  float sd = length(sp);
  float seal = vFlags.y * (1.0 - smoothstep(0.062, 0.078, sd));
  float sealRing = vFlags.y * smoothstep(0.012, 0.0, abs(sd - 0.098));
  col = mix(col, uGold * 1.2, seal);
  col += uGold * sealRing;
  float alpha = inner * (1.0 - planned * 0.84) * 0.96 + fres * dash * 0.95 + seal + sealRing * 0.8 + aperture;
  alpha = clamp(alpha, 0.0, 1.0) * presence;
  float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  col = mix(col, uFogColor, fog * 0.92);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,ti=`
attribute vec3 aPos;
attribute vec4 aHalo; // size, intensity, irisMix, pulse
varying vec2 vUv; varying vec4 vHalo; varying float vDepth;
void main() {
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  mv.xy += position.xy * aHalo.x;
  mv.z += 0.05;
  vUv = position.xy; vHalo = aHalo; vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,ni=`
uniform vec3 uGold; uniform vec3 uIris; uniform float uFogDensity;
varying vec2 vUv; varying vec4 vHalo; varying float vDepth;
void main() {
  if (vHalo.y < 0.002 && vHalo.w < 0.002) discard;
  vec2 q = vUv * 2.0; q.x *= 0.78;
  float d = length(q);
  float glow = exp(-d * d * 6.0) * vHalo.y;
  float p = vHalo.w;
  float ring = p * smoothstep(0.07, 0.0, abs(d - (0.42 + (1.0 - p) * 0.5)));
  vec3 col = mix(uGold, uIris, vHalo.z) * (glow + ring * 1.4);
  float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  col *= (1.0 - fog);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,ri=new F,ii=new F,ai=new F,oi=new F;function si(e,t,n,r){let i=ai.copy(t).sub(e),a=i.length();if(a<1e-6)return!1;i.divideScalar(a);let o=oi.copy(e).sub(n),s=o.dot(i),c=s*s-(o.lengthSq()-r*r);if(c<=0)return!1;let l=-s-Math.sqrt(c);return l>0&&l<a-.001}var ci=class{group=new A;states=[];byId=new Map;order=[];mesh;halo;geo;haloGeo;mat;haloMat;posters;aPos;aData;aFlags;hPos;hHalo;form=null;hovered=null;highlight=null;priorityAt=-1;constructor(e,t,n){let r=Math.max(1,e.length),i=n.quality===`lite`,a=Math.min(r,n.maxLayers);this.posters=new Xr(a,{width:i?170:272,height:i?100:160,base:new M(`#1a1426`),onChange:n.onChange});let o=new j(Qr/2,.7,i?5:8,i?14:22,1);o.rotateZ(Math.PI/2),o.scale(1,1,.45),this.geo=new he,this.geo.index=o.index,this.geo.setAttribute(`position`,o.getAttribute(`position`)),this.geo.setAttribute(`normal`,o.getAttribute(`normal`)),this.aPos=new f(new Float32Array(r*3),3).setUsage(P),this.aData=new f(new Float32Array(r*4),4).setUsage(P),this.aFlags=new f(new Float32Array(r*4),4).setUsage(P),this.geo.setAttribute(`aPos`,this.aPos),this.geo.setAttribute(`aData`,this.aData),this.geo.setAttribute(`aFlags`,this.aFlags),this.geo.instanceCount=e.length;let s=n.palette;this.mat=new O({vertexShader:$r,fragmentShader:ei,uniforms:{uPosters:{value:this.posters.texture},uGold:{value:s.gold.clone()},uIris:{value:s.iris.clone()},uGlass:{value:new M(`#2a2140`)},uTime:n.shared.uTime,uMotion:n.shared.uMotion,uFogColor:n.shared.uFogColor,uFogDensity:n.shared.uFogDensity},transparent:!0,depthWrite:!1,depthTest:!0}),this.mesh=new x(this.geo,this.mat),this.mesh.frustumCulled=!1,this.mesh.renderOrder=10;let c=new D(1,1);this.haloGeo=new he,this.haloGeo.index=c.index,this.haloGeo.setAttribute(`position`,c.getAttribute(`position`)),this.hPos=new f(new Float32Array(r*3),3).setUsage(P),this.hHalo=new f(new Float32Array(r*4),4).setUsage(P),this.haloGeo.setAttribute(`aPos`,this.hPos),this.haloGeo.setAttribute(`aHalo`,this.hHalo),this.haloGeo.instanceCount=e.length,this.haloMat=new O({vertexShader:ti,fragmentShader:ni,uniforms:{uGold:{value:s.gold.clone()},uIris:{value:s.iris.clone()},uFogDensity:n.shared.uFogDensity},transparent:!0,depthWrite:!1,depthTest:!0,blending:2}),this.halo=new x(this.haloGeo,this.haloMat),this.halo.frustumCulled=!1,this.halo.renderOrder=9,this.group.add(this.halo,this.mesh),o.dispose(),c.dispose(),e.forEach((e,n)=>{let r=t.get(e.id),i=t.artFor(r?.art),o=n<a?n:-1;o>=0&&this.posters.setSource(o,i?.lqip,i?.posterSmall);let s={id:e.id,index:n,layer:o,planned:e.planned,premium:e.premium,rand:K(e.id,3),slot:{id:e.id,role:`ambient`,center:[0,0,-30],offset:[0,0,0],spin:0,scale:.5,presence:0},pos:new F((K(e.id,1)-.5)*8,(K(e.id,2)-.5)*5,-24-K(e.id,4)*10),from:new F,lift:new F,start:-1e9,dur:Ie,scale:.2,presence:0,hover:0,select:0,pulse:0,role:`ambient`,sx:0,sy:0,hw:0,hh:0,depth:0,onScreen:!1};this.states.push(s),this.byId.set(s.id,s),this.order.push(n)})}get count(){return this.states.length}markPrimed(){this.posters.markPrimed()}setForm(e,t,n){this.form=e;let r=this.states.length,i=new Map(e.seeds.map(e=>[e.id,e]));for(let e of this.states){let a=i.get(e.id);a&&(e.slot=a,e.role=a.role,n?e.start=-1e9:(e.from.copy(e.pos),e.start=t+Fe(e.index,r,e.id),e.dur=Ie*(.9+e.rand*.25),e.lift.set((K(e.id,41)-.5)*2,.6+K(e.id,43)*.6,(K(e.id,47)-.5)*1.4)))}if(n)for(let e of this.states)this.snap(e,0);this.priorityAt=-1}snap(e,t){if(!this.form)return;let n=Ne(e.slot,this.form,t);e.pos.set(n[0],n[1],n[2]);let r=at(e.id,this.highlight);e.scale=e.slot.scale*r.scale,e.presence=e.slot.presence*r.presence}setHovered(e){this.hovered=e}setHighlight(e){this.highlight=e?new Set(e):null}pulse(e){let t=this.byId.get(e);t&&(t.pulse=1)}update(e,t,n,r,i,a){let o=this.form;if(!o)return!1;let s=!1,c=r.position,l=r.getWorldDirection(ii).clone(),u=i.h/2/Math.tan(r.fov*Math.PI/360);for(let d of this.states){let f=Ne(d.slot,o,n),p=f[0],m=f[1]+Math.sin(n*.8+d.rand*6.283)*.07*d.slot.scale*a,h=f[2],g=(t-d.start)/d.dur;if(g<1){if(s=!0,g<=0)p=d.from.x,m=d.from.y,h=d.from.z;else{let e=Le(g),t=p-d.from.x,n=m-d.from.y,r=h-d.from.z,i=Math.hypot(t,n,r),a=(d.from.x+p)/2+d.lift.x*i*.18,o=(d.from.y+m)/2+d.lift.y*i*.22,s=(d.from.z+h)/2+d.lift.z*i*.18,c=1-e;p=c*c*d.from.x+2*c*e*a+e*e*p,m=c*c*d.from.y+2*c*e*o+e*e*m,h=c*c*d.from.z+2*c*e*s+e*e*h}}d.pos.set(p,m,h);let _=at(d.id,this.highlight),v=d.slot.scale*_.scale*(d.id===this.hovered?1.1:1),y=Math.min(1,d.slot.presence*_.presence+(d.id===this.hovered?.35:0)),b=e>.2?50:3.4;d.scale=Xn(d.scale,v,b,e),d.presence=Xn(d.presence,y,b,e),d.hover=Xn(d.hover,+(d.id===this.hovered),9,e),d.select=Xn(d.select,+!!d.slot.selected,4,e),d.pulse>0&&(d.pulse=Math.max(0,d.pulse-e/.9),s=!0),(Math.abs(d.scale-v)>.001||Math.abs(d.presence-y)>.001||Math.abs(d.hover-+(d.id===this.hovered))>.002)&&(s=!0),ri.copy(d.pos).sub(c);let x=ri.dot(l);if(d.depth=x,x>.2){ri.copy(d.pos).project(r),d.sx=(ri.x+1)/2*i.w,d.sy=(1-ri.y)/2*i.h;let e=u/x;d.hw=Zr/2*d.scale*e,d.hh=Qr/2*d.scale*e,d.onScreen=ri.z<1&&d.sx+d.hw>0&&d.sx-d.hw<i.w&&d.sy+d.hh>0&&d.sy-d.hh<i.h}else d.onScreen=!1}this.order.sort((e,t)=>this.states[t].depth-this.states[e].depth);let d=this.aPos.array,f=this.aData.array,p=this.aFlags.array,m=this.hPos.array,h=this.hHalo.array;for(let e=0;e<this.order.length;e++){let t=this.states[this.order[e]];d[e*3]=t.pos.x,d[e*3+1]=t.pos.y,d[e*3+2]=t.pos.z,f[e*4]=t.scale,f[e*4+1]=t.presence,f[e*4+2]=t.hover,f[e*4+3]=t.layer>=0?t.layer:-1,p[e*4]=+!!t.planned,p[e*4+1]=+!!t.premium,p[e*4+2]=t.select,p[e*4+3]=t.rand,m[e*3]=t.pos.x,m[e*3+1]=t.pos.y,m[e*3+2]=t.pos.z;let n=t.role===`featured`||t.role===`focus`?.22:0;h[e*4]=t.scale*2.7*(1+t.pulse*.6),h[e*4+1]=t.presence*(.07+n+t.hover*.5+t.select*.3),h[e*4+2]=Math.max(t.hover,t.select),h[e*4+3]=t.pulse}if(this.aPos.needsUpdate=!0,this.aData.needsUpdate=!0,this.aFlags.needsUpdate=!0,this.hPos.needsUpdate=!0,this.hHalo.needsUpdate=!0,t-this.priorityAt>.5){this.priorityAt=t;for(let e of this.states){if(e.layer<0)continue;let t=e.onScreen?e.presence*Math.max(e.hw,1)*(1+e.hover*4):0;this.posters.setPriority(e.layer,t>.5?t:0)}this.posters.pump()}return s}pick(e,t,n,r){let i=null;for(let a of this.states){if(!a.onScreen||a.presence<.2||n&&r&&si(n.position,a.pos,r.center,r.radius))continue;let o=(e-a.sx)/Math.max(4,a.hw*1.05),s=(t-a.sy)/Math.max(4,a.hh*1.1);o*o+s*s>1||(!i||a.depth<i.depth)&&(i=a)}return i?{id:i.id,depth:i.depth}:null}positionOf(e){return this.byId.get(e)?.pos??null}screenOf(e){let t=this.byId.get(e);return t?{x:t.sx,y:t.sy,visible:t.onScreen&&t.presence>.15}:null}presenceOf(e){return this.byId.get(e)?.presence??0}dispose(){this.posters.dispose(),this.geo.dispose(),this.haloGeo.dispose(),this.mat.dispose(),this.haloMat.dispose(),this.group.removeFromParent()}},li=class{group=new A;presence=new Vn;geo;mat;bones;beams;crown;column=new A;constructor(e,t,n){let r=n?15:24;this.geo=Tr(n),this.mat=Or(e,t,{core:e.gold.clone().lerp(e.pearl,.3),glow:e.gold,axisDir:new F(0,1,0)}),this.bones=new T(this.geo,this.mat,r),this.geo.setAttribute(`aGlow`,new f(new Float32Array(r),1));let i=new b,a=new E,o=new ie,s=-11.2,c=s;for(let e=0;e<r;e++){let t=(1.08-.5*(e/(r-1)))*(n?1.25:1);o.set(Math.sin(e*.9)*.06,e*.36+Math.sin(e*.5)*.1,Math.cos(e*.7)*.05),a.setFromEuler(o),i.compose(new F(0,s,0),a,new F(t,t,t)),this.bones.setMatrixAt(e,i),c=s,s+=.86*t*(n?.85:1)+.12}this.bones.instanceMatrix.needsUpdate=!0,this.bones.computeBoundingSphere(),this.column.add(this.bones);let l=c+13.5,u=jr(e.gold.clone().lerp(e.pearl,.4),l,.06,t,0);u.mesh.position.y=-12+l/2;let d=jr(e.iris.clone().multiplyScalar(.4),l,.5,t,1);d.mesh.position.y=u.mesh.position.y,d.mat.uniforms.uLevel.value=.22,this.beams=[u,d],this.crown=zn(e.gold,5.2,t,6),this.crown.mesh.position.y=c+1.4,this.crown.mat.uniforms.uRing.value=.3,this.group.add(this.column,u.mesh,d.mesh,this.crown.mesh)}update(e,t){let n=this.presence.step(e),r=this.presence.level;return this.group.visible=r>.004,this.mat.uniforms.uLevel.value=r,this.beams[0].mat.uniforms.uLevel.value=r,this.beams[1].mat.uniforms.uLevel.value=r*.22,this.crown.mat.uniforms.uIntensity.value=r*(.55+.15*Math.sin(t.t*1.1)),this.column.rotation.y=t.t*.05,this.group.scale.setScalar(.85+.15*r),n}dispose(){this.geo.dispose(),this.mat.dispose(),this.bones.dispose();for(let e of this.beams)e.geo.dispose(),e.mat.dispose();this.crown.geo.dispose(),this.crown.mat.dispose(),this.group.removeFromParent()}},ui={home:.0102,world:.0055,time:.0085,category:.0105,focus:.0105,watch:.02,personal:.0105,quiet:.012},di={home:1,world:.8,time:.7,category:.95,focus:.85,watch:.15,personal:.9,quiet:.6},fi=6;function pi(a){let o=a.host.closest(`.atlas-porthole`),c=!o,l=!0,u=a.quality,d=a.cat,f=document.createElement(`canvas`);f.className=`stage-canvas`,f.setAttribute(`aria-hidden`,`true`),f.style.cssText=`position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;`,a.host.appendChild(f);let p=new le({canvas:f,antialias:a.antialias,alpha:!1,powerPreference:`high-performance`,stencil:!1});p.toneMapping=4,p.toneMappingExposure=1,p.outputColorSpace=de;let m=sr();p.setClearColor(m.night,1);let h=()=>u===`webgl`?2:1.25,g=()=>{p.setPixelRatio(Math.min(window.devicePixelRatio||1,h())),b.uPixelRatio.value=p.getPixelRatio()},v=new _;v.fog=new ge(m.night.getHex(),ui.quiet);let b=Bn(m.night);g();let x=new qr,S=x.camera,C={w:1,h:1},w=new ht(m,b,u);v.add(w.bg,w.dust);let T=new jn(u);v.add(T.group);let E=new ar(m,b);v.add(E.mesh);let D=new In(m,b);v.add(D.group);let ee=p.getContext(),O=Math.max(1,Math.min(1024,ee.getParameter(ee.MAX_ARRAY_TEXTURE_LAYERS)||256)),te=[],ne=new Map,k=[],A,j={},M=()=>{te=st(d),ne=ct(d),k=lt(d,ne),A=new ci(te,d,{quality:u,palette:m,shared:b,maxLayers:O,onChange:()=>V()}),v.add(A.group)};M();let N=it({seeds:te,arrangement:{kind:`quiet`},aspect:1.6}),re=0,ie=0,P=+!e.get().reduced,ae=ui.quiet,oe=0,se=!1,ce=!1,I=!1,L=!1,ue=!1,fe=[],R=0,pe=u===`lite`,z=()=>e.get().reduced,me=()=>s.get().playing||N.kind===`watch`,B=()=>!z()&&N.energy>0&&!me(),he=new Rr(Ce,()=>!I&&!L&&!document.hidden&&l&&!(me()&&se));function V(){se=!1,he.wake()}let _e={spine:()=>new li(m,b,u===`lite`),globe:()=>new Cr(d,m,b,u===`lite`,()=>V()),helix:()=>new Ir(m,b,u===`lite`),core:()=>new Wn(m,b,u===`lite`)};function H(e,t){let n=j[e];if(!n&&t>0)try{n=_e[e](),j[e]=n,v.add(n.group)}catch(t){console.warn(`[stage] ${e} unavailable`,t);return}return n&&(n.presence.target=t),n}function ve(){let e=t.get(),n=it(ut(d,e.arrangement,{seeds:te,saved:r(i.get()),aspect:C.w/C.h,places:ne,routes:k}));if(o&&n.kind===`world`){let e=new F(...n.camera.pos).normalize(),t=Math.max(1,C.h/Math.max(1,C.w)),r=5/Math.sin(y.degToRad(19))*1.28*t;e.multiplyScalar(r),n.camera={...n.camera,pos:[e.x,e.y,e.z],target:[0,0,0],bias:0}}return n}function ye(e,n){N=e;let r=n.instant;A.setForm(e,re,r),T.setForm(e,re,r),x.setShot(e.camera,{instant:r,orbit:e.orbit,keepOrbit:n.keepOrbit});let i=e.furniture,a=H(`spine`,i.spine),o=H(`globe`,i.globe),s=H(`helix`,i.helix),c=H(`core`,i.core);if(r)for(let e of[a,o,s,c])e?.presence.snap();let l=t.get();o?.setFocus({place:e.world?.place,route:e.world?.route,scope:e.world?.place?d.placeScope(e.world.place):null}),o?.setHovered(l.hoveredPlace),s?.setFocus(e.time?.decade??null,e.time?.year??null),E.set(e.filaments),w.setTint(e.tint?cr[e.tint]??null:null),w.setGlow(e.camera.bias,di[e.kind],e.furniture.haze,e.kind===`home`?1:.4),r&&(ae=ui[e.kind],w.snap()),xe(),V()}let be=0;function xe(){be&&window.clearTimeout(be),be=window.setTimeout(()=>{if(be=0,!I){for(let e of Object.keys(j)){let t=j[e];t.presence.target===0&&t.presence.level<=.01&&(t.dispose(),delete j[e])}T.sweep()}},8e3)}let Se=new F;function Ce(e){let t=oe?(e-oe)/1e3:1/60;oe=e;let n=Math.min(Math.max(t,0),.1);re+=n;let r=B(),i=z()?0:+(N.energy>0&&!me());P+=(i-P)*(1-Math.exp(-2.5*n)),Math.abs(P-i)<.002&&(P=i),ie+=n*P,b.uTime.value=ie,b.uMotion.value=P;let o=ui[N.kind];ae+=(o-ae)*(1-Math.exp(-2*n)),v.fog.density=ae,b.uFogDensity.value=ae;let s=x.update(n);s=w.update(n)||s,s=Math.abs(P-i)>0||Math.abs(ae-o)>1e-5||s;let c={camera:S,view:C,form:N,motion:P,t:ie};s=A.update(n,re,ie,S,C,P)||s;for(let e of Object.keys(j)){let t=j[e];s=t.update(n,c)||s,t.presence.target===0&&t.presence.hiddenFor>fi&&(t.dispose(),delete j[e])}return s=T.update(n,re,c,N.kind===`category`?N.organs[0]?.section??null:null)||s,s=E.update(n,S,e=>A.positionOf(e),e=>A.presenceOf(e))||s,s=D.update(n)||s,p.render(v,S),ce||(ce=!0,A.markPrimed(),a.onReady()),pe||(s&&t>0&&t<.5?(R++,R>8&&fe.push(t*1e3)):R=0,fe.length>90&&fe.splice(0,fe.length-90),er(fe)?we($n(fe)):fe.length>=60&&(pe=!0)),se=!s,s?`busy`:r?`ambient`:(oe=0,`idle`)}function we(e){pe=!0,u!==`lite`&&(u=`lite`,console.info(`[stage] median frame ${e.toFixed(1)}ms — switching to lite`),g(),Te(),w.setLite(!0),T.setQuality(`lite`),a.onQuality(`lite`))}function Te(){let e=Math.max(1,o?a.host.clientWidth:window.innerWidth),t=Math.max(1,o?a.host.clientHeight:window.innerHeight);C.w=e,C.h=t,g(),p.setSize(e,t,!1),x.resize(e,t),w.setAspect(e/t);let n=e/t<.9;n!==ue&&(ue=n,ce&&ye(ve(),{instant:z(),keepOrbit:!0})),V()}Te();let Ee=()=>Te();window.addEventListener(`resize`,Ee);let De=new ResizeObserver(Ee);o&&De.observe(a.host);let U=new IntersectionObserver(([e])=>{l=e.isIntersecting,l?V():he.stop()},{rootMargin:`100px`});o&&U.observe(o);let W=``,Oe=null,ke=null,Ae=null,je=()=>{let e=t.get(),n=JSON.stringify(e.arrangement);n!==W&&(W=n,ye(ve(),{instant:z()})),e.highlight!==Oe&&(Oe=e.highlight,A.setHighlight(e.highlight),V()),e.hovered!==ke&&(ke=e.hovered,A.setHovered(e.hovered),V()),e.hoveredPlace!==Ae&&(Ae=e.hoveredPlace,j.globe?.setHovered(e.hoveredPlace),V())},G=r(i.get()).join(`|`),Me=[t.subscribe(je),i.subscribe(()=>{let e=r(i.get()).join(`|`);e!==G&&(G=e,N.kind===`personal`&&ye(ve(),{instant:z(),keepOrbit:!0}))}),e.subscribe(()=>V()),s.subscribe(()=>V())],K=()=>{oe=0,document.hidden||V()};document.addEventListener(`visibilitychange`,K);let Ne=e=>{e.preventDefault(),L=!0,he.stop(),a.onLost()};f.addEventListener(`webglcontextlost`,Ne);let Pe=null,Fe=0,Ie=document.documentElement,Le=(e,t)=>{if(o){let n=f.getBoundingClientRect();if(e<n.left||e>n.right||t<n.top||t>n.bottom)return null;e-=n.left,t-=n.top}let n={camera:S,view:C,form:N,motion:P,t:ie},r=[],i=N.kind===`world`&&!!j.globe&&j.globe.presence.level>.5,a=A.pick(e,t,S,i?{center:new F(0,0,0),radius:5*j.globe.group.scale.x}:void 0);a&&r.push({kind:`seed`,id:a.id,depth:a.depth});let s=j.globe;if(s&&N.kind===`world`){let i=s.pick(e,t,n);i&&r.push(i)}let c=j.helix;if(c&&N.kind===`time`){let i=c.pick(e,t,n);i&&r.push({...i,depth:i.depth+2})}if(N.kind===`home`||N.kind===`category`){let i=T.pick(e,t,n);i&&r.push({...i,depth:i.depth+1.5})}return r.sort((e,t)=>e.depth-t.depth),r[0]??null},Re=e=>{let r=Pe;if(r?.kind!==e?.kind||r?.id!==e?.id){if(Pe=e,e){Ie.dataset.stageHover=e.kind;let t=performance.now();t-Fe>120&&(Fe=t,n.play(`hover`))}else delete Ie.dataset.stageHover;t.set(t=>{let n=t;return r?.kind===`seed`&&t.hovered===r.id&&e?.kind!==`seed`&&(n={...n,hovered:null}),r?.kind===`place`&&t.hoveredPlace===r.id&&e?.kind!==`place`&&(n={...n,hoveredPlace:null}),e?.kind===`seed`&&n.hovered!==e.id&&(n={...n,hovered:e.id}),e?.kind===`place`&&n.hoveredPlace!==e.id&&(n={...n,hoveredPlace:e.id}),n}),T.setHovered(e?.kind===`organ`?e.id:null),j.helix?.setHovered(e?.kind===`decade`?Number(e.id):null),V()}},ze=Wr({enabled:()=>!I&&!L&&ce&&N.kind!==`watch`&&c,pick:Le,hover:Re,activate:e=>{n.play(`select`),e.kind===`seed`&&A.pulse(e.id),V(),a.onActivate(e)},canDrag:()=>x.canOrbit()&&!z(),dragStart:()=>{x.beginDrag(),Ie.dataset.stageHover=`drag`,V()},drag:(e,t,n)=>{x.drag(e,t,n),V()},dragEnd:()=>{x.endDrag(),delete Ie.dataset.stageHover,V()}}),Be=()=>{c=!0},Ve=()=>{c=!1,Re(null)};o?.addEventListener(`pointerenter`,Be),o?.addEventListener(`pointerleave`,Ve);let q=(e,t,n)=>{let r=new F(e/C.w*2-1,-(t/C.h)*2+1,.5).unproject(S).sub(S.position).normalize();S.getWorldDirection(Se);let i=n/Math.max(.05,r.dot(Se));return S.position.clone().addScaledVector(r,i)},He=()=>{let e=document.querySelectorAll(`[data-nav="my-world"]:not([hidden])`);for(let t of e){let e=t.getBoundingClientRect();if(e.width>0&&e.height>0&&e.bottom>0&&e.top<C.h&&e.right>0&&e.left<C.w)return{x:e.left+e.width/2,y:e.top+e.height/2}}return{x:C.w-48,y:40}};return je(),{commands:{resetView(){I||L||(ye(ve(),{instant:z()}),Re(null),V())},orbitBy(e,t=0){I||L||N.kind!==`world`||(x.orbitBy(e,t),V())},zoomBy(e){I||L||N.kind!==`world`||(x.zoomBy(e,z()),V())},flyToCore(e,t){if(I||L)return;let n=j.core,r=N.kind===`personal`&&!!n&&n.presence.level>.5;if(z()){A.pulse(e),n?.receive(),V();return}let i=A.positionOf(e),a=A.screenOf(e),o=t?q(t.left+t.width/2,t.top+t.height/2,9):i&&a?.visible?i.clone():q(C.w/2,C.h/2,12),s=r?null:He();D.launch(o,()=>r?new F(0,0,0):q(s.x,s.y,8),{up:new F(0,1,0),onArrive:()=>{n?.receive(),A.pulse(e)}}),V()},pulse(e){I||(A.pulse(e),V())},project(e){return I||L?null:A.screenOf(e)}},setCatalogue(e){if(e===d||e.version===d.version){d=e;return}d=e,A.dispose(),M();let n=j.globe;n&&(n.dispose(),delete j.globe),A.setHighlight(t.get().highlight),A.setHovered(t.get().hovered),ye(ve(),{instant:z(),keepOrbit:!0})},dispose(){if(!I){I=!0,he.dispose(),be&&window.clearTimeout(be),ze(),De.disconnect(),U.disconnect(),o?.removeEventListener(`pointerenter`,Be),o?.removeEventListener(`pointerleave`,Ve);for(let e of Me)e();if(window.removeEventListener(`resize`,Ee),document.removeEventListener(`visibilitychange`,K),f.removeEventListener(`webglcontextlost`,Ne),delete Ie.dataset.stageHover,Pe){let e=Pe;t.set(t=>({...t,hovered:e.kind===`seed`&&t.hovered===e.id?null:t.hovered,hoveredPlace:e.kind===`place`&&t.hoveredPlace===e.id?null:t.hoveredPlace}))}A.dispose();for(let e of Object.keys(j))j[e].dispose();T.dispose(),E.dispose(),D.dispose(),w.dispose(),v.clear(),p.dispose(),p.getContext().isContextLost()||p.forceContextLoss(),f.remove()}}}}export{pi as createStageEngine};