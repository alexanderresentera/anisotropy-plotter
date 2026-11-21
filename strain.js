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
// STR values are deliberately not converted to length or assigned an unstated strain multiplier.
function parseStrain(text,name){
  if(!/FILE containing strain along any direction/i.test(text))throw Error('Unrecognized STR header.');
  const lines=text.split(/\r?\n/),start=lines.findIndex(l=>/^\s*Theta\s+Phi\s+Strain\s+Sigma/.test(l)),cellLine=lines.findIndex(l=>/Unit cell parameters/.test(l));
  if(start<0||cellLine<0)throw Error('Missing strain columns or unit cell in STR.');
  const nums=l=>l.trim().split(/\s+/).map(v=>Number(v.replace(/[dD]/g,'e'))),cell=nums(lines[cellLine+1]);
  if(cell.length!==6||cell.some(v=>!Number.isFinite(v)))throw Error('Invalid STR cell.');
  const rows=[];
  for(const l of lines.slice(start+1)){if(!l.trim()||/^\s*[-=!#]+\s*$/.test(l))continue;const v=nums(l);if(v.length<4||v.some(n=>!Number.isFinite(n))||v[0]<0||v[0]>180||v[1]<0||v[1]>360||v[2]<0||v[3]<0)throw Error('Invalid STR directional row.');rows.push({theta:v[0],phi:v[1],strain:v[2],sigma:v[3]});}
  if(!rows.length)throw Error('No strain samples.');
  return {kind:'strain',name,cell,rows,phase:Number(name.match(/_strain_(\d+)\.str$/i)?.[1])||null,pattern:null};
}
function validateStrain(str,phase,pattern){
  const errors=[],warnings=['STR numerical values are shown exactly as written. No strain multiplier or physical grid scale is inferred.'],checks=[];
  if(!str.phase||str.phase!==phase.id)errors.push('STR filename phase does not match the selected PCR phase.');
  if(!pattern.cell||str.cell.some((v,i)=>Math.abs(v-pattern.cell[i])>Math.max(.001,Math.abs(v)*.0001)))errors.push('STR and PCR unit cells do not agree.');else checks.push('STR and PCR unit cells agree.');
  if(phase.patterns.length>1)errors.push('Multiple patterns: the STR pattern cannot be identified unambiguously by this version.');
  warnings.push('Strain parameters have not been cross-validated against PCR/OUT; phase and cell checks alone do not establish a matching refinement.');
  return {errors,warnings,checks};
}
async function generateStrain(str,phase,pattern){
  setBusy(true);invalidate();$('representation').value='grid';
  try{
    const audit=validateStrain(str,phase,pattern);if(audit.errors.length){report(audit);return;}
    const stem=str.name.replace(/\.str$/i,'').toLowerCase(),maps=state.maps.filter(m=>m.name.replace(/\.(bin|ggrid)$/i,'').toLowerCase()===stem);
    if(!maps.length)throw Error('Load the strain BIN or GGRID with the same basename as the STR.');
    if(maps.length>2)throw Error('Ambiguous grid files.');
    if(maps.length===2&&(String(maps[0].dims)!==String(maps[1].dims)||maps[0].values.some((v,i)=>v!==maps[1].values[i])))throw Error('Strain BIN and GGRID do not agree.');
    const map=maps.find(m=>/\.bin$/i.test(m.name))||maps[0],surface=FullProfGrid.surface(map);
    surface.trace.hovertemplate=surface.trace.hovertemplate.replace('size surface','strain surface');
    state.result={kind:'strain',siz:str,phase,pattern,grid:{hemi:false},metrics:{spans:surface.spans,max:1},unit:'A',audit,pcrName:state.pcr.name,outName:state.out?.name,rietveld:state.out?.rietveld?.[pattern.id]||null,view:'3d',baseData:[surface.trace],plotSpans:surface.spans,map:{name:map.name,dims:map.dims,threshold:map.threshold,bounds:surface.bounds,center:surface.center},projectionCache:{},palette:$('palette').value,normalized:false};
    $('empty').hidden=true;if(await renderPlot(false)===false)return;
    $('plot-subtitle').textContent=phase.name+' · Strain surface (FullProf grid)';
    $('model').textContent='Strain · FullProf grid';
    $('rietveld-stats').textContent=rietveldLine(state.result.rietveld)||'Rietveld statistics not available';$('rietveld-stats').hidden=false;
    audit.checks.push('Read '+str.rows.length+' STR samples; surface extracted directly from '+map.name+'.');
    renderMetrics();report(audit);$('export-html').disabled=$('export-png').disabled=false;document.querySelectorAll('[data-view]').forEach(b=>{b.disabled=false;b.classList.toggle('active',b.dataset.view==='3d');});
  }catch(e){invalidate();report({errors:[e.message]});}finally{setBusy(false);}
}
function strainTable(r){
  const rows=r.siz.rows,min=rows.reduce((a,b)=>b.strain<a.strain?b:a),max=rows.reduce((a,b)=>b.strain>a.strain?b:a);
  const entries=[['Quantity','Directional strain'],['STR source',r.siz.name],['Surface source',r.map.name],['Phase / pattern',r.phase.name+' · '+r.phase.id+' / '+r.pattern.id],['Space group',r.phase.spaceGroup],['STR minimum (original file convention)',fmt(min.strain)],['STR maximum (original file convention)',fmt(max.strain)],['σ at minimum / maximum (original file convention)',fmt(min.sigma)+' / '+fmt(max.sigma)],['Grid dimensions',r.map.dims.join(' × ')],['Isosurface level',fmt(r.map.threshold)],['Physical grid calibration','Not established'],['PCR source',r.pcrName],['OUT source',r.outName||'Not available']];
  return '<h3>Directional strain and FullProf surface</h3><table><tbody>'+entries.map(([a,b])=>'<tr><td>'+esc(a)+'</td><td>'+esc(b)+'</td></tr>').join('')+'</tbody></table><p>Strain is dimensionless, not a crystallite length. STR values and uncertainties above retain the original file convention; no factor such as 10⁻⁴ is assumed. The surface uses centered grid coordinates. Colors show grid radius, not strain magnitude. No cylinder dimensions or SIZ size metrics are calculated in strain mode.</p>';
}
