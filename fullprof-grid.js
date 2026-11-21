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
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.FullProfGrid=factory();})(globalThis,function(){
  'use strict';
  function parse(bytes,name){
    const v=new DataView(bytes),i=o=>v.getInt32(o,true),f=o=>v.getFloat32(o,true),isG=/\.ggrid$/i.test(name);
    let dims,offset,bounds;
    if(isG){
      if(v.byteLength<152||i(0)!==3||i(96)!==0||i(100)!==0||i(104)!==1||i(108)!==3)throw Error('Unsupported GGRID header: expected a full, scalar, real 3D grid (version 3).');
      dims=[i(112),i(116),i(120)];offset=152;bounds=[[0,1],[0,1],[0,1]];
      if(i(124)!==dims.reduce((a,b)=>a*b,1))throw Error('Asymmetric GGRID storage is not supported.');
      const cell=[0,1,2,3,4,5].map(k=>f(128+4*k));
      if(cell.some(n=>!Number.isFinite(n))||cell.slice(0,3).some(n=>n<=0)||cell.slice(3).some(n=>Math.abs(n-90)>1e-4)||Math.max(...cell.slice(0,3))-Math.min(...cell.slice(0,3))>1e-4)throw Error('This version supports orthogonal cubic plotting grids only.');
    }else{
      // GFourier BIN headers contain variable-length records before the grid.
      // Locate the validated descriptor, rather than assuming one header size.
      const candidates=[];
      for(let h=85;h+64<=Math.min(v.byteLength,1024*1024);h++){
        const d=[i(h),i(h+4),i(h+8)];
        if(d.some(n=>n<3||n>256))continue;
        const count=d.reduce((a,b)=>a*b,1);
        if(count>2000000||h+64+count*4!==v.byteLength)continue;
        const b=[0,1,2].map(k=>[f(h+20+8*k),f(h+24+8*k)]);
        if(b.some(r=>r[0]!==0||r[1]!==1))continue;
        if(d.some((n,k)=>Math.abs(f(h+44+4*k)-1/(n-1))>1e-7))continue;
        if(f(h+12)!==0||!Number.isFinite(f(h+16))||f(h+16)<=0)continue;
        candidates.push({dims:d,offset:h+64,bounds:b});
      }
      if(candidates.length!==1)throw Error('Unsupported or ambiguous FullProf BIN grid descriptor; use the companion GGRID.');
      ({dims,offset,bounds}=candidates[0]);
    }
    const count=dims.reduce((a,b)=>a*b,1);
    if(dims.some(n=>n<3||n>256)||count>2000000||offset+4*count!==v.byteLength)throw Error('Unsupported grid dimensions or binary layout; use a complete FullProf size GGRID.');
    const [nx,ny,nz]=dims,values=new Float32Array(count),levels=new Set();
    for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
      const n=f(offset+4*(isG?x+nx*(y+ny*z):z+nz*(y+ny*x)));
      if(!Number.isFinite(n))throw Error('Grid contains non-finite values.');
      values[x+nx*(y+ny*z)]=n;levels.add(n);
    }
    const sorted=[...levels].sort((a,b)=>a-b);
    if(sorted.length!==2||sorted[0]!==0||sorted[1]<=0)throw Error('Expected a two-level FullProf size mask, not a density map.');
    for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)if((x===0||y===0||z===0||x===nx-1||y===ny-1||z===nz-1)&&values[x+nx*(y+ny*z)]!==0)throw Error('Size surface touches the grid boundary; a closed surface cannot be verified.');
    return {name,dims,values,threshold:sorted[1]/2,levels:sorted};
  }
  function surface(g){
    const [nx,ny,nz]=g.dims,coords=[],faces=[],edges=new Map();
    const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
    const tetra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
    function vertex(a,b){const key=Math.min(a.id,b.id)+':'+Math.max(a.id,b.id);if(edges.has(key))return edges.get(key);const t=(g.threshold-a.v)/(b.v-a.v),p=a.p.map((v,k)=>v+t*(b.p[k]-v)),id=coords.length;coords.push(p);edges.set(key,id);return id;}
    for(let z=0;z<nz-1;z++)for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){
      const c=corners.map(([dx,dy,dz])=>{const id=x+dx+nx*(y+dy+ny*(z+dz));return {id,v:g.values[id],p:[(x+dx)/(nx-1),(y+dy)/(ny-1),(z+dz)/(nz-1)]};});
      if(c.every(p=>p.v<g.threshold)||c.every(p=>p.v>g.threshold))continue;
      for(const ids of tetra){const inside=ids.map(k=>c[k]).filter(p=>p.v>g.threshold),outside=ids.map(k=>c[k]).filter(p=>p.v<g.threshold);if(!inside.length||!outside.length)continue;
        let tris;if(inside.length===1)tris=[[...outside.map(p=>vertex(inside[0],p))]];else if(outside.length===1)tris=[[...inside.map(p=>vertex(outside[0],p))]];else {const a=vertex(inside[0],outside[0]),b=vertex(inside[0],outside[1]),c1=vertex(inside[1],outside[0]),d=vertex(inside[1],outside[1]);tris=[[a,b,c1],[b,d,c1]];}
        const direction=[0,1,2].map(k=>outside.reduce((s,p)=>s+p.p[k],0)/outside.length-inside.reduce((s,p)=>s+p.p[k],0)/inside.length);
        for(const t of tris){const a=coords[t[0]],u=coords[t[1]].map((v,k)=>v-a[k]),v=coords[t[2]].map((v,k)=>v-a[k]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];if(normal.reduce((s,n,k)=>s+n*direction[k],0)<0)t.reverse();faces.push(t);}
      }
    }
    const bounds=[0,1,2].map(k=>coords.reduce((b,p)=>[Math.min(b[0],p[k]),Math.max(b[1],p[k])],[Infinity,-Infinity])),center=bounds.map(b=>(b[0]+b[1])/2),spans=bounds.map(b=>b[1]-b[0]);
    const trace={type:'mesh3d',x:coords.map(p=>p[0]-center[0]),y:coords.map(p=>p[1]-center[1]),z:coords.map(p=>p[2]-center[2]),i:faces.map(t=>t[0]),j:faces.map(t=>t[1]),k:faces.map(t=>t[2]),intensity:coords.map(p=>Math.hypot(...p.map(v=>v-.5))),flatshading:false,showscale:false,hovertemplate:'FullProf size surface<br>x: %{x:.4f}<br>y: %{y:.4f}<br>z: %{z:.4f}<br>Centered grid coordinates (dimensionless)<extra></extra>',meta:{fullprofGrid:true,center,bounds,source:g.name,threshold:g.threshold},lighting:{ambient:.7,diffuse:.8,specular:.15,roughness:.6}};
    return {trace,spans,bounds,center};
  }
  return {parse,surface};
});
