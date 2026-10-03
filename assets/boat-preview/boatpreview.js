/* Maritime Wrap Co. – photo boat preview.
   Recolors a real photo of a center console in the browser. The hull's body tone is solved
   so it matches the selected film's hex exactly; gloss/satin/metallic reflections sit on top. */
(function(){
  const BASE='assets/boat-preview/';
  const META={SMAX:2.3,EMAX:0.16,W:1200,H:477,BB:[35,124,1137,343]};
  const PCT={matte:50,satin:45,gloss:30,metal:35};
  let ready=null, data=null, pending=null;
  const lin=v=>{v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4)};
  const LUT=new Float32Array(256);for(let i=0;i<256;i++)LUT[i]=lin(i);
  const toS=v=>{const x=Math.max(0,v);return x<=0.0031308?x*12.92:1.055*Math.pow(x,1/2.4)-0.055};
  function loadImg(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=BASE+src;})}
  function pixels(img){const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);return x.getImageData(0,0,c.width,c.height).data;}
  function load(){
    if(ready) return ready;
    ready=Promise.all(['base.webp','s1.webp','s2.webp','e_satin.webp','e_gloss.webp','e_metal.webp'].map(loadImg)).then(([b,s1,s2,es,eg,em])=>{
      const [x0,y0,x1,y1]=META.BB, w=x1-x0, h=y1-y0, n=w*h;
      const P={base:pixels(b),s1:pixels(s1),s2:pixels(s2),satin:pixels(es),gloss:pixels(eg),metal:pixels(em)};
      const dec=(v,mx)=>(v/255)*(v/255)*mx;
      const S={matte:new Float32Array(n),satin:new Float32Array(n),gloss:new Float32Array(n),metal:new Float32Array(n)};
      const E={satin:new Float32Array(n*3),gloss:new Float32Array(n*3),metal:new Float32Array(n*3)};
      const streak=new Float32Array(n), mask=new Float32Array(n), flake=new Float32Array(n);
      let seed=12345;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
      for(let i=0;i<n;i++){const q=i*4;
        S.matte[i]=dec(P.s1[q],META.SMAX);S.satin[i]=dec(P.s1[q+1],META.SMAX);S.gloss[i]=dec(P.s1[q+2],META.SMAX);
        S.metal[i]=dec(P.s2[q],META.SMAX);streak[i]=dec(P.s2[q+1],META.EMAX);mask[i]=P.s2[q+2]/255;
        for(const k of ['satin','gloss','metal'])for(let j=0;j<3;j++)E[k][i*3+j]=dec(P[k][q+j],META.EMAX);
        const r=rnd();flake[i]=r>0.93?(r-0.93)/0.07:0;}
      const sel=[];for(let i=0;i<n;i+=3)if(mask[i]>0.99)sel.push(i);
      const baseLin=new Float32Array(P.base.length);for(let i=0;i<P.base.length;i++)baseLin[i]=LUT[P.base[i]];
      data={w,h,n,x0,y0,S,E,streak,mask,flake,sel:Int32Array.from(sel),baseLin,baseRaw:P.base};
      return data;});
    return ready;
  }
  function pctl(arr,p){const a=Float32Array.from(arr).sort();return a[Math.min(a.length-1,Math.floor(p/100*(a.length-1)))]}
  function filmFinish(name,finish){const n=name.toLowerCase();
    if(finish==='matte')return 'matte';
    if(/metallic|\bmetal\b|sparkle|pearl|galactic|stardust|chrome|brushed/.test(n))return 'metal';
    if(finish==='satin')return 'satin';return 'gloss';}
  function paint(canvas,hex,name,finish){
    const D=data, f=filmFinish(name||'',finish||'gloss');
    const c=[1,3,5].map(i=>LUT[parseInt(hex.substr(i,2),16)]);
    const cmax=Math.max(c[0],c[1],c[2],1e-3);
    const S=D.S[f], pct=PCT[f];
    // extra (reflection) layer, rgb
    const ext=new Float32Array(D.n*3);
    if(f==='matte'){ext.fill(0.004);}
    else{const src=D.E[f];ext.set(src);
      if(f==='metal'){for(let i=0;i<D.n;i++)for(let j=0;j<3;j++)ext[i*3+j]+=D.streak[i]*(c[j]/cmax*0.7+0.3)+D.flake[i]*0.01;}}
    const k=[1,1,1];
    for(let j=0;j<3;j++){
      const es=new Float32Array(D.sel.length),bs=new Float32Array(D.sel.length);
      for(let t=0;t<D.sel.length;t++){const i=D.sel[t];es[t]=ext[i*3+j];bs[t]=S[i]*c[j]+(f==='metal'?D.flake[i]*0.12*c[j]:0);}
      let pe=pctl(es,pct);const ef=pe>0.7*c[j]?0.7*c[j]/Math.max(pe,1e-6):1;
      if(ef!==1){for(let i=0;i<D.n;i++)ext[i*3+j]*=ef;for(let t=0;t<es.length;t++)es[t]*=ef;pe*=ef;}
      let kk=1;const tmp=new Float32Array(bs.length);
      for(let it=0;it<6;it++){for(let t=0;t<bs.length;t++)tmp[t]=bs[t]*kk+es[t];const p=pctl(tmp,pct);
        kk*=Math.min(2,Math.max(0.5,(c[j]-pe)/Math.max(p-pe,1e-6)));}
      k[j]=kk;}
    const W=META.W,H=META.H;canvas.width=W;canvas.height=H;
    const ctx=canvas.getContext('2d');const img=ctx.createImageData(W,H);const o=img.data;o.set(D.baseRaw);
    for(let y=0;y<D.h;y++)for(let x=0;x<D.w;x++){const i=y*D.w+x,a=D.mask[i];if(a<=0)continue;
      const q=((y+D.y0)*W+(x+D.x0))*4;
      for(let j=0;j<3;j++){let v=S[i]*c[j]*k[j]+(f==='metal'?D.flake[i]*0.12*c[j]*k[j]:0)+ext[i*3+j];v=Math.min(1,Math.max(0,v));
        const b=D.baseLin[q+j];o[q+j]=Math.round(toS(b*(1-a)+v*a)*255);}}
    ctx.putImageData(img,0,0);
  }
  window.MWCBoatPreview={
    show(canvas,hex,name,finish){pending=[canvas,hex,name,finish];
      canvas.classList.add('is-loading');
      load().then(()=>{const p=pending;if(!p)return;pending=null;paint(...p);canvas.classList.remove('is-loading');})
        .catch(()=>{canvas.classList.remove('is-loading');canvas.dataset.failed='1';});},
    preload(){return load();}
  };
})();
