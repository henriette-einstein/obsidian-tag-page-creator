import { App } from "obsidian";

export async function getCaseSensitiveDuplicateTags(app: App): Promise<string[][]> {
    const tagMap: Map<string, Set<string>> = new Map();

    const markdownFiles = app.vault.getMarkdownFiles();

    for (const file of markdownFiles) {
        const cache = app.metadataCache.getFileCache(file);

        // Inline tags
        if (cache?.tags) {
            for (const tagObj of cache.tags) {
                const tag = tagObj.tag;
                const lower = tag.toLowerCase();
                if (!tagMap.has(lower)) tagMap.set(lower, new Set());
                tagMap.get(lower)!.add(tag);
            }
        }

        // YAML frontmatter tags
        const frontmatter = cache?.frontmatter;
        if (frontmatter && frontmatter.tags) {
            const addTag = (tag: string) => {
                const tagNorm = tag.startsWith("#") ? tag : "#" + tag;
                const lower = tagNorm.toLowerCase();
                if (!tagMap.has(lower)) tagMap.set(lower, new Set());
                tagMap.get(lower)!.add(tagNorm);
            };

            if (Array.isArray(frontmatter.tags)) {
                for (const tag of frontmatter.tags) {
                    if (typeof tag === "string") addTag(tag);
                }
            } else if (typeof frontmatter.tags === "string") {
                for (const tag of frontmatter.tags.split(/[, ]/)) {
                    if (tag) addTag(tag);
                }
            }
        }
    }

    // Only entries with more than one variant (case difference)
    const duplicates: string[][] = [];
    for (const variants of tagMap.values()) {
        if (variants.size > 1) {
            duplicates.push(Array.from(variants));
        }
    }
    return duplicates;
}

export function getSegmentNormalizedTagMap(tagGroup: string[]): Map<string, string> {
    const segmentsList = tagGroup.map(tag => tag.split("/"));
    const canonicalSegments = segmentsList[0].map((seg, idx) => {
        const variants = segmentsList.map(segs => segs[idx]);
        const lower = variants.find(v => v === v.toLowerCase());
        return lower ?? variants[0].toLowerCase();
    });

    const map = new Map<string, string>();
    for (const segments of segmentsList) {
        const normalized = segments.map((seg, idx) => canonicalSegments[idx]).join("/");
        map.set(segments.join("/"), normalized);
    }
    return map;
}

export function addSegmentsToSet(set: Set<string>, str: string) {
    const parts = str.toLowerCase().split('/');
    for (let i = 1; i <= parts.length; i++) {
        set.add(parts.slice(0, i).join('/'));
    }
}


export async function getAllTags(app: App): Promise<string[]> {
    const tagSet = new Set<string>();
    const files = app.vault.getMarkdownFiles();

    for (const file of files) {
        const cache = app.metadataCache.getFileCache(file);

        // 1. Inline tags
        if (cache && cache.tags) {
            for (const t of cache.tags) {
                const tag = t.tag.replace(/^#/, "");
                if (tag) addSegmentsToSet(tagSet, tag);
            }
        }

        // 2. YAML frontmatter tags
        if (cache && cache.frontmatter && cache.frontmatter.tags) {
            const yamlTags = cache.frontmatter.tags;
            if (Array.isArray(yamlTags)) {
                yamlTags.forEach(tag => {
                    if (typeof tag === "string") tagSet.add(tag.replace(/^#/, ""));
                });
            } else if (typeof yamlTags === "string") {
                yamlTags.split(/[, ]/).forEach(tag => {
                    tag = tag.trim();
                    if (tag) addSegmentsToSet(tagSet, tag.replace(/^#/, ""));
                });
            }
        }
    }

    return Array.from(tagSet).sort();
}
