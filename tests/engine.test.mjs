import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,PRESETS,simulate,simulateScenario,mortgagePayment,amortisationStep,monthlyRate,stampDuty,equityLoanRepayment,governmentInterestRate,propertyValue,incomeForMonth,annualTakeHome,incomeTax,taxYear,realDeflator,normaliseConfig} from '../dist/engine.js';

const close=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} should equal ${expected} (±${tolerance})`);
const cfg=x=>({...DEFAULTS,...x});

test('repayment mortgage amortises to zero over the full original term',()=>{
  const loan=227500,rate=5.5,months=420,payment=mortgagePayment(loan,rate,months);
  close(payment,1221.71203523,.000001);
  let balance=loan,principal=0,interest=0;
  for(let m=0;m<months;m++){const s=amortisationStep(balance,payment,rate);balance=s.balance;principal+=s.principal;interest+=s.interest;}
  close(balance,0,1e-5);close(principal,loan,1e-5);close(principal+interest,payment*months,1e-5);
});
test('zero-interest mortgage has equal principal repayments',()=>{
  close(mortgagePayment(120000,0,120),1000);
  assert.deepEqual(amortisationStep(120000,1000,0),{payment:1000,interest:0,principal:1000,balance:119000});
});
test('effective annual investment returns compound correctly at monthly resolution',()=>{
  close(Math.pow(1+monthlyRate(8),12),1.08);
  const c=cfg({grossSalary:0,netMonthly:0,rent:0,rentCouncil:0,rentEnergy:0,rentWater:0,living:0});
  const s=simulateScenario('rent',c,60).snapshots[60];
  close(s.netWorth,75000*1.08**5,1e-6);close(s.contributions,0);close(s.cgtPaid+s.terminalTax+s.dividendTax,0);
});
test('contributions are invested at the end of the month, without immediate growth',()=>{
  const c=cfg({savings:0,netMonthly:1000,rent:0,rentCouncil:0,rentEnergy:0,rentWater:0,living:0});
  const s=simulateScenario('rent',c,2).snapshots;
  close(s[1].isa,1000);close(s[2].isa,1000*(1+monthlyRate(8))+1000);
});
test('first-time buyer SDLT handles relief, thresholds and loss of relief above £500k',()=>{
  for(const [p,t] of [[280000,0],[300000,0],[350000,2500],[500000,10000],[500001,15000.05],[600000,20000],[1000000,43750]])close(stampDuty(p),t);
  close(stampDuty(280000,false),4000);
});
test('new-build correction is cumulative, smooth and independent from later growth',()=>{
  close(propertyValue('new',60),297500);
  close(propertyValue('new',30),350000*Math.sqrt(.85));
  close(propertyValue('new',72),297500*1.02);
  close(propertyValue('old',60),280000*1.02**5);
});
test('equity loan shares property price losses and gains symmetrically',()=>{
  close(equityLoanRepayment(297500,20),59500);
  close(equityLoanRepayment(420000,20),84000);
  const s=simulateScenario('new',DEFAULTS,60).snapshots[60];
  close(s.government,59500);close(s.govValueChange,-10500);
});
test('government interest starts in month 61 and doubles in month 73, on original nominal amount',()=>{
  assert.equal(governmentInterestRate(60),0);assert.equal(governmentInterestRate(61),1.5);
  assert.equal(governmentInterestRate(72),1.5);assert.equal(governmentInterestRate(73),3);
  const s=simulateScenario('new',DEFAULTS,84).snapshots;
  close(s[60].totals.governmentInterest,0);close(s[61].housing.governmentInterest,87.5);
  close(s[72].totals.governmentInterest,1050);close(s[73].housing.governmentInterest,175);
  close(s[84].totals.governmentInterest,3150);
});
test('all scenarios allocate exactly the same initial capital without double-counting',()=>{
  const model=simulate(DEFAULTS,1);
  for(const s of model.scenarios){const f=s.funding;close(f.deposit+f.sdlt+f.buyFees+f.invested-f.unfunded,75000);}
  const n=model.scenarios[2].funding;
  close(n.deposit,52500);close(n.government,70000);close(n.mortgage,227500);close(n.invested,16500);
  close(n.deposit+n.government+n.mortgage,n.price);
  close(model.scenarios[1].funding.deposit,71500);
});
test('initial capital already inside an ISA is never counted against new subscription allowance',()=>{
  const c=cfg({netMonthly:5000,rent:0,rentCouncil:0,rentEnergy:0,rentWater:0,living:0,investmentReturn:0});
  const s=simulateScenario('rent',c,5).snapshots;
  close(s[1].isa,80000);close(s[4].isa,95000);close(s[4].gia,0);close(s[5].gia,5000);
});
test('ISA allowance resets at April boundary, not the purchase anniversary',()=>{
  assert.equal(taxYear(0),2027);assert.equal(taxYear(6),2027);assert.equal(taxYear(7),2028);
  const c=cfg({netMonthly:5000,rent:0,rentCouncil:0,rentEnergy:0,rentWater:0,living:0,investmentReturn:0,dividendYield:0});
  const s=simulateScenario('rent',c,8).snapshots;
  close(s[7].isaContributions,20000);close(s[7].giaContributions,15000);close(s[8].isaContributions,25000);
});
test('ISA used before the model starts reduces only first-year room',()=>{
  const c=cfg({netMonthly:2000,rent:0,rentCouncil:0,rentEnergy:0,rentWater:0,living:0,isaAlreadyUsed:19500,investmentReturn:0});
  const s=simulateScenario('rent',c,1).snapshots[1];
  close(s.isaContributions,500);close(s.giaContributions,1500);
});
test('taxable investment overflow pays dividends and liquidation CGT while ISA stays exempt',()=>{
  const c=cfg({isaAllowance:0,isaAlreadyUsed:0,dividendAllowance:0,cgtAllowance:0,netMonthly:7000,rent:0,rentCouncil:0,rentEnergy:0,rentWater:0,living:0});
  const s=simulateScenario('rent',c,120).snapshots[120];
  assert.ok(s.dividendTax>0);assert.ok(s.terminalTax>0);assert.ok(s.gia>0);close(s.isa,75000*1.08**10,1e-5);
  close(s.investments,s.isa+s.gia-s.terminalTax);
});
test('investment dividend yield is part of total return, not an additional return',()=>{
  const c=cfg({isaAllowance:0,dividendBasicRate:0,dividendHigherRate:0,dividendAdditionalRate:0,cgtBasicRate:0,cgtHigherRate:0,netMonthly:5000,rent:0,rentCouncil:0,rentEnergy:0,rentWater:0,living:0});
  const a=simulateScenario('rent',{...c,dividendYield:0},60).snapshots[60];
  const b=simulateScenario('rent',{...c,dividendYield:5},60).snapshots[60];close(a.netWorth,b.netWorth,1e-5);
});
test('income is calibrated exactly and gross growth is taxed progressively',()=>{
  close(incomeForMonth(1).net,3000);close(incomeForMonth(12).net,3000);
  const second=incomeForMonth(13);close(second.gross,52500);assert.ok(second.net>3000&&second.net<3000*1.05);
  const c=cfg({pensionPct:5,studentPlan:'plan2'});close(incomeForMonth(1,c).net,3000);
  assert.ok(annualTakeHome(45000,c).net<annualTakeHome(45000,DEFAULTS).net);
});
test('income tax tapers personal allowance and uses higher dividend bands',()=>{
  close(incomeTax(45000,0).tax,6486);
  close(incomeTax(110000,0).pa,7570);
  close(incomeTax(130000,0).pa,0);
  close(incomeTax(60000,1000).divTax,500*.3575);
});
test('no remortgage fee at a five-year sale; rate and fee change in month 61',()=>{
  const c=cfg({postFixRate:7});const s=simulateScenario('old',c,121).snapshots;
  close(s[60].totals.remortgage,0);close(s[60].rate,5.5);
  close(s[61].rate,7);close(s[61].totals.remortgage,1000*1.025**5);
  close(s[61].payment,mortgagePayment(s[60].mortgage,7,360));
  close(s[120].totals.remortgage,1000*1.025**5);assert.ok(s[121].totals.remortgage>s[120].totals.remortgage);
});
test('real net worth deflates exactly the same terminal balance sheet',()=>{
  const s=simulate(DEFAULTS,60);for(const scenario of s.scenarios){const x=scenario.snapshots[60];close(x.realNetWorth,x.netWorth/realDeflator(60));assert.ok(x.realNetWorth<x.netWorth);}
});
test('major works are spent once, at the chosen year-end, without inventing a reserve asset',()=>{
  const s=simulateScenario('old',cfg({oldMajorWorks:20000,majorWorksYear:4}),60).snapshots;
  close(s[47].totals.majorWorks,0);close(s[48].totals.majorWorks,20000);close(s[60].totals.majorWorks,20000);
  assert.ok(s[48].cashflow<-15000);
});
test('income disruption is identical in all scenarios and zero pay does not retain calibration',()=>{
  const c=cfg({disruptionStartMonth:13,disruptionMonths:3,incomeRetainedPct:0});
  const s=simulate(c,24);for(const scenario of s.scenarios){close(scenario.snapshots[13].pay.net,0);assert.ok(scenario.snapshots[16].pay.net>0);}
  close(s.scenarios[0].snapshots[24].totals.income,s.scenarios[2].snapshots[24].totals.income);
});
test('unfunded costs remain a visible liability and net worth can be negative',()=>{
  const c=cfg({savings:0,grossSalary:0,netMonthly:0,oldMajorWorks:50000,newMajorWorks:50000,living:1000});
  for(const s of simulate(c,60).scenarios){const x=s.snapshots[60];assert.notEqual(x.firstDepletion,null);assert.ok(x.unfunded>0);close(x.netWorth,x.saleProceeds+x.investments-x.unfunded);}
});
test('voluntary full government repayment spends investments and ends future interest',()=>{
  const c=cfg({govRepayYear:5,savings:200000});
  const s=simulateScenario('new',c,84).snapshots;
  close(s[60].totals.govCapitalRepaid,59500);close(s[60].government,0);close(s[61].housing.governmentInterest,0);close(s[84].government,0);
  close(s[60].govValueChange,-10500);
});
test('sale of an underwater home produces negative net sale proceeds, not a zero floor',()=>{
  const x=simulateScenario('new',cfg({newFiveYearChange:-50,savings:20000,newDepositPct:2.5}),60).snapshots[60];
  assert.ok(x.saleProceeds<0);close(x.netWorth,x.saleProceeds+x.investments-x.unfunded);
});
test('an all-cash older purchase does not charge a mortgage product fee',()=>{
  const f=simulateScenario('old',cfg({savings:400000}),1).funding;
  close(f.mortgage,0);close(f.buyFees,2500);close(f.deposit,280000);
});
test('invalid deposit overrides are clamped to the configured scheme limits',()=>{
  close(normaliseConfig({newDepositPct:99}).newDepositPct,15);
  close(normaliseConfig({newDepositPct:0}).newDepositPct,2.5);
  close(normaliseConfig({investmentReturn:-100}).investmentReturn,-50);
});
test('every monthly balance sheet reconciles independently under every stress preset',()=>{
  for(const [name,preset] of Object.entries(PRESETS))for(const s of simulate(cfg(preset.values)).scenarios)for(const x of s.snapshots){
    assert.ok(Number.isFinite(x.netWorth),`${name}/${s.kind}/${x.month} finite`);
    close(x.reconciliationError,0,0.0001);
    close(x.netWorth,x.saleProceeds+x.isa+x.gia-x.terminalTax-x.unfunded,.0001);
    close(s.funding.mortgage-x.totals.mortgagePrincipal,x.mortgage,.0001);
  }
});
test('reconciliation survives taxable withdrawals, early loan repayment, fees and depleted cash',()=>{
  const cases=[
    {isaAllowance:0,dividendAllowance:0,cgtAllowance:0,oldMajorWorks:50000,newMajorWorks:50000},
    {savings:25000,investmentReturn:-10,postFixRate:12,serviceGrowth:12,disruptionMonths:12},
    {govRepayYear:6,investmentReturn:12,oldMaxDeposit:false,oldDepositPct:10},
    {newFiveYearChange:25,oldGrowth:8,sellAgentPct:3,ercPct:3,fixedYears:7},
  ];
  for(const c of cases)for(const s of simulate(cfg(c)).scenarios)for(const x of s.snapshots)close(x.reconciliationError,0,.0001);
});
