const fs=require('fs'), vm=require('vm'), assert=require('assert'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const script=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
const elements=Object.fromEntries(ids.map(id=>[id,{id,value:'',innerHTML:'',innerText:'',textContent:'',style:{},disabled:false,classList:{toggle(){}},addEventListener(){},getContext(){return {}},focus(){}}]));
const data={toks_jobs:{old:{firm:'SERVİS FİRMA',plate:'34 OLD',task:'TAMİR',price:'1000.00 ₺ (KDV Dahil)',currency:'TRY',status:3,history:{finished:'01.10.2026'}}},toks_quotes:{
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
 run('renderQuoteAnalytics()');
 assert.match(elements.quoteStats.innerHTML,/31\.200,00/);
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
 Object.assign(elements.quotePrice,{value:'1250'});
 Object.assign(elements.quoteCurrency,{value:'TRY'});
 Object.assign(elements.quoteDate,{value:'2026-10-14'});
 await run('saveQuote()');
 assert.equal(Object.keys(data.toks_quotes).length,4);
 const newId=Object.keys(data.toks_quotes).find(id=>data.toks_quotes[id].firm==='YENİ FİRMA');
 assert.equal(data.toks_quotes[newId].basePrice,1250);
 run(`editQuote(${JSON.stringify(newId)})`);
 elements.quotePrice.value='1500';
 await run('saveQuote()');
 assert.equal(data.toks_quotes[newId].basePrice,1500);
 assert.equal(Object.keys(data.toks_quotes[newId].revisions).length,1);
 run('generateQuotePDF("q2")');
 assert.match(savedPdf,/^TOKS_TEKLIF_/);
 assert.deepEqual(alerts,[]);
 console.log('PASS: quote totals, lost analysis, status, conversion, save, revision');
})().catch(e=>{console.error(e);process.exitCode=1});
