import { App, Notice, Plugin, TFile, TFolder, PluginSettingTab, Setting, moment } from "obsidian";
import { getCaseSensitiveDuplicateTags, getSegmentNormalizedTagMap, getAllTags } from "./tag-utils";


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
            const cleanedTag = tag.replace(/\//g, '-');
            const fileName = `${dir}/Tag ${cleanedTag}.md`;
            const file = this.app.vault.getAbstractFileByPath(fileName);
            if (!file) {
                const content = this.buildContent(tag);
                try {
                    await this.app.vault.create(fileName, content);
                } catch (error) {
                    new Notice(`Error creating tag page for "${tag}": ${error}`);
                    continue;
                }
                created.push(fileName);
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



    buildContent(tag: string): string {
        const today = moment().format("YYYY-MM-DD");
        return `---
aliases: ["#${tag}"]
created: ${today}
---

## Tag ${tag}

\`\`\`base
filters:
\tand:
\t\t- file.hasTag("${tag}")
views:
\t- type: table
\t  name: Alle Notizen
\`\`\`
`;
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
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