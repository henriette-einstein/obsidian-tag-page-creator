import { App, Notice, Plugin, TFile, TFolder, PluginSettingTab, Setting, moment } from "obsidian";

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
        this.addSettingTab(new TagPageCreatorSettingTab(this.app, this));
    }

    async createTagPages() {
        const dir = this.settings.directory.trim() || "Tags";
        await this.ensureFolder(dir);

        const tags = await this.getAllTags(this.app);
        const created: string[] = [];

        for (const tag of tags) {
            const cleanedTag = tag.replace(/\//g, '-');
            const fileName = `${dir}/Tag_${cleanedTag}.md`;
            const file = this.app.vault.getAbstractFileByPath(fileName);
            if (!file) {
                const content = this.buildContent(tag);
                await this.app.vault.create(fileName, content);
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

    addSegmentsToSet(set: Set<string>, str: string) {
        const parts = str.split('/');
        for (let i = 1; i <= parts.length; i++) {
            set.add(parts.slice(0, i).join('/'));
        }
    }

    async getAllTags(app: App): Promise<string[]> {
        const tagSet = new Set<string>();
        const files = app.vault.getMarkdownFiles();

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);

            // 1. Inline tags
            if (cache && cache.tags) {
                for (const t of cache.tags) {
                    const tag = t.tag.replace(/^#/, "");
                    if (tag) this.addSegmentsToSet(tagSet,tag);
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
                    // comma or space separated string
                    yamlTags.split(/[, ]/).forEach(tag => {
                        tag = tag.trim();
                        if (tag) this.addSegmentsToSet(tagSet, tag.replace(/^#/, ""));
                    });
                }
            }
        }

        return Array.from(tagSet).sort();
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