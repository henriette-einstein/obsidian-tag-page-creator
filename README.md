# Tag Page Creator

Creates a note for each tag in your Obsidian vault, with a specific YAML frontmatter and a content template, **only if the note doesn't already exist**.

Each generated page will have:
- YAML frontmatter with the tag as an alias, and creation date.
- H2 heading "Tag " + the name of the tag.
- A special code block with filters for the tag.