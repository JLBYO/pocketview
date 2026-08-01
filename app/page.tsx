"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Tx = { id: string; date: string; description: string; amount: number; category: string };

const demo: Tx[] = [
  { id: "1", date: "2026-07-31", description: "Salary · Acme Studio", amount: 6240, category: "Income" },
  { id: "2", date: "2026-07-30", description: "Woolworths Metro", amount: -146.82, category: "Groceries" },
  { id: "3", date: "2026-07-29", description: "Domain Rent", amount: -2140, category: "Housing" },
  { id: "4", date: "2026-07-28", description: "Opal Travel", amount: -48.60, category: "Transport" },
  { id: "5", date: "2026-07-27", description: "The Grounds", amount: -62.40, category: "Dining" },
  { id: "6", date: "2026-07-25", description: "AGL Energy", amount: -184.30, category: "Bills" },
  { id: "7", date: "2026-07-24", description: "Spotify", amount: -13.99, category: "Subscriptions" },
  { id: "8", date: "2026-07-23", description: "Chemist Warehouse", amount: -38.50, category: "Health" },
  { id: "9", date: "2026-07-20", description: "Freelance payment", amount: 720, category: "Income" },
  { id: "10", date: "2026-07-18", description: "Bunnings", amount: -96.75, category: "Shopping" },
];

const budget: Record<string, number> = { Housing: 2300, Groceries: 700, Dining: 350, Transport: 240, Bills: 450, Shopping: 300, Health: 180, Subscriptions: 80 };
const colours: Record<string, string> = { Housing: "#625bf6", Groceries: "#22a06b", Dining: "#f08b3e", Transport: "#2f80ed", Bills: "#e6566f", Shopping: "#9b51e0", Health: "#20a4a8", Subscriptions: "#8390a5" };
const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);

function guessCategory(text: string) {
  const s = text.toLowerCase();
  if (/salary|payroll|payment received|deposit/.test(s)) return "Income";
  if (/rent|mortgage|domain/.test(s)) return "Housing";
  if (/woolworths|coles|aldi|iga|grocer/.test(s)) return "Groceries";
  if (/opal|uber|petrol|transport|metro/.test(s)) return "Transport";
  if (/restaurant|cafe|coffee|grounds|mcdonald|doordash/.test(s)) return "Dining";
  if (/agl|energy|telstra|optus|water|insurance/.test(s)) return "Bills";
  if (/spotify|netflix|apple.com|subscription/.test(s)) return "Subscriptions";
  if (/chemist|medical|health|pharmacy/.test(s)) return "Health";
  return "Shopping";
}

function parseCsv(csv: string): Tx[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("No transactions found");
  const split = (line: string) => line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(v => v.trim().replace(/^\"|\"$/g, ""));
  const headers = split(lines[0]).map(h => h.toLowerCase());
  const find = (...names: string[]) => headers.findIndex(h => names.some(n => h.includes(n)));
  const dateI = find("date"); const descI = find("description", "details", "narrative", "merchant");
  const amountI = find("amount"); const debitI = find("debit", "withdrawal"); const creditI = find("credit", "deposit");
  if (dateI < 0 || descI < 0 || (amountI < 0 && debitI < 0 && creditI < 0)) throw new Error("Couldn’t identify the date, description and amount columns");
  return lines.slice(1).map((line, i) => {
    const c = split(line); const clean = (v = "") => Number(v.replace(/[$,\s]/g, "")) || 0;
    const amount = amountI >= 0 ? clean(c[amountI]) : clean(c[creditI]) - Math.abs(clean(c[debitI]));
    return { id: `import-${Date.now()}-${i}`, date: c[dateI], description: c[descI] || "Transaction", amount, category: amount > 0 ? "Income" : guessCategory(c[descI]) };
  }).filter(t => t.amount !== 0);
}

export default function Home() {
  const [transactions, setTransactions] = useState<Tx[]>(demo);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("This month");
  const [notice, setNotice] = useState("");
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { const saved = localStorage.getItem("pocketview-transactions"); if (saved) setTransactions(JSON.parse(saved)); }, []);
  const totals = useMemo(() => {
    const income = transactions.filter(t => t.amount > 0).reduce((a, t) => a + t.amount, 0);
    const spend = Math.abs(transactions.filter(t => t.amount < 0).reduce((a, t) => a + t.amount, 0));
    return { income, spend, left: income - spend };
  }, [transactions]);
  const categorySpend = useMemo(() => Object.entries(budget).map(([name, limit]) => ({ name, limit, spent: Math.abs(transactions.filter(t => t.category === name && t.amount < 0).reduce((a, t) => a + t.amount, 0)) })).sort((a,b) => b.spent-a.spent), [transactions]);
  const filtered = transactions.filter(t => `${t.description} ${t.category}`.toLowerCase().includes(query.toLowerCase()));
  const importFile = async (f?: File) => {
    if (!f) return;
    try { const next = parseCsv(await f.text()); setTransactions(next); localStorage.setItem("pocketview-transactions", JSON.stringify(next)); setNotice(`${next.length} transactions imported securely on this device.`); }
    catch (e) { setNotice(e instanceof Error ? e.message : "That file could not be read."); }
  };

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brandmark">P</span><span>Pocketview</span></div>
      <nav aria-label="Main navigation">
        <button className="nav active"><span>⌂</span>Overview</button><button className="nav"><span>⇄</span>Transactions</button><button className="nav"><span>◎</span>Budgets</button><button className="nav"><span>◫</span>Accounts</button>
      </nav>
      <div className="sideBottom"><button className="nav"><span>?</span>Help & security</button><div className="profile"><div className="avatar">AM</div><div><b>Alex Morgan</b><small>Personal workspace</small></div><span>•••</span></div></div>
    </aside>

    <section className="content">
      <header><div><p className="eyebrow">SATURDAY, 1 AUGUST</p><h1>Your money, made clear.</h1><p className="sub">Here’s how July came together.</p></div><div className="actions"><select value={period} onChange={e=>setPeriod(e.target.value)} aria-label="Budget period"><option>This month</option><option>Last month</option><option>Last 3 months</option></select><button className="import" onClick={()=>file.current?.click()}>＋ Import ANZ CSV</button><input ref={file} type="file" accept=".csv,text/csv" hidden onChange={e=>importFile(e.target.files?.[0])}/></div></header>
      {notice && <div className="notice" role="status"><span>✓</span>{notice}<button onClick={()=>setNotice("")} aria-label="Dismiss">×</button></div>}

      <section className="heroGrid">
        <article className="balanceCard"><div className="cardTop"><span>Available after spending</span><span className="positive">↑ 12% vs June</span></div><div className="bigMoney">{money(totals.left)}</div><div className="bar"><i style={{width: `${Math.min(100, totals.income ? totals.spend/totals.income*100 : 0)}%`}}/></div><div className="balanceMeta"><div><small>INCOME</small><b>{money(totals.income)}</b></div><div><small>SPENT</small><b>{money(totals.spend)}</b></div><div><small>SAVINGS RATE</small><b>{totals.income ? Math.round(totals.left/totals.income*100) : 0}%</b></div></div></article>
        <article className="insight"><div className="spark">✦</div><div><small>MONTHLY INSIGHT</small><h3>You’re building momentum.</h3><p>You spent {money(Math.max(0, 5120-totals.spend))} less than your recent average. Groceries and dining made the biggest difference.</p><button onClick={()=>setQuery("Dining")}>See the detail →</button></div></article>
      </section>

      <section className="sectionHead"><div><h2>Where your money went</h2><p>Spending against your monthly plan</p></div><button>View budgets →</button></section>
      <section className="budgetGrid">
        {categorySpend.slice(0,4).map(c => <article className="budgetCard" key={c.name}><div className="budgetTitle"><span className="catIcon" style={{background: colours[c.name]}}>{c.name[0]}</span><div><b>{c.name}</b><small>{Math.round(c.spent/c.limit*100)}% of budget</small></div><span className={c.spent>c.limit ? "over" : ""}>{money(c.spent)}</span></div><div className="miniBar"><i style={{width:`${Math.min(100,c.spent/c.limit*100)}%`,background:colours[c.name]}}/></div><div className="budgetFoot"><span>{money(Math.max(0,c.limit-c.spent))} left</span><span>of {money(c.limit)}</span></div></article>)}
      </section>

      <section className="transactions">
        <div className="sectionHead"><div><h2>Recent transactions</h2><p>Your latest ANZ activity</p></div><label className="search">⌕<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search transactions"/></label></div>
        <div className="table" role="table"><div className="tr th" role="row"><span>DESCRIPTION</span><span>CATEGORY</span><span>DATE</span><span>AMOUNT</span></div>{filtered.slice(0,8).map(t=><div className="tr" role="row" key={t.id}><span className="merchant"><i>{t.description[0]}</i><b>{t.description}</b></span><span><em style={{background:`${colours[t.category] || "#8b96a8"}18`,color:colours[t.category] || "#657085"}}>{t.category}</em></span><span>{t.date}</span><span className={t.amount>0 ? "credit" : ""}>{t.amount>0?"+":""}{money(t.amount)}</span></div>)}</div>
      </section>
      <footer><span>Data shown here stays in this browser.</span><button onClick={()=>{setTransactions(demo);localStorage.removeItem("pocketview-transactions");setNotice("Demo data restored.")}}>Restore demo data</button></footer>
    </section>
  </main>;
}
