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
'use strict';
const C = Crystallite;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => n == null ? '—' : Number(n).toLocaleString('en-US',{maximumSignificantDigits:6});
let state = {files:[],sizs:[],maps:[],pcr:null,out:null,mics:[],result:null}, busy=false;
const defaultCamera = {eye:{x:1.7,y:1.4,z:1.1},projection:{type:'orthographic'}};
function setBusy(value){busy=value;document.querySelector('.controls').classList.toggle('loading',value);$('generate').textContent=value?'Processing…':'Generate plot';}
function invalidate(){state.result=null;$('rietveld-stats').hidden=true;$('rietveld-stats').textContent='';$('empty').hidden=false;$('normalization-note').hidden=true;if($('plot').data)Plotly.purge($('plot'));$('export-html').disabled=$('export-png').disabled=true;document.querySelectorAll('[data-view]').forEach(b=>b.disabled=true);$('metrics').innerHTML=['Axial size','Equatorial mean','Axial ratio'].map(t=>'<div><span>'+t+'</span><strong>—</strong></div>').join('');$('metrics-table').innerHTML='<p>Metrics become available after a valid plot is generated.</p>';$('plot-subtitle').textContent='A centered representation of the FullProf size or strain grid.';}
function report({errors=[],warnings=[],checks=[],notes=[]},waiting=false){
  $('status').innerHTML='<ul>'+errors.map(t=>'<li class="error">'+esc(t)+'</li>').join('')+warnings.map(t=>'<li class="warn">'+esc(t)+'</li>').join('')+checks.map(t=>'<li>'+esc(t)+'</li>').join('')+notes.map(t=>'<li class="note">'+esc(t)+'</li>').join('')+'</ul>';
  const b=$('status-badge');b.textContent=waiting?'Waiting for files':errors.length?'Action needed':warnings.length?'Review notes':'Checks passed';b.className='badge '+(waiting?'neutral':errors.length?'error':warnings.length?'warn':'');
}
function selected(){if(!state.pcr)return {};const [ph,pa]=$('phase').value.split(':').map(Number);const phase=state.pcr.phases.find(p=>p.id===ph),pattern=phase?.patterns.find(p=>p.id===pa);return {phase,pattern,siz:state.sizs[+$('dataset').value]};}
function updateSelection(autoPhase=false){
  invalidate();const siz=state.sizs[+$('dataset').value];
  if(autoPhase&&siz&&state.pcr){const ph=state.pcr.phases.find(p=>p.id===siz.phase);const pa=ph?.patterns.find(p=>p.id===(siz.pattern||1));if(pa)$('phase').value=ph.id+':'+pa.id;}
  const {phase,pattern}=selected();
  $('generate').disabled=!(siz&&phase&&pattern);
  if(phase&&pattern){const m=C.modelFor(phase,pattern);$('model').textContent=pattern.model+' · '+m.name;$('space-group').textContent='Space group: '+phase.spaceGroup+' · From PCR';$('guide-model').textContent=pattern.model;$('guide-rule').textContent=m.rule;$('coeff-guide').textContent=m.coeff?'Required coefficients: '+m.coeff.join(', '):m.rule;
    if(siz){const v=siz.kind==='strain'?validateStrain(siz,phase,pattern):C.validate(siz,phase,pattern,state.out,state.mics,state.pcr.name);report(v);$('generate').disabled=v.errors.length>0;}
  }
}
async function loadEntries(entries,isExample=false){
  if(busy)return;setBusy(true);invalidate();
  state={files:entries,sizs:[],maps:[],pcr:null,out:null,mics:[],result:null,isExample};
  try{
    const pc=entries.filter(f=>/\.pcr$/i.test(f.name)),outs=entries.filter(f=>/\.out$/i.test(f.name));
    if(pc.length>1||outs.length>1)throw Error('Load one PCR and at most one OUT per refinement. Multiple SIZ and MIC files are allowed.');
    for(const file of entries){if(/\.pcr$/i.test(file.name))state.pcr=C.parsePcr(file.text,file.name);else if(/\.siz$/i.test(file.name))state.sizs.push(C.parseSiz(file.text,file.name));else if(/\.str$/i.test(file.name))state.sizs.push(parseStrain(file.text,file.name));else if(/\.out$/i.test(file.name))state.out=C.parseOut(file.text,file.name);else if(/\.mic$/i.test(file.name))state.mics.push(C.parseMic(file.text,file.name));else if(/\.(bin|ggrid)$/i.test(file.name))state.maps.push(FullProfGrid.parse(file.bytes,file.name));else throw Error('Unsupported file: '+file.name+'. Select .siz or .str, .pcr, .bin/.ggrid, .out and .mic files.');}
    $('file-list').innerHTML=entries.map(f=>'<div><span class="filename">'+esc(f.name)+'</span><span>Read</span></div>').join('');
    $('dataset').innerHTML=state.sizs.length?state.sizs.map((s,i)=>'<option value="'+i+'">'+esc(s.name)+'</option>').join(''):'<option>Load a .siz or .str file</option>';$('dataset').disabled=!state.sizs.length;
    $('phase').innerHTML=state.pcr?state.pcr.phases.flatMap(p=>p.patterns.map(pa=>'<option value="'+p.id+':'+pa.id+'">'+esc(p.name)+' · phase '+p.id+' / pattern '+pa.id+'</option>')).join(''):'<option>Load a .pcr file</option>';$('phase').disabled=!state.pcr;
    updateSelection(true);
    const missing=[];if(!state.sizs.length)missing.push('A .siz (size) or .str (strain) file is required.');if(!state.pcr)missing.push('A .pcr file is required.');
    if(missing.length)report({errors:missing,warnings:['Select all files together; a new selection replaces the previous set.']});
  }catch(e){state.pcr=null;state.sizs=[];report({errors:[e.message]});$('generate').disabled=true;$('phase').disabled=$('dataset').disabled=true;}
  finally{setBusy(false);}
  if(isExample&&!$('generate').disabled)await generate();
}
async function loadFiles(list){const fs=[...list];if(!fs.length)return;if(fs.some(f=>f.size>50*1024*1024)){report({errors:['Each file must be smaller than 50 MB.']});return;}try{await loadEntries(await Promise.all(fs.map(async f=>{const bytes=await f.arrayBuffer();let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('windows-1252').decode(bytes);}return {name:f.name,text,bytes};})));}catch(e){report({errors:[e.message]});}}
// Hide the axis parallel to the viewing direction: its ticks collapse to one point.
// The same function is embedded in standalone HTML exports.
function viewUpdate(v,unit,spans=[2,2,2]){
  const camera=v==='top'?{eye:{x:0,y:0,z:2.2},up:{x:0,y:1,z:0}}:v==='side'?{eye:{x:0,y:-2.2,z:0},up:{x:0,y:0,z:1}}:{eye:{x:1.7,y:1.4,z:1.1},up:{x:0,y:0,z:1}};
  camera.projection={type:'orthographic'};
  const update={'scene.camera':camera,'margin.l':v==='3d'?30:90};
  for(const axis of ['x','y','z']){
    const visible=!(v==='top'&&axis==='z')&&!(v==='side'&&axis==='y');
    update['scene.'+axis+'axis.visible']=visible;
    update['scene.'+axis+'axis.showticklabels']=visible&&!(v==='side'&&axis==='z');
    update['scene.'+axis+'axis.title.text']=visible&&!(v==='side'&&axis==='z')?axis+' ('+unit+')':'';
    update['scene.'+axis+'axis.tickangle']=v==='3d'&&axis!=='z'?'auto':0;
  }
  update.annotations=[];
  update['scene.annotations']=[];
  if(v==='side'){
    // The side view projects native z tick offsets into the viewing direction.
    // Data-anchored annotations keep a screen-space gap and follow zoom/pan.
    const half=spans[2]/2,raw=spans[2]/3,power=10**Math.floor(Math.log10(raw));
    const step=[1,2,5,10].find(n=>n*power>=raw)*power;
    const label=(z,text,shift,size)=>({x:spans[0]*0.53125,y:0,z,text,showarrow:false,xshift:shift,xanchor:'left',yanchor:'middle',font:{size,weight:700,color:'#213b55'}});
    const labels=[];
    for(let i=Math.ceil(-half/step);i<=Math.floor(half/step);i++)labels.push(label(i*step,Number((i*step).toPrecision(5)).toString(),18,14));
    labels.push({...label(0,'z ('+unit+')',68,17),textangle:90});
    update['scene.annotations']=labels;
  }
  return update;
}
function makeLayout(camera=defaultCamera){
  const unit=state.result?.unit||'nm',label=C.units[unit].label;
  // Normalize by the longest span: Plotly's volume normalization clips flat shapes.
  const spans=state.result?.metrics.spans||[1,1,1],longest=Math.max(...spans);
  const aspectratio=Object.fromEntries(['x','y','z'].map((a,i)=>[a,1.4*spans[i]/longest]));
  const axis=t=>({range:[-0.53125*spans['xyz'.indexOf(t)]*C.units[unit].factor,0.53125*spans['xyz'.indexOf(t)]*C.units[unit].factor],title:{text:t+' ('+label+')',font:{size:17,weight:700}},showbackground:true,backgroundcolor:'#f8fafc',gridcolor:'#b8c6d5',gridwidth:1,zerolinecolor:'#71859b',zerolinewidth:1.5,showline:true,linecolor:'#71859b',linewidth:2,tickfont:{size:14,weight:700,color:'#213b55'},tickangle:t==='z'?0:'auto',ticks:'outside',ticklen:8,tickcolor:'#71859b',nticks:5,showspikes:false});
  return {autosize:true,margin:{l:30,r:85,t:25,b:65},paper_bgcolor:'#ffffff',font:{family:'Arial, sans-serif',color:'#213b55',size:13},showlegend:false,annotations:viewUpdate('3d',label).annotations,scene:{aspectmode:'manual',aspectratio,xaxis:axis('x'),yaxis:axis('y'),zaxis:axis('z'),camera},uirevision:state.result?.siz.name+'-'+unit};
}
const plotConfig={responsive:true,displaylogo:false,displayModeBar:true,modeBarButtonsToRemove:['toImage','resetCameraLastSave3d'],scrollZoom:true};
async function generate(){
  if(busy)return;const {siz,phase,pattern}=selected();if(!siz||!phase||!pattern)return;
  if(siz.kind==='strain')return generateStrain(siz,phase,pattern);
  setBusy(true);invalidate();await new Promise(r=>setTimeout(r,30));
  try{
    const audit=C.validate(siz,phase,pattern,state.out,state.mics,state.pcr.name);if(audit.errors.length){report(audit);return;}
    const grid=C.buildGrid(siz),metrics=C.getMetrics(siz,grid),unit=C.chooseUnit(metrics.max,document.querySelector('[name=unit]:checked').value);
    const matchingMic=state.mics.filter(m=>m.phase===phase.id&&m.pattern===pattern.id);
    state.result={siz,phase,pattern,grid,metrics,unit,audit,mic:matchingMic.length===1?matchingMic[0]:null,pcrName:state.pcr.name,outName:state.out?.name||null,rietveld:state.out?.rietveld?.[pattern.id]||null,view:'3d'};
    const stem=siz.name.replace(/\.(siz|str)$/i,'').toLowerCase(),maps=state.maps.filter(m=>m.name.replace(/\.(bin|ggrid)$/i,'').toLowerCase()===stem);
    if(!maps.length)throw Error('Load the .bin or .ggrid with the same basename as the selected .siz.');
    if(maps.length>2)throw Error('Ambiguous surface files.');
    if(maps.length===2&&(String(maps[0].dims)!==String(maps[1].dims)||maps[0].values.some((v,i)=>v!==maps[1].values[i])))throw Error('BIN and GGRID do not contain the same grid.');
    const map=maps.find(m=>/\.bin$/i.test(m.name))||maps[0],surface=FullProfGrid.surface(map);
    state.result.map={name:map.name,dims:map.dims,threshold:map.threshold,bounds:surface.bounds,center:surface.center};state.result.plotSpans=surface.spans;
    state.result.gridBase=[surface.trace];state.result.gridSpans=surface.spans;state.result.sizBase=C.surfaceData(grid,'A');state.result.baseData=state.result.sizBase;state.result.plotSpans=metrics.spans;state.result.representation='siz';$('representation').value='siz';
    audit.checks.push('FullProf grid read directly: '+map.name+'. Half-level isosurface; no hemisphere reconstruction.');
    audit.warnings.push('Surface axes are dimensionless grid coordinates centered on its bounding box. Physical grid scale is not verified. Colors indicate radius in grid units, not Dₕ. SIZ/MIC metrics retain their own physical units.');state.result.paper=C.paperMetrics(state.result.mic,siz.cell);state.result.projectionCache={};state.result.normalized=false;
    const data=C.surfaceData(grid,unit),mn=metrics.min*C.units[unit].factor,mx=metrics.max*C.units[unit].factor;
    state.result.palette=$('palette').value;data.forEach(t=>t.colorscale=C.palettes[state.result.palette]);
    data.forEach(t=>{t.cmin=mn;t.cmax=mx===mn?mn*1.001:mx;});state.result.data=data;
    $('empty').hidden=true;
    if(await renderPlot(false)===false)return;
    $('plot-subtitle').textContent=(state.isExample?'Supplied example · ':'')+phase.name+' · Size-Model '+pattern.model;
    const stats=$('rietveld-stats');stats.textContent=rietveldLine(state.result.rietveld)||'Rietveld statistics: '+(state.out?'not available in this .out.':'load the optional .out file.');stats.hidden=false;
    stats.title='Conventional Rietveld factors for all non-excluded points, final reported block of pattern '+pattern.id+'. Shared by the phases of this pattern.';
    renderMetrics();
    audit.checks.push(siz.rows.length.toLocaleString('en-US')+' rows read; '+grid.count.toLocaleString('en-US')+' unique angular samples.');
    audit.checks.push(grid.hemi?'SIZ metrics only: northern hemisphere completed by antipodal continuation. This does not alter the FullProf grid.':'Full sphere read directly; antipodal sizes checked.');
    audit.checks.push('No Scherrer recalculation, harmonic refitting or smoothing.');
    report(audit);$('export-html').disabled=$('export-png').disabled=false;document.querySelectorAll('[data-view]').forEach(b=>{b.disabled=false;b.classList.toggle('active',b.dataset.view==='3d');});
  }catch(e){invalidate();report({errors:[e.message]});}finally{setBusy(false);}
}
async function renderPlot(keepCamera=true){
  const r=state.result;if(!r)return;
  $('plot-frame').classList.toggle('compact-projection',r.view==='combined');
  const camera=keepCamera&&r.view==='3d'?$('plot').layout?.scene?.camera:null;
  const captureOptions={view:r.view,palette:r.palette};
  $('unit-note').textContent=r.view==='3d'?'Rendering…':'Rendering orthographic 3D captures…';
  try{await CrystalView.prepareCaptures(r.baseData,r.plotSpans||r.metrics.spans,captureOptions,C.palettes,r.projectionCache);}catch(error){$('unit-note').textContent='3D capture failed';report({errors:[error.message]});return false;}
  if(state.result!==r||r.view!==captureOptions.view||r.palette!==captureOptions.palette)return;
  const fig=CrystalView.figure(r.baseData,r.plotSpans||r.metrics.spans,{renderMode:'capture',view:r.view,unit:r.unit,normalized:r.normalized,palette:r.palette,camera,width:$('plot-frame').clientWidth},C.palettes,r.projectionCache);
  r.data=fig.data;await CrystalView.draw(Plotly,$('plot'),fig,plotConfig,r.view);
  $('representation').disabled=r.kind==='strain';
  $('normalization-note').hidden=false;$('normalization-note').textContent='FullProf size surface · centered grid coordinates (dimensionless). Physical scale is not verified. Colors: distance from grid center, not Dₕ. Selected Å/nm/µm units apply only to size results; STR values retain their original convention.';
  document.querySelectorAll('[name=unit]').forEach(el=>el.disabled=r.kind==='strain');
  $('unit-note').textContent=r.representation==='siz'?'SIZ radial · r = Dₕ/2 · '+C.units[r.unit].label:'Surface: '+r.map.name+' · '+r.map.dims.join(' × ')+' grid · half-level isosurface';
  if(r.representation==='siz')$('normalization-note').textContent='Directional apparent size from SIZ: r = Dₕ/2. Axes and colors follow the selected physical units. This radial construction is distinct from the FullProf binary surface and is not a unique particle reconstruction.';
  $('axis-mode').options[0].text=r.representation==='siz'?'Physical units':'Centered grid coordinates';
}
function rietveldLine(stats){
  if(!stats)return '';
  const [rp,rwp,rexp,chi2]=stats.display;
  return 'Rwp = '+rwp+'% · Rp = '+rp+'% · Rexp = '+rexp+'% · χ² = '+chi2;
}
function renderMetrics(){
  if(state.result.kind==='strain'){$('metrics').innerHTML='<div><span>Quantity</span><strong>Strain</strong></div><div><span>Surface</span><strong>FullProf grid</strong></div><div><span>Axes</span><strong>Dimensionless</strong></div>';$('metrics-table').innerHTML=metricsTable(state.result);return;}
  const {metrics:m,unit}=state.result,{factor:f,label:u}=C.units[unit];
  const axial=m.cAligned?'c-axis size D꜀':'z-axis size D𝓏',eq=m.cAligned?'Basal-plane mean':'xy-plane mean';
  $('metrics').innerHTML=[[axial,fmt(m.axial*f)+' <small>'+u+'</small>'],[eq,fmt(m.eqMean===null?null:m.eqMean*f)+' <small>'+u+'</small>'],['Equatorial / axial',fmt(m.ratio)+' <small>×</small>']].map(([t,v])=>'<div><span>'+t+'</span><strong>'+v+'</strong></div>').join('');
  $('metrics-table').innerHTML=metricsTable(state.result);
}
function metricsTable(r){
  if(r.kind==='strain')return strainTable(r);
  const m=r.metrics,p=r.paper||C.paperMetrics(r.mic,r.siz.cell),value=n=>n==null?'Not available':fmt(n),eq=m.cAligned?'Equatorial apparent':'xy-plane apparent';
  const table=rows=>'<table><tbody>'+rows.map(([a,b])=>'<tr><td>'+esc(a)+'</td><td>'+esc(b)+'</td></tr>').join('')+'</tbody></table>';
  const {factor:f,label:u}=C.units[r.unit||'A']; const length=n=>value(n==null?null:n*f),volume=n=>value(n==null?null:n*f**3); const pair=(a,b)=>length(a)+' / '+length(b);
  return (r.map?'<h3>FullProf grid surface</h3>'+table([['Source',r.map.name],['Grid dimensions',r.map.dims.join(' × ')],['Surface extraction','Half-level isosurface: '+r.map.threshold],['Physical scale','Not verified — dimensionless axes'],['Original grid bounding box',r.map.bounds.map(b=>b.map(value).join(' to ')).join(' / ')]])+'<p>The SIZ radial spans below are independent calculations; they are not dimensions measured on this grid surface. Colors are decorative radial shading in grid units, not directional sizes.</p>':'')+'<h3>1 · Cylindrical platelet estimate from MIC reflections</h3>'+table([
    ['Cylinder diameter ('+u+')',length(p.diameter)],['Cylinder height / thickness ('+u+')',length(p.thickness)],['Cylinder volume ('+u+'³)',volume(p.volume)],['MIC hk0 / 00l reflection counts',p.hk0Count+' / '+p.axisCount]])+
    '<p>Conditional model estimate assuming a cylindrical platelet with its axis parallel to c: diameter = (3π/8) × arithmetic mean Dₕ(hk0); height = arithmetic mean Dₕ(00l); volume = π diameter² height / 4. This assumption is not established by the Size-Model alone. The formula requires c perpendicular to the ab plane and a matching MIC. Positive, non-resolution-limited reflection records are averaged without weighting; no uncertainty is inferred for the cylinder dimensions.</p><p>Source: Casas-Cabanas et al., J. Mater. Chem. 16 (2006), 2925–2939, p. 2927.</p>'+
    '<h3>2 · Projected dimensions of the SIZ radial representation</h3>'+table([
    ['Projected width x ('+u+')',length(m.spans[0])],['Projected width y ('+u+')',length(m.spans[1])],['Projected height z ('+u+')',length(m.spans[2])],['Projected full x / y / z spans ('+u+')',m.spans.map(length).join(' / ')],['c aligned with Cartesian z',m.cAligned?'Yes':'No']])+
    '<p>These are bounding spans of the r = Dₕ/2 representation, not the cylinder diameter or height above. Top + Side shows the complete orthographic surface projections, not central sections. When c is not aligned with Cartesian z, the projected z height is not a c-axis height.</p>'+
    '<h3>3 · Directional apparent sizes (SIZ)</h3>'+table([
    ['Axial apparent size ('+u+')',length(m.axial)],['Axial σ(Dₕ) from SIZ ('+u+')',length(m.axialSigma)],[eq+' mean ('+u+')',length(m.eqMean)],[eq+' min / max ('+u+')',pair(m.eqMin,m.eqMax)],['Global apparent min / max ('+u+')',pair(m.min,m.max)],['Equatorial mean / axial size',value(m.ratio)],['Equatorial max / min',value(m.basalRatio)],['Equatorial modulation (%)',value(m.modulation)],['Global max / min',value(m.globalRatio)]])+
    '<p>Equatorial mean uses unique φ samples (the 360° seam is not counted twice). Extrema and projected spans refer to the sampled grid. Lengths and volumes follow the selected physical units, including when plot axes are normalized. Not available never means zero.</p>'+
    '<h3>4 · MIC summaries and refinement</h3>'+table([
    ['Mean apparent size, MIC ('+u+')',length(p.sizeMean)],['Size anisotropy: global SD, MIC ('+u+')',length(p.sizeSD)],['Average maximum strain × 10⁴, MIC',value(p.strainMean)],['Strain anisotropy: global SD × 10⁴, MIC',value(p.strainSD)],['Maximum strain 001 × 10⁴, MIC',value(p.strain001)],['δ = Δ2θ102 − Δ2θ101 (°), manual','Not available'],['Phase / pattern',r.phase.name+' · '+r.phase.id+' / '+r.pattern.id],['Space group',r.phase.spaceGroup],['Size model',r.pattern.model+' · '+C.modelFor(r.phase,r.pattern).name],['Rp (%)',value(r.rietveld?.rp)],['Rwp (%)',value(r.rietveld?.rwp)],['Rexp (%)',value(r.rietveld?.rexp)],['χ²',value(r.rietveld?.chi2)],['SIZ source',r.siz.name],['PCR source',r.pcrName||'Not available'],['MIC source',r.mic?.name||'Not available'],['OUT source',r.outName||'Not available']])+ '<p>δ requires measured peak shifts; it is not inferred from calculated MIC peak positions. MIC global standard deviations describe anisotropy, not the uncertainty of the mean.</p>';
}
function exportDetails(r,provenance){
  const list=items=>'<ul>'+items.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>';
  return '<details><summary>Directional metrics, interpretation and file checks</summary><h2>Directional metrics</h2>'+'<div id="export-metrics">'+metricsTable(r)+'</div>'+ 
    '<p>The representation selector distinguishes the FullProf grid from the SIZ radial construction (r = Dₕ/2). SIZ radial spans and cylindrical estimates do not calibrate the grid. This is not a unique reconstruction of a physical particle.</p>'+
    '<p>In grid mode, axes are centered dimensionless grid coordinates and colors show grid radius. In SIZ radial mode, axes use physical units and colors show Dₕ; uncertainties are available on hover. No uncertainty on ratios is inferred without parameter covariances.</p>'+
    '<h2>File checks</h2><p><strong>'+((r.audit.warnings||[]).length?'Review notes':'Checks passed')+'</strong></p>'+list([...(r.audit.warnings||[]),...r.audit.checks,...(r.audit.notes||[])])+
    '<h2>Source files</h2>'+list(provenance.files)+'<p>Phase '+r.phase.id+' · Pattern '+r.pattern.id+' · Size-Model '+r.pattern.model+'</p>'+
    '<details><summary>Technical metadata (JSON)</summary><pre>'+esc(JSON.stringify(provenance,null,2))+'</pre></details></details>';
}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.textContent='Save '+name;$('download-status').replaceChildren(document.createTextNode('Export ready · '),a);a.click();}
function fileBase(){return state.result.siz.name.replace(/\.(siz|str)$/i,'').replace(/[^\w().-]+/g,'_');}
const scriptJson=x=>JSON.stringify(x).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
function exportViewer(payload,palettes,config){
  let cache={captures:payload.captures||{}};const options=payload.options,get=id=>document.getElementById(id);
  async function draw(preserve=true){
    get('frame').classList.toggle('compact-projection',options.view==='combined');
    if(preserve&&options.view==='3d')options.camera=get('figure').layout?.scene?.camera||options.camera;
    const snapshot={...options};get('map-note').textContent='Rendering orthographic 3D captures…';
    try{await CrystalView.prepareCaptures(payload.base,payload.spans,snapshot,palettes,cache);}catch(error){get('map-note').textContent='3D capture failed: '+error.message;return;}
    if(options.view!==snapshot.view||options.palette!==snapshot.palette||options.unit!==snapshot.unit||options.normalized!==snapshot.normalized)return;
    const fig=CrystalView.figure(payload.base,payload.spans,{renderMode:'capture',...options,width:get('frame').clientWidth},palettes,cache);
    await CrystalView.draw(Plotly,get('figure'),fig,config,options.view);
    get('map-note').textContent=payload.gridSurface?'FullProf surface · centered dimensionless grid coordinates. Colors: grid radius, not Dₕ. Physical units apply only to SIZ/MIC metrics below.':options.normalized?'x/a, y/b, z/c: centered at 0.5; a = b = c = L = '+Number(fig.reference.toPrecision(6))+' Å. Coordinates = 0.5 + Cartesian coordinate / L. L is 1.0625 × longest projected span, not a PCR lattice parameter. Colors show Dₕ in '+CrystalView.units[options.unit].label+'.':'Physical Cartesian axes and Dₕ colors in '+CrystalView.units[options.unit].label+'.';
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===options.view));
  }
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{options.view=b.dataset.view;delete options.camera;draw(false);});
  get('exp-representation').disabled=!payload.sources;
  get('exp-representation').onchange=e=>{options.representation=e.target.value;const source=payload.sources[options.representation];payload.base=source.base;payload.spans=source.spans;payload.gridSurface=options.representation==='grid';cache={};delete options.camera;get('exp-axis').options[0].text=payload.gridSurface?'Centered grid coordinates':'Physical units';draw(false);};
  get('exp-unit').disabled=options.kind==='strain';
  get('exp-unit').onchange=e=>{options.unit=e.target.value;get('export-metrics').innerHTML=payload.tables[options.unit];draw();};
  get('exp-axis').onchange=e=>{options.normalized=e.target.value==='normalized';draw();};
  function setPalette(p){options.palette=p;draw();}
  get('exp-palette').onchange=e=>setPalette(e.target.value);
  new ResizeObserver(()=>Plotly.Plots.resize('figure')).observe(get('frame'));draw(false);
}
function createExportHtml(){
  if(!state.result)throw Error('Generate a valid plot first.');
  const r=state.result,provenance={quantity:r.kind||'size',directionalSource:r.siz.name,pcr:state.pcr.name,phase:r.phase.id,pattern:r.pattern.id,sizeModel:r.pattern.model,spaceGroup:r.phase.spaceGroup,rietveld:r.rietveld||null,sourceUnits:r.kind==='strain'?'STR original convention':'Angstrom',displayUnits:C.units[r.unit].label,geometry:r.representation==='siz'?'SIZ radial r = Dh/2':'FullProf binary mask, half-level isosurface',gridSurface:r.map,normalization:'0.5 + coordinate/L; a=b=c=L=1.0625*max(projected spans); plotting references, not lattice parameters',palette:r.palette||'Viridis',completion:r.kind==='strain'?'direct grid':r.grid.hemi?'antipodal (SIZ metrics only)':'full sphere (SIZ metrics only)',metricsAngstrom:r.metrics,cylinder:r.paper||null,checks:r.audit.checks,notes:[...r.audit.warnings,...(r.audit.notes||[])],files:state.files.map(f=>f.name),fullProfVersion:state.out?.version||null};
  const options={representation:r.representation||'grid',kind:r.kind||'size',view:r.view||'3d',unit:r.unit,normalized:!!r.normalized,palette:r.palette||'Viridis',camera:r.view==='3d'?$('plot').layout?.scene?.camera:undefined};
  const tables=Object.fromEntries(Object.keys(C.units).map(unit=>[unit,metricsTable({...r,unit})])); const payload={gridSurface:r.representation!=='siz',sources:r.kind==='strain'?null:{grid:{base:r.gridBase||r.baseData,spans:r.gridSpans||r.plotSpans},siz:{base:C.surfaceData(r.grid,'A'),spans:r.metrics.spans}},tables,captures:r.projectionCache?.captures||{},base:r.baseData||C.surfaceData(r.grid,'A'),spans:r.plotSpans||r.metrics.spans,options};
  const opts=(items,selected)=>items.map(([key,label])=>'<option value="'+key+'"'+(key===selected?' selected':'')+'>'+label+'</option>').join('');
  const title='Anisotropy Plotter (Crystallite Size and Strain) · '+r.phase.name+' · '+(r.kind==='strain'?'Strain':'Crystallite size');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+'</title><style>body{font:14px Arial,sans-serif;color:#213b55;margin:24px auto;padding:0 18px;max-width:1050px}h1{font-size:20px}h2,h3{font-size:16px;margin:20px 0 10px}#frame{position:relative;width:100%;aspect-ratio:9/7}#frame.compact-projection{width:min(100%,680px,78vh);aspect-ratio:1;margin-inline:auto}#frame{margin-top:36px}#figure{position:absolute;inset:0}#figure .modebar-container{top:-32px!important;height:30px}#figure .modebar{top:0!important;background:#fff!important}p{line-height:1.5}details{margin:20px 0}summary{cursor:pointer;font-weight:600}table{width:100%;border-collapse:collapse;margin:15px 0}td{padding:8px 10px;border-bottom:1px solid #d9e3ea}td:first-child{width:55%}li{margin:6px 0}nav{display:flex;gap:8px;flex-wrap:wrap;align-items:center}button,select{background:white;border:1px solid #b5c5d5;border-radius:4px;padding:7px 10px;cursor:pointer;color:#213b55}.active{background:#09889b;color:white}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}#map-note{font-size:12px;color:#64768b}@media print{body{margin:0;padding:0}h1,p,details,nav{display:none}#frame,#frame.compact-projection{width:12.6cm;height:9.8cm}}</style></head><body><h1>'+esc(title)+'</h1><p style="font-size:14px;color:#52677d">Developed by Dr. Alexander Resentera (Universidad Nacional de Cuyo). Built with assistance from OpenAI Codex.</p><p>For refinements performed in FullProf · Size-Model '+r.pattern.model+' · '+(r.representation==='siz'?'SIZ radial surface':'FullProf grid surface')+'</p>'+(r.rietveld?'<p class="rietveld-stats">'+esc(rietveldLine(r.rietveld))+'</p>':'')+
    '<nav><label>Representation <select id="exp-representation">'+opts([['siz','SIZ radial · r = Dₕ/2'],['grid','FullProf BIN / GGRID']],r.representation||'grid')+'</select></label><button data-view="3d">3D</button><button data-view="top">Top</button><button data-view="side">Side</button><button data-view="combined">Top + Side</button><label>Axes <select id="exp-axis" disabled>'+opts([['physical',r.representation==='siz'?'Physical units':'Centered grid coordinates']], 'physical')+'</select></label><label>Result units <select id="exp-unit">'+opts([['A','Å'],['nm','nm'],['um','µm']],r.unit)+'</select></label><label>Palette <select id="exp-palette">'+opts(['Viridis','Cividis','Plasma'].map(p=>[p,p]),options.palette)+'</select></label></nav><p id="map-note"></p><div id="frame"><div id="figure"></div></div><p>Apparent coherent-domain representation; not a unique physical particle reconstruction. Top + Side uses orthographic captures of the 3D surface, without measurement arrows. Point values remain available in 3D. Figure ratio 9:7.</p><aside class="interpretation-note"><strong>Interpretation of the SIZ representation</strong><p>This is a representation of the directional apparent sizes obtained from the refinement, plotted as r = Dₕ/2. It does not establish the physical shape of a crystallite or guarantee that the plotted outer dimensions match those of a real particle.</p><p>FullProf defines the size derived from the integral breadth as follows: <q>gives the volume-averaged apparent size of the crystallites in the direction normal to the scattering planes.</q> <a href="https://www.ill.eu/sites/fullprof/downloads/Docs/Microstructural_effects.pdf" target="_blank" rel="noopener">FullProf microstructure documentation, Eq. (14)</a>.</p><p>The first paragraph explains the interpretation of this app’s radial construction; it is not a verbatim quotation from FullProf.</p></aside>'+exportDetails(r,provenance)+'<details><summary>Software license: GPL-3.0-only</summary><p>Copyright © 2026 Alexander Resentera. This viewer is free software under GNU GPL version 3, without warranty. Plotly is MIT-licensed. Source code is provided in the application publication package.</p><pre>'+esc($('license-text')?.textContent||'GNU GPL version 3: https://www.gnu.org/licenses/gpl-3.0.html')+'</pre></details>'+
    '<script>'+$('plotly-library').textContent+'\n'+$('presentation-library').textContent+'</scr'+'ipt><script>('+exportViewer.toString()+')('+scriptJson(payload)+','+scriptJson(C.palettes)+','+scriptJson(plotConfig)+');</scr'+'ipt></body></html>';
}
// PNG pHYs metadata makes physical size available to word processors and image editors.
function pngWithDensity(bytes,width,height){
  const ppm=Math.round(width/0.126),data=new Uint8Array(9),dv=new DataView(data.buffer);dv.setUint32(0,ppm);dv.setUint32(4,Math.round(height/0.098));data[8]=1;
  const chunk=new Uint8Array(21),cv=new DataView(chunk.buffer);cv.setUint32(0,9);chunk.set([112,72,89,115],4);chunk.set(data,8);
  let crc=0xffffffff;for(const b of chunk.slice(4,17)){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}cv.setUint32(17,(crc^0xffffffff)>>>0);
  const parts=[bytes.slice(0,8)];let pos=8,inserted=false;while(pos+12<=bytes.length){const len=new DataView(bytes.buffer,bytes.byteOffset+pos,4).getUint32(0);const typ=String.fromCharCode(...bytes.slice(pos+4,pos+8));if(typ!=='pHYs')parts.push(bytes.slice(pos,pos+len+12));if(typ==='IHDR'&&!inserted){parts.push(chunk);inserted=true;}pos+=len+12;}return new Blob(parts,{type:'image/png'});
}
async function exportPng(){
  const b=$('export-png');b.disabled=true;b.textContent='Exporting…';
  try{
    const width=1485,height=1155,plot=$('plot');
    // Keep the displayed layout in CSS pixels; scale the entire render uniformly.
    const displayedWidth=plot._fullLayout.width,displayedHeight=plot._fullLayout.height;
    const scale=Math.min(width/displayedWidth,height/displayedHeight);
    const uri=await Plotly.toImage(plot,{format:'png',width:displayedWidth,height:displayedHeight,scale});
    const img=new Image();img.src=uri;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
    ctx.drawImage(img,Math.round((width-img.naturalWidth)/2),Math.round((height-img.naturalHeight)/2));
    const bytes=new Uint8Array(await (await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))).arrayBuffer());
    download(pngWithDensity(bytes,width,height),fileBase()+'_12.6x9.8cm.png');
  }catch(e){report({errors:['PNG export failed: '+e.message]});}finally{b.disabled=!state.result;b.textContent='Export PNG';}
}
$('files').addEventListener('change',e=>loadFiles(e.target.files));
$('dropzone').addEventListener('dragover',e=>{e.preventDefault();$('dropzone').classList.add('drag');});
$('dropzone').addEventListener('dragleave',()=>$('dropzone').classList.remove('drag'));
$('dropzone').addEventListener('drop',e=>{e.preventDefault();$('dropzone').classList.remove('drag');loadFiles(e.dataTransfer.files);});
$('example').addEventListener('click',()=>loadEntries(JSON.parse($('example-data').textContent),true));
$('clear').addEventListener('click',()=>{state={files:[],sizs:[],maps:[],pcr:null,out:null,mics:[],result:null};invalidate();$('files').value='';$('file-list').innerHTML='<p class="secondary">Select .siz or .str, .pcr and matching .bin/.ggrid together.</p>';$('phase').innerHTML='<option>Load a .pcr file</option>';$('dataset').innerHTML='<option>Load a .siz or .str file</option>';$('phase').disabled=$('dataset').disabled=$('generate').disabled=true;$('model').textContent='—';$('guide-model').textContent='your model';$('space-group').textContent='Detected from your refinement.';report({checks:['Your files stay in this browser. Nothing is uploaded.']},true);});
$('dataset').addEventListener('change',()=>updateSelection(true));$('phase').addEventListener('change',()=>updateSelection());$('generate').addEventListener('click',generate);
$('palette').addEventListener('change',async()=>{if(state.result){state.result.palette=$('palette').value;await renderPlot();}});
$('axis-mode').addEventListener('change',async()=>{if(state.result){state.result.normalized=false;await renderPlot();}});
document.querySelectorAll('[name=unit]').forEach(el=>el.addEventListener('change',async()=>{if(state.result){state.result.unit=C.chooseUnit(state.result.metrics.max,el.value);await renderPlot();renderMetrics();}}));
document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',async()=>{if(!state.result)return;state.result.view=el.dataset.view;await renderPlot(false);document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b===el));}));
$('export-html').addEventListener('click',()=>{try{download(new Blob([createExportHtml()],{type:'text/html;charset=utf-8'}),fileBase()+'_3D.html');}catch(e){report({errors:[e.message]});}});
$('export-png').addEventListener('click',exportPng);
$('catalog-body').innerHTML=Object.entries(C.models).sort((a,b)=>+a[0]-+b[0]).map(([id,m])=>'<tr><td>'+id+'</td><td><strong>'+esc(m.name)+'</strong>'+(m.laue?'<br>'+esc(m.laue):'')+'</td><td>'+esc(m.rule)+(m.coeff?'<br><small>'+esc(m.coeff.join(', '))+'</small>':'')+'</td></tr>').join('')+'<tr><td>Str = −1, 2, 3</td><td>Generalized quadratic size</td><td>Six size coefficients (SZ1…SZ6); governed by Str rather than Size-Model. A finite directional .siz is mandatory.</td></tr>';
$('catalog-open').addEventListener('click',()=>$('catalog').showModal());$('catalog-close').addEventListener('click',()=>$('catalog').close());
new ResizeObserver(()=>{if(state.result&&$('plot').data)Plotly.Plots.resize($('plot'));}).observe($('plot-frame'));

$('representation').addEventListener('change',async()=>{
  const r=state.result;if(!r||r.kind==='strain')return;
  r.representation=$('representation').value;r.normalized=false;
  if(r.representation==='siz'){r.sizBase||=C.surfaceData(r.grid,'A');r.baseData=r.sizBase;r.plotSpans=r.metrics.spans;}
  else {r.baseData=r.gridBase;r.plotSpans=r.gridSpans;}
  r.projectionCache={};await renderPlot(false);
});
