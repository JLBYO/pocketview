"use client";
import { useEffect, useMemo, useRef, useState } from "react";
type Tx = {
    id: string;
    date: string;
    amount: number;
    description: string;
    merchant: string;
    note: string;
    category: string;
    detail: string;
};
type Rule = {
    match: string;
    merchant: string;
    category: string;
    detail: string;
};
const categories = ["Food", "Personal", "Car", "Streaming", "Bills", "Inbound TFR", "Outbound TFR", "Unclassified"];
const budget: Record<string, number> = { Food: 1050, Personal: 950, Car: 700, Streaming: 120, Bills: 650 };
const colours: Record<string, string> = { Food: "#22a06b", Personal: "#9b51e0", Car: "#2f80ed", Streaming: "#8390a5", Bills: "#e6566f", "Inbound TFR": "#13a168", "Outbound TFR": "#f08b3e", Unclassified: "#a2a9b5" };
const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
const reviewNeeded = (t: Tx) => !t.merchant.trim() || t.category === "Unclassified" || !t.detail.trim();
const dateKey = (value: string) => { const p = value.split(/[\/-]/).map(Number); return p[0] > 1900 ? p[0] * 10000 + p[1] * 100 + p[2] : p[2] * 10000 + p[1] * 100 + p[0]; };
const ruleMatches = (t: Tx, r: Rule) => { const source = `${t.merchant} ${t.description}`.toLowerCase(); return source.includes(r.match) || r.match.includes(t.merchant.toLowerCase()); };
function merchant(s: string) { return s.replace(/^(VISA DEBIT PURCHASE CARD \d+|EFTPOS|ANZ INTERNET BANKING BPAY|ANZ MOBILE BANKING PAYMENT \d+ TO|PAYMENT (TO|FROM))\s*/i, "").replace(/\s+\{?\d{5,}\}?\s*$/g, "").replace(/\s{2,}.+$/, "").trim() || s; }
function classify(s: string, a: number) { s = s.toLowerCase(); if (a > 0 && /salary|payroll|payment from/.test(s))
    return "Inbound TFR"; if (a < 0 && /payment (to|\d+ to)/.test(s))
    return "Outbound TFR"; if (/woolworth|coles|aldi|\biga\b|milk bar|cafe|restaurant|lunch|breakfast|dinner/.test(s))
    return "Food"; if (/petrol|vicroads|linkt|toll|parking|car wash|ampol|caltex/.test(s))
    return "Car"; if (/agl|energy|telstra|optus|water|insurance/.test(s))
    return "Bills"; if (/spotify|netflix|prime|youtube|disney|audible|crunchyroll|chatgpt|stan\b/.test(s))
    return "Streaming"; if (/chemist|medical|pharmacy|bunnings|kmart|big w|school fees|st marys/.test(s))
    return "Personal"; if (/account servicing fee/.test(s))
    return a > 0 ? "Inbound TFR" : "Outbound TFR"; return "Unclassified"; }
function split(line: string) { const out: string[] = []; let v = "", q = false; for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i + 1] === '"') {
        v += '"';
        i++;
    }
    else if (c === '"')
        q = !q;
    else if (c === ',' && !q) {
        out.push(v.trim());
        v = "";
    }
    else
        v += c;
} out.push(v.trim()); return out; }
function parseCsv(csv: string, rules: Rule[]): Tx[] { const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean); if (!lines.length)
    throw Error("No transactions found"); const first = split(lines[0]); const headed = !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(first[0]); let date = 0, amount = 1, description = 2, note = 7, rows = lines; if (headed) {
    const h = first.map(x => x.toLowerCase());
    const find = (...n: string[]) => h.findIndex(x => n.some(y => x.includes(y)));
    date = find("date");
    amount = find("amount");
    description = find("description", "details", "narrative");
    note = find("note", "memo");
    rows = lines.slice(1);
    if (date < 0 || amount < 0 || description < 0)
        throw Error("Could not identify the date, description and amount columns");
} return rows.map((line, i) => { const c = split(line), raw = c[description] || "Transaction", a = Number((c[amount] || "").replace(/[$,\s]/g, "")), m = merchant(raw), n = note >= 0 ? (c[note] || "") : "", base = { id: `anz-${Date.now()}-${i}`, date: c[date], amount: a, description: raw, merchant: m, note: n, category: classify(`${raw} ${n}`, a), detail: n }, rule = rules.find(r => ruleMatches(base, r)); return { ...base, merchant: rule?.merchant || m, category: rule?.category || base.category, detail: rule?.detail || n }; }).filter(x => Number.isFinite(x.amount) && x.amount !== 0); }
const demo: Tx[] = [{ id: "1", date: "31/07/2026", amount: -247, description: "PAYMENT TO ST MARYS COLLEGE SCHOOL FEES 40055", merchant: "ST MARYS COLLEGE SCHOOL FEES", note: "", category: "Personal", detail: "School Fees" }, { id: "2", date: "30/07/2026", amount: -103.1, description: "VISA DEBIT PURCHASE CARD 6012 NDC SERVICE CO P/L SHEPPARTON", merchant: "NDC SERVICE CO P/L", note: "", category: "Unclassified", detail: "" }, { id: "3", date: "28/07/2026", amount: -28, description: "VISA DEBIT PURCHASE CARD 6012 POPLAR AVENUE MILK BAR SHEPPARTON", merchant: "POPLAR AVENUE MILK BAR", note: "", category: "Food", detail: "Takeout" }, { id: "4", date: "25/07/2026", amount: 6240, description: "SALARY PAYMENT", merchant: "SALARY PAYMENT", note: "", category: "Inbound TFR", detail: "Salary" }];
export default function Home() { const [view, setView] = useState<"overview" | "transactions" | "category">("overview"), [txs, setTxs] = useState<Tx[]>(demo), [rules, setRules] = useState<Rule[]>([]), [customCategories, setCustomCategories] = useState<string[]>([]), [newCategory, setNewCategory] = useState(""), [selectedCategory, setSelectedCategory] = useState("Food"), [reviewOnly, setReviewOnly] = useState(false), [query, setQuery] = useState(""), [fromDate, setFromDate] = useState(""), [toDate, setToDate] = useState(""), [categorySlice, setCategorySlice] = useState("All"), [detailSlice, setDetailSlice] = useState("All"), [merchantSlice, setMerchantSlice] = useState("All"), [notice, setNotice] = useState(""); const file = useRef<HTMLInputElement>(null); useEffect(() => { try {
    const t = localStorage.getItem("pocketview-v2"), r = localStorage.getItem("pocketview-rules"), c = localStorage.getItem("pocketview-categories");
    if (t)
        setTxs(JSON.parse(t));
    if (r)
        setRules(JSON.parse(r));
    if (c)
        setCustomCategories(JSON.parse(c));
}
catch { } }, []); const save = (x: Tx[]) => { setTxs(x); localStorage.setItem("pocketview-v2", JSON.stringify(x)); }; const allCategories = [...categories, ...customCategories]; const filteredTxs = txs.filter(t => (!fromDate || dateKey(t.date) >= dateKey(fromDate)) && (!toDate || dateKey(t.date) <= dateKey(toDate)) && (categorySlice === "All" || t.category === categorySlice) && (detailSlice === "All" || t.detail === detailSlice) && (merchantSlice === "All" || t.merchant === merchantSlice)); const detailOptions = [...new Set(txs.map(t => t.detail).filter(Boolean))].sort(); const merchantOptions = [...new Set(txs.map(t => t.merchant).filter(Boolean))].sort(); const totals = useMemo(() => { const income = filteredTxs.filter(x => x.amount > 0).reduce((a, x) => a + x.amount, 0), spent = Math.abs(filteredTxs.filter(x => x.amount < 0 && !x.category.includes("TFR")).reduce((a, x) => a + x.amount, 0)); return { income, spent, left: income - spent }; }, [filteredTxs]); const spend = allCategories.filter(name => !name.includes("TFR") && name !== "Unclassified").map(name => ({ name, limit: budget[name] || 0, spent: Math.abs(filteredTxs.filter(x => x.category === name && x.amount < 0).reduce((a, x) => a + x.amount, 0)) })).filter(x => x.spent > 0 || x.limit > 0); const shown = txs.filter(x => (!reviewOnly || reviewNeeded(x)) && `${x.merchant} ${x.description} ${x.note}`.toLowerCase().includes(query.toLowerCase())); const addCategory = () => { const name = newCategory.trim(); if (!name || allCategories.some(x => x.toLowerCase() === name.toLowerCase())) return; const next = [...customCategories, name]; setCustomCategories(next); localStorage.setItem("pocketview-categories", JSON.stringify(next)); setNewCategory(""); setNotice(`Category “${name}” added.`); }; const applyLearnings = () => { const latest = JSON.parse(localStorage.getItem("pocketview-rules") || "[]") as Rule[]; const activeRules = latest.length ? latest : rules; const next = txs.map(t => { const rule = activeRules.find(r => ruleMatches(t, r)); return rule ? { ...t, merchant: rule.merchant || t.merchant, category: rule.category, detail: rule.detail } : t; }); save(next); setRules(activeRules); setReviewOnly(true); const remaining = next.filter(reviewNeeded).length; setNotice(`Applied ${activeRules.length} learned rules. ${remaining} transactions still need review.`); }; const exportCsv = () => { const quote = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`; const rows = [["Date", "Amount", "Merchant", "Category", "Category Detail", "Bank Description", "ANZ Note", "Review Status"], ...filteredTxs.map(t => [t.date, t.amount, t.merchant, t.category, t.detail, t.description, t.note, reviewNeeded(t) ? "Needs review" : "Complete"])]; const blob = new Blob([rows.map(row => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = `pocketview-enriched-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url); setNotice(`Exported ${filteredTxs.length} enriched transactions.`); }; const upload = async (f?: File) => { if (!f)
    return; try {
    const x = parseCsv(await f.text(), rules);
    save(x);
    setNotice(`${x.length} transactions imported · ${x.filter(t => t.category === "Unclassified").length} need review.`);
    setView("transactions");
}
catch (e) {
    setNotice(e instanceof Error ? e.message : "Could not read that file");
} }; const update = (id: string, p: Partial<Tx>) => save(txs.map(x => x.id === id ? { ...x, ...p } : x)); return <main className="shell">
<aside className="sidebar">
<div className="brand">
<span className="brandmark">P</span>
<span>Pocketview</span>
</div>
<nav>
<button className={`nav ${view === "overview" ? "active" : ""}`} onClick={() => setView("overview")}>
<span>⌂</span>Overview</button>
<button className={`nav ${view === "transactions" ? "active" : ""}`} onClick={() => setView("transactions")}>
<span>⇄</span>Classify transactions <b className="badge">
{txs.filter(reviewNeeded).length}</b>
</button>
</nav>
<div className="sideBottom">
<button className="nav">
<span>?</span>Help & security</button>
<div className="profile">
<div className="avatar">JB</div>
<div>
<b>Personal budget</b>
<small>Stored on this device</small>
</div>
</div>
</div>
</aside>
<section className="content">
{notice && <div className="notice">
<span>✓</span>
{notice}<button onClick={() => setNotice("")}>×</button>
</div>}{view === "overview" ? <>
<header>
<div>
<p className="eyebrow">YOUR FINANCIAL PICTURE</p>
<h1>Your money, made clear.</h1>
<p className="sub">Built around your ANZ transaction history.</p>
</div>
<div className="actions">
<button className="backButton" onClick={exportCsv}>⇩ Export enriched CSV</button>
<button className="import" onClick={() => file.current?.click()}>＋ Import ANZ CSV</button>
<input ref={file} hidden type="file" accept=".csv" onChange={e => upload(e.target.files?.[0])}/>
</div>
</header>
<section className="slicerPanel"><label>FROM<input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}/></label><label>TO<input type="date" value={toDate} onChange={e => setToDate(e.target.value)}/></label><label>CATEGORY<select value={categorySlice} onChange={e => setCategorySlice(e.target.value)}><option>All</option>{allCategories.map(x => <option key={x}>{x}</option>)}</select></label><label>CATEGORY DETAIL<select value={detailSlice} onChange={e => setDetailSlice(e.target.value)}><option>All</option>{detailOptions.map(x => <option key={x}>{x}</option>)}</select></label><label>MERCHANT<select value={merchantSlice} onChange={e => setMerchantSlice(e.target.value)}><option>All</option>{merchantOptions.map(x => <option key={x}>{x}</option>)}</select></label><button onClick={() => { setFromDate(""); setToDate(""); setCategorySlice("All"); setDetailSlice("All"); setMerchantSlice("All"); }}>Clear</button></section>
<section className="heroGrid">
<article className="balanceCard">
<div className="cardTop">
<span>Available after spending</span>
<span className="positive">Device-private</span>
</div>
<div className="bigMoney">
{money(totals.left)}</div>
<div className="bar">
<i style={{ width: `${Math.min(100, totals.income ? totals.spent / totals.income * 100 : 0)}%` }}/>
</div>
<div className="balanceMeta">
<div>
<small>INCOME</small>
<b>
{money(totals.income)}</b>
</div>
<div>
<small>SPENT</small>
<b>
{money(totals.spent)}</b>
</div>
<div>
<small>SAVINGS RATE</small>
<b>
{totals.income ? Math.round(totals.left / totals.income * 100) : 0}%</b>
</div>
</div>
</article>
<article className="insight">
<div className="spark">✦</div>
<div>
<small>CLASSIFICATION HEALTH</small>
<h3>
{txs.filter(reviewNeeded).length} transactions need review.</h3>
<p>Correct a merchant once and Pocketview will remember it for future imports.</p>
<button onClick={() => setView("transactions")}>Review transactions →</button>
</div>
</article>
</section>
<section className="sectionHead">
<div>
<h2>Where your money went</h2>
<p>Using the category structure from your budget workbook</p>
</div>
</section>
<section className="budgetGrid">
{spend.map(x =>
<article className="budgetCard clickable" tabIndex={0} role="button" key={x.name} onClick={() => { setSelectedCategory(x.name); setCategorySlice(x.name); setView("category"); }} onKeyDown={e => { if (e.key === "Enter") { setSelectedCategory(x.name); setCategorySlice(x.name); setView("category"); } }}>
<div className="budgetTitle">
<span className="catIcon" style={{ background: colours[x.name] || "#625bf6" }}>
{x.name[0]}</span>
<div>
<b>
{x.name}</b>
<small>
{x.limit ? `${Math.round(x.spent / x.limit * 100)}% of guide` : "Custom category"}</small>
</div>
<span>
{money(x.spent)}</span>
</div>
<div className="miniBar">
<i style={{ width: `${x.limit ? Math.min(100, x.spent / x.limit * 100) : 100}%`, background: colours[x.name] || "#625bf6" }}/>
</div>
<div className="budgetFoot">
<span>
{x.limit ? `${money(Math.max(0, x.limit - x.spent))} left` : `${txs.filter(t => t.category === x.name).length} transactions`}</span>
<span>{x.limit ? `of ${money(x.limit)}` : "View details →"}</span>
</div>
</article>)}</section>
</> : view === "category" ? <>
<header><div><p className="eyebrow">DEEP DIVE</p><h1>{selectedCategory}</h1><p className="sub">Edit enriched taxonomy fields or export this filtered view.</p></div><div className="actions"><button className="backButton" onClick={exportCsv}>⇩ Export this view</button><button className="backButton" onClick={() => setView("overview")}>← Back to overview</button></div></header>
<section className="slicerPanel"><label>FROM<input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}/></label><label>TO<input type="date" value={toDate} onChange={e => setToDate(e.target.value)}/></label><label>CATEGORY DETAIL<select value={detailSlice} onChange={e => setDetailSlice(e.target.value)}><option>All</option>{detailOptions.map(x => <option key={x}>{x}</option>)}</select></label><label>MERCHANT<select value={merchantSlice} onChange={e => setMerchantSlice(e.target.value)}><option>All</option>{merchantOptions.map(x => <option key={x}>{x}</option>)}</select></label></section>
<section className="categorySummary"><span>Total spent</span><b>{money(Math.abs(filteredTxs.filter(t => t.amount < 0).reduce((a, t) => a + t.amount, 0)))}</b><small>{filteredTxs.length} transactions</small></section>
<section className="transactions categoryTransactions"><div className="drillTable"><div className="drillRow drillHead"><span>MERCHANT</span><span>CATEGORY</span><span>CATEGORY DETAIL</span><span>DATE</span><span>AMOUNT</span></div>{filteredTxs.map(t => <div className="drillRow" key={t.id}><input value={t.merchant} onChange={e => update(t.id, { merchant: e.target.value })}/><select value={t.category} onChange={e => update(t.id, { category: e.target.value })}>{allCategories.map(x => <option key={x}>{x}</option>)}</select><input value={t.detail} onChange={e => update(t.id, { detail: e.target.value })} placeholder="Add detail"/><span>{t.date}</span><strong className={t.amount > 0 ? "credit" : ""}>{t.amount > 0 ? "+" : ""}{money(t.amount)}</strong></div>)}</div></section>
</> : <>
<header>
<div>
<p className="eyebrow">TRANSACTION WORKBENCH</p>
<h1>Make every transaction meaningful.</h1>
<p className="sub">Clean merchants, add context, and teach Pocketview your categories.</p>
</div>
<div className="actions">
<button className="import" onClick={() => file.current?.click()}>＋ Import ANZ CSV</button>
<input ref={file} hidden type="file" accept=".csv" onChange={e => upload(e.target.files?.[0])}/>
</div>
</header>
<section className="reviewStats">
<article>
<small>TRANSACTIONS</small>
<b>
{txs.length}</b>
</article>
<article>
<small>NEEDS REVIEW</small>
<b>
{txs.filter(reviewNeeded).length}</b>
</article>
<article>
<small>LEARNED RULES</small>
<b>
{rules.length}</b>
</article>
</section>
<section className="workbench">
<div className="toolbar">
<label className="search">⌕<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search merchant or note"/>
</label>
<label className="reviewToggle"><input type="checkbox" checked={reviewOnly} onChange={e => setReviewOnly(e.target.checked)}/> Needs review only</label>
<button className="applyRules" onClick={applyLearnings}>↻ Apply learned rules</button>
</div>
<div className="categoryMaker"><div><b>Add a category</b><small>Create a category, then assign transactions to it below.</small></div><input value={newCategory} onChange={e => setNewCategory(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addCategory(); }} placeholder="e.g. Holidays"/><button onClick={addCategory}>Add category</button></div>
{shown.map(t =>
<article className={`classRow ${reviewNeeded(t) ? "needsReview" : ""}`} key={t.id}>
<div className="txMain">
<i>
{t.merchant[0]}</i>
<div>
<b>
{t.merchant}</b>
<small>
{t.date} · {t.description}</small>
{t.note && <p>ANZ note: {t.note}</p>}</div>
<strong className={t.amount > 0 ? "credit" : ""}>
{t.amount > 0 ? "+" : ""}{money(t.amount)}</strong>
</div>
<div className="classControls">
<label>MERCHANT<input value={t.merchant} onChange={e => update(t.id, { merchant: e.target.value })} placeholder="Clean merchant name"/>
</label>
<label>CATEGORY<select value={t.category} onChange={e => update(t.id, { category: e.target.value })}>
{allCategories.map(x =>
<option key={x}>
{x}</option>)}</select>
</label>
<label>CATEGORY DETAIL<input value={t.detail} placeholder="e.g. School fees" onChange={e => update(t.id, { detail: e.target.value })}/>
</label>
<button className="remember" onClick={() => { const rule = { match: t.merchant.toLowerCase(), merchant: t.merchant, category: t.category, detail: t.detail }, nextRules = [...rules.filter(r => r.match !== rule.match), rule], nextTxs = txs.map(x => ruleMatches(x, rule) ? { ...x, merchant: rule.merchant, category: rule.category, detail: rule.detail } : x); setRules(nextRules); localStorage.setItem("pocketview-rules", JSON.stringify(nextRules)); save(nextTxs); setNotice(`Rule saved and applied to matching ${t.merchant} transactions.`); }}>Remember & apply</button>
</div>
</article>)}</section>
</>}<footer>
<span>Transactions and rules stay in this browser.</span>
<button onClick={() => save(demo)}>Restore demo data</button>
</footer>
</section>
</main>; }
