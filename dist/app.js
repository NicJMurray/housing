import {DEFAULTS, PRESETS, MODEL_VERSION, simulate, simulateScenario, normaliseConfig, rankings, breakEvens, threshold, dateAt, realDeflator, incomeForMonth, governmentInterestRate} from './engine.js';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const NAMES={rent:'Rent & invest',old:'Older flat',new:'New build + loan'};
const COLOURS={rent:'#2d6755',old:'#7f75a6',new:'#be8256'};
const fmt=new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0});
const money=n=>fmt.format(Math.abs(n)<0.5?0:n);
const compact=n=>Math.abs(n)>=1000000?'£'+(n/1000000).toFixed(1)+'m':(n<0?'−':'')+'£'+Math.round(Math.abs(n)/1000)+'k';
const signedMoney=n=>(n>=0?'+':'−')+money(Math.abs(n));
const percent=n=>(n>0?'+':'')+Number(n.toFixed(2))+'%';
const dateLabel=m=>dateAt(m).toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'});
const fullDate=m=>dateAt(m).toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dot=k=>`<i class="dot ${k}" aria-hidden="true"></i>`;
const STORAGE_KEY='housing-simulator-v1';
let settings={...DEFAULTS}, real=false, activePreset='base', model, insightTimer, toastTimer, renderRevision=0;
let storageAvailable=true;
let currentShare=null;
function readSharedSettings() {
  const hash=new URLSearchParams(location.hash.slice(1));
  if(!hash.has('s'))return null;
  const data=hash.get('s').replace(/-/g,'+').replace(/_/g,'/');
  const decoded=JSON.parse(decodeURIComponent(escape(atob(data))));
  if(decoded.version!==MODEL_VERSION)throw new Error('Unsupported settings version');
  return normaliseConfig(decoded.settings);
}
try {
  const shared=readSharedSettings();
  if(shared) {
    settings=shared;activePreset='custom';currentShare=JSON.stringify(settings);
  } else {
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(saved?.version===MODEL_VERSION){settings=normaliseConfig(saved.settings);real=!!saved.real;activePreset=saved.preset||'custom';}
  }
} catch { /* Invalid links or unavailable storage simply use the documented defaults. */ }

const field=(key,label,min,max,step,unit='%',help='',note='')=>({key,label,min,max,step,unit,help,note});
const primary=[
  {heading:'INVESTMENTS & INCOME'},
  field('investmentReturn','Investment return',-10,20,.25,'%', 'Expected effective annual total return, including dividends, nominal. The default 8% is a scenario, not a forecast, and assumes no extra fees. Additional investment charges can be set below.'),
  field('salaryGrowth','Gross salary growth',-5,15,.25,'%', 'Gross salary rises on each September anniversary. Net pay is recalculated using English income-tax and employee NI bands, rather than growing take-home pay by the same percentage.'),
  field('rentGrowth','Annual rent increase',-3,10,.25),
  {heading:'PROPERTY VALUES'},
  field('oldGrowth','Older flat, per year',-10,12,.25,'%', 'Nominal annual appreciation or depreciation, compounded at monthly resolution. The default +2% is a modelling assumption, not a Southwark price forecast.'),
  field('newFiveYearChange','New build, first 5 years',-50,30,1,'%', 'A cumulative change across five years. −15% means £350,000 becomes £297,500 after 60 months, using the same geometric change each month.'),
  field('newLaterGrowth','New build, year 6 onward',-10,12,.25),
  {heading:'BORROWING & COSTS'},
  field('mortgageRate','Initial mortgage rate',0,12,.1,'%', 'Illustrative nominal mortgage rate, charged monthly at annual rate ÷ 12. It is not a lender quote and is not automatically reduced at lower LTV.'),
  field('postFixRate','After the fixed period',0,15,.1,'%', 'At the first month after the fixed period, refinance at this rate over the remaining mortgage term. Fees apply only when a refinancing actually occurs, not just because a sale falls on the expiry date.'),
  field('serviceGrowth','Service charge increase',-3,15,.25,'%', 'Annual compounded increase in both flats’ service charges. 4% is a cautious scenario, not TPI’s observed London annual inflation rate.'),
  field('inflation','General inflation',-2,10,.25,'%', 'Used for ordinary bills, inside-flat maintenance, insurance and fixed future fees. Real wealth is expressed in October 2026 purchasing power, including the interval to the September 2027 start.'),
];
const groups=[
  {title:'Your money & income',subtitle:'Starting resources, pay, deductions and income disruption',note:'The savings and income inputs are an illustrative example profile at the September 2027 start. No pre-start investment gains or savings are added. The calibration is a fixed monthly adjustment to match your actual starting pay. Pension assets are excluded in all scenarios.',fields:[
    field('savings','Total starting ISA savings',0,500000,500,'£'),field('grossSalary','Gross annual salary',0,200000,500,'£'),field('netMonthly','Actual starting take-home',0,10000,10,'£'),
    {key:'calibrateNet',label:'Calibrate starting pay to actual take-home',type:'check'},
    field('pensionPct','Salary-sacrifice pension',0,30,.5),
    {key:'studentPlan',label:'Student-loan deduction',type:'select',options:[['none','None'],['plan1','Plan 1'],['plan2','Plan 2'],['plan4','Plan 4'],['plan5','Plan 5'],['custom','Custom threshold']]},
    field('studentThreshold','Custom student threshold',0,60000,100,'£'),field('studentRate','Custom student rate',0,15,.5),
    {key:'postgrad',label:'Include postgraduate loan deductions',type:'check'},field('postgradThreshold','Postgraduate threshold',0,50000,100,'£'),
    field('taxThresholdGrowth','Tax-band annual indexation',0,5,.25,'%', '0% holds published tax thresholds constant for the whole projection. This is a transparent extrapolation, not a claim that all thresholds will stay frozen for fifteen years. Student-loan thresholds are held at the published values unless you use a custom threshold.'),
    field('lenderMultiple','Illustrative lender multiple',3,6,.1,'×','A screening assumption, not an approval rule. Actual lenders consider commitments, service charges, term, age, stress rates and other criteria.'),
    field('disruptionStartMonth','Income shock starts, month',1,180,1,'mo'),field('disruptionMonths','Income shock duration',0,24,1,'mo'),field('incomeRetainedPct','Gross income retained in shock',0,100,5,'%'),
  ]},
  {title:'Purchase prices & deposits',subtitle:'One pot of savings pays for deposits and all upfront costs',note:'The older flat uses all savings left after fees by default. In the new build, the remaining ISA stays invested after a deposit capped at 15%. Insufficient capital is flagged; extra funds are never silently invented.',fields:[
    field('oldPrice','Older-flat purchase price',100000,750000,5000,'£'),field('newPrice','New-build purchase price',100000,800000,5000,'£'),
    {key:'oldMaxDeposit',label:'Use maximum practical older-flat deposit',type:'check'},field('oldDepositPct','Older deposit if maximum is off',5,100,.5),field('newDepositPct','New-build buyer deposit',2.5,15,.5),
  ]},
  {title:'Mortgages & refinancing',subtitle:'Repayment term, fix expiry, refinancing and exit fees',note:'The same illustrative rate assumptions apply to both homes. LTV (loan-to-value) is the bank mortgage divided by the property price; the government loan is an additional liability. Refinancing occurs after the initial fix and repeats at the selected interval; the post-fix rate is reused. No extension of the original term. ERC is a simplified percentage, applied only when sale occurs inside a fixed period.',fields:[
    field('mortgageYears','Original mortgage term',5,40,1,'yr'),field('fixedYears','Initial fixed period',1,15,1,'yr'),field('refixYears','Later fixed periods',1,15,1,'yr'),field('remortgageFee','Fee per refinancing, start £',0,5000,100,'£'),field('ercPct','Early repayment charge',0,5,.25),field('mortgageExitFee','Mortgage exit fee, start £',0,1000,25,'£'),
  ]},
  {title:'Your First Home equity loan',subtitle:'Announced terms; eligibility and operational details remain provisional',note:'Official terms checked 28 October 2026. Interest is applied to the original outstanding nominal equity-loan amount, not the growing home value. Repayment uses the current equity share. Later escalation defaults to zero: no further automatic rise is assumed. A voluntary full repayment is hypothetical, funded from investments; partial repayments are excluded pending rules.',fields:[
    field('govShare','Government equity share',0,40,.5),field('govMinDeposit','Minimum buyer deposit',0,15,.5),field('govMaxDeposit','Maximum buyer deposit',2.5,30,.5),field('govFreeYears','Interest-free years',0,10,1,'yr'),field('govYearSixRate','First interest-bearing rate',0,10,.25),field('govLaterRate','Later annual interest rate',0,12,.25),field('govLaterStartYear','Later rate starts, scheme year',2,15,1,'yr'),field('govAnnualEscalation','Annual escalation after later rate',0,10,.25),field('govRepayYear','Full repayment year; 0 = at sale',0,15,1,'yr'),field('govValuationFee','Valuation/admin on redemption',0,2000,25,'£','£350 is an illustrative allowance; the scheme’s valuation and administration fees have not been confirmed.'),
  ]},
  {title:'Rent & everyday living',subtitle:'A room in shared accommodation, throughout the model',note:'Rent grows at the separate rent-increase assumption. These bills and living expenses grow at general inflation. Homeowners pay the same other living expenses, so only housing arrangements differ.',fields:[
    field('rent','Initial monthly room rent',0,2500,10,'£'),field('rentCouncil','Shared council-tax contribution',0,300,5,'£'),field('rentEnergy','Shared monthly energy',0,300,5,'£'),field('rentWater','Shared monthly water',0,150,5,'£'),field('rentInsurance','Renter contents insurance',0,50,1,'£'),field('living','Other monthly living expenses',0,3000,10,'£'),
  ]},
  {title:'Council tax & household bills',subtitle:'One occupant; estimated bands C and D, not property-specific valuations',note:'Southwark 2026/27 published annual bills: C £1,748.68; D £1,967.26. A 25% single-person discount gives £109.29/£122.95 a month. Rates are used as starting estimates for 2027 and grow with general inflation. Energy and water are usage estimates, not guaranteed savings from buying newer.',fields:[
    field('oldCouncil','Older annual council tax, pre-discount',0,5000,10,'£'),field('newCouncil','New-build annual council tax, pre-discount',0,5000,10,'£'),field('singleDiscount','Single-person discount',0,25,1),field('oldEnergy','Older monthly gas/electricity',0,400,5,'£'),field('newEnergy','New monthly gas/electricity',0,400,5,'£'),field('oldWater','Older monthly water',0,150,1,'£'),field('newWater','New monthly water',0,150,1,'£'),
  ]},
  {title:'Leasehold charges & upkeep',subtitle:'Separate communal charges from expected inside-flat spending',note:'London-informed starting estimates: £340 older / £275 newer. TPI 2026 London budgets averaged £4,620 a year overall, £4,070 below 11m and £3,328 for buildings under 25 years. A specific building can differ greatly. If charges already include your own heating or water, set those separate bill inputs to zero. Service charges already cover communal repairs, buildings insurance and reserves where applicable. Maintenance below is expected inside-flat spending; it is expensed, not an accumulating cash reserve.',fields:[
    field('oldService','Older monthly service charge',0,1200,5,'£'),field('newService','New monthly service charge',0,1200,5,'£'),field('oldGround','Older monthly ground rent',0,200,1,'£'),field('newGround','New monthly ground rent',0,200,1,'£'),field('groundGrowth','Annual ground-rent increase',0,10,.25),field('oldMaintenance','Older inside-flat maintenance/month',0,400,5,'£'),field('newMaintenance','New inside-flat maintenance/month',0,400,5,'£'),field('oldInsurance','Older contents insurance/month',0,100,1,'£'),field('newInsurance','New contents insurance/month',0,100,1,'£'),
  ]},
  {title:'Major works & one-off costs',subtitle:'Stress-test a bill that is additional to service-charge reserves',note:'Enter future nominal amounts for the specified year-end. A major-works amount must be your net additional bill after any sinking-fund contribution, so the same communal work is not counted twice. Extra one-off costs can cover furniture, moving or a lease issue. Default zero does not mean these risks are absent.',fields:[
    field('oldMajorWorks','Older major-works bill',0,75000,500,'£'),field('newMajorWorks','New-build major-works bill',0,75000,500,'£'),field('majorWorksYear','Major works at end of year',1,15,1,'yr'),field('oldExtraCost','Older other one-off cost',0,50000,250,'£'),field('newExtraCost','New other one-off cost',0,50000,250,'£'),field('extraCostYear','Other cost at end of year',1,15,1,'yr'),
  ]},
  {title:'Buying, selling & stamp duty',subtitle:'Fees are paid from your existing capital; agency fee includes VAT',note:'£3,500 upfront fees are a modelling allowance (£1,750 legal + £500 survey + £1,000 mortgage + £250 other). Actual leasehold legal costs can be higher. Sale legal/other costs grow with inflation; the agency fee is a percentage of sale value. Main-residence capital-gains relief is assumed for the home. Manual SDLT overrides apply only when automatic calculation is off.',fields:[
    field('buyLegal','Buying legal/conveyancing',0,6000,50,'£'),field('buySurvey','Survey/snagging',0,2500,50,'£'),field('buyMortgageFee','Initial mortgage product fee',0,3000,50,'£'),field('buyOther','Searches/other buying costs',0,2000,25,'£'),
    {key:'sdltAutomatic',label:'Calculate English first-time buyer SDLT automatically',type:'check'},field('oldSdltOverride','Older SDLT manual override',0,50000,100,'£'),field('newSdltOverride','New SDLT manual override',0,50000,100,'£'),field('sellAgentPct','Selling agent, including VAT',0,4,.05),field('sellLegal','Selling legal fees',0,5000,50,'£'),field('sellOther','EPC/leasehold pack/other exit',0,2500,25,'£'),
  ]},
  {title:'Investments, ISA & taxable overflow',subtitle:'Preserve the existing ISA; tax new money outside the wrapper',note:'Existing savings are already in an ISA and do not use new subscription allowance. New surplus goes into ISA room first, then a taxable general investment account. The tax year resets in April (monthly approximation to 6 April). No flexible-ISA replacement or automatic bed-and-ISA is assumed. Taxable dividends are reinvested after estimated tax; pooled capital gains are taxed on withdrawals and final liquidation. Annual losses carry forward. No other gains or dividends are assumed.',fields:[
    field('investmentFee','Extra annual investment charge',0,2,.05,'%','The 8% default is net of fees. Leave this at zero unless you wish to deduct an additional annual percentage charge.'),field('dividendYield','Dividend portion of total return',0,6,.1,'%','Included in total return, not added on top. The model separates taxable dividends from price gains in the general account.'),field('isaAllowance','Annual ISA contribution allowance',0,40000,500,'£'),field('isaAlreadyUsed','ISA allowance used before start',0,20000,500,'£'),field('dividendAllowance','Annual dividend allowance',0,2000,100,'£'),field('cgtAllowance','Annual CGT exemption',0,20000,500,'£'),field('cgtBasicRate','CGT basic rate',0,40,.5),field('cgtHigherRate','CGT higher rate',0,45,.5),field('dividendBasicRate','Dividend basic rate',0,50,.25),field('dividendHigherRate','Dividend higher rate',0,50,.25),field('dividendAdditionalRate','Dividend additional rate',0,50,.25),
  ]},
];
const allFields=[...primary.filter(f=>f.key),...groups.flatMap(g=>g.fields)];
const descriptors=Object.fromEntries(allFields.map(f=>[f.key,f]));

function controlMarkup(f) {
  const id='setting-'+f.key;
  if(f.type==='check')return `<label class="field-check"><input type="checkbox" data-key="${f.key}" ${settings[f.key]?'checked':''}>${f.label}<button class="reset-one" type="button" data-reset="${f.key}" aria-label="Reset ${f.label}">↺</button></label>`;
  if(f.type==='select')return `<label class="field-select" for="${id}">${f.label}<select id="${id}" data-key="${f.key}">${f.options.map(([value,label])=>`<option value="${value}" ${value===settings[f.key]?'selected':''}>${label}</option>`).join('')}</select></label>`;
  const value=settings[f.key],fill=(value-f.min)/(f.max-f.min)*100;
  const help=f.help?`<button class="help" data-help="${safe(f.help)}" aria-label="Explain ${safe(f.label)}">?</button>`:'';
  return `<div class="slider-control ${value!==DEFAULTS[f.key]?'changed':''}" data-control="${f.key}"><div class="slider-top"><label for="${id}-range">${f.label}${help}</label><div class="input-with-unit">${f.unit==='£'?'<span>£</span>':''}<input id="${id}" type="number" data-key="${f.key}" min="${f.min}" max="${f.max}" step="${f.unit==='£'?.01:f.step}" value="${value}" aria-label="${safe(f.label)} exact value">${f.unit!=='£'?`<span>${f.unit}</span>`:''}<button class="reset-one" type="button" data-reset="${f.key}" aria-label="Reset ${safe(f.label)}">↺</button></div></div><input id="${id}-range" type="range" data-key="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${value}" style="--fill:${fill}%" aria-label="${safe(f.label)} slider">${f.note?`<p class="control-hint">${f.note}</p>`:''}</div>`;
}

function buildControls() {
  $('#primary-controls').innerHTML=`<div class="primary-grid">${primary.map(f=>f.heading?`<h3 class="control-group-title">${f.heading}</h3>`:controlMarkup(f)).join('')}</div>`;
  $('#advanced-controls').innerHTML=groups.map(g=>`<details class="advanced-group"><summary><span>${g.title}<small>${g.subtitle}</small></span></summary><p class="group-note">${g.note}</p><div class="advanced-grid">${g.fields.map(controlMarkup).join('')}</div></details>`).join('');
  $('#preset').innerHTML=Object.entries(PRESETS).map(([key,p])=>`<option value="${key}">${p.label}</option>`).join('')+'<option value="custom">Custom assumptions</option>';
}

function save() {
  if(currentShare&&currentShare!==JSON.stringify(settings)){
    history.replaceState(null,'',location.pathname+location.search);currentShare=null;
  }
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:MODEL_VERSION,settings,real,preset:activePreset}));storageAvailable=true;}
  catch{storageAvailable=false;}
  $('.header-status').innerHTML=storageAvailable?'<i></i> Saved on this device':'Session only · storage unavailable';
}
function syncControls() {
  $$('[data-key]').forEach(el=>{
    const key=el.dataset.key;
    if(el.type==='checkbox')el.checked=settings[key];
    else if(el!==document.activeElement)el.value=settings[key];
    if(el.type==='range')el.style.setProperty('--fill',clampedFill(settings[key],Number(el.min),Number(el.max))+'%');
  });
  $$('[data-control]').forEach(el=>el.classList.toggle('changed',settings[el.dataset.control]!==DEFAULTS[el.dataset.control]));
  $('#horizon-range').value=settings.horizon;
  $('#horizon-range').style.setProperty('--fill',(settings.horizon-5)*10+'%');
  $('#horizon-display').textContent=settings.horizon;
  $('#evaluation-date').textContent=fullDate(settings.horizon*12);
  $('#preset').value=PRESETS[activePreset]?activePreset:'custom';
  $('#preset-description').textContent=PRESETS[activePreset]?.description||'Your own mix of assumptions. Changes are saved automatically.';
  $('#starting-savings').textContent=money(settings.savings);
  $('#starting-income').textContent=money(incomeForMonth(1,settings).net)+' take-home / month';
  const changed=Object.keys(DEFAULTS).filter(k=>settings[k]!==DEFAULTS[k]).length;
  $('#modified-count').textContent=changed?changed+' edited assumption'+(changed===1?'':'s'):'Default assumptions';
  $('#nominal').classList.toggle('active',!real);$('#real').classList.toggle('active',real);
  $('#nominal').setAttribute('aria-pressed',String(!real));$('#real').setAttribute('aria-pressed',String(real));
  const newDeposit=$('#setting-newDepositPct-range');
  newDeposit.min=settings.govMinDeposit;newDeposit.max=settings.govMaxDeposit;
  const newNumber=$('#setting-newDepositPct');newNumber.min=settings.govMinDeposit;newNumber.max=settings.govMaxDeposit;
}
const clampedFill=(v,min,max)=>Math.min(100,Math.max(0,(v-min)/(max-min)*100));
const displayed=s=>real?s.realNetWorth:s.netWorth;
const terminalMoney=(n,month=settings.horizon*12)=>money(real?n/realDeflator(month,settings):n);

function renderCards() {
  const month=settings.horizon*12,rank=rankings(model),leader=rank[0].kind;
  $('#scenario-cards').innerHTML=model.scenarios.map(s=>{
    const snap=s.snapshots[month],first=s.snapshots[1],surplus=first.cashflow;
    const alternate=real?money(snap.netWorth)+' future pounds':money(snap.realNetWorth)+' in today’s money';
    const foot=s.kind==='rent'?'Room in a shared home':s.multiple>settings.lenderMultiple?s.multiple.toFixed(2)+'× income · lender check':'Private flat · '+money(s.funding.price);
    return `<article class="scenario-card ${s.kind} ${s.kind===leader?'leader':''}"><div class="card-top"><span class="scenario-label">${dot(s.kind)}${NAMES[s.kind]}</span>${s.kind===leader?'<span class="leader-label">PROJECTED LEADER</span>':''}</div><div class="card-value ${money(displayed(snap)).length>9?'long':''}">${money(displayed(snap))}</div><p class="card-equivalent">${alternate}</p><div class="card-divider"></div><div class="card-bottom"><span>${surplus>=0?'Initial monthly surplus':'Initial monthly shortfall'}</span><strong class="${surplus<0?'negative-number':''}">${money(surplus)}</strong></div><div class="card-foot">${foot}</div>${snap.firstDepletion!==null?'<div class="badge-unsustainable">Liquid funds exhausted in this horizon</div>':''}</article>`;
  }).join('');
  const advantage=rank[0].netWorth-rank[1].netWorth;
  const unstable=rank[0].firstDepletion!==null;
  const scale=real?realDeflator(month,settings):1;
  const winner=model.scenarios.find(s=>s.kind===leader);
  const caveat=unstable?'The projected leader needs unfunded cash; this path is not financeable as entered.':winner.kind!=='rent'&&winner.multiple>settings.lenderMultiple?'The projected leader still needs lender approval at the indicated income multiple.':'This is a deterministic illustration. Change the assumptions to test the result.';
  $('#verdict').innerHTML=`<span class="verdict-icon" aria-hidden="true">↗</span><p><strong>${NAMES[leader]}</strong> leads by <strong>${money(advantage/scale)}</strong> after ${settings.horizon} years, compared with ${NAMES[rank[1].kind].toLowerCase()}.<small>${caveat}</small></p>`;
}

function renderWarnings() {
  const month=settings.horizon*12,w=[];
  for(const s of model.scenarios) {
    const snap=s.snapshots[month];
    if(s.kind!=='rent'&&!s.funding.valid)w.push({severe:true,text:`<strong>${NAMES[s.kind]}: insufficient upfront funding.</strong> Available savings cannot cover the assumed minimum deposit and fees. The projection does not represent an approved purchase.`});
    if(snap.firstDepletion!==null)w.push({severe:true,text:`<strong>${NAMES[s.kind]} runs out of liquid funds in ${dateLabel(snap.firstDepletion)}.</strong> ${money(snap.unfunded)} remains unfunded at evaluation. Unfunded spending is deducted as a liability; no borrowing facility is assumed. The path is not financeable as entered.`});
  }
  const n=model.scenarios[2];
  const affordability=n.multiple>settings.lenderMultiple?`${money(n.funding.mortgage)} is <strong>${n.multiple.toFixed(2)}× your gross salary</strong>, above the ${settings.lenderMultiple.toFixed(1)}× screening assumption. `:'';
  w.push({text:`<strong>Your First Home: eligibility is provisional.</strong> ${affordability}Lender approval, the participating development and eligibility with ${money(settings.savings)} in savings need checking. The scheme targets buyers who would struggle to buy without support.`});
  const o=model.scenarios[1];
  if(o.multiple>settings.lenderMultiple)w.push({text:`<strong>Older-flat mortgage needs checking.</strong> ${money(o.funding.mortgage)} is ${o.multiple.toFixed(2)}× gross income, above your ${settings.lenderMultiple.toFixed(1)}× screening assumption.`});
  if(settings.newPrice>650000||settings.grossSalary>140000)w.push({severe:true,text:'<strong>Outside an announced London cap.</strong> The new-build price exceeds the £650,000 inner-London cap or household earnings exceed £140,000.'});
  const schemeKeys=['govShare','govMinDeposit','govMaxDeposit','govFreeYears','govYearSixRate','govLaterRate','govLaterStartYear','govAnnualEscalation'];
  if(schemeKeys.some(k=>settings[k]!==DEFAULTS[k]))w.push({text:'<strong>Scheme terms have been edited.</strong> These results use hypothetical rules rather than the announced government terms.'});
  const overflowing=model.scenarios.filter(s=>s.snapshots[month].overflowMonth!==null);
  if(overflowing.length)w.push({info:true,text:`<strong>ISA overflow is taxed.</strong> ${overflowing.map(s=>NAMES[s.kind]).join(', ')} exceed the annual allowance for new contributions within this horizon. The excess uses a taxable account; dividend tax and estimated liquidation CGT are included.`});
  $('#warnings').innerHTML=w.map(x=>`<div class="warning ${x.severe?'severe':''} ${x.info?'info':''}"><span aria-hidden="true">${x.info?'i':'!'}</span><p>${x.text}</p></div>`).join('');
}

let chartGeometry={width:900,height:330,left:53,right:882,top:20,bottom:280,yMin:0,yMax:500000};
function chartPosition(month,nw){const g=chartGeometry;return {x:g.left+(g.right-g.left)*month/180,y:g.bottom-(nw-g.yMin)/(g.yMax-g.yMin)*(g.bottom-g.top)};}
function renderChart() {
  const width=Math.max(280,$('#chart-container').clientWidth),height=width<450?235:300;
  Object.assign(chartGeometry,{width,height,left:47,right:width-10,top:24,bottom:height-32});
  $('#wealth-chart').setAttribute('viewBox',`0 0 ${width} ${height}`);
  const all=model.scenarios.flatMap(s=>s.snapshots.map(displayed));
  const lo=Math.min(0,...all),hi=Math.max(10000,...all),rough=(hi-lo)/4;
  const base=10**Math.floor(Math.log10(rough));
  const step=[1,2,2.5,5,10].map(n=>n*base).find(n=>n>=rough)||base*10;
  chartGeometry.yMin=Math.floor(lo/step)*step;chartGeometry.yMax=Math.ceil(hi/step)*step;
  const g=chartGeometry,ticks=[];
  for(let v=g.yMin;v<=g.yMax+1;v+=step){const y=chartPosition(0,v).y;ticks.push(`<line class="grid" x1="${g.left}" x2="${g.right}" y1="${y}" y2="${y}"/><text x="${g.left-11}" y="${y+3}" text-anchor="end">${compact(v)}</text>`);}
  const xTicks=(width<450?[0,5,10,15]:[0,3,5,7,10,12,15]).map(y=>`<text x="${chartPosition(y*12,0).x}" y="${height-10}" text-anchor="middle">${y===0?'Start':y+'y'}</text>`).join('');
  const curves=model.scenarios.map(s=>{
    const path=s.snapshots.map((snap,i)=>`${i===0?'M':'L'}${chartPosition(i,displayed(snap)).x.toFixed(2)},${chartPosition(i,displayed(snap)).y.toFixed(2)}`).join(' ');
    const point=chartPosition(settings.horizon*12,displayed(s.snapshots[settings.horizon*12]));
    return `<path class="curve" stroke="${COLOURS[s.kind]}" d="${path}"/><circle cx="${point.x}" cy="${point.y}" r="4" fill="${COLOURS[s.kind]}" stroke="#fffefa" stroke-width="2"/>`;
  }).join('');
  const mark=chartPosition(settings.horizon*12,0).x;
  const labelX=Math.max(62,Math.min(width-65,mark));
  $('#wealth-chart').innerHTML=`<title>After-sale net worth from September 2027 to September 2042</title><desc>All three portfolios include surplus contributions. Homeowners repay loans and selling costs. Click between years five and fifteen to select the evaluation year.</desc>${ticks.join('')}${xTicks}<line class="selected-marker" x1="${mark}" x2="${mark}" y1="${g.top}" y2="${g.bottom}"/>${curves}<text x="${labelX}" y="13" text-anchor="middle" style="fill:#364c3e;font-size:10px">${fullDate(settings.horizon*12)}</text><line id="chart-hover-line" x1="0" x2="0" y1="${g.top}" y2="${g.bottom}" stroke="#aab2a1" stroke-dasharray="2 3" opacity="0"/>`;
  $('#chart-basis').textContent=real?`October 2026 purchasing power · ${settings.inflation}% annual inflation`:'Future pounds · after sale costs and estimated investment tax';
  const fixed=settings.fixedYears,free=settings.govFreeYears;
  const y6=model.scenarios[2].funding.government*settings.govYearSixRate/1200;
  const later=model.scenarios[2].funding.government*settings.govLaterRate/1200;
  $('#milestones').innerHTML=`<div class="milestone"><span>YEAR ${fixed+1}</span><div><strong>Mortgage fix ends</strong><p>${settings.postFixRate}% assumed on refinancing. Repayment recalculated over the remaining term.</p></div></div><div class="milestone"><span>YEARS ${free+1} / ${settings.govLaterStartYear}</span><div><strong>Equity-loan interest begins</strong><p>If still outstanding: ${money(y6)}/mo initially, then ${money(later)}/mo at the later rate. Interest does not repay the loan.</p></div></div>`;
}

function cashMonth(){return $('#cash-month').value==='selected'?settings.horizon*12:Number($('#cash-month').value);}
function renderAffordability() {
  const month=cashMonth();
  $('#affordability').innerHTML=`<div class="afford-grid">${model.scenarios.map(s=>{
    const snap=s.snapshots[month],h=snap.housing,income=snap.pay.net,surplus=snap.cashflow;
    const ordinarySurplus=income-h.total-h.living;
    const caution=snap.firstDepletion!==null?'Liquid funds exhausted':ordinarySurplus<0?'Withdrawals needed':s.kind!=='rent'&&s.multiple>settings.lenderMultiple?'Lender affordability check needed':'Positive monthly cash flow';
    const denominator=Math.max(income,h.total+h.living,1);
    return `<div class="afford-col ${s.kind}"><div class="afford-name">${dot(s.kind)}${NAMES[s.kind]}</div><div class="afford-total">${money(h.total)}<small> / mo</small></div><div class="afford-sub">Total housing · ${dateLabel(month-1)}</div><div class="budget-bar" aria-hidden="true"><span class="housing-segment" style="width:${h.total/denominator*100}%"></span><span class="living-segment" style="width:${h.living/denominator*100}%"></span><span class="surplus-segment" style="width:${Math.max(0,ordinarySurplus)/denominator*100}%"></span></div><div class="afford-line"><span>${s.kind==='rent'?'Room rent':'Mortgage repayment'}</span><strong>${money(s.kind==='rent'?h.rent:h.mortgage)}</strong></div>${s.kind==='new'?`<div class="afford-line"><span>Equity-loan interest</span><strong>${money(h.governmentInterest)}</strong></div>`:''}<div class="afford-line"><span>Take-home pay</span><strong>${money(income)}</strong></div><div class="afford-line"><span>Other living costs</span><strong>${money(h.living)}</strong></div>${snap.oneOff>0?`<div class="afford-line"><span>One-off payments</span><strong>${money(snap.oneOff)}</strong></div>`:''}<div class="afford-line surplus ${surplus<0?'negative':''}"><span>${surplus>=0?'Available to invest':'Withdrawals needed'}</span><strong>${money(Math.abs(surplus))}</strong></div><div class="afford-status ${caution==='Positive monthly cash flow'?'':'caution'}">${caution}</div></div>`;
  }).join('')}</div><p class="panel-note">Nominal cash flows in ${fullDate(month-1)}. Mortgage payments include principal; principal builds equity. One-off bills are included only in the month they occur.</p>`;
  const snaps=model.scenarios.map(s=>s.snapshots[month]);
  const rows=[['Net take-home income',s=>s.pay.net],['Rent',s=>s.housing.rent],['Mortgage payment',s=>s.housing.mortgage],['↳ interest component',s=>s.mortgageInterestThisMonth,'subtle'],['↳ principal component',s=>s.mortgagePrincipalThisMonth,'subtle'],['Government-loan interest',s=>s.housing.governmentInterest],['Council tax (after discount)',s=>s.housing.council],['Gas & electricity',s=>s.housing.energy],['Water',s=>s.housing.water],['Service charges',s=>s.housing.service],['Ground rent',s=>s.housing.ground],['Inside-flat maintenance',s=>s.housing.maintenance],['Contents insurance',s=>s.housing.insurance],['Total monthly housing',s=>s.housing.total,'total'],['Other living expenses',s=>s.housing.living],['One-off bills / refinancing / redemption',s=>s.oneOff],['Surplus / (shortfall)',s=>s.cashflow,'total']];
  $('#monthly-detail').innerHTML=table(rows,snaps);
}

function table(rows,snaps) {
  return `<table><thead><tr><th scope="col">${real?'Cash-flow / ledger values remain nominal':'Nominal £'}</th>${model.scenarios.map(s=>`<th scope="col">${NAMES[s.kind]}</th>`).join('')}</tr></thead><tbody>${rows.map(([label,get,cls])=>get===null?`<tr class="table-section"><th colspan="4">${label}</th></tr>`:`<tr class="${cls||''}"><td>${label}</td>${snaps.map((s,i)=>`<td>${money(get(s,i))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function renderBreakdown() {
  const m=settings.horizon*12,snaps=model.scenarios.map(s=>s.snapshots[m]);
  $('#wealth-composition').innerHTML=`<div class="composition-cards">${model.scenarios.map((s,i)=>{const snap=snaps[i];return `<div class="composition"><div class="afford-name">${dot(s.kind)}${NAMES[s.kind]}</div><div class="afford-line"><span>Investments, after tax</span><strong>${terminalMoney(snap.investments)}</strong></div><div class="afford-line"><span>Net cash from sale</span><strong>${terminalMoney(snap.saleProceeds)}</strong></div><div class="afford-line"><span>${snap.unfunded>0?'Unfunded spending':'Other cash'}</span><strong>${terminalMoney(-snap.unfunded)}</strong></div><div class="comp-total">${money(displayed(snap))}</div></div>`;}).join('')}</div><p class="reconcile-note"><span aria-hidden="true">✓</span> Balance sheets reconcile to starting capital + income + returns − spending, taxes and fees.</p>`;
  const rows=[
    ['AT PURCHASE',null],['Initial resources',()=>settings.savings],['Deposit',(_,i)=>model.scenarios[i].funding.deposit],['Initial bank mortgage',(_,i)=>model.scenarios[i].funding.mortgage],['Initial government equity loan',(_,i)=>model.scenarios[i].funding.government],['Stamp duty',(_,i)=>model.scenarios[i].funding.sdlt],['Other buying fees',(_,i)=>model.scenarios[i].funding.buyFees],['Initial ISA left invested',(_,i)=>model.scenarios[i].funding.invested],
    ['MORTGAGE & GOVERNMENT LOAN',null],['Mortgage payments, total',s=>s.totals.mortgagePayments],['↳ mortgage principal repaid',s=>s.totals.mortgagePrincipal,'subtle'],['↳ mortgage interest paid',s=>s.totals.mortgageInterest,'subtle'],['Bank mortgage at sale',s=>s.mortgage],['Equity-loan interest paid',s=>s.totals.governmentInterest],['Equity principal repaid before sale',s=>s.totals.govCapitalRepaid],['Government share owed at sale',s=>s.government],['Government value change (− = protection)',s=>s.govValueChange],
    ['ONGOING CASH FLOW',null],['Total net employment income',s=>s.totals.income],['Other living costs',s=>s.totals.living],['Rent paid',s=>s.totals.rent],['Council tax',s=>s.totals.council],['Energy & water',s=>s.totals.energy+s.totals.water],['Service charges',s=>s.totals.service],['Ground rent',s=>s.totals.ground],['Inside-flat maintenance',s=>s.totals.maintenance],['Contents insurance',s=>s.totals.insurance],['Major works (net additional)',s=>s.totals.majorWorks],['Other one-off costs',s=>s.totals.extraCosts],['Refinancing fees',s=>s.totals.remortgage],['Earlier equity-redemption fees',s=>s.totals.govFeesPaid],
    ['INVESTMENTS',null],['New investment contributions',s=>s.contributions],['↳ to ISA',s=>s.isaContributions,'subtle'],['↳ to taxable account',s=>s.giaContributions,'subtle'],['Cash withdrawn from investments',s=>s.withdrawals],['Compounded investment returns, before tax',s=>s.investmentGrowth],['Dividend tax paid',s=>s.dividendTax],['CGT paid on withdrawals',s=>s.cgtPaid],['Remaining ISA',s=>s.isa],['Remaining taxable portfolio, gross',s=>s.gia],['− estimated CGT on final liquidation',s=>-s.terminalTax],['Liquid investments after tax',s=>s.investments,'total'],
    ['SALE & FINAL WEALTH',null],['Property market value',s=>s.value],['Property value change since purchase',(s,i)=>s.value-model.scenarios[i].funding.price],['− bank mortgage repayment',s=>-s.mortgage],['− government repayment',s=>-s.government],['− estate agency fee, VAT-inclusive',s=>-s.saleAgent],['− selling legal fees',s=>-s.saleLegal],['− EPC / management pack / other',s=>-s.saleOther],['− equity valuation/admin allowance',s=>-s.govFee],['− early repayment / mortgage exit',s=>-s.erc-s.exitFee],['Net cash returned by property sale',s=>s.saleProceeds,'total'],['+ investments after liquidation tax',s=>s.investments],['− unfunded spending liability',s=>-s.unfunded],['FINAL NOMINAL NET WORTH',s=>s.netWorth,'total'],['FINAL REAL NET WORTH (Oct 2026 £)',s=>s.realNetWorth,'total'],['Unrecoverable housing costs incl. buy/sale',s=>s.unrecoverable],['Reconciliation difference (should be £0)',s=>s.reconciliationError,'subtle'],
  ];
  $('#ledger').innerHTML=table(rows,snaps);
}

function renderBreakEvens() {
  let el=$('#break-evens');
  if(!el){el=document.createElement('div');el.id='break-evens';el.className='subtle-notice';$('#insights').after(el);}
  el.innerHTML='<strong>Overtaking points, years 5–15:</strong> '+breakEvens(model).map(pair=>{
    if(!pair.crossings.length)return `${NAMES[pair.leaderAtStart]} stays ahead of ${NAMES[pair.leaderAtStart===pair.a?pair.b:pair.a].toLowerCase()}.`;
    return pair.crossings.map(x=>`${NAMES[x.leader]} moves ahead in ${dateLabel(x.month)} (${(x.month/12).toFixed(1)} years).`).join(' ');
  }).join(' ');
}

function render() {
  model=simulate(settings);renderRevision++;
  syncControls();renderCards();renderWarnings();renderChart();renderAffordability();renderBreakdown();renderBreakEvens();
  $('#insight-horizon').textContent='At '+settings.horizon+' years';
  clearTimeout(insightTimer);const revision=renderRevision;
  insightTimer=setTimeout(()=>{if(revision===renderRevision){renderInsights();if($('#heatmap-details').open)renderHeatmap();}},120);
}

function rentWinReturn() {
  const m=settings.horizon*12;
  const delta=r=>{const next=simulate({...settings,investmentReturn:r},m);const values=next.scenarios.map(s=>s.snapshots[m].netWorth);return values[0]-Math.max(values[1],values[2]);};
  let lo=-10,prev=delta(lo);
  for(let r=-8;r<=20;r+=2){const next=delta(r);if(prev*next<=0){let hi=r;for(let i=0;i<22;i++){const mid=(lo+hi)/2,v=delta(mid);if(prev*v<=0)hi=mid;else{lo=mid;prev=v;}}return {root:(lo+hi)/2};}lo=r;prev=next;}
  return {text:delta(-10)>=0?'Below −10%':'Above 20%'};
}
function renderInsights() {
  const m=settings.horizon*12,stock=rentWinReturn(),growth=threshold(settings,'oldGrowth','old',-10,15);
  const current=model.scenarios[2].snapshots[m];
  const without=simulateScenario('new',{...settings,newFiveYearChange:0},m).snapshots[m];
  const curveImpact=current.netWorth-without.netWorth;
  const stockText=stock.root===undefined?`<small>${stock.text}</small>`:Number(stock.root.toFixed(1))+'%';
  const growthText=growth===null?'<small>Outside −10 to 15%</small>':Number(growth.toFixed(1))+'%';
  const protection=current.govValueChange<0?`The government absorbs ${money(-current.govValueChange)} of the value loss.`:`The government shares ${money(current.govValueChange)} of the value gain.`;
  $('#insights').innerHTML=`<div class="insight"><div class="insight-label">Investment return for renting to lead</div><div class="insight-value">${stockText}</div><p>Annual return at parity with the better-performing buyer. All other inputs stay fixed.</p></div><div class="insight"><div class="insight-label">Older-flat growth to match renting</div><div class="insight-value">${growthText}</div><p>Annual nominal appreciation needed to close the gap with rent &amp; invest.</p></div><div class="insight"><div class="insight-label">Impact of the new-build first-five-year curve</div><div class="insight-value">${terminalMoney(curveImpact)}</div><p>Versus a flat first five years, then the same later growth. ${protection}</p></div>`;
}

function renderHeatmap() {
  const returns=[0,2,4,6,8,10,12],growths=[8,6,4,2,0,-2,-4],m=settings.horizon*12;
  const cells=growths.map(g=>`<tr><th scope="row">${percent(g)}</th>${returns.map(r=>{
    const next=simulate({...settings,investmentReturn:r,oldGrowth:g},m),rank=rankings(next,settings.horizon),win=rank[0];
    const label=win.kind==='rent'?'Rent':win.kind==='old'?'Older':'New';
    return `<td><button class="heat-cell ${win.kind} ${settings.investmentReturn===r&&settings.oldGrowth===g?'current-cell':''}" data-heat-return="${r}" data-heat-growth="${g}" title="${r}% investments; ${g}% older-flat growth. ${NAMES[win.kind]} leads at ${terminalMoney(win.netWorth)}.">${label}<small>${compact(real?win.realNetWorth:win.netWorth)}</small></button></td>`;
  }).join('')}</tr>`).join('');
  $('#heatmap').innerHTML=`<div class="heatmap-wrap"><p class="heatmap-axis-label">Older-flat annual growth ↓ · Investment return →</p><div class="table-scroll"><table class="heatmap-table"><thead><tr><th scope="col">Growth</th>${returns.map(r=>`<th scope="col">${r}%</th>`).join('')}</tr></thead><tbody>${cells}</tbody></table></div><div class="heatmap-legend">${Object.keys(NAMES).map(k=>`<span>${dot(k)}${NAMES[k]}</span>`).join('')}</div><p class="panel-note">Amounts are the winning terminal net worth, ${real?'in October 2026 pounds':'in nominal pounds'}. A cell’s winner can still fail lender or cash-flow checks. No probability is attached to a market scenario.</p></div>`;
}

function notify(message) {clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
function update(key,value) {
  settings=normaliseConfig({...settings,[key]:value});activePreset='custom';save();render();
}

document.addEventListener('input',e=>{
  const key=e.target.dataset.key;
  if(key&&e.target.type!=='checkbox'&&e.target.tagName!=='SELECT'&&e.target.value!=='')update(key,Number(e.target.value));
  if(e.target.id==='horizon-range'){settings.horizon=Number(e.target.value);save();render();}
});
document.addEventListener('change',e=>{
  const key=e.target.dataset.key;
  if(key){update(key,e.target.type==='checkbox'?e.target.checked:e.target.tagName==='SELECT'?e.target.value:Number(e.target.value));if(e.target.type!=='checkbox')e.target.value=settings[key];syncControls();}
  if(e.target.id==='cash-month')renderAffordability();
});
document.addEventListener('click',e=>{
  const reset=e.target.closest('[data-reset]');if(reset){update(reset.dataset.reset,DEFAULTS[reset.dataset.reset]);syncControls();return;}
  if(e.target.closest('[data-open-method]')){$('#method-dialog').showModal();return;}
  if(e.target.closest('[data-close-dialog]')){e.target.closest('dialog').close();return;}
  const help=e.target.closest('[data-help]');if(help){$('#help-content').textContent=help.dataset.help;$('#help-dialog').showModal();return;}
  const heat=e.target.closest('[data-heat-return]');if(heat){settings=normaliseConfig({...settings,investmentReturn:Number(heat.dataset.heatReturn),oldGrowth:Number(heat.dataset.heatGrowth)});activePreset='custom';save();render();notify('Market assumptions applied.');}
});
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('#reset-all').addEventListener('click',()=>{settings={...DEFAULTS};real=false;activePreset='base';save();render();notify('All assumptions restored.');});
$('#preset').addEventListener('change',e=>{
  if(e.target.value==='custom'){activePreset='custom';save();syncControls();return;}
  const keys=new Set(Object.values(PRESETS).flatMap(p=>Object.keys(p.values)));
  const clean={...settings};for(const k of keys)clean[k]=DEFAULTS[k];
  activePreset=e.target.value;settings=normaliseConfig({...clean,...PRESETS[activePreset].values});save();render();
});
for(const id of ['nominal','real'])$('#'+id).addEventListener('click',()=>{real=id==='real';save();render();});
$('#heatmap-details').addEventListener('toggle',()=>{if($('#heatmap-details').open)renderHeatmap();});

function hoverMonth(event) {
  const svg=$('#wealth-chart'),rect=svg.getBoundingClientRect();
  const x=(event.clientX-rect.left)/rect.width*chartGeometry.width;
  return Math.max(0,Math.min(180,Math.round((x-chartGeometry.left)/(chartGeometry.right-chartGeometry.left)*180)));
}
$('#wealth-chart').addEventListener('pointermove',e=>{
  const m=hoverMonth(e),x=chartPosition(m,0).x,line=$('#chart-hover-line');
  line.setAttribute('x1',x);line.setAttribute('x2',x);line.setAttribute('opacity','1');
  const tooltip=$('#chart-tooltip');tooltip.hidden=false;
  tooltip.innerHTML=`<strong>${fullDate(m)} · ${(m/12).toFixed(1)} years</strong>${model.scenarios.map(s=>`<div><span>${dot(s.kind)}${NAMES[s.kind]}</span><b>${money(displayed(s.snapshots[m]))}</b></div>`).join('')}`;
  const rect=$('#chart-container').getBoundingClientRect();
  tooltip.style.left=Math.min(Math.max(0,e.clientX-rect.left+15),Math.max(0,rect.width-tooltip.offsetWidth))+'px';tooltip.style.right='auto';
});
$('#wealth-chart').addEventListener('pointerleave',()=>{$('#chart-tooltip').hidden=true;$('#chart-hover-line')?.setAttribute('opacity','0');});
$('#wealth-chart').addEventListener('click',e=>{settings.horizon=Math.max(5,Math.min(15,Math.round(hoverMonth(e)/12)));save();render();});
$('#wealth-chart').addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();settings.horizon=Math.max(5,Math.min(15,settings.horizon+(e.key==='ArrowRight'?1:-1)));save();render();}});

$('#share').addEventListener('click',async()=>{
  const encoded=btoa(unescape(encodeURIComponent(JSON.stringify({version:MODEL_VERSION,settings})))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const url=location.origin+location.pathname+'#s='+encoded;
  try{await navigator.clipboard.writeText(url);notify('Settings link copied. It contains your financial inputs; site access still applies.');}
  catch{const a=document.createElement('textarea');a.value=url;document.body.append(a);a.select();const ok=document.execCommand('copy');a.remove();notify(ok?'Settings link copied; site access still applies.':'Clipboard unavailable. Your settings are still saved on this device.');}
});
$('#download-csv').addEventListener('click',()=>{
  const headers=['Scenario','Months elapsed','Evaluation date','Net income','Housing costs','Living costs','One-off cash outflows','Monthly surplus','Mortgage balance','Property value','Government share owed','ISA','Taxable investments gross','Liquidation CGT estimate','Investments after tax','Net sale proceeds','Unfunded cash shortfall','Nominal net worth','Real net worth Oct 2026 GBP','Cumulative mortgage interest','Cumulative principal repaid','Cumulative new investments','Cumulative investment returns before tax','Cumulative dividend tax','Cumulative CGT on withdrawals','Cumulative unrecoverable housing costs','Reconciliation error'];
  const rows=[headers];
  for(const s of model.scenarios)for(const x of s.snapshots.slice(0,settings.horizon*12+1))rows.push([NAMES[s.kind],x.month,dateAt(x.month).toISOString().slice(0,10),x.month?x.pay.net:0,x.month?x.housing.total:0,x.month?x.housing.living:0,x.oneOff,x.cashflow,x.mortgage,x.value,x.government,x.isa,x.gia,x.terminalTax,x.investments,x.saleProceeds,x.unfunded,x.netWorth,x.realNetWorth,x.totals.mortgageInterest,x.totals.mortgagePrincipal,x.contributions,x.investmentGrowth,x.dividendTax,x.cgtPaid,x.unrecoverable,x.reconciliationError]);
  const csv='\uFEFF'+rows.map(row=>row.map(v=>typeof v==='number'?v.toFixed(4):'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='southwark-wealth-'+settings.horizon+'-years.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Monthly workings downloaded in nominal pounds, with a real-wealth column.');
});

$('#method-content').innerHTML=`
  <p>Three monthly balance sheets, with identical starting capital and employment income. The model begins <strong>1 September 2027</strong>. All prices, bills and income inputs refer to that start; there is no assumed saving or return before then.</p>
  <h3>How a month works</h3>
  <p>Salary rises on each September anniversary. English income tax and employee National Insurance are calculated on annualised pay, with optional salary-sacrifice pension and student-loan deductions. A fixed monthly calibration matches the entered starting take-home pay. During an income shock the calibration scales with retained pay. This is an annualised estimate, not a payroll or tax-return calculation; cumulative PAYE refunds and benefits are excluded.</p>
  <p>Investments earn the monthly equivalent of the effective annual total return before end-of-month contributions or withdrawals. An extra charge, if set, reduces the annual return multiplicatively. Rent, bills and property values compound monthly; annual salary steps are discrete. Mortgage interest uses annual quoted rate ÷ 12. A fixed-rate expiry changes the payment over the original remaining term.</p>
  <h3>What counts as wealth</h3>
  <p>Final wealth = property value − bank mortgage − government’s current equity share − sale and exit costs + ISA + taxable portfolio − estimated investment liquidation tax − unfunded spending. A negative sale balance remains a liability. Repaid mortgage principal appears once, as a lower mortgage balance. It is never charged again as a loss.</p>
  <p>Every plotted point assumes sale and investment liquidation on that date. A remortgage is charged only if the model continues into the following mortgage period. Both owners are assumed to occupy their home throughout and qualify for main-residence CGT relief. No lodger income, pension wealth, benefits or additional credit are modelled. Optional student loans are deductions from income, not conventional balance-sheet debts.</p>
  <h3>ISA and taxable investments</h3>
  <p>The starting portfolio is already inside a Stocks &amp; Shares ISA. Buying withdrawals reduce it; the remainder stays sheltered. Only new contributions use the £20,000 annual allowance. The monthly model resets that allowance in April, approximating the 6 April tax boundary. The “already used” input covers contributions before September. No flexible-ISA replacement or automatic bed-and-ISA tax optimisation is assumed.</p>
  <p>Excess new savings use a general investment account. The dividend yield is part of total return, not additional return. Estimated dividend tax is paid from the portfolio and net dividends increase pooled cost basis. Sales use proportional cost basis, the annual CGT exemption, income-linked rates and carried losses. Taxable assets are spent before ISA funds. Investment taxes are settled in the model as they accrue or on disposal; the timing differs from actual self-assessment. Tax bands use annualised current pay; other investment income, tax reliefs and the 30-day matching rule are excluded. Future rates and allowances are held at the entered values unless indexation is selected.</p>
  <h3>Real pounds, costs and shortfalls</h3>
  <p>“Today’s £” means <strong>28 October 2026 purchasing power</strong>. We deflate the terminal value using your inflation rate for both the interval to September 2027 and the selected holding period. Detailed cash-flow and ledger amounts stay nominal and are labelled. Real wealth does not imply an inflation guarantee.</p>
  <p>Service charges include building-level items where applicable; separate maintenance covers expected inside-flat expenditure and is expensed monthly. Major works are a net extra bill after reserves. Fixed sale, refinancing and equity-valuation allowances inflate from the start. Agency fees include VAT. One-off shock inputs are nominal bills at their selected future date. The model excludes unentered lease extensions, moving, furniture and property-specific building-safety costs: use the one-off inputs if relevant.</p>
  <p>If liquid funds run out, the path is flagged as unfinanceable. The unfunded amount is deducted as a liability to preserve the arithmetic; it is not an assumed credit facility. Later surplus first closes that gap. No borrowing interest is invented.</p>
  <h3>Your First Home: confirmed and provisional</h3>
  <p>The announced funding is a 20% equity loan, with a 2.5% minimum and 15% maximum buyer deposit. Interest is zero for five years, 1.5% in year six and 3% from year seven. We hold the later rate constant unless you edit escalation. Interest is charged on the original outstanding nominal loan, while redemption uses the outstanding percentage of current property value, sharing gains and falls symmetrically.</p>
  <p>Full eligibility, participating lenders/developers, valuation requirements, minimum partial repayments, repayment procedures and fees are not final. £350 redemption valuation/admin is an estimate, not an official fee. No developer participation fee is charged to the buyer. Only a full voluntary early repayment is available in this illustration; it spends liquid investments and can cause a funding failure. A single independent market value is assumed to equal the sale price. Approval is never inferred from the projection.</p>
  <h3>Sources &amp; starting estimates</h3>
  <p>Rules and sources checked <strong>28 October 2026</strong>. September 2027 is a future hypothetical start. Published 2027/28 tax bands are used where available; longer-term policies are assumptions. The +2% property growth, −15% new-build correction, 8% investments, 5% pay growth and 5.5% mortgage rate are editable scenarios, not research forecasts.</p>
  ${[
    ['Your First Home — GOV.UK','https://www.gov.uk/government/publications/your-first-home/your-first-home','Announced equity share, interest stages, value-linked repayment, provisional guidance and launch timeline.','Announced rules'],
    ['Budget 2026 — HM Treasury','https://www.gov.uk/government/publications/budget-2026-document/budget-2026-html','Maximum 15% deposit, London price/income caps and first loans expected April 2027.','Announced rules'],
    ['SDLT residential rates — HMRC','https://www.gov.uk/stamp-duty-land-tax/residential-property-rates','First-time buyers: 0% to £300,000; 5% to £500,000. Above £500,000, normal residential bands apply. £280k → £0; £350k → £2,500.','Published rules'],
    ['2026 Budget rates & allowances — HMRC','https://www.gov.uk/government/publications/budget-2026-overview-of-tax-legislation-and-rates-ootlar/annex-a-rates-and-allowances','2027/28 income tax 20/40/45%; NI 8/2%; ISA £20k; CGT 18/24% and £3k exemption; dividend allowance £500 and rates 10.75/35.75/39.35%. Future unchanged values are an extrapolation.','Published rules'],
    ['Student-loan deductions — HMRC','https://www.gov.uk/guidance/special-rules-for-student-loans','Published annual thresholds: Plans 1/2/4/5 £26,900/£29,385/£33,795/£25,000. 9% above threshold; postgraduate 6% above £21,000. Plan-specific future changes are not projected; use custom values.','Published rules'],
    ['Southwark council-tax bands','https://www.southwark.gov.uk/council-tax/how-much/bands-and-charges','2026/27 Band C £1,748.68; Band D £1,967.26. Bands for these hypothetical flats are estimates.','Published rates'],
    ['Southwark single-person discount','https://www.southwark.gov.uk/council-tax/get-money-your-council-tax-bill/single-person-discount','25% discount for an eligible single occupant. Applied to both hypothetical flats.','Published rules'],
    ['TPI Service Charge Index — London 2026','https://www.tpi.org.uk/media/nsqlsmvy/service-charge-index-london-cortile-2026-final-digital.pdf','402 estates and 20,828 leasehold homes. London mean £4,620/year; below 11m £4,070; under 25 years £3,328. Mostly 2026 budgets, not individual quotes. Starting £340/£275 estimates reflect these benchmarks; actual older buildings may cost much more.','Local benchmark'],
    ['Thames Water metered bills','https://www.thameswater.co.uk/help/water-meters/installing-meters-in-our-region','2026/27 single-occupant examples: £261 low, £450 medium, £743 high annually. £35/£30 monthly inputs are usage estimates.','Usage estimate'],
    ['Ofgem unit rates & standing charges','https://www.ofgem.gov.uk/your-energy-supply/your-energy-bill/energy-price-cap-unit-rates-and-standing-charges','Current tariffs inform the £105/£85 energy estimates. September 2027 tariffs and actual heating/communal systems are unknown.','Usage estimate'],
    ['Buying & mortgage costs — MoneyHelper','https://www.moneyhelper.org.uk/en/homes/buying-a-home/estimate-your-overall-buying-and-moving-costs','Mortgage fees often £1,000–£2,000+, surveys £400–£1,500, remortgaging £1,000+. £3,500 purchase and £1,000 refinancing allowances remain estimates. Contents insurance £11/month is illustrative.','Cost estimate'],
    ['Selling costs — MoneyHelper','https://www.moneyhelper.org.uk/en/homes/buying-a-home/selling-your-house-or-flat-england-wales-northern-ireland','£1,200 legal fees and 1.42% VAT-inclusive agency fee are modelling allowances; £300 other exit costs include an indicative leasehold pack/EPC.','Cost estimate'],
    ['Leasehold charges — GOV.UK','https://www.gov.uk/leasehold-property/service-charges-and-other-expenses','Communal repairs, insurance and reserve funds can already be inside service charges. Read the actual lease and accounts.','Published guidance'],
    ['Ground-rent reform — GOV.UK','https://www.gov.uk/guidance/leasehold-reform-ground-rent-act-2022','Most new regulated long residential leases from 30 June 2022 are limited to peppercorn ground rent. £0 new build assumes such a lease; older £10/month is provisional.','Published rules'],
    ['Southwark housing context — ONS','https://www.ons.gov.uk/visualisations/housingpriceslocal/E09000028/','Local flat prices are volatile. A short period of data is not a fifteen-year forecast; entered purchase prices are your targets. Full-flat rents are not used for your shared-room comparison.','Market context'],
  ].map(([name,url,note,tag])=>`<div class="source-entry"><a href="${url}" target="_blank" rel="noopener noreferrer">${name} ↗</a><span class="tag ${/estimate|benchmark|context/i.test(tag)?'estimate':''}">${tag}</span><p>${note}</p></div>`).join('')}
  <p>Tipping points scan for a crossing and refine it numerically; they are conditional on all other inputs, not probabilities. Break-even dates use the first monthly observation after a crossing. Stress tests are editable configurations, not predictions.</p>
`;

buildControls();save();render();
let resizeTimer;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(renderChart,100);});
window.addEventListener('hashchange',()=>{
  try{const shared=readSharedSettings();if(shared){settings=shared;currentShare=JSON.stringify(settings);activePreset='custom';save();render();notify('Shared settings applied.');}}
  catch{notify('This settings link could not be read. Your current inputs are unchanged.');}
});
