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
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const G=require('../fullprof-grid.js'),V=require('../presentation.js'),C=require('../core.js');
function fixture(bin=false,header=256){
 const n=9,count=n**3,offset=bin?header+64:152,b=new ArrayBuffer(offset+4*count),v=new DataView(b),i=(o,x)=>v.setInt32(o,x,true),f=(o,x)=>v.setFloat32(o,x,true);
 if(bin){[0,1,2].forEach(k=>i(header+4*k,n));f(header+16,20);for(let k=0;k<3;k++){f(header+24+8*k,1);f(header+44+4*k,1/(n-1));}}
 else {i(0,3);i(104,1);i(108,3);[112,116,120].forEach(o=>i(o,n));i(124,count);[5,5,5,90,90,90].forEach((x,k)=>f(128+4*k,x));}
 for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++)f(offset+4*(bin?z+n*(y+n*x):x+n*(y+n*z)),((x-4)**2+(y-4)**2+(z-4)**2<9)?20:0);
 return b;
}
test('variable BIN headers preserve the same voxel field as GGRID',()=>{
 const g=G.parse(fixture(),'synthetic.ggrid');for(const h of [256,4805,7057])assert.deepEqual(G.parse(fixture(true,h),'synthetic.bin').values,g.values);
});
test('grid extraction is finite and watertight, with dimensionless axes',()=>{
 const s=G.surface(G.parse(fixture(),'synthetic.ggrid')),t=s.trace,edges=new Map();assert.ok(t.i.length>0);assert.ok(t.x.every(Number.isFinite));
 for(let q=0;q<t.i.length;q++){const a=[t.i[q],t.j[q],t.k[q]];for(let k=0;k<3;k++){const key=[a[k],a[(k+1)%3]].sort((a,b)=>a-b).join(':');edges.set(key,(edges.get(key)||0)+1);}}
 assert.ok([...edges.values()].every(n=>n===2));
 const fig=V.figure([t],s.spans,{view:'3d',unit:'nm',palette:'Viridis'},C.palettes);assert.equal(fig.layout.scene.xaxis.title.text,'x (grid)');assert.deepEqual(fig.data[0].x,t.x);
});
test('invalid or truncated grid files fail explicitly',()=>{assert.throws(()=>G.parse(new ArrayBuffer(10),'bad.bin'));const b=fixture();assert.throws(()=>G.parse(b.slice(0,-4),'bad.ggrid'));});
test('standalone build has no embedded personal refinement or external scripts',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../dist/Anisotropy Plotter (Crystallite Size and Strain).html'),'utf8');
 assert.match(html,/<script id="example-data" type="application\/json">\[\]<\/script>/);assert.doesNotMatch(html,/<script[^>]+src=/i);assert.doesNotMatch(html,/C:[\\/]+Users[\\/]/i);assert.doesNotMatch(html,/nimh-op3-ani|ni\(oh\)2-44a74um/i);
 for(const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g))if(!m[1].includes('application/json'))new vm.Script(m[2]);
});
