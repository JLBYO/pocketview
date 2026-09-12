/** Shared admission patterns with the consumer; not a complete secret classifier. */
export function containsOutputCredential(text: string): boolean {
    return /(?:^|[^A-Za-z0-9_-])(?:bot)?[1-9]\d{4,19}:[A-Za-z0-9_-]{30,128}(?:$|[^A-Za-z0-9_-])/.test(text)
        || /\bsk-[A-Za-z0-9_-]{16,}/.test(text)
        || /\b(?:sb_secret_|sbp_)[A-Za-z0-9_-]{16,}/.test(text)
        || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)
        || /\b(?:password|recovery code|seed phrase)\s*[:=]/i.test(text)
        || /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/.test(text)
        || /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/.test(text)
        || /\bAKIA[0-9A-Z]{16}\b/.test(text)
        || /\bAIza[0-9A-Za-z_-]{30,}/.test(text)
        || /\b(?:api[_ -]?key|access[_ -]?token|secret)\s*[:=]\s*["']?[A-Za-z0-9+/_=-]{16,}/i.test(text);
}
