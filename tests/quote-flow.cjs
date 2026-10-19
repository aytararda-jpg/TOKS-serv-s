const fs=require('fs'), vm=require('vm'), assert=require('assert'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const firebaseRules=JSON.parse(fs.readFileSync(path.join(__dirname,'..','firebase-rules.json'),'utf8')).rules;
const script=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
const elements=Object.fromEntries(ids.map(id=>[id,{id,value:'',checked:false,innerHTML:'',innerText:'',textContent:'',style:{},disabled:false,classList:{toggle(){}},addEventListener(){},querySelectorAll(){return []},getContext(){return {}},focus(){}}]));
const data={toks_jobs:{old:{firm:'SERVİS FİRMA',plate:'34 OLD',task:'TAMİR',price:'1000.00 ₺ (KDV Dahil)',currency:'TRY',status:3,history:{finished:'01.10.2026'}}},toks_inventory:{},toks_quotes:{
 q1:{firm:'DENEME FİRMA',plate:'34 TEST 01',task:'BRANDA',basePrice:1000,currency:'TRY',quoteDate:'2026-10-12',followUpDate:'2026-10-13',status:'pending',createdAt:1},
 q2:{firm:'BAŞKA FİRMA',plate:'35 TEST 02',task:'YENİ BRANDA',basePrice:500,currency:'EUR',exchangeRateAtQuote:50,quoteDate:'2026-10-11',followUpDate:'',status:'rejected',createdAt:2},
 q3:{firm:'ÜÇÜNCÜ FİRMA',plate:'41 TEST 03',task:'KAPAK',basePrice:2000,currency:'TRY',quoteDate:'2026-10-10',followUpDate:'',status:'accepted',createdAt:3}
}};
const listeners={};let seq=100;
function get(path){return path.split('/').filter(Boolean).reduce((x,k)=>x?.[k],data)}
function set(path,val){const keys=path.split('/').filter(Boolean);let x=data;for(const key of keys.slice(0,-1)){x[key]??={};x=x[key]}if(val===null)delete x[keys.at(-1)];else x[keys.at(-1)]=val}
function emit(){for(const [path,arr] of Object.entries(listeners))for(const fn of arr)fn({val:()=>get(path)})}
class Ref{constructor(path=''){this.path=path}child(key){return new Ref([this.path,key].filter(Boolean).join('/'))}on(type,fn){(listeners[this.path]??=[]).push(fn);fn({val:()=>get(this.path)})}push(value){const key='q'+(++seq);if(value===undefined)return {key};set(this.path+'/'+key,value);emit();return Promise.resolve({key})}update(values){for(const [key,value] of Object.entries(values))set([this.path,key].filter(Boolean).join('/'),value);emit();return Promise.resolve()}remove(){set(this.path,null);emit();return Promise.resolve()}}
const authInstance={setPersistence:()=>Promise.resolve(),onAuthStateChanged:fn=>fn({uid:'test'}),signInWithEmailAndPassword:()=>Promise.resolve(),signOut:()=>Promise.resolve()};
function auth(){return authInstance}auth.Auth={Persistence:{LOCAL:'local'}};
const alerts=[]; let savedPdf='';
class MockPDF { setFont(){} setFontSize(){} setTextColor(){} text(){} setDrawColor(){} setLineWidth(){} line(){} splitTextToSize(text){return [text]} save(name){savedPdf=name} }
const context=vm.createContext({
 document:{getElementById:id=>elements[id],querySelectorAll:()=>[]},
 window:{scrollTo(){},location:{reload(){}},jspdf:{jsPDF:MockPDF}},
 firebase:{initializeApp(){},auth,database:()=>({ref:(path='')=>new Ref(path)})},
 localStorage:{getItem:()=>null,setItem(){}},
 fetch:()=>Promise.resolve({json:()=>Promise.resolve({rates:{TRY:50}})}),
 Chart:class{destroy(){}},setInterval(){},alert:msg=>alerts.push(msg),confirm:()=>true,
 console, Date, Number, String, Object, Math, Promise, Intl, isFinite, parseFloat
});
vm.runInContext(script,context);
const run=s=>vm.runInContext(s,context);
(async()=>{
 assert.equal(firebaseRules['.read'],false);
 assert.equal(firebaseRules.toks_inventory['$materialId']['.write'],firebaseRules.toks_jobs['$jobId']['.write']);
 assert.match(html, /input type="text" inputmode="numeric"[^>]*id="receipt"/);
 assert.match(html, /input type="text" inputmode="decimal" id="price"/);
 assert.match(html, /input type="tel" inputmode="tel"[^>]*id="quotePhone"/);
 assert.equal(run('parseDecimalInput("1250,75")'),1250.75);
 assert.equal(run('quoteTotal({basePrice:1000})'),1200);
 assert.equal(run('quoteTotalTRY({basePrice:500,currency:"EUR",exchangeRateAtQuote:50})'),30000);
 run('switchTab("budget"); switchBudgetMode("jobs")');
 assert.match(elements.grandTotal.innerText,/1\.000/);
 run('switchBudgetMode("quotes")');
 assert.match(elements.quoteStats.innerHTML,/30\.000,00/);
 assert.match(elements.quoteStats.innerHTML,/KAÇIRILAN İŞ/);
 assert.match(elements.lostQuoteFirms.innerHTML,/BAŞKA FİRMA/);
 await run('setQuoteStatus("q1","not_arrived")');
 assert.equal(data.toks_quotes.q1.status,'not_arrived');
 elements.quoteFilter.value='all';
 elements.archiveQuoteFilter.value='all';
 run('switchTab("archive"); switchArchiveMode("quotes")');
 assert.match(elements.archiveQuoteList.innerHTML,/data-status="not_arrived"/);
 assert.match(elements.archiveQuoteList.innerHTML,/Durum geçmişi/);
 run('switchTab("quotes")');
 assert.doesNotMatch(elements.quoteList.innerHTML,/data-id="q1"/);
 await run('archiveQuote("q1",true)');
 assert.equal(data.toks_quotes.q1.status,'pending');
 assert.match(elements.quoteList.innerHTML,/data-id="q1"/);
 run('renderQuoteAnalytics()');
 assert.match(elements.quoteStats.innerHTML,/30\.000,00/);
 await run('archiveQuote("q3",false)');
 assert.equal(run('isQuoteArchived(findQuote("q3"))'),true);
 await run('archiveQuote("q3",true)');
 assert.equal(run('isQuoteArchived(findQuote("q3"))'),false);
 await run('convertQuote("q3")');
 assert.equal(data.toks_quotes.q3.linkedJobId,'quote_q3');
 assert.equal(data.toks_jobs.quote_q3.basePrice,2000);
 assert.equal(data.toks_jobs.quote_q3.status,0);
 await run('convertQuote("q3")');
 assert.equal(Object.keys(data.toks_jobs).length,2);
 run('switchTab("quotes")');
 Object.assign(elements.quoteFirm,{value:'YENİ FİRMA'});
 Object.assign(elements.quotePlate,{value:'34 ABC 34'});
 Object.assign(elements.quoteTask,{value:'TAMİR'});
 Object.assign(elements.quotePhone,{value:'+90 555 123 45 67'});
 Object.assign(elements.quotePrice,{value:'1250,75'});
 Object.assign(elements.quoteCurrency,{value:'TRY'});
 Object.assign(elements.quoteDate,{value:'2026-10-14'});
 await run('saveQuote()');
 assert.equal(Object.keys(data.toks_quotes).length,4);
 const newId=Object.keys(data.toks_quotes).find(id=>data.toks_quotes[id].firm==='YENİ FİRMA');
 assert.equal(data.toks_quotes[newId].basePrice,1250.75);
 assert.equal(data.toks_quotes[newId].phone,'+90 555 123 45 67');
 run(`editQuote(${JSON.stringify(newId)})`);
 elements.quotePrice.value='1500';
 await run('saveQuote()');
 assert.equal(data.toks_quotes[newId].basePrice,1500);
 assert.equal(Object.keys(data.toks_quotes[newId].revisions).length,1);
 assert.equal(data.toks_quotes[newId].revisions[Object.keys(data.toks_quotes[newId].revisions)[0]].phone,'+90 555 123 45 67');
 run('generateQuotePDF("q2")');
 assert.match(savedPdf,/^TOKS_TEKLIF_/);
 Object.assign(elements.plate,{value:'34 TEST 99'});
 Object.assign(elements.firm,{value:'SERVİS FİRMA'});
 Object.assign(elements.receipt,{value:'000123'});
 Object.assign(elements.task,{value:'ÇATI BRANDA DEĞİŞİM'});
 Object.assign(elements.price,{value:'750,50'});
 Object.assign(elements.currency,{value:'TRY'});
 run('saveJob()');
 const newJobId=Object.keys(data.toks_jobs).find(id=>data.toks_jobs[id].plate==='34 TEST 99');
 const newJob=data.toks_jobs[newJobId];
 assert.equal(newJob.basePrice,750.5);
 assert.equal(newJob.receipt,'000123');
 assert.equal(newJob.materials.xlsm_211,40);
 assert.equal(newJob.materials.xlsm_232,40);
 assert.equal(run('usedMaterialTotals().xlsm_211 || 0'),0);
 await run('saveStockOpening("xlsm_211","100")');
 await run('addStockReceipt("xlsm_211","20")');
 assert.equal(run('stockNumbers("xlsm_211").balance'),120);
 run(`updateStatus(${JSON.stringify(newJobId)},2)`);
 assert.equal(run('stockNumbers("xlsm_211").balance'),80);
 assert.equal(run('usedMaterialTotals().xlsm_232'),40);
 run(`cancelJob(${JSON.stringify(newJobId)})`);
 assert.equal(run('stockNumbers("xlsm_211").balance'),120);
 run(`updateStatus(${JSON.stringify(newJobId)},0)`);
 assert.equal(run('stockNumbers("xlsm_211").balance'),80);
 run(`deleteJob(${JSON.stringify(newJobId)})`);
 assert.equal(run('stockNumbers("xlsm_211").balance'),120);
 assert.ok(data.toks_jobs[newJobId].deletedAt);
 run(`updateStatus(${JSON.stringify(newJobId)},0)`);
 assert.equal(run('stockNumbers("xlsm_211").balance'),80);
 run(`openMaterialDialog(${JSON.stringify(newJobId)})`);
 run('draftJobMaterials.xlsm_211 = 30');
 await run('saveJobMaterials()');
 assert.equal(run('stockNumbers("xlsm_211").balance'),90);
 run(`updateStatus(${JSON.stringify(newJobId)},3)`);
 assert.equal(run('stockNumbers("xlsm_211").balance'),90);
 run('switchTab("stock")');
 assert.match(elements.stockList.innerHTML,/KAPSÜL 32&#39;LİK ÇATI/);
 assert.match(elements.stockList.innerHTML,/Hareketler/);
 assert.match(elements.stockList.innerHTML,/BRANDA TOKASI/);
 assert.match(elements.stockList.innerHTML,/EDSCHA ARABA/);
 assert.match(elements.stockList.innerHTML,/TİNER/);
 assert.doesNotMatch(elements.stockList.innerHTML,/100\*100\*4 PROFİL/);
 assert.match(elements.stockMessage.textContent,/profil gizli/);
 elements.stockSearch.value='PROFİL';
 run('renderStock()');
 assert.match(elements.stockList.innerHTML,/100\*100\*4 PROFİL/);
 elements.stockSearch.value='';
 elements.stockShowProfiles.checked=true;
 run('renderStock()');
 assert.match(elements.stockMessage.textContent,/231 malzeme gösteriliyor/);
 await run('saveStockOpening("basic_branda_tokasi","100")');
 assert.equal(run('stockNumbers("basic_branda_tokasi").balance'),100);
 assert.match(elements.stockList.innerHTML,/YANLIŞ SAYIMI GERİ AL/);
 await run('clearStockOpening("basic_branda_tokasi")');
 assert.equal(run('stockNumbers("basic_branda_tokasi").balance'),null);
 assert.equal(data.toks_inventory.basic_branda_tokasi.openingQty,undefined);
 assert.ok(Object.values(data.toks_inventory.basic_branda_tokasi.openingHistory).some(entry=>entry.action==='clear' && entry.from===100));
 assert.match(elements.stockList.innerHTML,/100 → SAYIM YOK/);
 assert.deepEqual(alerts,[]);
 console.log('PASS: quote archive, stock receipt, roof defaults, finish/cancel/delete/restore, quote conversion');
})().catch(e=>{console.error(e);process.exitCode=1});
