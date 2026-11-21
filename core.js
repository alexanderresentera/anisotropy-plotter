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
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Crystallite = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const NUM = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eEdD][+-]?\\d+)?';
  const numbers = s => (s.match(new RegExp(NUM, 'g')) || []).map(x => Number(x.replace(/[dD]/, 'e')));
  const numericLine = s => s.trim().split(/\s+/).map(x => Number(x.replace(/[dD]/, 'e')));
  const near = (a,b,t=1e-5) => Math.abs(a-b) <= t;
  const rad = d => d*Math.PI/180;
  const mean = a => a.reduce((s,v)=>s+v,0)/a.length;
  const clean = s => s.replace(/^!\s*/, '').trim();
  const units = {A:{label:'Å',factor:1},nm:{label:'nm',factor:0.1},um:{label:'µm',factor:0.0001}};
  const palettes = {
    Viridis:['#440154','#482878','#3e4989','#31688e','#26828e','#1f9e89','#35b779','#6ece58','#b5de2b','#fde725'],
    Cividis:['#00224e','#123570','#3b496c','#575d6d','#707173','#8a8678','#a59c74','#c3b369','#e1cc55','#fee838'],
    Plasma:['#0d0887','#46039f','#7201a8','#9c179e','#bd3786','#d8576b','#ed7953','#fb9f3a','#fdca26','#f0f921']
  };
  for(const key of Object.keys(palettes))palettes[key]=palettes[key].map((color,i)=>[i/9,color]);
  const models = {
    0:{name:'Isotropic size',kind:'continuous',rule:'Anisotropic size terms are disabled. A valid finite directional .siz is still required.'},
    1:{name:'Platelet limit',kind:'continuous',rule:'Uses a platelet normal (Sz1, Sz2, Sz3). Infinite or resolution-limited directions cannot form a finite closed surface.'},
    '-1':{name:'Needle limit',kind:'continuous',rule:'Uses a needle direction (Sz1, Sz2, Sz3). Infinite or resolution-limited directions cannot form a finite closed surface.'},
    14:{name:'Legacy selective broadening',kind:'ambiguous',rule:'The manual illustrates an anti-phase-domain case as −14 but does not give a consistent +14 definition. Verify against the installed FullProf version; no continuous shape is inferred.'},
    '-14':{name:'Legacy anti-phase-domain example',kind:'ambiguous',rule:'The manual figure labels this example −14, outside its documented user-rule interval −2…−9. Its meaning is version-dependent; no continuous shape is inferred.'},
    15:{name:'Monoclinic harmonics',laue:'2/m',kind:'harmonic',coeff:['Y00','Y22+','Y22-','Y20','Y44+','Y44-','Y42+','Y42-','Y40'],rule:'Use the monoclinic setting required by FullProf; axis conventions must match the refinement.'},
    16:{name:'Trigonal harmonics',laue:'−3m (hexagonal axes)',kind:'harmonic',coeff:['Y00','Y20','Y40','Y43-','Y60','Y63-','Y66+'],rule:'Hexagonal setting of the trigonal −3m Laue class.'},
    17:{name:'Cubic harmonics',laue:'m−3 / m−3m',kind:'harmonic',coeff:['K00','K41','K61','K62','K81'],rule:'For m−3m, K62 must be zero and fixed.'},
    18:{name:'Orthorhombic harmonics',laue:'mmm',kind:'harmonic',coeff:['Y00','Y20','Y22+','Y40','Y42+','Y44+'],rule:'Orthorhombic mmm symmetry.'},
    19:{name:'Hexagonal harmonics',laue:'6/m / 6/mmm',kind:'harmonic',coeff:['Y00','Y20','Y40','Y60','Y66+','Y66-'],rule:'For 6/mmm, Y66− must be zero and fixed.'},
    20:{name:'Trigonal harmonics',laue:'−3 (hexagonal axes)',kind:'harmonic',coeff:['Y00','Y20','Y40','Y43-','Y43+'],rule:'Hexagonal setting of the trigonal −3 Laue class.'},
    21:{name:'Tetragonal harmonics',laue:'4/m / 4/mmm',kind:'harmonic',coeff:['Y00','Y20','Y40','Y44+','Y44-','Y60','Y64+','Y64-'],rule:'For 4/mmm, negative sine terms Y44− and Y64− must be zero and fixed. The manual abbreviates the second constraint as “Y64=0”.'},
    22:{name:'Triclinic harmonics',laue:'−1',kind:'harmonic',coeff:['Y00','Y20','Y21+','Y21-','Y22+','Y22-'],rule:'General second-order spherical harmonics; respect the Cartesian frame written in .siz.'}
  };
  ['00l','0k0','h00','hk0','h0l','0kl','satellites only','h and k odd','h0l with h+l even','all except hhl','h odd','h even, k odd'].forEach((s,i)=> {
    models[i+2]={name:'Selective broadening: '+s,kind:'selective',rule:'Applies to selected reflections ('+s+'), not a continuous directional size field. Inspect reflection sizes in .mic; no closed 3D shape is inferred.'};
  });
  for(let i=2;i<=9;i++) models[-i]={name:i+' user-defined reflection rules',kind:'selective',rule:'Rules select reflections by n₁h+n₂k+n₃l=n₄n+n₅. For a single rule use −2 with an unused zero rule. No continuous 3D shape is inferred.'};

  function parseSiz(text,name='data.siz') {
    if(!/size\/correlation length.*(?:Angstrom|Å)/i.test(text)) throw Error('The .siz header must declare size/correlation length in Angstroms. Binary .siz/.bin files are not supported.');
    const lines=text.split(/\r?\n/), start=lines.findIndex(l=>/^\s*Theta\s+Phi\s+Size\s+Sigma/i.test(l));
    if(start<0) throw Error('Missing Theta / Phi / Size / Sigma columns in .siz.');
    const rows=[], params=[];
    let cell=null,matrix=null;
    for(let i=0;i<start;i++) {
      if(/Unit cell parameters/i.test(lines[i])) cell=numbers(lines[i+1]).slice(0,6);
      if(/Matrix converting Cartesian to Reciprocal/i.test(lines[i])) matrix=lines.slice(i+1,i+4).map(l=>numbers(l));
      const p=lines[i].match(new RegExp('P\\(\\s*(\\d+)\\)\\s*:\\s*('+NUM+')\\s*\\+/-\\s*('+NUM+')\\s*(.*)'));
      if(p) params.push({index:+p[1],value:numbers(p[2])[0],sigma:numbers(p[3])[0],label:p[4].trim()});
    }
    for(let i=start+1;i<lines.length;i++) {
      const l=lines[i].trim(); if(!l || /^[-!=#]/.test(l) && !/^-\d/.test(l)) continue;
      const v=numericLine(l);
      if(v.length<4 || v.some(x=>!Number.isFinite(x))) throw Error('Invalid numeric .siz row at line '+(i+1)+'.');
      const [theta,phi,D,sigma]=v;
      if(theta<0 || theta>180 || phi<0 || phi>360 || D<=0 || sigma<0) throw Error('Invalid angle, non-positive size or negative uncertainty in .siz at line '+(i+1)+'.');
      if(near(D,99999,0.0001)) throw Error('The .siz contains the 99999 no-broadening sentinel. A finite closed surface cannot be generated.');
      if(v.length>=10) {
        const u=[Math.sin(rad(theta))*Math.cos(rad(phi)),Math.sin(rad(theta))*Math.sin(rad(phi)),Math.cos(rad(theta))];
        if(u.some((x,j)=>Math.abs(x-v[7+j])>0.00015)) throw Error('The .siz Cartesian direction columns disagree with Theta/Phi at line '+(i+1)+'.');
      }
      rows.push({theta,phi,D,sigma});
    }
    if(rows.length<12) throw Error('Not enough directional samples in .siz.');
    if(!cell || cell.length!==6 || !matrix || matrix.some(r=>r.length!==3 || r.some(x=>!Number.isFinite(x)))) throw Error('The .siz must include its unit cell and Cartesian-to-reciprocal matrix.');
    if(cell.slice(0,3).some(x=>x<=0)||cell.slice(3).some(x=>x<=0||x>=180))throw Error('Invalid .siz unit-cell parameters.');
    const phaseLabel=params.map(p=>p.label).join(' ').match(/_ph(\d+)_pat(\d+)/i);
    const filePhase=name.match(/_size_(\d+)\.siz$/i);
    return {name,rows,cell,matrix,params,phase:phaseLabel?+phaseLabel[1]:filePhase?+filePhase[1]:null,pattern:phaseLabel?+phaseLabel[2]:null};
  }

  function parsePcr(text,name='data.pcr') {
    const lines=text.split(/\r?\n/), phases=[];
    let phase=null,pattern=1, globalProfile=null;
    const next=i=>{ for(let j=i+1;j<lines.length;j++) if(lines[j].trim()&&!lines[j].trim().startsWith('!')) return {values:numericLine(lines[j].split('!')[0].trim()),index:j}; return {values:[],index:i}; };
    for(let i=0;i<lines.length;i++) {
      const l=lines[i], t=clean(l), tokens=t.split(/\s+/);
      if(/^Job\s+Npr\s+Nph/i.test(t)) globalProfile=next(i).values[1];
      const pm=l.match(/Data for PHASE number\s*:\s*(\d+)/i);
      if(pm) {phase={id:+pm[1],name:'Phase '+pm[1],patterns:[],spaceGroup:'Unknown',more:null,jvi:null,str:0};phases.push(phase); let j=i+1;while(j<lines.length&&(!lines[j].trim()||lines[j].trim().startsWith('!'))) j++;if(j<lines.length) phase.name=lines[j].trim();}
      if(/^Nat\s+Dis\s+/i.test(t)) {
        if(!phase) {phase={id:phases.length+1,name:lines.slice(0,i).filter(x=>x.trim()&&!x.trim().startsWith('!')).at(-1)?.trim()||'Phase 1',patterns:[],spaceGroup:'Unknown',more:null,jvi:null,str:0};phases.push(phase);}
        const v=next(i).values;
        for(const [key,label] of [['more','More'],['str','Str'],['npr','Npr']]) {const j=tokens.findIndex(s=>s.toLowerCase()===label.toLowerCase());if(j>=0)phase[key]=v[j];}
      }
      if(!phase) continue;
      if(/^Jvi\s+/i.test(t)) phase.jvi=next(i).values[0];
      if(/<--\s*Space group/i.test(l)) phase.spaceGroup=l.split('<--')[0].trim();
      const pat=l.match(/Profile Parameters for Pattern\s*#\s*(\d+)/i); if(pat) pattern=+pat[1];
      if(/Size-Model\b/i.test(t)&&l.trim().startsWith('!')&&(/GauSiz|Sig-?2|LorSiz|Size-Model/.test(t))) {
        const v=next(i).values, idx=tokens.findIndex(x=>/^Size-Model$/i.test(x));
        if(idx<0 || !Number.isInteger(v[idx])) throw Error('Cannot read Size-Model in PCR phase '+phase.id+'.');
        const entry={id:pattern,model:v[idx],coeff:[],codes:[],cell:null,npr:phase.npr??globalProfile,rawHeader:l,rawValues:lines[next(i).index]};
        phase.patterns.push(entry);
        for(let j=next(i).index+1;j<lines.length;j++) {
          if(/Data for PHASE number|Profile Parameters for Pattern/i.test(lines[j]))break;
          if(/^!\s*a\s+b\s+c\s+alpha/i.test(lines[j])) entry.cell=next(j).values.slice(0,6);
          if(/^!\s*(?:Y00|K00)\b/i.test(lines[j])) {
            const expected=models[entry.model]?.coeff?.length||0;
            let k=j;
            while(entry.coeff.length<expected&&k<lines.length) {
              const val=next(k); if(val.values.some(x=>!Number.isFinite(x)))break;
              entry.coeff.push(...val.values);const code=next(val.index);entry.codes.push(...code.values);k=code.index+1;
              while(k<lines.length && !lines[k].trim())k++;
              if(!/^!\s*[YK]\d/.test(lines[k]||''))break;
            }
          }
        }
      }
    }
    if(!phases.length||!phases.some(p=>p.patterns.length)) throw Error('No labelled phase/profile blocks found in PCR. Save a commented PCR with EdPCR/FullProf and try again.');
    return {name,phases};
  }

  function parseMic(text,name='data.mic') {
    if(!/MICRO-STRUCTURAL ANALYSIS FROM FULLPROF/i.test(text)) throw Error(name+': not a FullProf .mic file.');
    const match=text.match(/Pattern No\s*:\s*(\d+)\s+Phase No\.?\s*:\s*(\d+)\s*(.*)/i);
    const code=text.match(/Code of PCR-file\s*:\s*(.*)/i)?.[1].trim();
    const rows=[];let active=false;
    for(const l of text.split(/\r?\n/)) {
      if(/s=1\/d.*App-size.*Max-strain/i.test(l)){active=true;continue;}
      if(!active || !/^\s*[+\-]?\d/.test(l))continue;
      const v=numericLine(l.trim()); if(v.length>=15&&v.every(Number.isFinite)) rows.push({D:v[9],strain:v[10],h:v[11],k:v[12],l:v[13],position:v[14]});
    }
    const dataLines=text.split(/\r?\n/).filter(l=>!l.trim().startsWith('!')).join('\n');
    const summary=kind=>{const re=new RegExp('Average apparent '+kind+'\\s+and standard deviation[^:\\n]*:\\s*('+NUM+')\\s*\\(\\s*('+NUM+')','i'),m=text.match(re);return m?{mean:numbers(m[1])[0],sd:numbers(m[2])[0]}:null;};
    const strainUnavailable=/Average apparent strain cannot be calculated/i.test(text);
    return {name,sizeSummary:summary('size'),strainSummary:strainUnavailable?null:summary('strain'),strainUnavailable,phase:match?+match[2]:null,pattern:match?+match[1]:null,code,rows,resolutionLimited:/<-\s*Resolution limited/i.test(dataLines),negativeBroadening:/<-.*negative/i.test(dataLines)};
  }

  function parseOut(text,name='data.out') {
    if(!/PROGRAM FullProf/i.test(text)) throw Error(name+': not a FullProf output file.');
    const params=new Map();
    const re=new RegExp('Parameter number\\s+\\d+\\s*:\\s*(\\S+)\\s+('+NUM+')\\s*\\(\\s*\\+/-\\s*('+NUM+')','g');
    for(const m of text.matchAll(re)) params.set(m[1].toLowerCase(),{value:numbers(m[2])[0],sigma:numbers(m[3])[0]});
    const rietveld={};let statsPattern=null;
    const statsRe=new RegExp('Conventional Rietveld Rp,\\s*Rwp,\\s*Re(?:xp)? and Chi2:\\s*('+NUM+')\\s+('+NUM+')\\s+('+NUM+')\\s+('+NUM+')','i');
    for(const line of text.split(/\r?\n/)){
      if(/RELIABILITY FACTORS/i.test(line)){
        const header=line.match(/ALL NON-EXCLUDED POINTS FOR PATTERN:\s*(\d+)/i);
        statsPattern=header?+header[1]:null;
        if(statsPattern!==null)rietveld[statsPattern]=null;
      }
      const match=statsPattern!==null&&line.match(statsRe);
      if(match){const values=match.slice(1).map(v=>numbers(v)[0]);if(values.every(v=>Number.isFinite(v)&&v>=0))rietveld[statsPattern]={rp:values[0],rwp:values[1],rexp:values[2],chi2:values[3],display:match.slice(1),pattern:statsPattern,source:'Conventional Rietveld; all non-excluded points (Ynet, true sigma)'};}
    }
    return {name,code:text.match(/PCR file code\s*:\s*(.*)/i)?.[1].trim(),rietveld,version:text.match(/PROGRAM FullProf\.2k\s*\(([^)]+)\)/i)?.[1],params};
  }

  function paperMetrics(mic,cell){
    const valid=mic?.rows.filter(r=>r.D>0&&r.D<99999)||[],hk0=valid.filter(r=>r.l===0&&(r.h!==0||r.k!==0)),axis=valid.filter(r=>r.h===0&&r.k===0&&r.l!==0);
    const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
    const compatible=cell&&Math.abs(cell[3]-90)<.03&&Math.abs(cell[4]-90)<.03;
    const diameter=compatible&&hk0.length?3*Math.PI/8*avg(hk0.map(r=>r.D)):null,thickness=compatible?avg(axis.map(r=>r.D)):null;
    const eps=mic?.rows.find(r=>r.h===0&&r.k===0&&Math.abs(r.l)===1)?.strain;
    return {diameter,thickness,volume:diameter!==null&&thickness!==null?Math.PI*diameter**2*thickness/4:null,hk0Count:hk0.length,axisCount:axis.length,compatible:!!compatible,sizeMean:mic?.sizeSummary?.mean??null,sizeSD:mic?.sizeSummary?.sd??null,strainMean:mic?.strainSummary?.mean??null,strainSD:mic?.strainSummary?.sd??null,strain001:mic?.strainSummary&&!mic.strainUnavailable?eps??null:null};
  }
  function modelFor(phase,pattern) {
    if([-1,2,3].includes(phase.str)) return {name:'Generalized quadratic size',kind:'continuous',rule:'Selected by Str = '+phase.str+'. Requires six quadratic-form size parameters; a positive finite directional .siz is required.'};
    return models[pattern.model]||{name:'Undocumented model '+pattern.model,kind:'ambiguous',rule:'Not defined in the reference manual. Verify the model against your installed FullProf version.'};
  }
  function validate(siz,phase,pattern,out,mics=[],pcrName='') {
    const errors=[],warnings=[],checks=[],notes=[],info=modelFor(phase,pattern);
    if(siz.phase!==null && siz.phase!==phase.id) errors.push('The .siz phase number does not match the selected PCR phase.');
    if(siz.pattern!==null && siz.pattern!==pattern.id) errors.push('The .siz pattern number does not match the selected PCR pattern.');
    if(siz.phase===null)warnings.push('No phase identifier was found in .siz; verify the selected phase.');
    if(pattern.cell) {
      if(pattern.cell.some((v,i)=>Math.abs(v-siz.cell[i])>Math.max(0.0002,Math.abs(v)*2e-5)))errors.push('PCR and .siz unit cells differ. Use files from the same final refinement.');
      else checks.push('PCR and .siz unit cells agree.');
    } else errors.push('Missing labelled PCR cell parameters.');
    if(info.kind==='selective'||info.kind==='ambiguous') errors.push('Size-Model '+pattern.model+': '+info.rule);
    if(info.kind==='harmonic') {
      if(pattern.coeff.length!==info.coeff.length)errors.push('Expected '+info.coeff.length+' harmonic coefficients for Size-Model '+pattern.model+'; found '+pattern.coeff.length+'.');
      else {
        const source=siz.params.filter(p=>p.index<=info.coeff.length);
        if(source.length!==info.coeff.length) warnings.push('The .siz parameter header does not expose all harmonic coefficients.');
        else if(source.some((p,i)=>Math.abs(p.value-pattern.coeff[i])>Math.max(0.000003,Math.abs(p.value)*0.0000002)))errors.push('PCR and .siz harmonic coefficients differ. These files may be from different refinement cycles.');
        else checks.push('All harmonic coefficients agree between PCR and .siz.');
      }
      const sg=phase.spaceGroup.replace(/\s|_/g,'').toLowerCase();
      const zero=[];
      if(pattern.model===17 && /[mndac]-?3[mndac]/.test(sg)) zero.push('K62');
      if(pattern.model===19 && /6[1-5]?\/[mndac].*[mndac]/.test(sg)) zero.push('Y66-');
      if(pattern.model===21 && /4[123]?\/[mndac].*[mndac]/.test(sg)) zero.push('Y44-','Y64-');
      for(const label of zero) {const i=info.coeff.indexOf(label);if(Math.abs(pattern.coeff[i]||0)>1e-8 || Math.abs(pattern.codes[i]||0)>1e-8)errors.push(label+' must be zero and fixed for this higher-symmetry Laue class.');}
      // Necessary metric constraints are checked; no guess at full space-group operations.
      const [a,b,c,al,be,ga]=siz.cell;
      const angle=(x,y)=>near(x,y,0.03),len=(x,y)=>Math.abs(x-y)/Math.max(x,y)<0.0005;
      if([16,19,20].includes(pattern.model)&&!(len(a,b)&&angle(al,90)&&angle(be,90)&&angle(ga,120))) errors.push('This harmonic model requires a hexagonal-axis metric (a=b, α=β=90°, γ=120°).');
      if(pattern.model===17&&!(len(a,b)&&len(b,c)&&[al,be,ga].every(v=>angle(v,90))))errors.push('Cubic harmonics require a cubic cell metric.');
      if(pattern.model===18&&![al,be,ga].every(v=>angle(v,90)))errors.push('Orthorhombic harmonics require orthogonal cell angles.');
      if(pattern.model===21&&!(len(a,b)&&[al,be,ga].every(v=>angle(v,90))))errors.push('Tetragonal harmonics require a=b and orthogonal cell angles.');
      notes.push('Model '+pattern.model+' uses Laue class '+info.laue+'. This is model information, not a detected error. Cell metrics and the listed constraints are checked; full space-group symmetry is not automatically certified.');
    }
    if(phase.more!==1 || phase.jvi!==5) warnings.push('PCR does not currently show More=1 and Jvi=5. The supplied .siz can still be read, but check output settings before regenerating it.');
    const stem=s=>s?.replace(/\.pcr$/i,'').toLowerCase();
    if(out) {
      if(out.code && pcrName && stem(out.code)!==stem(pcrName))warnings.push('The .out PCR identifier differs from the loaded PCR filename. Files may have been renamed; verify their origin.');
      let count=0;
      for(const p of siz.params) {if(!p.label)continue;const o=out.params.get(p.label.toLowerCase());if(o){count++;if(Math.abs(o.value-p.value)>Math.max(0.000004,Math.abs(p.value)*0.0000003))errors.push('Final .out value differs from .siz for '+p.label+'.');}}
      if(count)checks.push(count+' final .out size parameters checked.');else warnings.push('No matching final size-parameter records found in .out.');
    }
    const chosen=mics.filter(m=>m.phase===phase.id&&m.pattern===pattern.id);
    if(mics.length&&!chosen.length)warnings.push('No loaded .mic matches the selected phase and pattern.');
    for(const mic of chosen) {
      if(mic.code&&pcrName&&stem(mic.code)!==stem(pcrName))warnings.push('The .mic PCR identifier differs from the loaded PCR filename. Files may have been renamed; verify their origin.');
      if(mic.resolutionLimited)warnings.push('The .mic reports resolution-limited reflections.');
      if(mic.negativeBroadening)warnings.push('The .mic reports negative broadening.');
      checks.push(mic.rows.length+' reflection records read from '+mic.name+'.');
      // Compare only directions represented exactly by the SIZ angular sampling.
      // Approximate nearest-neighbour comparisons would create false mismatches.
      const A=siz.matrix,det=A[0][0]*(A[1][1]*A[2][2]-A[1][2]*A[2][1])-A[0][1]*(A[1][0]*A[2][2]-A[1][2]*A[2][0])+A[0][2]*(A[1][0]*A[2][1]-A[1][1]*A[2][0]);
      let compared=0,mismatch=0;
      if(Math.abs(det)>1e-12) {
        const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
        const columns=[cross(A[1],A[2]),cross(A[2],A[0]),cross(A[0],A[1])];
        const lookup=new Map(siz.rows.map(r=>[r.theta.toFixed(2)+':'+(r.phi%360).toFixed(2),r]));
        for(const r of mic.rows) {
          if(r.D<=0||r.D>=99999)continue;
          let v=[0,1,2].map(i=>(r.h*columns[0][i]+r.k*columns[1][i]+r.l*columns[2][i])/det),norm=Math.hypot(...v);if(!norm)continue;
          v=v.map(x=>x/norm);if(v[2]<-1e-8)v=v.map(x=>-x);
          const t=Math.acos(Math.min(1,Math.max(-1,v[2])))*180/Math.PI,p=(Math.atan2(v[1],v[0])*180/Math.PI+360)%360;
          const sample=lookup.get(t.toFixed(2)+':'+p.toFixed(2));
          if(sample){compared++;if(Math.abs(sample.D-r.D)>Math.max(.035,Math.abs(r.D)*.001)){mismatch++;errors.push('The .mic apparent size for ('+r.h+' '+r.k+' '+r.l+') differs from .siz at the same direction.');}}
        }
      }
      if(compared)checks.push((compared-mismatch)+' of '+compared+' comparable .mic reflection sizes agree with sampled .siz directions (within output rounding).');
    }
    return {errors:[...new Set(errors)],warnings:[...new Set(warnings)],checks,notes,info,mics:chosen};
  }

  function buildGrid(siz) {
    const theta=[...new Set(siz.rows.map(r=>r.theta))].sort((a,b)=>a-b);
    const phi=[...new Set(siz.rows.map(r=>near(r.phi,360)?0:r.phi))].sort((a,b)=>a-b);
    if(!near(theta[0],0)||(!near(theta.at(-1),90)&&!near(theta.at(-1),180)))throw Error('The .siz must span θ=0…90° or θ=0…180°. Partial angular sectors cannot be closed safely.');
    if(phi.length<4||!near(phi[0],0))throw Error('The .siz must cover a complete azimuth beginning at φ=0°.');
    const dp=phi[1]-phi[0];
    if(phi.some((p,i)=>!near(p,i*dp,0.015))||!near(phi.at(-1)+dp,360,0.015))throw Error('Expected a complete uniform φ grid around 360°. No unmeasured angular gaps are interpolated.');
    const by=new Map(), key=(t,p)=>t.toFixed(5)+':'+p.toFixed(5);
    for(const r of siz.rows) {
      const p=near(r.phi,360)?0:r.phi,k=key(r.theta,p),prev=by.get(k);
      if(prev&&Math.abs(prev.D-r.D)>Math.max(0.0003,r.D*0.00002))throw Error('Conflicting duplicate .siz samples, including the 0°/360° seam.');
      if(!prev)by.set(k,r);
    }
    const grid=theta.map(t=>phi.map(p=>{const r=by.get(key(t,p));if(!r)throw Error('Missing .siz sample at θ='+t+'°, φ='+p+'°.');return r;}));
    for(const row of grid.filter(r=>near(r[0].theta,0)||near(r[0].theta,180)))if(row.some(r=>Math.abs(r.D-row[0].D)>Math.max(0.0003,row[0].D*0.00002)))throw Error('Different size values are given for the same pole direction.');
    const hemi=near(theta.at(-1),90);
    // Equator and full-sphere antipodes must describe the same undirected length.
    for(const row of grid) {
      if(hemi&&!near(row[0].theta,90))continue;
      for(const r of row) {const op=by.get(key(180-r.theta,(r.phi+180)%360));if(!op)throw Error('The angular grid does not contain corresponding antipodes.');if(Math.abs(op.D-r.D)>Math.max(0.0005,r.D*0.0002))throw Error('Opposite directions have inconsistent apparent sizes; a centrosymmetric surface cannot be assumed.');}
    }
    return {grid,theta,phi,hemi,count:by.size};
  }
  function getMetrics(siz,g) {
    const equator=g.grid.find(r=>near(r[0].theta,90));
    let min=Infinity,max=-Infinity;for(const row of g.grid)for(const r of row){min=Math.min(min,r.D);max=Math.max(max,r.D);}
    let spans=[0,0,0];
    for(const row of g.grid)for(const r of row){const u=[Math.sin(rad(r.theta))*Math.cos(rad(r.phi)),Math.sin(rad(r.theta))*Math.sin(rad(r.phi)),Math.cos(rad(r.theta))];spans=spans.map((s,i)=>Math.max(s,Math.abs(r.D*u[i])));}
    const c=siz.matrix[2],cAligned=Math.hypot(c[0],c[1])<1e-5*Math.abs(c[2]);
    const eq=equator?.map(r=>r.D), axial=g.grid[0][0].D;
    return {axial,axialSigma:g.grid[0][0].sigma,eqMean:eq?mean(eq):null,eqMin:eq?Math.min(...eq):null,eqMax:eq?Math.max(...eq):null,ratio:eq?mean(eq)/axial:null,basalRatio:eq?Math.max(...eq)/Math.min(...eq):null,modulation:eq?(Math.max(...eq)-Math.min(...eq))/mean(eq)*100:null,min,max,globalRatio:max/min,spans,cAligned};
  }
  function chooseUnit(maxA,choice='auto') {return choice==='auto'?(maxA<10?'A':maxA<10000?'nm':'um'):choice;}
  function surfaceData(g,unitKey='nm') {
    const {factor,label}=units[unitKey];
    const make=sign=>{
      const x=[],y=[],z=[],color=[],custom=[],hovertext=[];
      for(const source of g.grid) {
        const row=[...source,{...source[0],phi:360}];
        x.push(row.map(r=>sign*r.D*factor/2*Math.sin(rad(r.theta))*Math.cos(rad(r.phi))));
        y.push(row.map(r=>sign*r.D*factor/2*Math.sin(rad(r.theta))*Math.sin(rad(r.phi))));
        z.push(row.map(r=>sign*r.D*factor/2*Math.cos(rad(r.theta))));
        // Surface picking reads hovertext[row][column] directly. Template array lookups
        // in the bundled renderer swap these indices on rectangular surface grids.
        hovertext.push(row.map(r=>'θ '+(sign===1?r.theta:180-r.theta).toFixed(1)+'°, φ '+(sign===1?r.phi:(r.phi+180)%360).toFixed(1)+'°<br>Dₕ '+Number((r.D*factor).toPrecision(5))+' '+label+'<br>σ(Dₕ) '+Number((r.sigma*factor).toPrecision(3))+' '+label));
        color.push(row.map(r=>r.D*factor));custom.push(row.map(r=>[sign===1?r.theta:180-r.theta,sign===1?r.phi:(r.phi+180)%360,r.sigma*factor]));
      }
      return {type:'surface',x,y,z,surfacecolor:color,customdata:custom,colorscale:'Viridis',showscale:sign===1,colorbar:{title:{text:'Dₕ ('+label+')'},thickness:14,len:0.72,x:1.01,tickfont:{size:12},outlinewidth:0},lighting:{ambient:0.75,diffuse:0.75,roughness:0.7,specular:0.1},hovertext,hoverinfo:'text',name:'Directional size'};
    };
    return g.hemi?[make(1),make(-1)]:[make(1)];
  }
  return {models,units,palettes,parseSiz,parsePcr,parseOut,parseMic,validate,modelFor,paperMetrics,buildGrid,getMetrics,chooseUnit,surfaceData};
});
