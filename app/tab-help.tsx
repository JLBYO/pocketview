"use client";

import { ruleGuide, tabGuides } from "./help-content";

export default function TabHelp({ view, open, onToggle }: { view: string; open: boolean; onToggle(): void }) {
    const guide = tabGuides[view] || tabGuides.overview;
    return <section className="tabHelp" id="tab-help" aria-label={`How To Use ${guide.name}`}>
        <button id="tab-help-toggle" className="tabHelpToggle" type="button" aria-expanded={open} aria-controls="tab-help-body" onClick={onToggle}>
            <span className="helpMark" aria-hidden="true">?</span>
            <span><strong>How To Use {guide.name}</strong><small>Steps, Learning Rules And Safe Saving</small></span>
            <span className="helpToggleLabel">{open ? "Close Guide" : "Open Guide"}</span>
        </button>
        {open && <div id="tab-help-body" className="tabHelpBody">
            <p className="helpPurpose">{guide.purpose}</p>
            <ol className="helpSteps">{guide.steps.map(step => <li key={step.title}><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>
            <p className="helpNote">{guide.note}</p>
            <details className="helpRules"><summary>How Learning Rules And Master Data Work</summary><div className="helpRuleGrid">{ruleGuide.map(item => <article key={item.title}><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></details>
            <details className="helpRules"><summary>Privacy, Saving And Recovery</summary><p>Wait for History Saved On This Device before leaving. Unsaved transaction drafts are temporary. If a save fails, keep the tab open and export a backup. Only one tab should edit your history at a time.</p><p>Your working history and archives stay in this browser. Signing out hides the app but does not erase local files. Use your own locked device and export encrypted backups regularly; clearing browser data can remove the local database.</p><p>Learning Rules and Master Data exports contain knowledge only. Assistant JSON is a read-only transaction snapshot, not a complete backup. A password-encrypted history backup is the recovery file to use on a new device.</p></details>
        </div>}
    </section>;
}
