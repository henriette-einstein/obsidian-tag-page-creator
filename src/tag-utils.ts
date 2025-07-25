import { App } from "obsidian";

// Helper to extract tags from frontmatter (array or string)
function extractYamlTags(tags: string[] | string | undefined): string[] {
    if (!tags) return [];
    if (Array.isArray(tags)) return tags.filter(t => typeof t === "string");
    return tags.split(/[, ]/).map(t => t.trim()).filter(Boolean);
}

// Adds all hierarchical segments to a set
export function addSegmentsToSet(set: Set<string>, str: string) {
    const parts = str.split('/');
    for (let i = 1; i <= parts.length; i++) {
        set.add(parts.slice(0, i).join('/'));
    }
}

export async function getCaseSensitiveDuplicateTags(app: App): Promise<string[][]> {
    const tagMap: Map<string, Set<string>> = new Map();
    const markdownFiles = app.vault.getMarkdownFiles();

    for (const file of markdownFiles) {
        const cache = app.metadataCache.getFileCache(file);

        // Inline tags
        if (cache?.tags) {
            for (const tagObj of cache.tags) {
                const tag = tagObj.tag.startsWith("#") ? tagObj.tag : "#" + tagObj.tag;
                const lower = tag.toLowerCase();
                if (!tagMap.has(lower)) tagMap.set(lower, new Set());
                tagMap.get(lower)!.add(tag);
            }
        }

        // YAML frontmatter tags
        if (cache?.frontmatter) {
            extractYamlTags(cache.frontmatter.tags).forEach(tag => {
                const tagNorm = tag.startsWith("#") ? tag : "#" + tag;
                const lower = tagNorm.toLowerCase();
                if (!tagMap.has(lower)) tagMap.set(lower, new Set());
                tagMap.get(lower)!.add(tagNorm);
            });
        }
    }

    // Only entries with more than one case variant
    return Array.from(tagMap.values()).filter(variants => variants.size > 1).map(variants => Array.from(variants));
}

export function getSegmentNormalizedTagMap(tagGroup: string[]): Map<string, string> {
    const segmentsList = tagGroup.map(tag => tag.split("/"));
    const canonicalSegments = segmentsList[0].map((_, idx) => {
        const variants = segmentsList.map(segs => segs[idx]);
        const lower = variants.find(v => v === v.toLowerCase());
        return lower ?? variants[0].toLowerCase();
    });

    const map = new Map<string, string>();
    segmentsList.forEach(segments => {
        const normalized = segments.map((seg, idx) => canonicalSegments[idx]).join("/");
        map.set(segments.join("/"), normalized);
    });
    return map;
}

export async function getAllTags(app: App): Promise<string[]> {
    const tagSet = new Set<string>();
    const files = app.vault.getMarkdownFiles();

    for (const file of files) {
        const cache = app.metadataCache.getFileCache(file);

        // Inline tags
        if (cache?.tags) {
            for (const t of cache.tags) {
                const tag = t.tag.replace(/^#/, "");
                if (tag) addSegmentsToSet(tagSet, tag);
            }
        }

        // YAML frontmatter tags
        if (cache?.frontmatter) {
            extractYamlTags(cache.frontmatter.tags).forEach(tag => {
                if (tag) addSegmentsToSet(tagSet, tag.replace(/^#/, ""));
            });
        }
    }

    return Array.from(tagSet).sort();
}
