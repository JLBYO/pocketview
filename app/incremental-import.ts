export type IncrementalMergeResult<T> = {
    records: T[];
    added: T[];
    skippedCount: number;
};

/**
 * Keeps every existing record and appends only occurrences that are not already
 * present. Counting occurrences avoids collapsing two legitimate, identical
 * transactions from the same account and date into one.
 */
export function mergeUniqueByOccurrence<T>(existing: T[], incoming: T[], keyOf: (record: T) => string): IncrementalMergeResult<T> {
    const existingCounts = existing.reduce((counts, record) => {
        const key = keyOf(record);
        counts.set(key, (counts.get(key) || 0) + 1);
        return counts;
    }, new Map<string, number>());
    const incomingCounts = new Map<string, number>();
    const added = incoming.filter(record => {
        const key = keyOf(record), occurrence = (incomingCounts.get(key) || 0) + 1;
        incomingCounts.set(key, occurrence);
        return occurrence > (existingCounts.get(key) || 0);
    });
    return { records: [...existing, ...added], added, skippedCount: incoming.length - added.length };
}
