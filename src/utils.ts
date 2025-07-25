import * as yaml from "js-yaml";

/**
 * Extracts frontmatter and body from a Markdown file content.
 * @returns { frontmatter: any, body: string }
 */
export function getFrontmatterAndBody(content: string): { frontmatter: any, body: string } {
    const fmRegex = /^---\n([\s\S]*?)\n---\n?/;
    const match = content.match(fmRegex);

    let frontmatter: any = {};
    let body = content;
    if (match) {
        frontmatter = yaml.load(match[1]) || {};
        body = content.slice(match[0].length);
    }
    return { frontmatter, body };
}

export function getAliases(frontmatter: any): string[] {
    if (!frontmatter) return [];
    if (frontmatter.aliases) {
        if (Array.isArray(frontmatter.aliases)) {
            return [...frontmatter.aliases.map(String)];
        } else if (typeof frontmatter.aliases === "string") {
            return frontmatter.aliases.split(",").map((s: string) => s.trim()).filter(Boolean);
        }
    }
    if (frontmatter.alias) {
        if (Array.isArray(frontmatter.alias)) {
            return [...frontmatter.alias.map(String)];
        } else if (typeof frontmatter.alias === "string") {
            return frontmatter.alias.split(",").map((s: string) => s.trim()).filter(Boolean);
        }
    }
    return [];
}

export function createContent(frontmatter: any, body: string): string {
    const fm = yaml.dump(frontmatter, { noRefs: true });
    return `---\n${fm}---\n\n${body.replace(/^\n+/, "")}`;
}

export function updateCodeBlock(body: string, tagVariants: string[]): string {
    body = body.replace(
        /```base([\s\S]*?)```/g,
        (match, code) => {
            const lines = code.split("\n");
            const newLines: string[] = [];
            let inOrBlock = false;
            let foundFilters = false;
            let orIndent = "";
            let tagsInBlock = new Set<string>();
            for (let line of lines) {
                if (line.trim().startsWith("filters:")) {
                    foundFilters = true;
                    newLines.push(line);
                    continue;
                }
                if (foundFilters && line.includes("or:")) {
                    inOrBlock = true;
                    orIndent = line.match(/^(\s*)/)?.[1] ?? "";
                    newLines.push(line);
                    continue;
                }
                if (inOrBlock && line.includes('file.hasTag(')) {
                    const tagMatch = line.match(/file\.hasTag\("([^"]+)"\)/);
                    if (tagMatch) tagsInBlock.add(tagMatch[1]);
                    continue;
                }
                if (inOrBlock && !line.match(/^\s*-\s*file\.hasTag/)) {
                    inOrBlock = false;
                    for (const t of tagVariants) {
                        if (!tagsInBlock.has(t)) tagsInBlock.add(t);
                    }
                    for (const t of Array.from(tagsInBlock)) {
                        newLines.push(`${orIndent}\t\t- file.hasTag("${t}")`);
                    }
                }
                newLines.push(line);
            }
            // If still inside the or block at the end, add tags
            if (inOrBlock) {
                for (const t of tagVariants) {
                    if (!tagsInBlock.has(t)) tagsInBlock.add(t);
                }
                for (const t of Array.from(tagsInBlock)) {
                    newLines.push(`${orIndent}\t\t- file.hasTag("${t}")`);
                }
            }
            const uniqueLines = Array.from(new Set(newLines));
            return "```base\n" + uniqueLines.join("\n") + "\n```";
        }
    );
    return body;
}