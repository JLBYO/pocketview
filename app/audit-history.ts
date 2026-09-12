/** Legacy audit entries deliberately stripped transactions; they are not full backups. */
export function usableUndo<T extends { txs?: unknown[]; fullSnapshot?: boolean }>(snapshot: T): boolean {
    return snapshot.fullSnapshot === true && Array.isArray(snapshot.txs);
}

export function keepRecentAudit<T>(entries: T[]): T[] {
    return entries.slice(0, 10);
}
