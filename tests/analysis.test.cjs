// Run with: node --test tests/analysis.test.cjs (no dependencies).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function app(){
 const elements={};function element(){return {value:'',textContent:'',children:[],append(...v){this.children.push(...v)},replaceChildren(...v){this.children=v},setAttribute(){},scrollIntoView(){},click(){}}}
 const document={getElementById(id){if(!elements[id]){elements[id]=element();if(id==='statusFilter')elements[id].value='all'}return elements[id]},createElement:element,createElementNS:element};
 const context=vm.createContext({document,structuredClone,Date,console,TextDecoder,Set,Map,Blob,URL,setTimeout,window:{print(){}}});
 const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
 vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1],context);
 return {run:s=>vm.runInContext(s,context),context};
}
const fixture=`function row(point='L',extra={}) { return {'Date&Time':'2026-03-12 08:00:00',WorkCenter_Code:'RLP_Check',Part_No:'A',Barcode_No:'glass',MeasurementPosition:'G_'+point,'470nm':'15.5','530nm':'20','630nm':'20',LeftDis:'5',RightDis:'5',DepthResult:'OK',...extra}; } function file(rows){return {name:'sample.csv',rows:normalize(rows),dates:new Set(['2026-03-12'])};} function result(rows){return aggregate([file(rows)]).events[0]}`;
function prepared(){const a=app();a.run(fixture);return a}
test('complete three points pass; inclusive boundaries',()=>{const a=prepared();assert.equal(a.run(`result(['L','M','R'].map(p=>row(p,{'470nm':'13.5','530nm':'22','630nm':'18',LeftDis:'3',RightDis:'7'}))).status`),'PASS')});
test('RLP failures and depth numeric failures fail whole event',()=>{const a=prepared();for(const patch of [`{'470nm':'17.501'}`,`{RightDis:'7.01'}`])assert.equal(a.run(`result(['L','M','R'].map(p=>row(p,${patch}))).status`),'FAIL')});
test('original NG survives editable numeric tolerance',()=>{assert.equal(prepared().run(`result(['L','M','R'].map(p=>row(p,{DepthResult:'NG'}))).status`),'FAIL')});
test('missing points or measurements or original verdict stay pending',()=>{const a=prepared();assert.equal(a.run(`result([row('L'),row('M')]).status`),'PENDING');for(const patch of [`{'630nm':''}`,`{LeftDis:''}`,`{DepthResult:''}`,`{DepthResult:'UNKNOWN'}`])assert.equal(a.run(`result(['L','M','R'].map(p=>row(p,${patch}))).status`),'PENDING')});
test('exact duplicates merge with provenance; retests retained',()=>{const a=prepared();assert.equal(a.run(`aggregate([file(['L','M','R'].map(p=>row(p))),{...file(['L','M','R'].map(p=>row(p))),name:'other.csv'}]).unique`),3);assert.equal(a.run(`aggregate([file(['L','M','R'].flatMap(p=>[row(p),row(p,{'Date&Time':'2026-03-12 08:00:01'})]))]).events.length`),2);assert.equal(a.run(`aggregate([file(['L','M','R'].map(p=>row(p))),{...file(['L','M','R'].map(p=>row(p))),name:'other.csv'}]).events[0].sources.size`),2)});
test('conflicting positions and depth values cannot pass',()=>{const a=prepared();assert.equal(a.run(`result([...['L','M','R'].map(p=>row(p)),row('L',{'470nm':'15.6'})]).status`),'PENDING');assert.equal(a.run(`result(['L','M','R'].map(p=>row(p,{LeftDis:p==='L'?'4':'5'}))).status`),'PENDING')});
test('multiple days split inside a file; chronological sorting',()=>{const a=prepared();assert.equal(a.run(`aggregate([{name:'multi.csv',rows:normalize([row('L',{'Date&Time':'2026-03-13 08:00:00'}),row('L')]),dates:new Set(['2026-03-12'])}]).events.length`),1);assert.equal(a.run(`aggregate([file([row('L',{'Date&Time':'2026-03-12 09:00:00'}),row('L')])]).events[0].time`),'2026-03-12 08:00:00')});
test('CSV BOM, CRLF, quoted commas, quotes and line breaks',()=>{const a=app();const csv='\uFEFFDate&Time,WorkCenter_Code,Part_No,Barcode_No,MeasurementPosition,470nm,530nm,630nm\r\n2026-03-12 08:00:00,RLP,A,"glass,""one""\nline",G_L,15,20,20\r\n';a.context.sample=csv;assert.equal(a.run(`parseCSV(sample)[0].Barcode_No`),'glass,"one"\nline');assert.throws(()=>a.run(`parseCSV('x,x\\na,b')`));assert.throws(()=>a.run(`parseCSV('"unterminated')`))});
test('invalid timestamps/numbers rejected; source text stays inert',()=>{const a=prepared();assert.equal(a.run(`Number.isNaN(timestamp('2026-02-30 08:00:00'))`),true);assert.throws(()=>a.run(`normalize([row('L',{'470nm':'bad'})])`));assert.equal(a.run(`normalize([row('L',{Barcode_No:'<script>alert(1)</script>'})])[0].Barcode_No`),'<script>alert(1)</script>')});
test('CSV export escapes spreadsheet formulas',()=>{assert.equal(app().run(`csvEscape('=1+1')`),'"\'=1+1"')});
