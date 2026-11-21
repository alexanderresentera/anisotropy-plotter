/*
Copyright (c) 2026 Alexander Resentera.
SPDX-License-Identifier: GPL-3.0-only

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License version 3
as published by the Free Software Foundation.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see https://www.gnu.org/licenses/.
*/
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CrystalView=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const units={A:{label:'Å',factor:1},nm:{label:'nm',factor:.1},um:{label:'µm',factor:.0001}};
  // Orthographic z-buffer of the complete sampled surface, not a central section.
  function project(data,spans,plane,resolution=1800){
    const vertical=plane==='top'?'y':'z',depth=plane==='top'?'z':'y',sign=plane==='top'?1:-1;
    const width=spans[0],height=spans[plane==='top'?1:2],step=Math.max(width,height)/resolution;
    const nx=Math.max(2,Math.ceil(width/step)+2),ny=Math.max(2,Math.ceil(height/step)+2);
    const x0=-nx*step/2,y0=-ny*step/2,depths=new Float64Array(nx*ny).fill(-Infinity),values=new Float64Array(nx*ny).fill(NaN);
    function triangle(a,b,c){
      const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-14)return;
      const loX=Math.max(0,Math.floor((Math.min(a[0],b[0],c[0])-x0)/step)),hiX=Math.min(nx-1,Math.ceil((Math.max(a[0],b[0],c[0])-x0)/step));
      const loY=Math.max(0,Math.floor((Math.min(a[1],b[1],c[1])-y0)/step)),hiY=Math.min(ny-1,Math.ceil((Math.max(a[1],b[1],c[1])-y0)/step));
      for(let j=loY;j<=hiY;j++)for(let i=loX;i<=hiX;i++){
        const x=x0+(i+.5)*step,y=y0+(j+.5)*step,w=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den,u=1-w-v;
        if(Math.min(w,v,u)<-1e-8)continue;const k=j*nx+i,d=w*a[2]+v*b[2]+u*c[2];
        if(d>depths[k]){depths[k]=d;values[k]=w*a[3]+v*b[3]+u*c[3];}
      }
    }
    for(const t of data){
      const p=(i,j)=>[t.x[i][j],t[vertical][i][j],sign*t[depth][i][j],t.surfacecolor[i][j]];
      for(let i=0;i<t.x.length-1;i++)for(let j=0;j<t.x[i].length-1;j++){const a=p(i,j),b=p(i,j+1),c=p(i+1,j),d=p(i+1,j+1);triangle(a,b,c);triangle(b,d,c);}
    }
    return {x:Array.from({length:nx},(_,i)=>x0+(i+.5)*step),y:Array.from({length:ny},(_,j)=>y0+(j+.5)*step),z:Array.from({length:ny},(_,j)=>Array.from(values.slice(j*nx,(j+1)*nx),v=>Number.isFinite(v)?v:null))};
  }
  function figure(base,spans,opts,palettes,cache={}){
    const gridSurface=!!base[0]?.meta?.fullprofGrid;
    const unit=gridSurface?{label:'grid',factor:1}:units[opts.unit]||units.nm,norm=gridSurface?false:opts.normalized,reference=Math.max(...spans)*1.0625;
    const convert=n=>norm?.5+n/reference:n*unit.factor;
    const label=a=>norm?a+'/'+({x:'a',y:'b',z:'c'}[a]):a+' ('+unit.label+')';
    const range=i=>[-.53125*spans[i],.53125*spans[i]].map(convert);
    const font={size:15,weight:700,color:'#213b55'},axis=i=>({title:{text:label('xyz'[i]),font:{...font,size:17}},range:range(i),showline:true,mirror:true,linecolor:'#52677d',linewidth:1.4,gridcolor:'#dce4ec',zeroline:false,tickfont:font,nticks:5,ticks:'outside',automargin:true,constrain:'domain'});
    const layout={autosize:true,margin:{l:85,r:90,t:22,b:65},paper_bgcolor:'#fff',plot_bgcolor:'#fff',showlegend:false,font:{family:'Arial, sans-serif',color:'#213b55'},uirevision:opts.view+'-'+opts.unit+'-'+norm};
    const colors=base.flatMap(t=>t.intensity||t.surfacecolor.flat()),min=Math.min(...colors.slice(0,60000)),max=colors.reduce((a,b)=>Math.max(a,b),-Infinity),cmin=colors.reduce((a,b)=>Math.min(a,b),min)*unit.factor,cmax=max*unit.factor;
    const scale={colorscale:palettes[opts.palette]||palettes.Viridis,cmin,cmax:cmax===cmin?cmin*1.001:cmax,colorbar:{title:{text:'Dₕ ('+unit.label+')'},thickness:14,len:.72,outlinewidth:0}};
    if(opts.view==='3d'){
      const data=base.map(t=>gridSurface?({...t,colorscale:scale.colorscale,cmin,cmax,showscale:false}):({...t,...scale,x:t.x.map(r=>r.map(convert)),y:t.y.map(r=>r.map(convert)),z:t.z.map(r=>r.map(convert)),surfacecolor:t.surfacecolor.map(r=>r.map(n=>n*unit.factor)),hovertext:t.customdata.map((r,i)=>r.map((p,j)=>'θ '+p[0].toFixed(1)+'°, φ '+p[1].toFixed(1)+'°<br>Dₕ '+Number((t.surfacecolor[i][j]*unit.factor).toPrecision(5))+' '+unit.label+'<br>σ(Dₕ) '+Number((p[2]*unit.factor).toPrecision(3))+' '+unit.label))}));
      layout.margin.l=30;layout.scene={aspectmode:'manual',aspectratio:Object.fromEntries(['x','y','z'].map((a,i)=>[a,1.4*spans[i]/Math.max(...spans)])),camera:opts.camera||{eye:{x:1.7,y:1.4,z:1.1},projection:{type:'orthographic'}}};
      for(let i=0;i<3;i++)layout.scene['xyz'[i]+'axis']={...axis(i),title:axis(i).title,tickangle:i===2?0:'auto',showbackground:true,backgroundcolor:'#f8fafc',ticks:'outside',ticklen:8,showspikes:false};
      return {data,layout,reference};
    }
    const planes=opts.view==='combined'?['top','side']:[opts.view],combined=planes.length===2;
    layout.images=[];
    const data=planes.map((plane,i)=>{
      if(opts.renderMode==='capture'){
        const image=cache.captures?.[opts.palette]?.[plane];
        if(!image)throw Error('The 3D projection capture is not ready.');
        const vertical=plane==='top'?1:2,xref=combined&&i===0?'x2':'x',yref=i?'y2':'y';
        // Capture bounds correspond to the complete sampled surface spans.
        layout.images.push({source:image.source,xref,yref,x:convert(-spans[0]/2-image.padX),y:convert(spans[vertical]/2+image.padY),sizex:(spans[0]+2*image.padX)*(norm?1/reference:unit.factor),sizey:(spans[vertical]+2*image.padY)*(norm?1/reference:unit.factor),xanchor:'left',yanchor:'top',sizing:'stretch',layer:'above'});
        // Layout images do not contribute to Plotly autorange. Supply the full
        // physical extents so Reset/Autoscale cannot collapse onto the origin.
        return {type:'scatter',x:[-spans[0]/2,spans[0]/2].map(convert),y:[-spans[vertical]/2,spans[vertical]/2].map(convert),mode:'markers',marker:{opacity:0},hoverinfo:'skip',showlegend:false,xaxis:xref,yaxis:yref};
      }
      const p=cache[plane]||(cache[plane]=project(base,spans,plane));
      return {type:'heatmap',x:p.x.map(convert),y:p.y.map(convert),z:p.z.map(r=>r.map(v=>v===null?null:v*unit.factor)),colorscale:scale.colorscale,zmin:scale.cmin,zmax:scale.cmax,colorbar:scale.colorbar,showscale:i===0&&!combined,hoverongaps:false,zsmooth:'best',connectgaps:false,xaxis:combined&&i===0?'x2':'x',yaxis:i?'y2':'y',hovertemplate:'Projected surface Dₕ: %{z:.5g} '+unit.label+'<br>(interpolated on the sampled mesh)<extra></extra>'};
    });
    const figureWidth=opts.width||600,k=figureWidth/600;
    const projectionAxis=i=>({...axis(i),linewidth:1.8*k,linecolor:'#263b50',tickfont:{...font,size:20*k},tickangle:-45,title:{text:label('xyz'[i]),font:{...font,size:24*k},standoff:10*k},nticks:i===2?3:9}); layout.margin={l:72*k,r:(combined?18:78)*k,t:22*k,b:62*k}; layout.xaxis=projectionAxis(0);layout.xaxis.anchor=combined?'y2':'y';
    layout.yaxis={...projectionAxis(planes[0]==='top'?1:2),scaleanchor:'x',scaleratio:1};
    if(combined){const gap=.008,split=(1-gap)*spans[2]/(spans[1]+spans[2]);layout.yaxis.domain=[split+gap,1];layout.yaxis.anchor='x2';layout.xaxis2={...projectionAxis(0),anchor:'y',matches:'x',showticklabels:false,title:{text:''}};layout.yaxis2={...projectionAxis(2),domain:[0,split],scaleanchor:'x',scaleratio:1};}
    return {data,layout,reference};
  }
  function captureCamera(plane){
    return {eye:plane==='top'?{x:0,y:0,z:2}:{x:0,y:-2,z:0},up:plane==='top'?{x:0,y:1,z:0}:{x:0,y:0,z:1},center:{x:0,y:0,z:0},projection:{type:'orthographic'}};
  }
  async function prepareCaptures(base,spans,opts,palettes,cache){
    if(opts.view==='3d')return;
    const palette=opts.palette||'Viridis',planes=opts.view==='combined'?['top','side']:[opts.view];
    cache.captures||={};const saved=cache.captures[palette]||={};
    for(const plane of planes){
      if(saved[plane])continue;
      cache.captureJobs||={};const key=palette+'/'+plane;
      if(!cache.captureJobs[key])cache.captureJobs[key]=(async()=>{
        const host=document.createElement('div');
        host.style.cssText='position:fixed;left:-10000px;top:0;width:800px;height:800px;pointer-events:none';document.body.appendChild(host);
        try{
          const fig=figure(base,spans,{view:'3d',unit:'A',palette,camera:captureCamera(plane)},palettes);
          fig.data.forEach(t=>{t.showscale=false;t.hoverinfo='skip';delete t.hovertext;});
          Object.assign(fig.layout,{width:800,height:800,autosize:false,margin:{l:0,r:0,t:0,b:0},paper_bgcolor:'rgba(0,0,0,0)'});
          fig.layout.scene.bgcolor='rgba(0,0,0,0)';
          for(const a of ['x','y','z'])Object.assign(fig.layout.scene[a+'axis'],{visible:false,showbackground:false});
          await Plotly.newPlot(host,fig.data,fig.layout,{staticPlot:true,displayModeBar:false,plotGlPixelRatio:2});
          const uri=await Plotly.toImage(host,{format:'png',width:800,height:800,scale:3});
          const img=new Image();img.src=uri;await img.decode();
          const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
          const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
          let x0=canvas.width,y0=canvas.height,x1=-1,y1=-1;
          for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]>8){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
          if(x1<x0||x0===0||y0===0||x1===canvas.width-1||y1===canvas.height-1)throw Error('Could not isolate the transparent 3D capture; the original version remains available.');
          const w=x1-x0+1,h=y1-y0+1,pad=3;
          const crop=document.createElement('canvas');crop.width=w+2*pad;crop.height=h+2*pad;
          crop.getContext('2d').drawImage(canvas,x0,y0,w,h,pad,pad,w,h);
          return saved[plane]={source:crop.toDataURL('image/png'),padX:pad*spans[0]/w,padY:pad*spans[plane==='top'?1:2]/h};
        }finally{Plotly.purge(host);host.remove();}
      })().finally(()=>{delete cache.captureJobs[key];});
      await cache.captureJobs[key];
    }
  }
  function draw(plotly,target,fig,baseConfig,view){
    if(view==='3d')return plotly.react(target,fig.data,fig.layout,baseConfig);
    // Plotly's native reset/autoscale also modifies constrained subplot domains.
    // Recreate from an immutable initial figure instead of retaining that state.
    const clone=value=>JSON.parse(JSON.stringify(value)),initial=clone(fig);
    let restoring=false;
    const config={...baseConfig,doubleClick:false,modeBarButtonsToRemove:[...new Set([...(baseConfig.modeBarButtonsToRemove||[]),'resetScale2d','autoScale2d'])]};
    const restore=async()=>{
      if(restoring)return;restoring=true;
      try{return await plotly.newPlot(target,clone(initial.data),clone(initial.layout),config);}finally{restoring=false;}
    };
    config.modeBarButtonsToAdd=[{name:'Restore initial view',title:'Restore initial view',icon:{width:24,height:24,path:'M12 2L1 11h3v11h6v-7h4v7h6V11h3L12 2z'},click:restore}];
    return plotly.react(target,fig.data,fig.layout,config);
  }
  return {units,project,figure,captureCamera,prepareCaptures,draw};
});
