"use client";
import { useEffect, useMemo, useRef, useState } from "react";
type Tx = {
    id: string;
    date: string;
    amount: number;
    description: string;
    merchant: string;
    note: string;
    direction?: "Inbound" | "Outbound";
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
const directionOf = (t: Pick<Tx, "amount" | "direction">) => t.direction || (t.amount >= 0 ? "Inbound" : "Outbound");
const reviewNeeded = (t: Tx) => !t.merchant.trim() || t.category === "Unclassified" || !t.detail.trim();
const dateKey = (value: string) => { const p = value.split(/[\/-]/).map(Number); return p[0] > 1900 ? p[0] * 10000 + p[1] * 100 + p[2] : p[2] * 10000 + p[1] * 100 + p[0]; };
const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const canonicalKey = (t: Tx) => { const raw = t.description.toLowerCase(); const mobile = raw.match(/anz mobile banking payment \d+ to (.+)$/i); if (mobile) return normalizeKey(mobile[1]); const incoming = raw.match(/^payment from (.+)$/i); if (incoming) return normalizeKey(incoming[1]); if (/\bbig\s*w\b|bigw/.test(raw)) return "big w"; return normalizeKey(t.merchant); };
const ruleMatches = (t: Tx, r: Rule) => canonicalKey(t) === normalizeKey(r.match);
function merchant(s: string) { const mobile = s.match(/ANZ MOBILE BANKING PAYMENT \d+ TO (.+)$/i); if (mobile) return mobile[1].trim(); const incoming = s.match(/^PAYMENT FROM (.+)$/i); if (incoming) return incoming[1].trim(); if (/\bBIG\s*W\b|BIGW/i.test(s)) return "Big W"; return s.replace(/^(VISA DEBIT PURCHASE CARD \d+|EFTPOS|ANZ INTERNET BANKING BPAY|PAYMENT TO)\s*/i, "").replace(/\s+\{?\d{5,}\}?\s*$/g, "").replace(/\s{2,}.+$/, "").trim() || s; }
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
} return rows.map((line, i) => { const c = split(line), raw = c[description] || "Transaction", a = Number((c[amount] || "").replace(/[$,\s]/g, "")), m = merchant(raw), n = note >= 0 ? (c[note] || "") : "", base: Tx = { id: `anz-${Date.now()}-${i}`, date: c[date], amount: a, direction: a >= 0 ? "Inbound" : "Outbound", description: raw, merchant: m, note: n, category: classify(`${raw} ${n}`, a), detail: n }, rule = rules.find(r => ruleMatches(base, r)); return { ...base, merchant: rule?.merchant || m, category: rule?.category || base.category, detail: rule?.detail || n }; }).filter(x => Number.isFinite(x.amount) && x.amount !== 0); }
const demo: Tx[] = [{ id: "1", date: "31/07/2026", amount: -247, description: "PAYMENT TO ST MARYS COLLEGE SCHOOL FEES 40055", merchant: "ST MARYS COLLEGE SCHOOL FEES", note: "", category: "Personal", detail: "School Fees" }, { id: "2", date: "30/07/2026", amount: -103.1, description: "VISA DEBIT PURCHASE CARD 6012 NDC SERVICE CO P/L SHEPPARTON", merchant: "NDC SERVICE CO P/L", note: "", category: "Unclassified", detail: "" }, { id: "3", date: "28/07/2026", amount: -28, description: "VISA DEBIT PURCHASE CARD 6012 POPLAR AVENUE MILK BAR SHEPPARTON", merchant: "POPLAR AVENUE MILK BAR", note: "", category: "Food", detail: "Takeout" }, { id: "4", date: "25/07/2026", amount: 6240, description: "SALARY PAYMENT", merchant: "SALARY PAYMENT", note: "", category: "Inbound TFR", detail: "Salary" }];
export default function Home() { const [view, setView] = useState<"overview" | "transactions" | "category">("overview"), [txs, setTxs] = useState<Tx[]>(demo), [rules, setRules] = useState<Rule[]>([]), [drafts, setDrafts] = useState<Record<string, Partial<Tx>>>({}), [customCategories, setCustomCategories] = useState<string[]>([]), [newCategory, setNewCategory] = useState(""), [selectedCategory, setSelectedCategory] = useState("Food"), [reviewOnly, setReviewOnly] = useState(false), [workbenchDate, setWorkbenchDate] = useState("All"), [query, setQuery] = useState(""), [fromDate, setFromDate] = useState(""), [toDate, setToDate] = useState(""), [directionSlice, setDirectionSlice] = useState("All"), [categorySlice, setCategorySlice] = useState("All"), [detailSlice, setDetailSlice] = useState("All"), [merchantSlice, setMerchantSlice] = useState("All"), [notice, setNotice] = useState(""); const file = useRef<HTMLInputElement>(null), knowledgeFile = useRef<HTMLInputElement>(null); useEffect(() => { try {
    const t = localStorage.getItem("pocketview-v2"), r = localStorage.getItem("pocketview-rules"), c = localStorage.getItem("pocketview-categories");
    if (t)
        setTxs(JSON.parse(t));
    if (r)
        setRules(JSON.parse(r));
    if (c)
        setCustomCategories(JSON.parse(c));
}
catch { } }, []); const save = (x: Tx[]) => { setTxs(x); localStorage.setItem("pocketview-v2", JSON.stringify(x)); }; const allCategories = [...categories, ...customCategories]; const dateOptions = [...new Set(txs.map(t => t.date))].sort((a, b) => dateKey(a) - dateKey(b)); const dateFiltered = txs.filter(t => (!fromDate || dateKey(t.date) >= dateKey(fromDate)) && (!toDate || dateKey(t.date) <= dateKey(toDate))); const directionFiltered = dateFiltered.filter(t => directionSlice === "All" || directionOf(t) === directionSlice); const categoryOptions = [...new Set(directionFiltered.map(t => t.category))].sort(); const categoryFiltered = directionFiltered.filter(t => categorySlice === "All" || t.category === categorySlice); const detailOptions = [...new Set(categoryFiltered.map(t => t.detail).filter(Boolean))].sort(); const detailFiltered = categoryFiltered.filter(t => detailSlice === "All" || t.detail === detailSlice); const merchantOptions = [...new Set(detailFiltered.map(t => t.merchant).filter(Boolean))].sort(); const filteredTxs = detailFiltered.filter(t => merchantSlice === "All" || t.merchant === merchantSlice); const totals = useMemo(() => { const income = filteredTxs.filter(x => x.amount > 0).reduce((a, x) => a + x.amount, 0), spent = Math.abs(filteredTxs.filter(x => x.amount < 0 && !x.category.includes("TFR")).reduce((a, x) => a + x.amount, 0)); return { income, spent, left: income - spent }; }, [filteredTxs]); const spend = allCategories.filter(name => !name.includes("TFR") && name !== "Unclassified").map(name => ({ name, limit: budget[name] || 0, spent: Math.abs(filteredTxs.filter(x => x.category === name && x.amount < 0).reduce((a, x) => a + x.amount, 0)) })).filter(x => x.spent > 0 || x.limit > 0); const shown = txs.filter(x => (workbenchDate === "All" || x.date === workbenchDate) && (!reviewOnly || reviewNeeded(x)) && `${x.merchant} ${x.description} ${x.note}`.toLowerCase().includes(query.toLowerCase())); const addCategory = () => { const name = newCategory.trim(); if (!name || allCategories.some(x => x.toLowerCase() === name.toLowerCase())) return; const next = [...customCategories, name]; setCustomCategories(next); localStorage.setItem("pocketview-categories", JSON.stringify(next)); setNewCategory(""); setNotice(`Category “${name}” added.`); }; const applyLearnings = () => { const savedRules = JSON.parse(localStorage.getItem("pocketview-rules") || "[]") as Rule[]; const draftRules = Object.entries(drafts).map(([id, patch]) => { const original = txs.find(t => t.id === id)!; const edited = { ...original, ...patch }; return { match: canonicalKey(original), merchant: edited.merchant, category: edited.category, detail: edited.detail }; }); const activeRules = [...savedRules, ...draftRules].filter((r, i, a) => a.findLastIndex(x => x.match === r.match) === i); const next = txs.map(t => { const rule = activeRules.find(r => ruleMatches(t, r)); return rule ? { ...t, direction: directionOf(t), merchant: rule.merchant || t.merchant, category: rule.category, detail: rule.detail } : { ...t, direction: directionOf(t) }; }); save(next); setRules(activeRules); localStorage.setItem("pocketview-rules", JSON.stringify(activeRules)); setDrafts({}); setReviewOnly(true); const remaining = next.filter(reviewNeeded).length; setNotice(`Saved and applied ${activeRules.length} learned rules. ${remaining} transactions still need review.`); }; const exportCsv = (data?: Tx[]) => { const source = Array.isArray(data) ? data : filteredTxs; const quote = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`; const rows = [["Date", "Amount", "Direction", "Merchant", "Category", "Category Detail", "Bank Description", "ANZ Note", "Review Status"], ...source.map(t => [t.date, t.amount, directionOf(t), t.merchant, t.category, t.detail, t.description, t.note, reviewNeeded(t) ? "Needs review" : "Complete"])]; const blob = new Blob([rows.map(row => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = `pocketview-enriched-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url); setNotice(`Exported ${source.length} enriched transactions.`); }; const exportKnowledge = () => { const blob = new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), rules, categories: customCategories }, null, 2)], { type: "application/json" }), url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = "pocketview-knowledge.json"; a.click(); URL.revokeObjectURL(url); }; const importKnowledge = async (f?: File) => { if (!f) return; try { const data = JSON.parse(await f.text()); const nextRules = Array.isArray(data.rules) ? data.rules : [], nextCategories = Array.isArray(data.categories) ? data.categories : []; setRules(nextRules); setCustomCategories(nextCategories); localStorage.setItem("pocketview-rules", JSON.stringify(nextRules)); localStorage.setItem("pocketview-categories", JSON.stringify(nextCategories)); setNotice(`Imported ${nextRules.length} merchant rules.`); } catch { setNotice("That knowledge file could not be read."); } }; const upload = async (f?: File) => { if (!f)
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
<section className="slicerPanel"><label>FROM<select value={fromDate} onChange={e => setFromDate(e.target.value)}><option value="">First date</option>{dateOptions.map(x => <option key={x}>{x}</option>)}</select></label><label>TO<select value={toDate} onChange={e => setToDate(e.target.value)}><option value="">Last date</option>{dateOptions.map(x => <option key={x}>{x}</option>)}</select></label><label>DIRECTION<select value={directionSlice} onChange={e => { setDirectionSlice(e.target.value); setCategorySlice("All"); setDetailSlice("All"); setMerchantSlice("All"); }}><option>All</option><option>Inbound</option><option>Outbound</option></select></label><label>CATEGORY<select value={categorySlice} onChange={e => { setCategorySlice(e.target.value); setDetailSlice("All"); setMerchantSlice("All"); }}><option>All</option>{categoryOptions.map(x => <option key={x}>{x}</option>)}</select></label><label>CATEGORY DETAIL<select value={detailSlice} onChange={e => { setDetailSlice(e.target.value); setMerchantSlice("All"); }}><option>All</option>{detailOptions.map(x => <option key={x}>{x}</option>)}</select></label><label>MERCHANT<select value={merchantSlice} onChange={e => setMerchantSlice(e.target.value)}><option>All</option>{merchantOptions.map(x => <option key={x}>{x}</option>)}</select></label><button onClick={() => { setFromDate(""); setToDate(""); setDirectionSlice("All"); setCategorySlice("All"); setDetailSlice("All"); setMerchantSlice("All"); }}>Clear</button></section>
<section className="filteredSpend"><span>SPEND IN CURRENT FILTER</span><b>{money(totals.spent)}</b><small>{filteredTxs.length} matching transactions</small></section>
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
<section className="slicerPanel"><label>FROM<select value={fromDate} onChange={e => setFromDate(e.target.value)}><option value="">First date</option>{dateOptions.map(x => <option key={x}>{x}</option>)}</select></label><label>TO<select value={toDate} onChange={e => setToDate(e.target.value)}><option value="">Last date</option>{dateOptions.map(x => <option key={x}>{x}</option>)}</select></label><label>DIRECTION<select value={directionSlice} onChange={e => setDirectionSlice(e.target.value)}><option>All</option><option>Inbound</option><option>Outbound</option></select></label><label>CATEGORY DETAIL<select value={detailSlice} onChange={e => { setDetailSlice(e.target.value); setMerchantSlice("All"); }}><option>All</option>{detailOptions.map(x => <option key={x}>{x}</option>)}</select></label><label>MERCHANT<select value={merchantSlice} onChange={e => setMerchantSlice(e.target.value)}><option>All</option>{merchantOptions.map(x => <option key={x}>{x}</option>)}</select></label></section>
<section className="categorySummary"><span>Total spent</span><b>{money(Math.abs(filteredTxs.filter(t => t.amount < 0).reduce((a, t) => a + t.amount, 0)))}</b><small>{filteredTxs.length} transactions</small></section>
<section className="transactions categoryTransactions"><div className="drillTable"><div className="drillRow drillHead"><span>DIRECTION</span><span>MERCHANT</span><span>CATEGORY</span><span>CATEGORY DETAIL</span><span>DATE</span><span>AMOUNT</span></div>{filteredTxs.map(t => <div className="drillRow" key={t.id}><span className={`directionTag ${directionOf(t).toLowerCase()}`}>{directionOf(t)}</span><input value={t.merchant} onChange={e => update(t.id, { merchant: e.target.value })}/><select value={t.category} onChange={e => update(t.id, { category: e.target.value })}>{allCategories.map(x => <option key={x}>{x}</option>)}</select><input value={t.detail} onChange={e => update(t.id, { detail: e.target.value })} placeholder="Add detail"/><span>{t.date}</span><strong className={t.amount > 0 ? "credit" : ""}>{t.amount > 0 ? "+" : ""}{money(t.amount)}</strong></div>)}</div></section>
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
<select className="workbenchDate" value={workbenchDate} onChange={e => setWorkbenchDate(e.target.value)} aria-label="Transaction date"><option>All</option>{dateOptions.map(x => <option key={x}>{x}</option>)}</select>
<label className="reviewToggle"><input type="checkbox" checked={reviewOnly} onChange={e => setReviewOnly(e.target.checked)}/> Needs review only</label>
<button className="applyRules" onClick={() => exportCsv(shown)}>⇩ Export view</button>
<button className="applyRules" onClick={applyLearnings}>↻ Apply learned rules</button>
</div>
<div className="categoryMaker"><div><b>Add a category</b><small>Create a category, then assign transactions to it below.</small></div><input value={newCategory} onChange={e => setNewCategory(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addCategory(); }} placeholder="e.g. Holidays"/><button onClick={addCategory}>Add category</button></div>
<div className="knowledgeBar"><div><b>Local learning file</b><small>The browser remembers automatically; export this file as a portable backup for another browser or future import.</small></div><button onClick={exportKnowledge}>Export knowledge</button><button onClick={() => knowledgeFile.current?.click()}>Import knowledge</button><input ref={knowledgeFile} hidden type="file" accept=".json,application/json" onChange={e => importKnowledge(e.target.files?.[0])}/></div>
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
{t.note && <p>ANZ note: {t.note}</p>}<em className={`directionTag ${directionOf(t).toLowerCase()}`}>{directionOf(t)}</em></div>
<strong className={t.amount > 0 ? "credit" : ""}>
{t.amount > 0 ? "+" : ""}{money(t.amount)}</strong>
</div>
<div className="classControls">
<label>MERCHANT<input value={drafts[t.id]?.merchant ?? t.merchant} onChange={e => setDrafts(d => ({ ...d, [t.id]: { ...d[t.id], merchant: e.target.value } }))} placeholder="Clean merchant name"/>
</label>
<label>CATEGORY<select value={drafts[t.id]?.category ?? t.category} onChange={e => setDrafts(d => ({ ...d, [t.id]: { ...d[t.id], category: e.target.value } }))}>
{allCategories.map(x =>
<option key={x}>
{x}</option>)}</select>
</label>
<label>CATEGORY DETAIL<input value={drafts[t.id]?.detail ?? t.detail} placeholder="e.g. School fees" onChange={e => setDrafts(d => ({ ...d, [t.id]: { ...d[t.id], detail: e.target.value } }))}/>
</label>
<button className="remember" disabled={!drafts[t.id]} onClick={() => { const edited = { ...t, ...drafts[t.id] }, rule = { match: canonicalKey(t), merchant: edited.merchant, category: edited.category, detail: edited.detail }, nextRules = [...rules.filter(r => normalizeKey(r.match) !== rule.match), rule], nextTxs = txs.map(x => ruleMatches(x, rule) ? { ...x, direction: directionOf(x), merchant: rule.merchant, category: rule.category, detail: rule.detail } : { ...x, direction: directionOf(x) }); setRules(nextRules); localStorage.setItem("pocketview-rules", JSON.stringify(nextRules)); save(nextTxs); setDrafts(d => { const next = { ...d }; delete next[t.id]; return next; }); setNotice(`Rule saved and applied only to matching ${edited.merchant} transactions.`); }}>Remember & apply</button>
</div>
</article>)}</section>
</>}<footer>
<span>Transactions and rules stay in this browser.</span>
<button onClick={() => save(demo)}>Restore demo data</button>
</footer>
</section>
</main>; }
