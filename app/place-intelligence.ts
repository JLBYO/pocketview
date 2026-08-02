import { australianPlaces, australianPlaceSource } from "./australian-places";

export type PlacePrediction = {
    place: string;
    confidence: number;
    evidence: string;
};

type PlaceCandidate = {
    words: string[];
    name: string;
    stateCode: string;
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const baseName = (value: string) => value.replace(/\s+\([^)]*\)\s*$/, "").trim();
const stateAliases: Record<string, string[]> = {
    NSW: ["nsw", "new south wales"], VIC: ["vic", "victoria"], QLD: ["qld", "queensland"],
    SA: ["south australia"], WA: ["western australia"], TAS: ["tas", "tasmania"],
    NT: ["northern territory"], ACT: ["act", "australian capital territory"], OT: ["other territories"],
};
const genericSingleWords = new Set(["airport", "bank", "beach", "bridge", "cash", "central", "home", "online", "orange", "park", "sale", "service", "spring", "target"]);
const firstWordIndex = new Map<string, PlaceCandidate[]>();

for (const [officialName, stateCode] of australianPlaces) {
    const name = baseName(officialName);
    const words = normalize(name).split(" ").filter(Boolean);
    if (!words.length) continue;
    const candidate = { words, name, stateCode };
    const bucket = firstWordIndex.get(words[0]) || [];
    bucket.push(candidate);
    firstWordIndex.set(words[0], bucket);
}
firstWordIndex.forEach(bucket => bucket.sort((a, b) => b.words.length - a.words.length || b.name.length - a.name.length));

export const australianPlaceCount = australianPlaceSource.count;
export const australianPlaceReference = australianPlaceSource;

export function predictAustralianPlace(value: string): PlacePrediction | undefined {
    const normalized = normalize(value);
    if (!normalized) return undefined;
    const words = normalized.split(" ");
    const matches: PlaceCandidate[] = [];
    for (let index = 0; index < words.length; index += 1) {
        for (const candidate of firstWordIndex.get(words[index]) || []) {
            if (candidate.words.every((word, offset) => words[index + offset] === word)) matches.push(candidate);
        }
    }
    if (!matches.length) return undefined;
    const longest = Math.max(...matches.map(candidate => candidate.words.length));
    let finalists = matches.filter(candidate => candidate.words.length === longest);
    const detectedStates = Object.entries(stateAliases).filter(([, aliases]) => aliases.some(alias => normalized.includes(alias))).map(([code]) => code);
    if (detectedStates.length === 1) finalists = finalists.filter(candidate => candidate.stateCode === detectedStates[0]);
    if (!finalists.length) return undefined;
    const uniquePlaces = [...new Map(finalists.map(candidate => [`${normalize(candidate.name)}|${candidate.stateCode}`, candidate])).values()];
    const uniqueStates = new Set(uniquePlaces.map(candidate => candidate.stateCode));
    if (uniqueStates.size > 1 && detectedStates.length !== 1) return undefined;
    const candidate = uniquePlaces[0];
    if (candidate.words.length === 1 && (candidate.name.length < 6 || genericSingleWords.has(normalize(candidate.name))) && detectedStates.length !== 1) return undefined;
    const confidence = Math.min(96, (candidate.words.length > 1 ? 88 : 78) + (detectedStates.length === 1 ? 8 : 0));
    return {
        place: `${candidate.name}, ${candidate.stateCode}`,
        confidence,
        evidence: detectedStates.length === 1 ? `${candidate.name} and ${candidate.stateCode} appear in the bank description` : `${candidate.name} appears in the bank description`,
    };
}
