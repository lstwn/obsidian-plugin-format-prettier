# obsidian-plugin-format-prettier

> Format your notes in Obsidian using [prettier](https://prettier.io/).

This is an **updated** and _maintained_ fork of
[the original obsidian prettier plugin](https://github.com/hipstersmoothie/obsidian-plugin-prettier).
It adds prettier's capability to format prose with a given print width. This is
helpful when viewing your vault with a text editor like vim.

The plugin exposes the following commands:

| Action                 | Hotkey             |
| ---------------------- | ------------------ |
| Format the entire note | Not Set by Default |
| Format only selection  | Not Set by Default |

And the following settings:

| Setting            | Default      |
| ------------------ | ------------ |
| Format on Save     | `false`      |
| Format Code Blocks | `false`      |
| Prose Wrap         | `"preserve"` |
| Print Width        | `80`         |

## Installing

Either install the latest release from Obsidian directly or unzip the
[latest release](https://github.com/lstwn/obsidian-plugin-prettier/releases/latest)
into your `<vault>/.obsidian/plugins/` folder.

Once the plugin is installed, you need to make sure that the switch for
"Prettier Format" is turned on. Afterwards you can see the plugin's commands
commands in the command palette. You can assign the commands to hotkeys for easy
usage in Obsidian's settings.
