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
    stateDisplay: string;
};

type PositionedPlaceCandidate = PlaceCandidate & { wordIndex: number };

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const baseName = (value: string) => value.replace(/\s+\([^)]*\)\s*$/, "").trim();
const stateAliases: Record<string, string[]> = {
    NSW: ["nsw", "new south wales"], VIC: ["vic", "victoria"], QLD: ["qld", "queensland"],
    SA: ["south australia"], WA: ["western australia"], TAS: ["tas", "tasmania"],
    NT: ["northern territory"], ACT: ["act", "australian capital territory"], OT: ["other territories"],
};
const absStateCodes: Record<string, string> = { "1": "NSW", "2": "VIC", "3": "QLD", "4": "SA", "5": "WA", "6": "TAS", "7": "NT", "8": "ACT", "9": "OT" };
const stateDisplayNames: Record<string, string> = { NSW: "NSW", VIC: "Victoria", QLD: "Queensland", SA: "South Australia", WA: "Western Australia", TAS: "Tasmania", NT: "Northern Territory", ACT: "ACT", OT: "Other Territories" };
const canonicalStateCode = (value: string) => absStateCodes[value] || value.toUpperCase();
export const formatAustralianStateCode = (value: string) => stateDisplayNames[canonicalStateCode(value)] || value;
const genericSingleWords = new Set(["airport", "bank", "beach", "bridge", "cash", "central", "home", "online", "orange", "park", "sale", "service", "spring", "target"]);
const firstWordIndex = new Map<string, PlaceCandidate[]>();

for (const [officialName, stateCode] of australianPlaces) {
    const name = baseName(officialName);
    const words = normalize(name).split(" ").filter(Boolean);
    if (!words.length) continue;
    const canonicalCode = canonicalStateCode(stateCode);
    const candidate = { words, name, stateCode: canonicalCode, stateDisplay: formatAustralianStateCode(canonicalCode) };
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
    const matches: PositionedPlaceCandidate[] = [];
    for (let index = 0; index < words.length; index += 1) {
        for (const candidate of firstWordIndex.get(words[index]) || []) {
            if (candidate.words.every((word, offset) => words[index + offset] === word)) matches.push({ ...candidate, wordIndex: index });
        }
    }
    if (!matches.length) return undefined;
    const longest = Math.max(...matches.map(candidate => candidate.words.length));
    let finalists = matches.filter(candidate => candidate.words.length === longest);
    const detectedStates = Object.entries(stateAliases).filter(([, aliases]) => aliases.some(alias => normalized.includes(alias))).map(([code]) => code);
    if (detectedStates.length === 1) finalists = finalists.filter(candidate => candidate.stateCode === detectedStates[0]);
    if (!finalists.length) return undefined;
    finalists.sort((a, b) => b.wordIndex - a.wordIndex || b.name.length - a.name.length);
    const uniquePlaces = [...new Map(finalists.map(candidate => [`${normalize(candidate.name)}|${candidate.stateCode}`, candidate])).values()];
    const uniqueStates = new Set(uniquePlaces.map(candidate => candidate.stateCode));
    if (uniqueStates.size > 1 && detectedStates.length !== 1) return undefined;
    const candidate = uniquePlaces[0];
    if (candidate.words.length === 1 && (candidate.name.length < 6 || genericSingleWords.has(normalize(candidate.name))) && detectedStates.length !== 1) return undefined;
    const confidence = Math.min(96, (candidate.words.length > 1 ? 88 : 78) + (detectedStates.length === 1 ? 8 : 0));
    return {
        place: `${candidate.name}, ${candidate.stateDisplay}`,
        confidence,
        evidence: detectedStates.length === 1 ? `${candidate.name} and ${candidate.stateDisplay} appear in the bank description` : `${candidate.name} appears in the bank description`,
    };
}
