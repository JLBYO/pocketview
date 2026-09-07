export type LocalArchiveRecord<T> = {
    id: string;
    createdAt: string;
    reason: string;
    transactionCount: number;
    importCount: number;
    payload: T;
};

export type LocalArchiveSummary = Omit<LocalArchiveRecord<unknown>, "payload">;

export type LocalSourceFile = {
    id: string;
    name: string;
    type: string;
    size: number;
    lastModified: number;
    text: string;
};

const databaseName = "pocketview-local-data";
const storeName = "archives";
const sourceStoreName = "source-files";
const activeStoreName = "active-state";

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 3);
    request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, { keyPath: "id" });
        if (!database.objectStoreNames.contains(sourceStoreName)) database.createObjectStore(sourceStoreName, { keyPath: "id" });
        if (!database.objectStoreNames.contains(activeStoreName)) database.createObjectStore(activeStoreName, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const complete = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
});

export async function saveLocalArchive<T>(record: LocalArchiveRecord<T>) {
    const database = await openDatabase();
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(record);
    await complete(transaction);
    database.close();
}

export async function listLocalArchives(): Promise<LocalArchiveSummary[]> {
    const database = await openDatabase();
    const request = database.transaction(storeName).objectStore(storeName).getAll();
    const records = await new Promise<LocalArchiveRecord<unknown>[]>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    database.close();
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(record => ({ id: record.id, createdAt: record.createdAt, reason: record.reason, transactionCount: record.transactionCount, importCount: record.importCount }));
}

export async function getLocalArchive<T>(id: string): Promise<LocalArchiveRecord<T> | undefined> {
    const database = await openDatabase();
    const request = database.transaction(storeName).objectStore(storeName).get(id);
    const record = await new Promise<LocalArchiveRecord<T> | undefined>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    database.close();
    return record;
}

export async function deleteLocalArchive(id: string) {
    const database = await openDatabase();
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(id);
    await complete(transaction);
    database.close();
}

export async function listLocalSourceFiles(): Promise<LocalSourceFile[]> {
    const database = await openDatabase();
    const request = database.transaction(sourceStoreName).objectStore(sourceStoreName).getAll();
    const records = await new Promise<LocalSourceFile[]>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    database.close();
    return records;
}

export async function replaceLocalSourceFiles(records: LocalSourceFile[]) {
    const database = await openDatabase();
    const transaction = database.transaction(sourceStoreName, "readwrite");
    const store = transaction.objectStore(sourceStoreName);
    store.clear();
    records.forEach(record => store.put(record));
    await complete(transaction);
    database.close();
}

export async function appendLocalSourceFiles(records: LocalSourceFile[]) {
    if (!records.length) return;
    const database = await openDatabase();
    const transaction = database.transaction(sourceStoreName, "readwrite");
    const store = transaction.objectStore(sourceStoreName);
    records.forEach(record => store.put(record));
    await complete(transaction);
    database.close();
}

export async function getLocalSourceFile(id: string): Promise<LocalSourceFile | undefined> {
    const database = await openDatabase();
    const request = database.transaction(sourceStoreName).objectStore(sourceStoreName).get(id);
    const record = await new Promise<LocalSourceFile | undefined>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    database.close();
    return record;
}

export async function getLocalActiveState<T>(key: string): Promise<T | undefined> {
    const database = await openDatabase();
    const request = database.transaction(activeStoreName).objectStore(activeStoreName).get(key);
    const record = await new Promise<{ key: string; value: T } | undefined>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    database.close();
    return record?.value;
}

export async function saveLocalActiveState<T>(key: string, value: T) {
    const database = await openDatabase();
    const transaction = database.transaction(activeStoreName, "readwrite");
    transaction.objectStore(activeStoreName).put({ key, value });
    await complete(transaction);
    database.close();
}

export async function clearLocalActiveState() {
    const database = await openDatabase();
    const transaction = database.transaction(activeStoreName, "readwrite");
    transaction.objectStore(activeStoreName).clear();
    await complete(transaction);
    database.close();
}
