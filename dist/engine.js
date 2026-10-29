/* Pure monthly model. Currency stays unrounded internally; presentation rounds.
 * All scenarios start 1 September 2027. Returns occur before end-month cash flow.
 * Every snapshot is an after-sale / after-investment-liquidation balance sheet.
 */
export const MODEL_VERSION = 1;
export const START_YEAR = 2027;
export const START_MONTH = 8;
export const REAL_BASE_DATE = '2026-10-28';
const YEARS_TO_START = (Date.UTC(START_YEAR,START_MONTH,1)-Date.parse(REAL_BASE_DATE+'T00:00:00Z'))/(365.2425*86400000);
export function realDeflator(month,c=DEFAULTS) {return Math.pow(1+c.inflation/100,month/12+YEARS_TO_START);}
export const DEFAULTS = Object.freeze({
  horizon: 5, investmentReturn: 8, investmentFee: 0, dividendYield: 2,
  salaryGrowth: 5, rentGrowth: 3, oldGrowth: 2, newFiveYearChange: -15,
  newLaterGrowth: 2, mortgageRate: 5.5, postFixRate: 5.5,
  serviceGrowth: 4, inflation: 2.5, groundGrowth: 0, taxThresholdGrowth: 0,
  savings: 75000, grossSalary: 50000, netMonthly: 3000, calibrateNet: true,
  pensionPct: 0, studentPlan: 'none', studentThreshold: 29385, studentRate: 9,
  postgrad: false, postgradThreshold: 21000,
  disruptionStartMonth: 37, disruptionMonths: 0, incomeRetainedPct: 0,
  lenderMultiple: 4.5, oldPrice: 280000, newPrice: 350000,
  oldMaxDeposit: true, oldDepositPct: 35, newDepositPct: 15,
  mortgageYears: 35, fixedYears: 5, refixYears: 5,
  remortgageFee: 1000, ercPct: 0, mortgageExitFee: 0,
  govShare: 20, govMinDeposit: 2.5, govMaxDeposit: 15,
  govFreeYears: 5, govYearSixRate: 1.5, govLaterRate: 3,
  govLaterStartYear: 7, govAnnualEscalation: 0, govRepayYear: 0,
  govValuationFee: 350,
  rent: 1000, rentCouncil: 75, rentEnergy: 75, rentWater: 25, rentInsurance: 0,
  oldCouncil: 1748.68, newCouncil: 1967.26, singleDiscount: 25,
  oldEnergy: 105, newEnergy: 85, oldWater: 35, newWater: 30,
  oldService: 340, newService: 275, oldGround: 10, newGround: 0,
  oldMaintenance: 64, newMaintenance: 39, oldInsurance: 11, newInsurance: 11,
  living: 900, oldMajorWorks: 0, newMajorWorks: 0, majorWorksYear: 4,
  oldExtraCost: 0, newExtraCost: 0, extraCostYear: 1,
  buyLegal: 1750, buySurvey: 500, buyMortgageFee: 1000, buyOther: 250,
  sellAgentPct: 1.42, sellLegal: 1200, sellOther: 300,
  sdltAutomatic: true, oldSdltOverride: 0, newSdltOverride: 2500,
  isaAllowance: 20000, isaAlreadyUsed: 0, dividendAllowance: 500,
  cgtAllowance: 3000, cgtBasicRate: 18, cgtHigherRate: 24,
  dividendBasicRate: 10.75, dividendHigherRate: 35.75, dividendAdditionalRate: 39.35,
});

export const PRESETS = {
  base: { label: 'Base case', description: 'Your finances, with London leasehold cost estimates.', values: {} },
  crash: { label: 'Property downturn', description: 'Older −3% a year; new build −30% in five years, then flat; 6.5% mortgages.', values: {oldGrowth:-3,newFiveYearChange:-30,newLaterGrowth:0,mortgageRate:6.5,postFixRate:6.5} },
  property: { label: 'Strong property', description: 'Older +5%; new build +5% over five years, then +5%; rates ease.', values: {oldGrowth:5,newFiveYearChange:5,newLaterGrowth:5,mortgageRate:4.5,postFixRate:4} },
  weakStocks: { label: 'Weak investments', description: 'A 3% nominal annual total investment return.', values: {investmentReturn:3} },
  strongStocks: { label: 'Strong investments', description: 'A 12% nominal annual total investment return.', values: {investmentReturn:12} },
  rates: { label: 'Higher rates', description: '6.5% initially and 8% on refinancing.', values: {mortgageRate:6.5,postFixRate:8} },
  costs: { label: 'Housing cost shock', description: '£600/£450 service charges, +10% a year; £20k older-flat works in year four.', values: {oldService:600,newService:450,serviceGrowth:10,oldMajorWorks:20000,majorWorksYear:4,remortgageFee:2000} },
  stress: { label: 'Financial stress', description: '1% pay growth, three unpaid months in year four, 3% investments, 7% refinancing.', values: {salaryGrowth:1,disruptionStartMonth:37,disruptionMonths:3,incomeRetainedPct:0,investmentReturn:3,postFixRate:7,serviceGrowth:7} },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function normaliseConfig(input = {}) {
  const c = {...DEFAULTS};
  for (const key of Object.keys(DEFAULTS)) {
    if (typeof DEFAULTS[key] === 'number') {
      if (Number.isFinite(Number(input[key]))) c[key] = Number(input[key]);
    } else if (typeof DEFAULTS[key] === 'boolean') {
      if (typeof input[key] === 'boolean') c[key] = input[key];
    } else if (typeof input[key] === 'string') c[key] = input[key];
  }
  for (const key of Object.keys(c)) {
    if (typeof c[key] === 'number') c[key] = clamp(c[key], 0, 10000000);
  }
  for (const key of ['investmentReturn','salaryGrowth','rentGrowth','oldGrowth','newLaterGrowth','serviceGrowth','inflation','groundGrowth','taxThresholdGrowth']) {
    c[key] = clamp(Number.isFinite(Number(input[key])) ? Number(input[key]) : DEFAULTS[key], -50, 50);
  }
  c.newFiveYearChange = clamp(Number.isFinite(Number(input.newFiveYearChange)) ? Number(input.newFiveYearChange) : DEFAULTS.newFiveYearChange, -90, 100);
  c.horizon = Math.round(clamp(c.horizon,5,15));
  c.mortgageYears = Math.round(clamp(c.mortgageYears,5,40));
  c.fixedYears = Math.round(clamp(c.fixedYears,1,15));
  c.refixYears = Math.round(clamp(c.refixYears,1,15));
  c.mortgageRate = clamp(c.mortgageRate,0,25);
  c.postFixRate = clamp(c.postFixRate,0,25);
  c.oldPrice = Math.max(10000,c.oldPrice); c.newPrice = Math.max(10000,c.newPrice);
  c.govShare = clamp(c.govShare,0,40);
  c.govMinDeposit = clamp(c.govMinDeposit,0,40);
  c.govMaxDeposit = clamp(c.govMaxDeposit,c.govMinDeposit,80-c.govShare);
  c.newDepositPct = clamp(c.newDepositPct,c.govMinDeposit,c.govMaxDeposit);
  for (const k of ['pensionPct','singleDiscount','incomeRetainedPct','oldDepositPct']) c[k] = clamp(c[k],0,100);
  c.investmentFee = clamp(c.investmentFee,0,10);
  c.dividendYield = clamp(c.dividendYield,0,15);
  c.govFreeYears = Math.round(clamp(c.govFreeYears,0,14));
  c.govLaterStartYear = Math.round(clamp(c.govLaterStartYear,c.govFreeYears+2,30));
  c.govRepayYear = Math.round(clamp(c.govRepayYear,0,15));
  c.isaAlreadyUsed = Math.min(c.isaAlreadyUsed,c.isaAllowance);
  c.disruptionStartMonth = Math.round(clamp(c.disruptionStartMonth,1,180));
  c.disruptionMonths = Math.round(clamp(c.disruptionMonths,0,60));
  c.majorWorksYear = Math.round(clamp(c.majorWorksYear,1,15));
  c.extraCostYear = Math.round(clamp(c.extraCostYear,1,15));
  if (!['none','plan1','plan2','plan4','plan5','custom'].includes(c.studentPlan)) c.studentPlan='none';
  return c;
}

export function monthlyRate(effectiveAnnualPercent) { return Math.pow(1+effectiveAnnualPercent/100,1/12)-1; }
export function mortgagePayment(principal,annualPercent,months) {
  if (principal<=0 || months<=0) return 0;
  const r=annualPercent/1200;
  return r===0 ? principal/months : principal*r/(-Math.expm1(-months*Math.log1p(r)));
}
export function amortisationStep(balance,payment,annualPercent) {
  const interest=balance*annualPercent/1200;
  const paid=Math.min(payment,balance+interest);
  const principal=Math.max(0,paid-interest);
  return {payment:paid,interest,principal,balance:Math.max(0,balance-principal)};
}

export function stampDuty(price,firstTimeBuyer=true) {
  if (firstTimeBuyer && price<=500000) return Math.max(0,price-300000)*0.05;
  const limits=[125000,250000,925000,1500000,Infinity], rates=[0,0.02,0.05,0.10,0.12];
  let tax=0,previous=0;
  for(let i=0;i<limits.length;i++) {tax+=Math.max(0,Math.min(price,limits[i])-previous)*rates[i];previous=limits[i];}
  return tax;
}

export function taxYear(monthIndex) {
  const d=new Date(Date.UTC(START_YEAR,START_MONTH+monthIndex,1));
  return d.getUTCFullYear()-(d.getUTCMonth()<3?1:0); // monthly April boundary; see methodology
}
export function dateAt(months) {return new Date(Date.UTC(START_YEAR,START_MONTH+months,1));}
function taxBands(c,year=START_YEAR) {
  const f=Math.pow(1+c.taxThresholdGrowth/100,year-START_YEAR);
  return {pa:12570*f,basic:37700*f,additional:125140*f,taper:100000*f,niLower:12570*f,niUpper:50270*f};
}
function progressive(value,basic,upper,rates) {
  return Math.min(value,basic)*rates[0]+Math.max(0,Math.min(value,upper)-basic)*rates[1]+Math.max(0,value-upper)*rates[2];
}
export function incomeTax(employment,dividends,c=DEFAULTS,year=START_YEAR) {
  const b=taxBands(c,year);
  const pa=Math.max(0,b.pa-Math.max(0,employment+dividends-b.taper)/2);
  const earnedTaxable=Math.max(0,employment-pa);
  const earnedTax=progressive(earnedTaxable,b.basic,b.additional-pa,[0.2,0.4,0.45]);
  const divTaxable=Math.max(0,dividends-Math.max(0,pa-employment));
  const allowance=Math.min(c.dividendAllowance,divTaxable);
  const end=earnedTaxable+divTaxable, start=earnedTaxable+allowance;
  const divRates=[c.dividendBasicRate/100,c.dividendHigherRate/100,c.dividendAdditionalRate/100];
  const divTax=progressive(end,b.basic,b.additional-pa,divRates)-progressive(start,b.basic,b.additional-pa,divRates);
  return {tax:earnedTax+divTax,earnedTax,divTax,pa,taxableIncome:earnedTaxable+divTaxable};
}
export function annualTakeHome(gross,c=DEFAULTS,year=START_YEAR) {
  const salary=Math.max(0,gross*(1-c.pensionPct/100)); // salary sacrifice assumption
  const b=taxBands(c,year);
  const ni=Math.max(0,Math.min(salary,b.niUpper)-b.niLower)*0.08+Math.max(0,salary-b.niUpper)*0.02;
  const thresholds={plan1:26900,plan2:29385,plan4:33795,plan5:25000,custom:c.studentThreshold};
  const threshold=thresholds[c.studentPlan]??0;
  const student=c.studentPlan==='none'?0:Math.max(0,salary-threshold)*(c.studentPlan==='custom'?c.studentRate:9)/100;
  const postgrad=c.postgrad?Math.max(0,salary-c.postgradThreshold)*0.06:0;
  const tax=incomeTax(salary,0,c,year).tax;
  return {net:Math.max(0,salary-tax-ni-student-postgrad),tax,ni,student,postgrad,pension:gross-salary,taxSalary:salary};
}
export function incomeForMonth(month,c=DEFAULTS) {
  const elapsed=Math.floor((month-1)/12),year=taxYear(month-1);
  const baseGross=c.grossSalary*Math.pow(1+c.salaryGrowth/100,elapsed);
  const disrupted=month>=c.disruptionStartMonth && month<c.disruptionStartMonth+c.disruptionMonths;
  const retained=disrupted?c.incomeRetainedPct/100:1;
  const gross=baseGross*retained;
  const pay=annualTakeHome(gross,c,year);
  const calibration=c.calibrateNet?c.netMonthly-annualTakeHome(c.grossSalary,c,START_YEAR).net/12:0;
  return {...pay,gross,grossMonthly:gross/12,net:Math.max(0,pay.net/12+calibration*retained),calibration,year,disrupted};
}

export function governmentInterestRate(month,c=DEFAULTS) {
  const year=Math.floor((month-1)/12)+1;
  if(year<=c.govFreeYears)return 0;
  if(year<c.govLaterStartYear)return c.govYearSixRate;
  return c.govLaterRate*Math.pow(1+c.govAnnualEscalation/100,year-c.govLaterStartYear);
}
export function propertyValue(kind,month,c=DEFAULTS) {
  if(kind==='rent')return 0;
  if(kind==='old')return c.oldPrice*Math.pow(1+c.oldGrowth/100,month/12);
  return c.newPrice*Math.pow(1+c.newFiveYearChange/100,Math.min(month,60)/60)*Math.pow(1+c.newLaterGrowth/100,Math.max(0,month-60)/12);
}
export const equityLoanRepayment=(value,sharePercent)=>value*sharePercent/100;

function initialFunding(kind,c) {
  if(kind==='rent')return {price:0,deposit:0,government:0,mortgage:0,sdlt:0,buyFees:0,invested:c.savings,unfunded:0,valid:true};
  const price=kind==='old'?c.oldPrice:c.newPrice;
  const sdlt=c.sdltAutomatic?stampDuty(price):c[kind+'SdltOverride'];
  const nonMortgageFees=c.buyLegal+c.buySurvey+c.buyOther;
  const needsMortgage=kind==='new'||!c.oldMaxDeposit&&c.oldDepositPct<100||c.savings<price+sdlt+nonMortgageFees;
  const buyFees=nonMortgageFees+(needsMortgage?c.buyMortgageFee:0);
  const available=Math.max(0,c.savings-sdlt-buyFees);
  const requested=kind==='old'?(c.oldMaxDeposit?available:price*c.oldDepositPct/100):price*c.newDepositPct/100;
  const government=kind==='new'?price*c.govShare/100:0;
  const deposit=Math.min(available,requested,price-government);
  const mortgage=price-deposit-government;
  const invested=Math.max(0,c.savings-deposit-sdlt-buyFees);
  const unfunded=Math.max(0,sdlt+buyFees-c.savings);
  const minDeposit=price*(kind==='new'?c.govMinDeposit:5)/100;
  return {price,deposit,government,mortgage,sdlt,buyFees,invested,unfunded,valid:deposit+1e-6>=minDeposit&&unfunded===0};
}

function cgtLiability(gains,employment,dividends,losses,c,year) {
  const taxable=Math.max(0,gains-c.cgtAllowance-losses);
  const basicRoom=Math.max(0,taxBands(c,year).basic-incomeTax(employment,dividends,c,year).taxableIncome);
  return Math.min(taxable,basicRoom)*c.cgtBasicRate/100+Math.max(0,taxable-basicRoom)*c.cgtHigherRate/100;
}

class Portfolio {
  constructor(initial,c) {
    this.c=c;this.isa=initial;this.gia=0;this.basis=0;
    this.year=START_YEAR;this.isaUsed=c.isaAlreadyUsed;
    this.dividends=0;this.divTaxThisYear=0;this.gains=0;this.cgtThisYear=0;this.losses=0;
    this.contributions=0;this.isaContributions=0;this.giaContributions=0;this.withdrawals=0;
    this.growth=0;this.divTax=0;this.cgt=0;this.overflowMonth=null;
  }
  beginYear(year) {
    if(year===this.year)return;
    const carryUsed=Math.min(this.losses,Math.max(0,this.gains-this.c.cgtAllowance));
    this.losses=Math.max(0,this.losses-carryUsed)+Math.max(0,-this.gains);
    this.year=year;this.isaUsed=0;this.dividends=0;this.divTaxThisYear=0;this.gains=0;this.cgtThisYear=0;
  }
  accrue(pay) {
    const c=this.c;
    const r=Math.pow((1+c.investmentReturn/100)*(1-c.investmentFee/100),1/12)-1;
    const returnAmount=(this.isa+this.gia)*r;
    const dividends=this.gia*monthlyRate(c.dividendYield);
    this.isa*=1+r;
    this.gia*=1+r;
    this.dividends+=dividends;
    // Incremental income tax includes dividend bands and any loss of personal allowance.
    const total=incomeTax(pay.taxSalary,this.dividends,c,this.year).tax-incomeTax(pay.taxSalary,0,c,this.year).tax;
    const tax=total-this.divTaxThisYear;
    this.divTaxThisYear=total;this.divTax+=tax;
    this.gia=Math.max(0,this.gia-tax);
    this.basis+=dividends-tax;
    this.growth+=returnAmount;
  }
  contribute(amount,month) {
    const toIsa=Math.min(amount,Math.max(0,this.c.isaAllowance-this.isaUsed));
    const toGia=amount-toIsa;
    this.isa+=toIsa;this.isaUsed+=toIsa;this.gia+=toGia;this.basis+=toGia;
    this.contributions+=amount;this.isaContributions+=toIsa;this.giaContributions+=toGia;
    if(toGia>1e-6&&this.overflowMonth===null)this.overflowMonth=month;
  }
  withdraw(required,pay) {
    let net=0;
    // Spend taxable investments first, preserving the non-flexible ISA wrapper.
    if(this.gia>1e-9) {
      const before=this.gia;
      const taxFor=(sale)=>cgtLiability(this.gains+sale*(1-this.basis/before),pay.taxSalary,this.dividends,this.losses,this.c,this.year)-this.cgtThisYear;
      const fullCash=before-taxFor(before);
      let sale=before;
      if(fullCash>required) {
        let lo=0,hi=before;
        for(let j=0;j<36;j++){const mid=(lo+hi)/2;if(mid-taxFor(mid)>required)hi=mid;else lo=mid;}
        sale=(lo+hi)/2;
      }
      const basisSold=this.basis*sale/before;
      const tax=taxFor(sale);
      this.gains+=sale-basisSold;this.cgtThisYear+=tax;this.cgt+=tax;
      this.gia=Math.max(0,before-sale);this.basis=Math.max(0,this.basis-basisSold);
      net=sale-tax;
    }
    const isaSpend=Math.min(Math.max(0,required-net),this.isa);
    this.isa-=isaSpend;net+=isaSpend;this.withdrawals+=net;
    return Math.max(0,required-net);
  }
  terminalTax(pay) {
    return Math.max(0,cgtLiability(this.gains+this.gia-this.basis,pay.taxSalary,this.dividends,this.losses,this.c,this.year)-this.cgtThisYear);
  }
}

export function housingForMonth(kind,month,c,mortgage=0,governmentInterest=0) {
  const elapsed=(month-1)/12,gen=Math.pow(1+c.inflation/100,elapsed);
  const owner=kind!=='rent';
  const rent=owner?0:c.rent*Math.pow(1+c.rentGrowth/100,elapsed);
  const council=owner?c[kind+'Council']*(1-c.singleDiscount/100)/12*gen:c.rentCouncil*gen;
  const energy=c[owner?kind+'Energy':'rentEnergy']*gen;
  const water=c[owner?kind+'Water':'rentWater']*gen;
  const service=owner?c[kind+'Service']*Math.pow(1+c.serviceGrowth/100,elapsed):0;
  const ground=owner?c[kind+'Ground']*Math.pow(1+c.groundGrowth/100,elapsed):0;
  const maintenance=owner?c[kind+'Maintenance']*gen:0;
  const insurance=c[owner?kind+'Insurance':'rentInsurance']*gen;
  const living=c.living*gen;
  const total=rent+mortgage+governmentInterest+council+energy+water+service+ground+maintenance+insurance;
  return {rent,mortgage,governmentInterest,council,energy,water,service,ground,maintenance,insurance,living,total};
}

export function simulateScenario(kind,config={},months=180) {
  const c=normaliseConfig(config),funding=initialFunding(kind,c),owner=kind!=='rent';
  const p=new Portfolio(funding.invested,c);
  const originalMortgage=funding.mortgage;
  let balance=originalMortgage,payment=mortgagePayment(balance,c.mortgageRate,c.mortgageYears*12),rate=c.mortgageRate;
  let unfunded=funding.unfunded,firstDepletion=unfunded>0?0:null,minSurplus=Infinity;
  let govShare=kind==='new'?c.govShare:0,govNominal=funding.government;
  const totals={income:0,living:0,mortgageInterest:0,mortgagePrincipal:0,mortgagePayments:0,governmentInterest:0,
    rent:0,council:0,energy:0,water:0,service:0,ground:0,maintenance:0,insurance:0,
    majorWorks:0,extraCosts:0,remortgage:0,govCapitalRepaid:0,govFeesPaid:0};
  const snapshots=[];
  let lastPay=incomeForMonth(1,c), lastHousing=housingForMonth(kind,1,c,payment,0);
  let lastStep={interest:0,principal:0};
  function snapshot(month,cashflow=0,oneOff=0) {
    const value=propertyValue(kind,month,c);
    const government=equityLoanRepayment(value,govShare);
    const inflator=Math.pow(1+c.inflation/100,month/12);
    const saleAgent=owner?value*c.sellAgentPct/100:0;
    const saleLegal=owner?c.sellLegal*inflator:0;
    const saleOther=owner?c.sellOther*inflator:0;
    const govFee=government>0?c.govValuationFee*inflator:0;
    const exitFee=owner&&balance>1e-7?c.mortgageExitFee*inflator:0;
    const fixed=c.fixedYears*12,refix=c.refixYears*12;
    const insideFix=month<fixed||(month>fixed&&(month-fixed)%refix!==0);
    const erc=owner&&insideFix?balance*c.ercPct/100:0;
    const saleCosts=saleAgent+saleLegal+saleOther+govFee+exitFee+erc;
    const saleProceeds=value-balance-government-saleCosts;
    const terminalTax=p.terminalTax(lastPay);
    const investments=p.isa+p.gia-terminalTax;
    const netWorth=saleProceeds+investments-unfunded;
    const govValueChange=totals.govCapitalRepaid+government-funding.government;
    const operating=totals.rent+totals.council+totals.energy+totals.water+totals.service+totals.ground+totals.maintenance+totals.insurance+totals.majorWorks+totals.extraCosts+totals.remortgage+totals.govFeesPaid;
    const unrecoverable=operating+totals.mortgageInterest+totals.governmentInterest+funding.sdlt+funding.buyFees+saleCosts;
    const reconstructed=c.savings+totals.income+p.growth+(value-funding.price)-govValueChange-totals.living-unrecoverable-p.divTax-p.cgt-terminalTax;
    return {month,year:month/12,netWorth,realNetWorth:netWorth/realDeflator(month,c),value,mortgage:balance,government,govShare,
      saleProceeds,saleCosts,saleAgent,saleLegal,saleOther,govFee,exitFee,erc,
      isa:p.isa,gia:p.gia,giaBasis:p.basis,investments,terminalTax,unfunded,
      cash:0,cashflow,oneOff,payment,rate,mortgageInterestThisMonth:lastStep.interest,mortgagePrincipalThisMonth:lastStep.principal,housing:{...lastHousing},pay:{...lastPay},
      contributions:p.contributions,isaContributions:p.isaContributions,giaContributions:p.giaContributions,
      withdrawals:p.withdrawals,investmentGrowth:p.growth,dividendTax:p.divTax,cgtPaid:p.cgt,
      unrecoverable,govValueChange,totals:{...totals},reconciliationError:netWorth-reconstructed,
      firstDepletion,minSurplus:Number.isFinite(minSurplus)?minSurplus:0,overflowMonth:p.overflowMonth};
  }
  snapshots.push(snapshot(0));
  for(let month=1;month<=months;month++) {
    const pay=incomeForMonth(month,c);lastPay=pay;p.beginYear(pay.year);p.accrue(pay);
    let remortgage=0;
    const fixedMonths=c.fixedYears*12,refixMonths=c.refixYears*12;
    if(owner&&balance>1e-7&&month>fixedMonths&&(month-fixedMonths-1)%refixMonths===0) {
      rate=c.postFixRate;
      payment=mortgagePayment(balance,rate,c.mortgageYears*12-(month-1));
      remortgage=c.remortgageFee*Math.pow(1+c.inflation/100,(month-1)/12);
    }
    const step=amortisationStep(balance,payment,rate);balance=step.balance;lastStep=step;
    const govInterest=govNominal*governmentInterestRate(month,c)/1200;
    const housing=housingForMonth(kind,month,c,step.payment,govInterest);lastHousing=housing;
    const majorWorks=owner&&month===c.majorWorksYear*12?c[kind+'MajorWorks']:0;
    const extraCosts=owner&&month===c.extraCostYear*12?c[kind+'ExtraCost']:0;
    let govCapital=0,govFee=0;
    if(kind==='new'&&govShare>0&&c.govRepayYear>0&&month===c.govRepayYear*12) {
      govCapital=equityLoanRepayment(propertyValue(kind,month,c),govShare);
      govFee=c.govValuationFee*Math.pow(1+c.inflation/100,month/12);
      govShare=0;govNominal=0;
    }
    const oneOff=remortgage+majorWorks+extraCosts+govCapital+govFee;
    const surplus=pay.net-housing.total-housing.living-oneOff;
    minSurplus=Math.min(minSurplus,surplus);
    if(surplus>=0) {
      const recover=Math.min(unfunded,surplus);unfunded-=recover;
      p.contribute(surplus-recover,month);
    } else {
      const shortage=p.withdraw(-surplus,pay);
      if(shortage>1e-5){unfunded+=shortage;if(firstDepletion===null)firstDepletion=month;}
    }
    totals.income+=pay.net;totals.living+=housing.living;
    totals.mortgageInterest+=step.interest;totals.mortgagePrincipal+=step.principal;totals.mortgagePayments+=step.payment;
    totals.governmentInterest+=govInterest;totals.majorWorks+=majorWorks;totals.extraCosts+=extraCosts;totals.remortgage+=remortgage;
    totals.govCapitalRepaid+=govCapital;totals.govFeesPaid+=govFee;
    for(const k of ['rent','council','energy','water','service','ground','maintenance','insurance'])totals[k]+=housing[k];
    snapshots.push(snapshot(month,surplus,oneOff));
  }
  const multiple=funding.mortgage/(c.grossSalary||1);
  return {kind,funding,snapshots,multiple,initialPayment:mortgagePayment(originalMortgage,c.mortgageRate,c.mortgageYears*12)};
}

export function simulate(config={},months=180) {
  const c=normaliseConfig(config);
  const scenarios=['rent','old','new'].map(kind=>simulateScenario(kind,c,months));
  return {config:c,scenarios};
}

export function rankings(model,year=model.config.horizon) {
  return model.scenarios.map(s=>({kind:s.kind,...s.snapshots[Math.min(s.snapshots.length-1,Math.round(year*12))]})).sort((a,b)=>b.netWorth-a.netWorth);
}

export function breakEvens(model,fromYear=5,toYear=15) {
  const out=[];
  for(const [a,b] of [[0,1],[0,2],[1,2]]) {
    const sa=model.scenarios[a],sb=model.scenarios[b];
    const crossings=[];
    for(let m=fromYear*12+1;m<=Math.min(toYear*12,sa.snapshots.length-1);m++) {
      const prev=sa.snapshots[m-1].netWorth-sb.snapshots[m-1].netWorth;
      const next=sa.snapshots[m].netWorth-sb.snapshots[m].netWorth;
      if((prev<0&&next>=0)||(prev>0&&next<=0))crossings.push({month:m,leader:next>=0?sa.kind:sb.kind});
    }
    out.push({a:sa.kind,b:sb.kind,crossings,leaderAtStart:sa.snapshots[fromYear*12].netWorth>=sb.snapshots[fromYear*12].netWorth?sa.kind:sb.kind});
  }
  return out;
}

// Find the first observed sign change, then bisect. Tax thresholds can introduce kinks.
export function threshold(config,key,targetKind,min,max,steps=16) {
  const c=normaliseConfig(config),month=c.horizon*12;
  const difference=(v)=>{
    const cfg={...c,[key]:v};
    const rent=simulateScenario('rent',cfg,month).snapshots[month].netWorth;
    const owner=simulateScenario(targetKind,cfg,month).snapshots[month].netWorth;
    return rent-owner;
  };
  let a=min,fa=difference(a);
  for(let i=1;i<=steps;i++) {
    const b=min+(max-min)*i/steps,fb=difference(b);
    if(fa===0)return a;
    if(fa*fb<=0) {
      let lo=a,hi=b,flo=fa;
      for(let j=0;j<23;j++){const mid=(lo+hi)/2,fmid=difference(mid);if(flo*fmid<=0)hi=mid;else{lo=mid;flo=fmid;}}
      return (lo+hi)/2;
    }
    a=b;fa=fb;
  }
  return null;
}
