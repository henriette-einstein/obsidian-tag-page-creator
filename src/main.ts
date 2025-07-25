import { App, Notice, Menu, Plugin, TFile, normalizePath, PluginSettingTab, Setting, moment } from "obsidian";
import { getCaseSensitiveDuplicateTags, getSegmentNormalizedTagMap, getAllTags } from "./tag-utils";
import { getAliases, getFrontmatterAndBody, updateCodeBlock } from "./utils";
import * as yaml from "js-yaml";


interface TagPageCreatorSettings {
    directory: string;
}

const DEFAULT_SETTINGS: TagPageCreatorSettings = {
    directory: "Tags"
};



export default class TagPageCreatorPlugin extends Plugin {
    settings: TagPageCreatorSettings;

    async onload() {
        this.loadSettings()

        this.addCommand({
            id: "create-tag-pages",
            name: "Create Tag Pages",
            callback: async () => await this.createTagPages(),
        });

        this.addCommand({
            id: "normalize-tag-segments-to-lowercase",
            name: "Normalize tag segments to lowercase",
            callback: async () => {
                await normalizeTagSegmentsToLowercase(this.app);
            }
        });
        this.addSettingTab(new TagPageCreatorSettingTab(this.app, this));
    }

    async createTagPages() {
        const dir = this.settings.directory.trim() || "Tags";
        await this.ensureFolder(dir);

        const tags = await getAllTags(this.app);
        const created: string[] = [];

        for (const tag of tags) {
            const cleanedTag = tag.replace(/\//g, ' ').toLowerCase().trim();
            // always generate lowercase files
            const fileName = `${dir}/Tag ${cleanedTag}.md`;
            console.log(`Furzing tag page for "${tag}" at ${fileName}`);
            const file = this.app.vault.getAbstractFileByPath(fileName);
            if (!file) {
                try {
                    await createTagPage(this.app, fileName, tag);
                } catch (error) {
                    new Notice(`Error creating tag page for "${tag}": ${error}`);
                    continue;
                }
                created.push(fileName);
            } else {
                try {
                    await addTagIfNeeded(this.app, file as TFile, tag);
                } catch (error) {
                    new Notice(`Error updating tag page for "${tag}": ${error}`);
                    continue;
                }
            }
        }

        if (created.length) {
            new Notice(`Created ${created.length} tag page(s):\n${created.join(", ")}`);
        } else {
            new Notice("No new tag pages created. All tag pages already exist.");
        }
    }

    async ensureFolder(path: string) {
        const folder = this.app.vault.getAbstractFileByPath(path);
        if (!folder) {
            await this.app.vault.createFolder(path);
            new Notice(`Created dirctory ${path}`)
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

}


async function createTagPage(app: App, fileName: string, tag: string) {
    const today = moment().format("YYYY-MM-DD");
    const content = `---
aliases: ["#${tag}"]
created: ${today}
---

## Tag ${tag}

\`\`\`base
filters:
\tor:
\t\t- file.hasTag("${tag}")
views:
\t- type: table
\t  name: Alle Notizen
\`\`\`
`;
    await this.app.vault.create(fileName, content);
}

async function addTagIfNeeded(app: App, file: TFile, tag: string) {
    let content = await app.vault.read(file);
    const { frontmatter, body } = getFrontmatterAndBody(content);
    let aliases = getAliases(frontmatter);
    const normalizedTag = "#" + tag;
    if (!aliases.includes(normalizedTag)) {
        aliases.push(normalizedTag);
        frontmatter.aliases = aliases.length === 1 ? aliases[0] : aliases;
        // Collect all tag variants (without #)
        const tagVariants = Array.from(new Set(
            aliases
                .map(a => a.startsWith("#") ? a.slice(1) : a)
        ));
        const newBody = updateCodeBlock(body, tagVariants);
        const fm = yaml.dump(frontmatter, { noRefs: true }).trim();
        const newContent = `---\n${fm}\n---\n${newBody.replace(/^\n+/, "")}`;
        await app.vault.modify(file, newContent)
    }
}


async function normalizeTagSegmentsToLowercase(app: App) {
    const duplicateTagGroups = await getCaseSensitiveDuplicateTags(app);

    const replacementMap = new Map<string, string>();
    for (const group of duplicateTagGroups) {
        const groupMap = getSegmentNormalizedTagMap(group);
        for (const [from, to] of groupMap.entries()) {
            if (from !== to) replacementMap.set(from, to);
        }
    }

    if (replacementMap.size === 0) {
        new Notice("No tag segments with case differences found.");
        return;
    }

    const markdownFiles = app.vault.getMarkdownFiles();

    for (const file of markdownFiles) {
        let content = await app.vault.read(file);

        // Replace inline tags (with #)
        for (const [from, to] of replacementMap.entries()) {
            const escapedFrom = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\B#${escapedFrom}\\b`, "g");
            content = content.replace(regex, `#${to}`);
        }

        // Replace YAML frontmatter tags
        content = content.replace(/^---\n([\s\S]+?)\n---/, (fm) => {
            let newFm = fm;
            for (const [from, to] of replacementMap.entries()) {
                const regexWithHash = new RegExp(`\\b${from}\\b`, "g");
                const regexWithoutHash = new RegExp(`\\b${from.replace(/^#/, "")}\\b`, "g");
                newFm = newFm.replace(regexWithHash, to);
                newFm = newFm.replace(regexWithoutHash, to.replace(/^#/, ""));
            }
            return newFm;
        });

        if (content !== await app.vault.read(file)) {
            await app.vault.modify(file, content);
        }
    }
    new Notice("Tag segments normalized to lowercase.");
}

/**
 * Replaces (or updates) all file.hasTag(...) filter lines in all ```base code blocks,
 * adding all tagVariants (and not duplicating).
 */
function replaceBaseFilters(body: string, tagVariants: string[]): string {
    return body.replace(
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
                    const tagMatch = line.match(/file\.hasTag$begin:math:text$"([^"]+)"$end:math:text$/);
                    if (tagMatch) tagsInBlock.add(tagMatch[1]);
                    continue; // Don't add old tag line here
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
}


class TagPageCreatorSettingTab extends PluginSettingTab {
    plugin: TagPageCreatorPlugin;

    constructor(app: App, plugin: TagPageCreatorPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl("h2", { text: "Tag Page Creator Settings" });

        new Setting(containerEl)
            .setName("Output directory")
            .setDesc('Where the tag pages should be created (default: "Tags").')
            .addText(text => text
                .setPlaceholder("Tags")
                .setValue(this.plugin.settings.directory)
                .onChange(async (value) => {
                    this.plugin.settings.directory = value.trim() || "Tags";
                    await this.plugin.saveSettings();
                }));
    }
}