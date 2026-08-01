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
    mode?: "contains" | "identity";
    sourceDescription?: string;
};
type MasterItem = { id: string; direction: "Inbound" | "Outbound"; originalMerchant?: string; merchant: string; category: string; detail: string };
const categories = ["Food", "Personal", "Car", "Streaming", "Bills", "Bank", "Inbound TFR", "Outbound TFR", "Unclassified"];
const budget: Record<string, number> = { Food: 1050, Personal: 950, Car: 700, Streaming: 120, Bills: 650 };
const colours: Record<string, string> = { Food: "#22a06b", Personal: "#9b51e0", Car: "#2f80ed", Streaming: "#8390a5", Bills: "#e6566f", Bank: "#56657a", "Inbound TFR": "#13a168", "Outbound TFR": "#f08b3e", Unclassified: "#a2a9b5" };
const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
const directionOf = (t: Pick<Tx, "amount" | "direction">) => t.direction || (t.amount >= 0 ? "Inbound" : "Outbound");
const reviewNeeded = (t: Tx) => !t.merchant.trim() || t.category === "Unclassified" || !t.detail.trim();
const dateKey = (value: string) => { const p = value.split(/[\/-]/).map(Number); return p[0] > 1900 ? p[0] * 10000 + p[1] * 100 + p[2] : p[2] * 10000 + p[1] * 100 + p[0]; };
const isoDate = (value: string) => { const p = value.split(/[\/-]/).map(Number); return p[0] > 1900 ? `${p[0]}-${String(p[1]).padStart(2, "0")}-${String(p[2]).padStart(2, "0")}` : `${p[2]}-${String(p[1]).padStart(2, "0")}-${String(p[0]).padStart(2, "0")}`; };
const dateMillis = (value: string) => { const p = value.split(/[\/-]/).map(Number); return p[0] > 1900 ? Date.UTC(p[0], p[1] - 1, p[2]) : Date.UTC(p[2], p[1] - 1, p[0]); };
const monthKey = (value: string) => { const p = value.split(/[\/-]/).map(Number); return p[0] > 1900 ? `${p[0]}-${String(p[1]).padStart(2, "0")}` : `${p[2]}-${String(p[1]).padStart(2, "0")}`; };
const shortMonth = (value: string) => { const [year, month] = value.split("-").map(Number); return new Intl.DateTimeFormat("en-AU", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1))); };
const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const canonicalKey = (t: Tx) => `transaction ${normalizeKey(t.description.replace(/\b\d{4,}\b/g, " reference "))}`;
const ruleMatches = (t: Tx, r: Rule) => { const match = normalizeKey(r.match); if (!match) return false; return r.mode === "contains" ? normalizeKey(t.description).includes(match) : canonicalKey(t) === match; };
const matchingRule = (t: Tx, rules: Rule[]) => rules.findLast(r => r.mode === "contains" && ruleMatches(t, r)) || rules.findLast(r => r.mode !== "contains" && ruleMatches(t, r));
const keywordOptions = (t?: Tx) => { if (!t) return []; const stop = new Set(["card", "purchase", "payment", "banking", "debit", "credit", "transaction", "internet", "mobile", "from", "with", "the", "and", "for"]), words = normalizeKey(t.description).split(" ").filter(x => x.length >= 3 && !/^\d+$/.test(x) && !stop.has(x)); return [...new Set(words)].sort((a, b) => b.length - a.length); };
function merchant(s: string) { return s.trim() || "Transaction"; }
function inferDetail() { return ""; }
function classify() { return "Unclassified"; }
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
} return rows.map((line, i) => { const c = split(line), raw = c[description] || "Transaction", a = Number((c[amount] || "").replace(/[$,\s]/g, "")), m = merchant(raw), n = note >= 0 ? (c[note] || "") : "", base: Tx = { id: `transaction-${Date.now()}-${i}`, date: c[date], amount: a, direction: a >= 0 ? "Inbound" : "Outbound", description: raw, merchant: m, note: n, category: classify(), detail: inferDetail() }, rule = matchingRule(base, rules); return { ...base, merchant: rule?.merchant || m, category: rule?.category || base.category, detail: rule?.detail || base.detail }; }).filter(x => Number.isFinite(x.amount) && x.amount !== 0); }
const demo: Tx[] = [{ id: "1", date: "31/07/2026", amount: -247, description: "PAYMENT TO SCHOOL FEES 40055", merchant: "PAYMENT TO SCHOOL FEES 40055", note: "", category: "Unclassified", detail: "" }, { id: "2", date: "30/07/2026", amount: -103.1, description: "CARD PURCHASE SERVICE CO 6012", merchant: "CARD PURCHASE SERVICE CO 6012", note: "", category: "Unclassified", detail: "" }, { id: "3", date: "28/07/2026", amount: -28, description: "CARD PURCHASE LOCAL SHOP 6012", merchant: "CARD PURCHASE LOCAL SHOP 6012", note: "", category: "Unclassified", detail: "" }, { id: "4", date: "25/07/2026", amount: 6240, description: "INCOMING PAYMENT", merchant: "INCOMING PAYMENT", note: "", category: "Unclassified", detail: "" }];
export default function Home() { const [view, setView] = useState<"overview" | "budget" | "transactions" | "category" | "rules" | "master">("overview"), [txs, setTxs] = useState<Tx[]>([]), [rules, setRules] = useState<Rule[]>([]), [master, setMaster] = useState<MasterItem[]>([]), [drafts, setDrafts] = useState<Record<string, Partial<Tx>>>({}), [selectedTxIds, setSelectedTxIds] = useState<string[]>([]), [customCategories, setCustomCategories] = useState<string[]>([]), [newCategory, setNewCategory] = useState(""), [newRuleMatch, setNewRuleMatch] = useState(""), [newRuleKeyword, setNewRuleKeyword] = useState(""), [newRuleMerchant, setNewRuleMerchant] = useState(""), [savingsTarget, setSavingsTarget] = useState(20), [selectedCategory, setSelectedCategory] = useState("Food"), [reviewOnly, setReviewOnly] = useState(false), [workbenchDate, setWorkbenchDate] = useState("All"), [workbenchDirection, setWorkbenchDirection] = useState("All"), [workbenchPage, setWorkbenchPage] = useState(0), [query, setQuery] = useState(""), [appliedWorkbenchDate, setAppliedWorkbenchDate] = useState("All"), [appliedWorkbenchDirection, setAppliedWorkbenchDirection] = useState("All"), [appliedReviewOnly, setAppliedReviewOnly] = useState(false), [appliedQuery, setAppliedQuery] = useState(""), [fromDate, setFromDate] = useState(""), [toDate, setToDate] = useState(""), [directionSlice, setDirectionSlice] = useState("All"), [categorySlice, setCategorySlice] = useState("All"), [detailSlice, setDetailSlice] = useState("All"), [merchantSlice, setMerchantSlice] = useState("All"), [appliedFilters, setAppliedFilters] = useState({ from: "", to: "", direction: "All", category: "All", detail: "All", merchant: "All" }), [chartSelection, setChartSelection] = useState<{ month: string; direction: "Inbound" | "Outbound" } | null>(null), [overviewTransactionPage, setOverviewTransactionPage] = useState(0), [notice, setNotice] = useState(""); const file = useRef<HTMLInputElement>(null), knowledgeFile = useRef<HTMLInputElement>(null); useEffect(() => { try {
    const t = localStorage.getItem("pocketview-v2"), r = localStorage.getItem("pocketview-rules"), c = localStorage.getItem("pocketview-categories"), m = localStorage.getItem("pocketview-master"), s = localStorage.getItem("pocketview-savings-target");
    if (t)
        setTxs(JSON.parse(t));
    if (r)
        setRules(JSON.parse(r));
    if (c)
        setCustomCategories(JSON.parse(c));
    if (m)
        setMaster(JSON.parse(m));
    if (s)
        setSavingsTarget(Number(s));
}
catch { } }, []); const save = (x: Tx[]) => { setTxs(x); localStorage.setItem("pocketview-v2", JSON.stringify(x)); }; const saveRules = (x: Rule[]) => { setRules(x); localStorage.setItem("pocketview-rules", JSON.stringify(x)); }; const saveMaster = (x: MasterItem[]) => { setMaster(x); localStorage.setItem("pocketview-master", JSON.stringify(x)); };
const rebuildTransactions = (ruleSet: Rule[] = rules) => { const next = txs.map(t => { const base: Tx = { ...t, direction: t.amount >= 0 ? "Inbound" : "Outbound", merchant: merchant(t.description), category: classify(), detail: inferDetail() }, rule = matchingRule(base, ruleSet); return rule ? { ...base, merchant: rule.merchant || base.merchant, category: rule.category || base.category, detail: rule.detail || base.detail } : base; }); save(next); setDrafts({}); setWorkbenchPage(0); return next; };
const allCategories = [...new Map([...categories, ...customCategories, ...master.map(x => x.category)].filter(Boolean).map(x => [normalizeKey(x), x])).values()];
const dateOptions = [...new Set(txs.map(t => t.date))].sort((a, b) => dateKey(a) - dateKey(b)), firstDate = dateOptions[0] ? isoDate(dateOptions[0]) : "", lastDate = dateOptions.at(-1) ? isoDate(dateOptions.at(-1)!) : "";
const detailOptions = [...new Set([...master.map(x => x.detail), ...txs.map(t => t.detail)].filter(Boolean))].sort(), slicerDateTxs = txs.filter(t => (!fromDate || dateKey(t.date) >= dateKey(fromDate)) && (!toDate || dateKey(t.date) <= dateKey(toDate))), slicerDirectionTxs = slicerDateTxs.filter(t => directionSlice === "All" || directionOf(t) === directionSlice), overviewCategoryOptions = [...new Set(slicerDirectionTxs.map(t => t.category || "Unclassified"))].sort(), slicerCategoryTxs = slicerDirectionTxs.filter(t => categorySlice === "All" || t.category === categorySlice), overviewDetailOptions = [...new Set(slicerCategoryTxs.map(t => t.detail).filter(Boolean))].sort(), slicerDetailTxs = slicerCategoryTxs.filter(t => detailSlice === "All" || t.detail === detailSlice), overviewMerchantOptions = [...new Set(slicerDetailTxs.map(t => t.merchant).filter(Boolean))].sort();
const dateFiltered = txs.filter(t => (!appliedFilters.from || dateKey(t.date) >= dateKey(appliedFilters.from)) && (!appliedFilters.to || dateKey(t.date) <= dateKey(appliedFilters.to))), directionFiltered = dateFiltered.filter(t => appliedFilters.direction === "All" || directionOf(t) === appliedFilters.direction), categoryFiltered = directionFiltered.filter(t => appliedFilters.category === "All" || t.category === appliedFilters.category), detailFiltered = categoryFiltered.filter(t => appliedFilters.detail === "All" || t.detail === appliedFilters.detail), filteredTxs = detailFiltered.filter(t => appliedFilters.merchant === "All" || t.merchant === appliedFilters.merchant);
const totals = useMemo(() => { const income = filteredTxs.filter(x => x.amount > 0).reduce((a, x) => a + x.amount, 0), spent = Math.abs(filteredTxs.filter(x => x.amount < 0).reduce((a, x) => a + x.amount, 0)); return { income, spent, left: income - spent }; }, [filteredTxs]), tileDirection: "Inbound" | "Outbound" = appliedFilters.direction === "Inbound" ? "Inbound" : "Outbound", tileTxs = filteredTxs.filter(t => directionOf(t) === tileDirection), tileTotal = tileTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0), categoryTiles = [...tileTxs.reduce((map, t) => { const name = t.category?.trim() || "Unclassified", current = map.get(name) || { name, amount: 0, count: 0 }; current.amount += Math.abs(t.amount); current.count += 1; map.set(name, current); return map; }, new Map<string, { name: string; amount: number; count: number }>()).values()].sort((a, b) => a.name === "Unclassified" ? 1 : b.name === "Unclassified" ? -1 : b.amount - a.amount), displayTotal = tileDirection === "Inbound" ? totals.income : totals.spent;
const periodDates = filteredTxs.map(t => dateMillis(t.date)), periodDays = periodDates.length ? Math.max(1, Math.floor((Math.max(...periodDates) - Math.min(...periodDates)) / 86400000) + 1) : 0, dailyFlow = periodDays ? displayTotal / periodDays : 0, monthlyFlowAverage = periodDays ? displayTotal / periodDays * 30.44 : 0, largestInbound = filteredTxs.filter(t => t.amount > 0).sort((a, b) => b.amount - a.amount)[0], largestOutbound = filteredTxs.filter(t => t.amount < 0).sort((a, b) => a.amount - b.amount)[0], tileShare = (value: number) => tileTotal ? Math.round(value / tileTotal * 100) : 0, filteredDates = [...new Set(filteredTxs.map(t => t.date))].sort((a, b) => dateKey(a) - dateKey(b));
const monthlyFlow = [...filteredTxs.reduce((map, t) => { const key = monthKey(t.date), current = map.get(key) || { inbound: 0, outbound: 0 }; if (t.amount >= 0) current.inbound += t.amount; else current.outbound += Math.abs(t.amount); map.set(key, current); return map; }, new Map<string, { inbound: number; outbound: number }>()).entries()].sort(([a], [b]) => a.localeCompare(b)), maxMonthlyFlow = Math.max(0, ...monthlyFlow.flatMap(([, flow]) => [flow.inbound, flow.outbound])), chartTransactions = chartSelection ? filteredTxs.filter(t => monthKey(t.date) === chartSelection.month && directionOf(t) === chartSelection.direction) : [], overviewPageSize = 25, overviewTransactionPages = Math.max(1, Math.ceil(chartTransactions.length / overviewPageSize)), safeOverviewTransactionPage = Math.min(overviewTransactionPage, overviewTransactionPages - 1), overviewTransactionRows = chartTransactions.slice(safeOverviewTransactionPage * overviewPageSize, (safeOverviewTransactionPage + 1) * overviewPageSize);
const totalBudgetGuide = Object.values(budget).reduce((a, b) => a + b, 0), targetSavingsAmount = totals.income * savingsTarget / 100, plannedSpendLimit = Math.max(0, totals.income - targetSavingsAmount);
const shown = txs.filter(x => (appliedWorkbenchDate === "All" || x.date === appliedWorkbenchDate) && (appliedWorkbenchDirection === "All" || directionOf(x) === appliedWorkbenchDirection) && (!appliedReviewOnly || reviewNeeded(x)) && `${x.merchant} ${x.description} ${x.note}`.toLowerCase().includes(appliedQuery.toLowerCase()));
const workbenchPageSize = 50, workbenchPages = Math.max(1, Math.ceil(shown.length / workbenchPageSize)), safeWorkbenchPage = Math.min(workbenchPage, workbenchPages - 1), pagedShown = shown.slice(safeWorkbenchPage * workbenchPageSize, (safeWorkbenchPage + 1) * workbenchPageSize);
const ruleSourceOptions = txs.map(t => [t.id, t] as const);
const selectedRuleSource = ruleSourceOptions.find(([id]) => id === newRuleMatch)?.[1], newRuleKeywords = keywordOptions(selectedRuleSource);
const addCategory = () => { const name = newCategory.trim(); if (!name) return; if (allCategories.some(x => normalizeKey(x) === normalizeKey(name))) { setNotice(`“${name}” already exists. Duplicate category names are not allowed.`); return; } const next = [...customCategories, name]; setCustomCategories(next); localStorage.setItem("pocketview-categories", JSON.stringify(next)); setNewCategory(""); setNotice(`Category “${name}” added.`); };
const detailChoices = (t: Tx) => { const edited = { ...t, ...drafts[t.id] }, records = [...master, ...txs.map(x => ({ ...x, direction: directionOf(x) }))], exact = records.filter(x => normalizeKey(x.category) === normalizeKey(edited.category) && normalizeKey(x.merchant) === normalizeKey(edited.merchant)), related = records.filter(x => normalizeKey(x.category) === normalizeKey(edited.category) || normalizeKey(x.merchant) === normalizeKey(edited.merchant)); return [...new Set([...exact, ...related].map(x => x.detail).filter(Boolean))].sort(); };
const applyOverviewFilters = () => { setAppliedFilters({ from: fromDate, to: toDate, direction: directionSlice, category: categorySlice, detail: detailSlice, merchant: merchantSlice }); setChartSelection(null); setOverviewTransactionPage(0); };
const clearOverviewFilters = () => { setFromDate(""); setToDate(""); setDirectionSlice("All"); setCategorySlice("All"); setDetailSlice("All"); setMerchantSlice("All"); setAppliedFilters({ from: "", to: "", direction: "All", category: "All", detail: "All", merchant: "All" }); setChartSelection(null); setOverviewTransactionPage(0); };
const filterOverviewByCategory = (name: string) => { setCategorySlice(name); setDetailSlice("All"); setMerchantSlice("All"); setAppliedFilters({ ...appliedFilters, category: name, detail: "All", merchant: "All" }); setChartSelection(null); setOverviewTransactionPage(0); setNotice(`Overview filtered to category “${name}”.`); };
const openCategory = (name: string) => { setSelectedCategory(name); setDirectionSlice(appliedFilters.direction); setCategorySlice(name); setDetailSlice("All"); setMerchantSlice("All"); setAppliedFilters({ ...appliedFilters, category: name, detail: "All", merchant: "All" }); setChartSelection(null); setOverviewTransactionPage(0); setView("category"); };
const clearDeepFilters = () => { setFromDate(""); setToDate(""); setDirectionSlice(tileDirection); setCategorySlice(selectedCategory); setDetailSlice("All"); setMerchantSlice("All"); setAppliedFilters({ from: "", to: "", direction: tileDirection, category: selectedCategory, detail: "All", merchant: "All" }); setChartSelection(null); setOverviewTransactionPage(0); };
const applyWorkbenchFilters = () => { setAppliedQuery(query); setAppliedWorkbenchDate(workbenchDate); setAppliedWorkbenchDirection(workbenchDirection); setAppliedReviewOnly(reviewOnly); setWorkbenchPage(0); };
const saveCombination = (t: Tx) => { const identity = canonicalKey(t), masterItem: MasterItem = { id: identity, direction: directionOf(t), originalMerchant: t.description, merchant: t.merchant, category: t.category, detail: t.detail }, rule: Rule = { match: identity, mode: "identity", merchant: t.merchant, category: t.category, detail: t.detail }; save(txs.map(x => x.id === t.id ? t : x)); saveMaster([...master.filter(x => x.id !== identity), masterItem]); saveRules([...rules.filter(x => normalizeKey(x.match) !== normalizeKey(identity)), rule]); setDrafts(d => { const next = { ...d }; delete next[t.id]; return next; }); setNotice(`Saved ${t.merchant} to master data and learning rules.`); };
const clearAll = () => { if (!window.confirm("Clear all transactions, rules, custom categories and master data? This cannot be undone unless you exported a knowledge file.")) return; ["pocketview-v2", "pocketview-rules", "pocketview-categories", "pocketview-master", "pocketview-savings-target"].forEach(k => localStorage.removeItem(k)); setTxs([]); setRules([]); setMaster([]); setCustomCategories([]); setDrafts({}); setSelectedTxIds([]); setNewRuleMatch(""); setNewRuleKeyword(""); setNewRuleMerchant(""); setSavingsTarget(20); clearOverviewFilters(); setQuery(""); setWorkbenchDate("All"); setWorkbenchDirection("All"); setReviewOnly(false); setAppliedQuery(""); setAppliedWorkbenchDate("All"); setAppliedWorkbenchDirection("All"); setAppliedReviewOnly(false); setWorkbenchPage(0); setSelectedCategory("Food"); setChartSelection(null); setOverviewTransactionPage(0); setNotice("All Pocketview data was cleared. Import a CSV to start learning again."); setView("overview"); };
const applyLearnings = () => { const savedRules = JSON.parse(localStorage.getItem("pocketview-rules") || "[]") as Rule[]; const draftRules = Object.entries(drafts).map(([id, patch]) => { const original = txs.find(t => t.id === id)!; const edited = { ...original, ...patch }; return { match: canonicalKey(original), mode: "identity" as const, merchant: edited.merchant, category: edited.category, detail: edited.detail }; }); const activeRules = [...savedRules, ...draftRules].filter((r, i, a) => a.findLastIndex(x => `${x.mode || "identity"}|${normalizeKey(x.match)}` === `${r.mode || "identity"}|${normalizeKey(r.match)}`) === i); saveRules(activeRules); const next = rebuildTransactions(activeRules); setReviewOnly(true); const remaining = next.filter(reviewNeeded).length; setNotice(`Applied ${activeRules.length} specific rules. ${remaining} transactions still need review.`); };
const rememberSelected = () => { const chosen = txs.filter(t => selectedTxIds.includes(t.id)); if (!chosen.length) { setNotice("Select one or more transactions first."); return; } const newRules = chosen.map(t => { const edited = { ...t, ...drafts[t.id] }; return { match: canonicalKey(t), mode: "identity" as const, merchant: edited.merchant, category: edited.category, detail: edited.detail }; }), nextRules = [...rules, ...newRules].filter((r, i, a) => a.findLastIndex(x => `${x.mode || "identity"}|${normalizeKey(x.match)}` === `${r.mode || "identity"}|${normalizeKey(r.match)}`) === i), newMaster = chosen.map(t => { const edited = { ...t, ...drafts[t.id] }; return { id: canonicalKey(t), direction: directionOf(t), originalMerchant: t.description, merchant: edited.merchant, category: edited.category, detail: edited.detail } as MasterItem; }), nextMaster = [...master, ...newMaster].filter((m, i, a) => a.findLastIndex(x => x.id === m.id) === i), nextTxs = txs.map(t => selectedTxIds.includes(t.id) ? { ...t, ...drafts[t.id] } : t); saveRules(nextRules); saveMaster(nextMaster); save(nextTxs); setDrafts({}); setSelectedTxIds([]); setNotice(`Remembered and applied ${chosen.length} selected transactions.`); };
const exportCsv = (data?: Tx[]) => { const source = Array.isArray(data) ? data : filteredTxs; const quote = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`; const rows = [["Date", "Amount", "Direction", "Merchant", "Category", "Category Detail", "Bank Description", "Extended Details", "Review Status"], ...source.map(t => [t.date, t.amount, directionOf(t), t.merchant, t.category, t.detail, t.description, t.note, reviewNeeded(t) ? "Needs review" : "Complete"])]; const blob = new Blob([rows.map(row => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = `pocketview-enriched-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url); setNotice(`Exported ${source.length} enriched transactions.`); };
const exportKnowledge = (format: "json" | "csv") => { const exportedAt = new Date().toISOString(), a = document.createElement("a"); let blob: Blob; if (format === "json") { blob = new Blob([JSON.stringify({ version: 4, exportedAt, rules, categories: customCategories, master }, null, 2)], { type: "application/json" }); } else { const quote = (v: string) => `"${String(v).replace(/"/g, '""')}"`, header = ["Record Type", "Rule Match", "Match Mode", "Source Description", "Merchant", "Category", "Category Detail", "Direction", "Original Merchant", "Master ID", "Category Name"], rows = [header, ...rules.map(r => ["Rule", r.match, r.mode || "identity", r.sourceDescription || "", r.merchant, r.category, r.detail, "", "", "", ""]), ...customCategories.map(category => ["Category", "", "", "", "", "", "", "", "", "", category]), ...master.map(m => ["Master", "", "", "", m.merchant, m.category, m.detail, m.direction, m.originalMerchant || "", m.id, ""])]; blob = new Blob([rows.map(row => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }); } const url = URL.createObjectURL(blob); a.href = url; a.download = `pocketview-knowledge.${format}`; a.click(); URL.revokeObjectURL(url); setNotice(`Exported Pocketview knowledge as ${format.toUpperCase()}.`); };
const importKnowledge = async (f?: File) => { if (!f) return; try { const text = await f.text(); let nextRules: Rule[] = [], nextCategories: string[] = [], nextMaster: MasterItem[] = []; if (f.name.toLowerCase().endsWith(".json") || text.trimStart().startsWith("{")) { const data = JSON.parse(text); nextRules = Array.isArray(data.rules) ? data.rules : []; nextCategories = Array.isArray(data.categories) ? data.categories : []; nextMaster = Array.isArray(data.master) ? data.master : []; } else { const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean), headers = split(lines[0]).map(normalizeKey), at = (row: string[], name: string) => row[headers.indexOf(normalizeKey(name))] || ""; lines.slice(1).map(split).forEach((row, i) => { const type = normalizeKey(at(row, "Record Type")); if (type === "rule") nextRules.push({ match: at(row, "Rule Match"), mode: at(row, "Match Mode") === "contains" ? "contains" : "identity", sourceDescription: at(row, "Source Description") || undefined, merchant: at(row, "Merchant"), category: at(row, "Category") || "Unclassified", detail: at(row, "Category Detail") }); if (type === "category" && at(row, "Category Name")) nextCategories.push(at(row, "Category Name")); if (type === "master") nextMaster.push({ id: at(row, "Master ID") || `master-import-${Date.now()}-${i}`, direction: at(row, "Direction") === "Inbound" ? "Inbound" : "Outbound", originalMerchant: at(row, "Original Merchant"), merchant: at(row, "Merchant"), category: at(row, "Category") || "Unclassified", detail: at(row, "Category Detail") }); }); } nextRules = nextRules.filter(r => r.match?.trim()); nextCategories = [...new Map(nextCategories.filter(Boolean).map(x => [normalizeKey(x), x])).values()]; nextMaster = nextMaster.filter(m => m.merchant?.trim() || m.originalMerchant?.trim()); saveRules(nextRules); setCustomCategories(nextCategories); saveMaster(nextMaster); localStorage.setItem("pocketview-categories", JSON.stringify(nextCategories)); rebuildTransactions(nextRules); setNotice(`Imported ${nextRules.length} rules, ${nextCategories.length} categories and ${nextMaster.length} master rows from ${f.name.toLowerCase().endsWith(".csv") ? "CSV" : "JSON"}.`); } catch { setNotice("That knowledge file could not be read. Import a Pocketview CSV or JSON knowledge export."); } };
const upload = async (f?: File) => { if (!f)
    return; try {
    const x = parseCsv(await f.text(), rules);
    save(x);
    const importedDates = [...new Set(x.map(t => t.date))].sort((a, b) => dateKey(a) - dateKey(b)), importedFrom = importedDates[0] ? isoDate(importedDates[0]) : "", importedTo = importedDates.at(-1) ? isoDate(importedDates.at(-1)!) : "";
    setFromDate(importedFrom); setToDate(importedTo); setDirectionSlice("All"); setCategorySlice("All"); setDetailSlice("All"); setMerchantSlice("All"); setAppliedFilters({ from: importedFrom, to: importedTo, direction: "All", category: "All", detail: "All", merchant: "All" }); setChartSelection(null); setOverviewTransactionPage(0);
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
<button className={`nav ${view === "budget" ? "active" : ""}`} onClick={() => setView("budget")}><span>◎</span>Budget planner</button>
<button className={`nav ${view === "transactions" ? "active" : ""}`} onClick={() => setView("transactions")}>
<span>⇄</span>Classify transactions <b className="badge">
{txs.filter(reviewNeeded).length}</b>
</button>
<button className={`nav ${view === "rules" ? "active" : ""}`} onClick={() => setView("rules")}><span>⌁</span>Learning rules <b className="badge">{rules.length}</b></button>
<button className={`nav ${view === "master" ? "active" : ""}`} onClick={() => setView("master")}><span>▦</span>Master data</button>
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
<p className="eyebrow">SPEND OVERVIEW</p>
<h1>See exactly where your money went.</h1>
<p className="sub">Actual spending across the dates in your imported transaction file.</p>
</div>
<div className="actions">
<button className="backButton" onClick={exportCsv}>⇩ Export enriched CSV</button>
<button className="import" onClick={() => file.current?.click()}>＋ Import bank CSV</button>
<input ref={file} hidden type="file" accept=".csv" onChange={e => { upload(e.target.files?.[0]); e.currentTarget.value = ""; }}/>
</div>
</header>
<section className="slicerPanel"><label>FROM<input type="date" min={firstDate} max={lastDate} value={fromDate} onChange={e => { setFromDate(e.target.value); setCategorySlice("All"); setDetailSlice("All"); setMerchantSlice("All"); }}/></label><label>TO<input type="date" min={firstDate} max={lastDate} value={toDate} onChange={e => { setToDate(e.target.value); setCategorySlice("All"); setDetailSlice("All"); setMerchantSlice("All"); }}/></label><label>DIRECTION<select value={directionSlice} onChange={e => { setDirectionSlice(e.target.value); setCategorySlice("All"); setDetailSlice("All"); setMerchantSlice("All"); }}><option>All</option><option>Inbound</option><option>Outbound</option></select></label><label>CATEGORY<select value={categorySlice} onChange={e => { setCategorySlice(e.target.value); setDetailSlice("All"); setMerchantSlice("All"); }}><option>All</option>{overviewCategoryOptions.map(x => <option key={x}>{x}</option>)}</select></label><label>CATEGORY DETAIL<select value={detailSlice} onChange={e => { setDetailSlice(e.target.value); setMerchantSlice("All"); }}><option>All</option>{overviewDetailOptions.map(x => <option key={x}>{x}</option>)}</select></label><label>MERCHANT<select value={merchantSlice} onChange={e => setMerchantSlice(e.target.value)}><option>All</option>{overviewMerchantOptions.map(x => <option key={x}>{x}</option>)}</select></label><div className="filterActions"><button className="applyFilter" onClick={applyOverviewFilters}>Apply filters</button><button onClick={clearOverviewFilters}>Clear filters</button></div></section>
<section className={`filteredSpend ${tileDirection.toLowerCase()}`}><span>{tileDirection === "Inbound" ? "INCOME" : "SPEND"} IN CURRENT FILTER</span><b>{money(displayTotal)}</b><small>{tileTxs.length} matching {tileDirection.toLowerCase()} transactions</small></section>
<section className="spendKpis"><article><span>PERIOD</span><b>{periodDays} days</b><small>{filteredDates[0] || "No data"} – {filteredDates.at(-1) || "No data"}</small></article><article><span>DAILY {tileDirection === "Inbound" ? "INCOME" : "SPEND"}</span><b>{money(dailyFlow)}</b><small>Average across the selected period</small></article><article><span>30-DAY {tileDirection === "Inbound" ? "INCOME" : "SPEND"} PACE</span><b>{money(monthlyFlowAverage)}</b><small>Projected from the current rate</small></article><article className="largestInboundCard"><span>LARGEST INBOUND</span><b>{largestInbound ? money(largestInbound.amount) : money(0)}</b><small>{largestInbound ? `${largestInbound.merchant} · ${largestInbound.date}` : "No inbound transactions"}</small></article><article className="largestOutboundCard"><span>LARGEST OUTBOUND</span><b>{largestOutbound ? money(Math.abs(largestOutbound.amount)) : money(0)}</b><small>{largestOutbound ? `${largestOutbound.merchant} · ${largestOutbound.date}` : "No outbound transactions"}</small></article></section>
<section className="spendTimeline compactTrend flowTimeline"><div className="spendTrendHead"><div><h2>Money in and out over time</h2><p>{monthlyFlow.length ? `${monthlyFlow.length} ${monthlyFlow.length === 1 ? "month" : "months"} within the current filters · select a bar to see its transactions` : "Monthly inbound and outbound totals within the current filters"}</p></div><div className="flowSummary"><div><span>INBOUND</span><b>{money(totals.income)}</b></div><div><span>OUTBOUND</span><b>{money(totals.spent)}</b></div></div><button onClick={() => setView("transactions")}>{txs.filter(reviewNeeded).length} need review →</button></div>{monthlyFlow.length ? <div className="flowChartViewport"><div className="flowChart" style={{ minWidth: monthlyFlow.length > 10 ? `${monthlyFlow.length * 82}px` : "100%", gridTemplateColumns: `repeat(${monthlyFlow.length}, minmax(68px, 1fr))` }}>{monthlyFlow.map(([month, flow]) => <div className="flowMonth" key={month}><div className="flowHalf inboundHalf">{flow.inbound > 0 && <button className={`flowBar inboundBar ${chartSelection?.month === month && chartSelection.direction === "Inbound" ? "selected" : ""}`} style={{ height: `${Math.max(8, maxMonthlyFlow ? flow.inbound / maxMonthlyFlow * 82 : 0)}%` }} onClick={() => { setChartSelection({ month, direction: "Inbound" }); setOverviewTransactionPage(0); }} aria-label={`${shortMonth(month)} inbound ${money(flow.inbound)}`}><span>{money(flow.inbound)}</span></button>}</div><div className="flowHalf outboundHalf">{flow.outbound > 0 && <button className={`flowBar outboundBar ${chartSelection?.month === month && chartSelection.direction === "Outbound" ? "selected" : ""}`} style={{ height: `${Math.max(8, maxMonthlyFlow ? flow.outbound / maxMonthlyFlow * 82 : 0)}%` }} onClick={() => { setChartSelection({ month, direction: "Outbound" }); setOverviewTransactionPage(0); }} aria-label={`${shortMonth(month)} outbound ${money(flow.outbound)}`}><span>{money(flow.outbound)}</span></button>}</div><small>{shortMonth(month)}</small></div>)}</div><div className="flowLegend"><span><i className="inboundDot"/>Inbound</span><span><i className="outboundDot"/>Outbound</span></div></div> : <div className="trendEmpty">Import transactions or change the filters to see money moving in and out over time.</div>}</section>
{chartSelection && <section className="overviewTransactions"><div className="overviewTransactionsHead"><div><span>CHART DRILL-DOWN</span><h2>{shortMonth(chartSelection.month)} · {chartSelection.direction} transactions</h2><p>{chartTransactions.length} transactions within the current overview filters</p></div><button onClick={() => { setChartSelection(null); setOverviewTransactionPage(0); }}>Close</button></div><div className="overviewTxTable"><div className="overviewTxRow overviewTxHead"><span>DATE</span><span>MERCHANT</span><span>CATEGORY</span><span>CATEGORY DETAIL</span><span>AMOUNT</span></div>{overviewTransactionRows.map(t => <div className="overviewTxRow" key={t.id}><span>{t.date}</span><strong>{t.merchant}</strong><span>{t.category || "Unclassified"}</span><span>{t.detail || "—"}</span><b className={t.amount > 0 ? "credit" : ""}>{t.amount > 0 ? "+" : ""}{money(t.amount)}</b></div>)}</div><div className="overviewPagination"><span>Showing {chartTransactions.length ? safeOverviewTransactionPage * overviewPageSize + 1 : 0}–{Math.min((safeOverviewTransactionPage + 1) * overviewPageSize, chartTransactions.length)} of {chartTransactions.length}</span><div><button disabled={safeOverviewTransactionPage === 0} onClick={() => setOverviewTransactionPage(p => Math.max(0, p - 1))}>Previous</button><b>{safeOverviewTransactionPage + 1} / {overviewTransactionPages}</b><button disabled={safeOverviewTransactionPage >= overviewTransactionPages - 1} onClick={() => setOverviewTransactionPage(p => Math.min(overviewTransactionPages - 1, p + 1))}>Next</button></div></div></section>}
<section className="sectionHead">
<div>
<h2>{tileDirection === "Inbound" ? "Where your income came from" : "Where your money went"}</h2>
<p>Share of {tileDirection === "Inbound" ? "income" : "spending"} by category within the current filters</p>
</div>
</section>
<section className="budgetGrid">
{categoryTiles.map(x =>
<article className={`budgetCard overviewCategoryTile ${appliedFilters.category === x.name ? "tileActive" : ""}`} key={x.name}>
<button className="tileFilterHit" onClick={() => filterOverviewByCategory(x.name)} aria-label={`Filter overview to ${x.name}`}>
<div className="budgetTitle">
<span className="catIcon" style={{ background: colours[x.name] || "#625bf6" }}>
{x.name[0]}</span>
<div>
<b>
{x.name}</b>
<small>{tileShare(x.amount)}% of filtered {tileDirection.toLowerCase()}</small>
</div>
<span>
{money(x.amount)}</span>
</div>
<div className="miniBar">
<i style={{ width: `${tileShare(x.amount)}%`, background: colours[x.name] || "#625bf6" }}/>
</div>
</button>
<div className="budgetFoot">
<span>{x.count} transactions</span>
<button className="tileDetails" onClick={() => openCategory(x.name)}>View transactions →</button>
</div>
</article>)}{!categoryTiles.length && <div className="emptyState categoryTileEmpty">No {tileDirection.toLowerCase()} categories match the current filters.</div>}</section>
</> : view === "budget" ? <>
<header><div><p className="eyebrow">BUDGET PLANNER</p><h1>Turn your spending into a forward plan.</h1><p className="sub">Set a savings target, then compare the remaining income with your category guides.</p></div><div className="actions"><button className="backButton" onClick={() => setView("overview")}>← Spend overview</button></div></header>
<section className="budgetHero"><div><span>INCOME IN IMPORTED PERIOD</span><b>{money(totals.income)}</b><small>Budgeting uses the currently applied date range.</small></div><div className="targetControl"><label>SAVINGS TARGET <strong>{savingsTarget}%</strong></label><input aria-label="Savings target percentage" type="range" min="0" max="80" step="5" value={savingsTarget} onInput={e => { const value = Number(e.currentTarget.value); setSavingsTarget(value); localStorage.setItem("pocketview-savings-target", String(value)); }} onChange={e => { const value = Number(e.target.value); setSavingsTarget(value); localStorage.setItem("pocketview-savings-target", String(value)); }}/><small>Move the slider to reserve more or less of your income.</small></div><div><span>TARGET SAVINGS</span><b>{money(targetSavingsAmount)}</b><small>{money(plannedSpendLimit)} remains available for all spending.</small></div></section>
<section className="budgetSummary"><article><span>CATEGORY GUIDES</span><b>{money(totalBudgetGuide)}</b><small>Combined planned category limits</small></article><article><span>PLANNED SPEND LIMIT</span><b>{money(plannedSpendLimit)}</b><small>Income after target savings</small></article><article className={totalBudgetGuide > plannedSpendLimit ? "warningCard" : "goodCard"}><span>PLAN POSITION</span><b>{money(plannedSpendLimit - totalBudgetGuide)}</b><small>{totalBudgetGuide > plannedSpendLimit ? "Reduce guides or lower the savings target" : "Unallocated after category guides"}</small></article></section>
<section className="sectionHead"><div><h2>Category budget guides</h2><p>Use these as the next-period plan; actual spending stays on Overview.</p></div></section><section className="budgetGrid">{Object.entries(budget).map(([name, limit]) => { const actual = Math.abs(txs.filter(t => t.category === name && t.amount < 0).reduce((a, t) => a + t.amount, 0)); return <article className="budgetCard" key={name}><div className="budgetTitle"><span className="catIcon" style={{ background: colours[name] || "#625bf6" }}>{name[0]}</span><div><b>{name}</b><small>{actual ? `${money(actual)} actual in imported period` : "No classified spend yet"}</small></div><span>{money(limit)}</span></div><div className="miniBar"><i style={{ width: `${Math.min(100, limit ? actual / limit * 100 : 0)}%`, background: colours[name] || "#625bf6" }}/></div><div className="budgetFoot"><span>{money(Math.max(0, limit - actual))} remaining</span><span>of {money(limit)}</span></div></article>})}</section>
</> : view === "category" ? <>
<header><div><p className="eyebrow">DEEP DIVE</p><h1>{selectedCategory}</h1><p className="sub">Edit enriched taxonomy fields or export this filtered view.</p></div><div className="actions"><button className="backButton" onClick={exportCsv}>⇩ Export this view</button><button className="backButton" onClick={() => setView("overview")}>← Back to overview</button></div></header>
<section className="slicerPanel deepFilters"><label>FROM<input type="date" min={firstDate} max={lastDate} value={fromDate} onChange={e => { setFromDate(e.target.value); setDetailSlice("All"); setMerchantSlice("All"); }}/></label><label>TO<input type="date" min={firstDate} max={lastDate} value={toDate} onChange={e => { setToDate(e.target.value); setDetailSlice("All"); setMerchantSlice("All"); }}/></label><label>DIRECTION<select value={directionSlice} onChange={e => { setDirectionSlice(e.target.value); setDetailSlice("All"); setMerchantSlice("All"); }}><option>All</option><option>Inbound</option><option>Outbound</option></select></label><label>CATEGORY DETAIL<select value={detailSlice} onChange={e => { setDetailSlice(e.target.value); setMerchantSlice("All"); }}><option>All</option>{overviewDetailOptions.map(x => <option key={x}>{x}</option>)}</select></label><label>MERCHANT<select value={merchantSlice} onChange={e => setMerchantSlice(e.target.value)}><option>All</option>{overviewMerchantOptions.map(x => <option key={x}>{x}</option>)}</select></label><div className="filterActions"><button className="applyFilter" onClick={applyOverviewFilters}>Apply filters</button><button onClick={clearDeepFilters}>Clear filters</button></div></section>
<section className="categorySummary"><span>Total {tileDirection.toLowerCase()}</span><b>{money(displayTotal)}</b><small>{filteredTxs.length} transactions</small></section>
<section className="transactions categoryTransactions"><div className="drillTable"><div className="drillRow drillHead"><span>DIRECTION</span><span>MERCHANT</span><span>CATEGORY</span><span>CATEGORY DETAIL</span><span>DATE</span><span>AMOUNT</span><span></span></div>{filteredTxs.map(t => { const edited = { ...t, ...drafts[t.id] }; return <div className="drillRow" key={t.id}><span className={`directionTag ${directionOf(t).toLowerCase()}`}>{directionOf(t)}</span><input value={edited.merchant} onChange={e => setDrafts(d => ({ ...d, [t.id]: { ...d[t.id], merchant: e.target.value } }))}/><select value={edited.category} onChange={e => setDrafts(d => ({ ...d, [t.id]: { ...d[t.id], category: e.target.value, detail: "" } }))}>{allCategories.map(x => <option key={x}>{x}</option>)}</select><select value={edited.detail} onChange={e => setDrafts(d => ({ ...d, [t.id]: { ...d[t.id], detail: e.target.value } }))}><option value="">Select detail</option>{detailChoices(t).filter(x => x !== edited.detail).map(x => <option key={x}>{x}</option>)}{edited.detail && <option>{edited.detail}</option>}</select><span>{t.date}</span><strong className={t.amount > 0 ? "credit" : ""}>{t.amount > 0 ? "+" : ""}{money(t.amount)}</strong><button className="saveCombo" disabled={!drafts[t.id] || !edited.merchant || edited.category === "Unclassified" || !edited.detail} onClick={() => saveCombination(edited)}>Save to master & rules</button></div>})}</div></section>
</> : view === "rules" ? <>
<header><div><p className="eyebrow">LEARNING RULES</p><h1>Review what Pocketview remembers.</h1><p className="sub">Create a rule from a specific imported transaction, edit it, or remove it individually.</p></div><div className="actions"><button className="backButton" onClick={() => { const next = rebuildTransactions(rules); setNotice(`Refreshed ${next.length} transactions using the current rules.`); }}>↻ Refresh transactions</button></div></header>
<section className="ruleBuilder keywordBuilder">
<div className="ruleBuilderIntro"><div><b>Create a merchant rule</b><small>Choose a transaction, identify the distinguishing words in its bank description, then give it a clean merchant name.</small></div><span>1. Choose&nbsp;&nbsp; 2. Match&nbsp;&nbsp; 3. Name</span></div>
<div className="ruleBuilderFields">
<label>SOURCE TRANSACTION<select aria-label="Source transaction for new rule" value={newRuleMatch} onChange={e => { const source = ruleSourceOptions.find(([id]) => id === e.target.value)?.[1]; setNewRuleMatch(e.target.value); setNewRuleKeyword(keywordOptions(source)[0] || ""); setNewRuleMerchant(""); }} disabled={!ruleSourceOptions.length}><option value="">Choose a source transaction…</option>{ruleSourceOptions.map(([id, t]) => <option key={id} value={id}>{t.date} · {t.description}</option>)}</select></label>
<label>DESCRIPTION CONTAINS<input aria-label="Description contains text" list="rule-keyword-options" value={newRuleKeyword} onChange={e => setNewRuleKeyword(e.target.value)} disabled={!selectedRuleSource} placeholder="Type a word or phrase"/><datalist id="rule-keyword-options">{newRuleKeywords.map(word => <option key={word} value={word}/>)}</datalist></label>
<label className="cleanMerchantField">CLEAN MERCHANT<input aria-label="Clean merchant for new rule" value={newRuleMerchant} onChange={e => setNewRuleMerchant(e.target.value)} disabled={!selectedRuleSource} placeholder="Main merchant name"/></label>
<button className="import" disabled={!selectedRuleSource || !newRuleKeyword.trim() || !newRuleMerchant.trim()} onClick={() => { const keyword = newRuleKeyword.trim(), cleanMerchant = newRuleMerchant.trim(); if (!selectedRuleSource || !keyword || !cleanMerchant) { setNotice("Choose a source transaction, type a description match and enter the clean merchant first."); return; } if (!normalizeKey(selectedRuleSource.description).includes(normalizeKey(keyword))) { setNotice("The description match must appear in the selected source transaction."); return; } if (rules.some(r => r.mode === "contains" && normalizeKey(r.match) === normalizeKey(keyword))) { setNotice("A contains rule already exists for that word or phrase."); return; } saveRules([...rules, { match: keyword, mode: "contains", sourceDescription: selectedRuleSource.description, merchant: cleanMerchant, category: selectedRuleSource.category, detail: selectedRuleSource.detail }]); setNewRuleMatch(""); setNewRuleKeyword(""); setNewRuleMerchant(""); setNotice(`Created a rule: descriptions containing “${keyword}” will use merchant “${cleanMerchant}”.`); }}>＋ Create merchant rule</button>
</div>
</section>
<section className="knowledgeBar rulesKnowledgeBar"><div><b>Backup or restore learning knowledge</b><small>Export rules, categories and master data as JSON or CSV. Either format can be imported later or moved to another browser.</small></div><button onClick={() => exportKnowledge("json")}>Export JSON</button><button onClick={() => exportKnowledge("csv")}>Export CSV</button><button onClick={() => knowledgeFile.current?.click()}>Import CSV or JSON</button><input ref={knowledgeFile} hidden type="file" accept=".json,.csv,application/json,text/csv" onChange={e => { importKnowledge(e.target.files?.[0]); e.currentTarget.value = ""; }}/></section>
<section className="ruleCards">{rules.map((r, i) => <article className="ruleCard" key={`${r.match}-${i}`}><div className="ruleCardHead"><div><span>RULE {i + 1} · {r.mode === "contains" ? "DESCRIPTION CONTAINS" : "EXACT IDENTITY"}</span><b>{r.mode === "contains" ? `Description contains “${r.match}”` : r.match}</b><small>{r.sourceDescription ? `Source: ${r.sourceDescription} · ` : ""}{txs.filter(t => ruleMatches(t, r)).length} matching transactions</small></div><button className="deleteButton" onClick={() => { const nextRules = rules.filter((_, j) => j !== i); saveRules(nextRules); rebuildTransactions(nextRules); setNotice("Rule deleted and transactions refreshed."); }}>Remove rule</button></div><div className="ruleFields merchantFirst"><label className="cleanMerchantField">CLEAN MERCHANT<input value={r.merchant || ""} onChange={e => saveRules(rules.map((x, j) => j === i ? { ...x, merchant: e.target.value } : x))}/></label><label>MATCH METHOD<select value={r.mode || "identity"} onChange={e => saveRules(rules.map((x, j) => j === i ? { ...x, mode: e.target.value as "contains" | "identity" } : x))}><option value="contains">Description contains</option><option value="identity">Exact transaction identity</option></select></label><label>{r.mode === "contains" ? "WORD OR PHRASE" : "TRANSACTION IDENTITY"}<input value={r.match} onChange={e => saveRules(rules.map((x, j) => j === i ? { ...x, match: e.target.value } : x))}/></label><label>CATEGORY<select value={r.category} onChange={e => saveRules(rules.map((x, j) => j === i ? { ...x, category: e.target.value, detail: "" } : x))}>{allCategories.map(x => <option key={x}>{x}</option>)}</select></label><label>CATEGORY DETAIL<select value={r.detail} onChange={e => { if (e.target.value === "__new__") { const value = window.prompt("Enter a new category detail"); if (value?.trim()) saveRules(rules.map((x, j) => j === i ? { ...x, detail: value.trim() } : x)); return; } saveRules(rules.map((x, j) => j === i ? { ...x, detail: e.target.value } : x)); }}><option value="">Select detail</option>{detailOptions.filter(x => x !== r.detail).map(x => <option key={x}>{x}</option>)}{r.detail && <option>{r.detail}</option>}<option value="__new__">＋ Create new detail…</option></select></label></div></article>)}{!rules.length && <div className="emptyState ruleEmpty">No rules yet. Select a source transaction and type the description match above to create the first merchant rule.</div>}</section>
<section className="dangerZone"><div><b>Clear all learning rules</b><p>Remove every rule and restore transactions from their original bank descriptions. Master data is kept.</p></div><button onClick={() => { if (!window.confirm("Clear every learning rule and refresh all transactions? Master data will be kept.")) return; saveRules([]); rebuildTransactions([]); setNotice("All learning rules were cleared and transactions were refreshed from the original bank data."); }}>Clear all rules</button></section>
</> : view === "master" ? <>
<header><div><p className="eyebrow">MASTER DATA</p><h1>Your permanent taxonomy.</h1><p className="sub">Clean and maintain original merchants and approved taxonomy combinations.</p></div><div className="actions"><button className="backButton" onClick={() => { const next = rebuildTransactions(rules); setNotice(`Refreshed ${next.length} transactions using the current rules.`); }}>↻ Refresh transactions</button><button className="backButton" onClick={() => { const seen = new Set<string>(), clean = master.filter(x => { const key = [x.direction, x.originalMerchant || "", x.merchant, x.category, x.detail].map(normalizeKey).join("|"); if (seen.has(key)) return false; seen.add(key); return true; }); saveMaster(clean); setNotice(`Removed ${master.length - clean.length} duplicate master rows.`); }}>Clean duplicates</button><button className="import" onClick={() => saveMaster([...master, { id: `master-${Date.now()}`, direction: "Outbound", originalMerchant: "", merchant: "", category: "Unclassified", detail: "" }])}>＋ Add master row</button></div></header>
<section className="adminPanel"><div className="masterInfo"><b>{master.length} master combinations</b><span>Original merchant is preserved from the imported bank description.</span></div><div className="adminRow masterGrid adminHead"><span>DIRECTION</span><span>ORIGINAL MERCHANT</span><span>CLEAN MERCHANT</span><span>CATEGORY</span><span>CATEGORY DETAIL</span><span></span></div>{master.map((m, i) => <div className="adminRow masterGrid" key={m.id}><select value={m.direction} onChange={e => saveMaster(master.map((x, j) => j === i ? { ...x, direction: e.target.value as "Inbound" | "Outbound" } : x))}><option>Inbound</option><option>Outbound</option></select><input value={m.originalMerchant || ""} onChange={e => saveMaster(master.map((x, j) => j === i ? { ...x, originalMerchant: e.target.value } : x))}/><input value={m.merchant} onChange={e => saveMaster(master.map((x, j) => j === i ? { ...x, merchant: e.target.value } : x))}/><select value={m.category} onChange={e => saveMaster(master.map((x, j) => j === i ? { ...x, category: e.target.value, detail: "" } : x))}>{allCategories.map(x => <option key={x}>{x}</option>)}</select><select value={m.detail} onChange={e => saveMaster(master.map((x, j) => j === i ? { ...x, detail: e.target.value } : x))}><option value="">Select detail</option>{detailOptions.filter(x => x !== m.detail).map(x => <option key={x}>{x}</option>)}{m.detail && <option>{m.detail}</option>}</select><button className="deleteButton" onClick={() => saveMaster(master.filter((_, j) => j !== i))}>Delete</button></div>)}</section>
<section className="dangerZone"><div><b>Start again</b><p>Clear transactions, learning rules, custom categories and master data from this browser.</p></div><button onClick={clearAll}>Clear all data</button></section>
</> : <>
<header>
<div>
<p className="eyebrow">TRANSACTION WORKBENCH</p>
<h1>Make every transaction meaningful.</h1>
<p className="sub">Clean merchants, add context, and teach Pocketview your categories.</p>
</div>
<div className="actions">
<button className="import" onClick={() => file.current?.click()}>＋ Import bank CSV</button>
<input ref={file} hidden type="file" accept=".csv" onChange={e => { upload(e.target.files?.[0]); e.currentTarget.value = ""; }}/>
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
<label className="search">⌕<input value={query} onChange={e => { setQuery(e.target.value); setWorkbenchPage(0); }} placeholder="Search merchant or note"/>
</label>
<select className="workbenchDate" value={workbenchDate} onChange={e => { setWorkbenchDate(e.target.value); setWorkbenchPage(0); }} aria-label="Transaction date"><option>All</option>{dateOptions.map(x => <option key={x}>{x}</option>)}</select>
<select className="workbenchDate" value={workbenchDirection} onChange={e => { setWorkbenchDirection(e.target.value); setWorkbenchPage(0); }} aria-label="Transaction direction"><option>All</option><option>Inbound</option><option>Outbound</option></select>
<label className="reviewToggle"><input type="checkbox" checked={reviewOnly} onChange={e => { setReviewOnly(e.target.checked); setWorkbenchPage(0); }}/> Needs review only</label>
<div className="filterActions"><button className="applyFilter" onClick={applyWorkbenchFilters}>Apply filters</button><button onClick={() => { setQuery(""); setWorkbenchDate("All"); setWorkbenchDirection("All"); setReviewOnly(false); setAppliedQuery(""); setAppliedWorkbenchDate("All"); setAppliedWorkbenchDirection("All"); setAppliedReviewOnly(false); setWorkbenchPage(0); }}>Clear filters</button></div>
<button className="applyRules" onClick={() => exportCsv(shown)}>⇩ Export view</button>
<button className="applyRules" onClick={applyLearnings}>↻ Apply learned rules</button>
</div>
<div className="batchBar"><label><input type="checkbox" checked={pagedShown.length > 0 && pagedShown.every(t => selectedTxIds.includes(t.id))} onChange={e => { const pageIds = pagedShown.map(t => t.id); setSelectedTxIds(ids => e.target.checked ? [...new Set([...ids, ...pageIds])] : ids.filter(id => !pageIds.includes(id))); }}/> Select all {pagedShown.length} on this page</label><span>{selectedTxIds.length} selected</span><button disabled={!selectedTxIds.length} onClick={rememberSelected}>Remember & apply selected</button></div>
<div className="categoryMaker"><div><b>Add a category</b><small>Create a category, then assign transactions to it below.</small></div><input value={newCategory} onChange={e => setNewCategory(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addCategory(); }} placeholder="e.g. Holidays"/><button onClick={addCategory}>Add category</button></div>
{pagedShown.map(t =>
<article className={`classRow ${reviewNeeded(t) ? "needsReview" : ""}`} key={t.id}>
<label className="rowSelect"><input type="checkbox" checked={selectedTxIds.includes(t.id)} onChange={e => setSelectedTxIds(ids => e.target.checked ? [...ids, t.id] : ids.filter(id => id !== t.id))}/><span>Select transaction</span></label>
<div className="txMain">
<i>
{t.merchant[0]}</i>
<div>
<b>
{t.merchant}</b>
<small>
{t.date} · {t.description}</small>
{t.note && <p>Extended details: {t.note}</p>}<em className={`directionTag ${directionOf(t).toLowerCase()}`}>{directionOf(t)}</em></div>
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
<label>CATEGORY DETAIL<input aria-label={`Category detail for ${t.description}`} list={`detail-options-${t.id}`} value={drafts[t.id]?.detail ?? t.detail} onChange={e => setDrafts(d => ({ ...d, [t.id]: { ...d[t.id], detail: e.target.value } }))} placeholder="Type or choose detail"/><datalist id={`detail-options-${t.id}`}>{detailChoices(t).filter(x => x !== (drafts[t.id]?.detail ?? t.detail)).map(x => <option key={x} value={x}/>)}</datalist>
</label>
<button className="remember" disabled={!drafts[t.id]} onClick={() => { const edited = { ...t, ...drafts[t.id] }, rule: Rule = { match: canonicalKey(t), mode: "identity", merchant: edited.merchant, category: edited.category, detail: edited.detail }, nextRules = [...rules.filter(r => `${r.mode || "identity"}|${normalizeKey(r.match)}` !== `identity|${normalizeKey(rule.match)}`), rule], nextTxs = txs.map(x => ruleMatches(x, rule) ? { ...x, direction: directionOf(x), merchant: rule.merchant, category: rule.category, detail: rule.detail } : { ...x, direction: directionOf(x) }), masterItem: MasterItem = { id: canonicalKey(t), direction: directionOf(t), originalMerchant: t.description, merchant: edited.merchant, category: edited.category, detail: edited.detail }, nextMaster = [...master.filter(x => x.id !== masterItem.id), masterItem]; saveRules(nextRules); saveMaster(nextMaster); save(nextTxs); setDrafts(d => { const next = { ...d }; delete next[t.id]; return next; }); setNotice(`Rule and master data saved for ${edited.merchant}.`); }}>Remember & apply</button>
</div>
</article>)}
<div className="pagination"><span>Showing {shown.length ? safeWorkbenchPage * workbenchPageSize + 1 : 0}–{Math.min((safeWorkbenchPage + 1) * workbenchPageSize, shown.length)} of {shown.length}</span><div><button disabled={safeWorkbenchPage === 0} onClick={() => setWorkbenchPage(p => Math.max(0, p - 1))}>Previous</button><b>{safeWorkbenchPage + 1} / {workbenchPages}</b><button disabled={safeWorkbenchPage >= workbenchPages - 1} onClick={() => setWorkbenchPage(p => Math.min(workbenchPages - 1, p + 1))}>Next</button></div></div></section>
</>}<footer>
<span>Transactions and rules stay in this browser.</span>
<button onClick={() => save(demo)}>Restore demo data</button>
</footer>
</section>
</main>; }
