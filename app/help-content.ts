export const tabGuides: Record<string, { name: string; purpose: string; steps: { title: string; text: string }[]; note: string }> = {
    overview: {
        name: "Overview", purpose: "Understand the money moving through your imported accounts.",
        steps: [
            { title: "Add Your Bank Files", text: "Choose Add Bank CSV and confirm the Bank and Account Name. Reuse the same account name for later exports. Overlapping records are skipped; your existing history and classifications stay intact." },
            { title: "Choose Your View", text: "Set dates within your imported range, then choose one or more banks, accounts, directions, categories, details, places or merchants. Click Apply Filters. Clear Filters restores the full view." },
            { title: "Explore The Chart And Tiles", text: "Inbound is money received; outbound is money paid. Select a bar to see that month's transactions, 25 at a time. A category tile filters the overview; View Transactions opens its Deep Dive." },
            { title: "Check Transfers", text: "Matched transfers between your accounts can be excluded from spending and income. Review those matches: a transfer is not necessarily earnings or a purchase." }
        ], note: "These are transaction totals, not live bank balances. Tiles show only categories present in the applied filters, including Unclassified when needed."
    },
    budget: {
        name: "Budget Planner", purpose: "Turn your recorded spending into a plan you can adjust.",
        steps: [
            { title: "Choose A Representative Period", text: "Select dates, bank, account and place, then Apply Filters. Use enough history to include regular bills; short or unusual periods can distort forecasts." },
            { title: "Set Your Savings Target", text: "Move the savings slider to reserve a percentage of income in the selected period. The remainder is your planning allowance. This does not move money or open a savings account." },
            { title: "Set Monthly Category Guides", text: "Classify spending first so its categories appear here. Enter a monthly guide for each category. The forecast scales recorded spending to a 30.44-day month; variance compares that forecast with your guide." },
            { title: "Review Likely Recurring Payments", text: "Repeated merchants, similar amounts and timing suggest bills or subscriptions. Check each suggestion; expected dates and confidence are estimates, not confirmed future payments." }
        ], note: "Savings targets use income for the selected period; category guides are monthly. These are different timeframes. Budgets save locally and are included in encrypted history backups."
    },
    transactions: {
        name: "Classify Transactions", purpose: "Clean bank descriptions and teach Pocketview what each transaction means.",
        steps: [
            { title: "Narrow The Review List", text: "Search or choose date, account, direction and place filters, then Apply Filters. Needs Review helps you find incomplete classifications. Rows are displayed 50 at a time." },
            { title: "Edit A Transaction", text: "Set the clean Merchant, Category, Category Detail and Place. Use Add A Category for a new category. Category Detail accepts either an existing choice or a new value you type." },
            { title: "Save And Learn Explicitly", text: "Edits here are drafts until you click Remember & Apply, Remember & Apply Selected, or Apply Learned Rules. Saving also creates a linked Master Data combination. Apply Learned Rules commits current drafts and reapplies saved rules." },
            { title: "Work In Smart Batches", text: "Inspect the sample and suggestions before approving a batch. Use Suggestions For Selected fills drafts; review them before saving. Select All applies to the current page, not your whole history." }
        ], note: "New imports begin unclassified. Australian places may be predicted locally; merchant, category and detail suggestions come from approved knowledge. Suggestions are not approval."
    },
    rules: {
        name: "Learning Rules", purpose: "Create, inspect and maintain the instructions Pocketview remembers.",
        steps: [
            { title: "Choose A Source Transaction", text: "Search your imported transactions, then choose the bank description the rule should match. Enter distinguishing words in Description Contains and give it a clean merchant name." },
            { title: "Make The Match Specific", text: "Use & when all terms must occur: coles & shepparton matches descriptions containing both, in any order. A phrase matches as a phrase. Do not use just ANZ when different payees share that bank name." },
            { title: "Inspect And Maintain Rules", text: "View Matches opens the transactions below a rule. Edit its matching text and output fields, or Copy Rule to create a separate rule and linked Master Data row. Use Remove Rule for one rule; Clear All Rules requires confirmation." },
            { title: "Refresh And Back Up", text: "Refresh Transactions rebuilds classifications from current rules. Export CSV or JSON saves knowledge; Import Knowledge restores that format. Audit And Undo keeps the latest 10 changes; older compact entries may require an archive restore." }
        ], note: "Editing rules saves knowledge immediately. Refresh Transactions applies those edits to existing records. Removing a rule also removes its linked Master Data and refreshes matching classifications."
    },
    master: {
        name: "Master Data", purpose: "Maintain clean names, linked rules, account history and recovery files.",
        steps: [
            { title: "Maintain Your Taxonomy", text: "Each row contains direction, original merchant, clean merchant, category, detail and place. Edit a linked row to update its Learning Rule too. The Linked Rule button opens that rule. Clean Duplicates consolidates repeated combinations." },
            { title: "Keep Accounts Consistent", text: "Manage Imported Accounts renames an account across transactions and import history. Every File Added Over Time shows each import's date coverage and added/skipped counts; Download Original CSV retrieves the source file." },
            { title: "Choose The Right Export", text: "Master CSV/JSON includes complete Master Data and linked rules. Save Encrypted History Backup includes transactions, knowledge, budgets and original CSVs. Save it in your private OneDrive or Google Drive folder and keep the password safe." },
            { title: "Share An Assistant Snapshot", text: "Download Assistant JSON exports all saved transactions, regardless of filters. Publish Assistant Output updates a separate private online copy. Publishing is manual; it does not connect the assistant automatically." },
            { title: "Start Again Safely", text: "Archive And Clear All Data asks for confirmation, archives the current workspace on this device, then clears active data and knowledge. Archives can be restored, exported or deleted here. Clear Published Output separately clears the online assistant copy." }
        ], note: "Deleting a linked Master Data row also deletes its Learning Rule after confirmation. Signing in does not sync your browser history across devices; use an encrypted history backup to move it."
    },
    category: {
        name: "Deep Dive", purpose: "Review and refine the individual transactions behind a category.",
        steps: [
            { title: "Check The Applied Scope", text: "This view opens from a category's View Transactions button. Narrow dates, account, direction, detail, place or merchant and choose Apply Filters." },
            { title: "Refine The Details", text: "Edit Merchant, Category, Category Detail and Place. Type a new category detail or choose a relevant existing detail. The original bank description stays visible for comparison." },
            { title: "Save A Complete Combination", text: "Once merchant, a classified category and detail are filled in, choose Save To Master & Rules. This saves a description-identity rule and linked Master Data, and updates transactions matching that identity." },
            { title: "Page Or Export", text: "Use Previous and Next to review 25 transactions at a time. Export This View downloads the filtered saved records, not just the current page. Unsaved drafts are not exported." }
        ], note: "Use Back To Overview to return to the chart. Changes remain drafts until Save To Master & Rules is pressed."
    }
};

export const ruleGuide = [
    { title: "Original Description → Match → Clean Fields", text: "Learning Rules match the original bank description, not the editable clean merchant. Description identity rules also use extended details. The output sets merchant, category, category detail and place." },
    { title: "Where Rules Are Built", text: "Remember & Apply, saving a Deep Dive combination and approving Smart Batches create rules plus linked Master Data. You can also create and copy rules directly in Learning Rules. An unlinked manual Master Data row is suggestion knowledge, not an automatic rule." },
    { title: "When Rules Overlap", text: "A description identity match takes priority over Description Contains. If several rules of the same kind match, the last matching rule in the saved list wins. View Matches helps you spot broad or conflicting rules." },
    { title: "What Is Built In", text: "Money direction follows the amount's sign. Local Australian place data offers location predictions. There are no built-in merchant/category assignments: categories start with Unclassified and grow from your approved data." }
];
