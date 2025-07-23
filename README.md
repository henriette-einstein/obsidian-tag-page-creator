# Tag Page Creator

Creates a note for each tag in your Obsidian vault, with a specific YAML frontmatter and a content template, **only if the note doesn't already exist**.

## How to Use

1. Install or copy this plugin into your `.obsidian/plugins/` folder.
2. Run `npm install` to install dependencies.
3. Run `npm run build` to build the plugin.
4. Enable the plugin in Obsidian's settings.
5. Run the "Create Tag Pages" command from the command palette.

Each generated page will have:
- YAML frontmatter with the tag as an alias, and creation date.
- H2 heading "Notizen".
- A special code block with filters for the tag.