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
const fs=require('node:fs'),path=require('node:path');
const root=__dirname,read=f=>fs.readFileSync(path.join(root,f),'utf8');
const entries=[]; // Publication bundle intentionally contains no refinement data.
let html=read('index.template.html');
const chunks={LICENSE:read('LICENSE').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),GRID:read('fullprof-grid.js'),STYLE:read('style.css'),PLOTLY:'/*\n'+read('vendor/LICENSE-plotly.txt')+'\n*/\n'+read('vendor/plotly.min.js'),CORE:read('core.js'),APP:read('app.js')+'\n'+read('strain.js'),PRESENTATION:read('presentation.js'),EXAMPLE:JSON.stringify(entries).replace(/</g,'\\u003c')};
for(const [key,value] of Object.entries(chunks))html=html.replace('/*__'+key+'__*/',()=>value);
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
fs.writeFileSync(path.join(root,'dist','Anisotropy Plotter (Crystallite Size and Strain).html'),html);
console.log('Built offline application: '+(Buffer.byteLength(html)/1024/1024).toFixed(2)+' MB');
