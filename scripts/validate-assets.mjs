import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const expected=['_headers','app.js','engine.js','index.html','styles.css'].sort();
const actual=(await readdir(new URL('dist/',root))).sort();
assert.deepEqual(actual,expected,'Only deliberate public assets belong in dist/');
for(const name of actual){const info=await stat(new URL('dist/'+name,root));assert.ok(info.isFile()&&info.size>0,'Empty/non-file asset: '+name);}
const html=await readFile(new URL('dist/index.html',root),'utf8');
for(const name of ['app.js','styles.css'])assert.ok(html.includes('./'+name),'Missing local asset '+name);
assert.ok(html.includes('EXAMPLE'),'Public defaults must be identified as an example');
const config=JSON.parse(await readFile(new URL('wrangler.jsonc',root),'utf8'));
assert.equal(config.name,'housing');assert.equal(config.pages_build_output_dir,'./dist');
assert.ok(!config.main,'This is a static Pages project');
console.log('Public asset and Pages configuration checks passed.');
