import {
  App,
  Editor,
  MarkdownView,
  Plugin,
  PluginSettingTab,
  Setting,
} from "obsidian";
import {
  Options as PrettierOptions,
  format as prettierFormat,
  formatWithCursor as prettierFormatWithCursor,
} from "prettier";
import * as babel from "prettier/plugins/babel";
import * as estree from "prettier/plugins/estree";
import * as html from "prettier/plugins/html";
import * as yaml from "prettier/plugins/yaml";
import * as ts from "prettier/plugins/typescript";
import * as gql from "prettier/plugins/graphql";
import * as markdown from "prettier/plugins/markdown";
import * as postcss from "prettier/plugins/postcss";

const prettierPlugins = [babel, estree, html, yaml, ts, gql, markdown, postcss];

export type CursorPosition = {
  line: number;
  ch: number;
};

const positionToCursorOffset = (
  code: string,
  { line, ch }: CursorPosition,
): number => {
  return code.split("\n").reduce((pos, currLine, index) => {
    if (index < line) {
      return pos + currLine.length + 1;
    }

    if (index === line) {
      return pos + ch;
    }

    return pos;
  }, 0);
};

const cursorOffsetToPosition = (
  code: string,
  cursorOffset: number,
): CursorPosition => {
  const substring = code.slice(0, cursorOffset);
  const line = substring.split("\n").length - 1;
  const indexOfLastLine = substring.lastIndexOf("\n");

  return {
    line,
    ch: cursorOffset - indexOfLastLine - 1,
  };
};

class PrettierFormatSettingsTab extends PluginSettingTab {
  private readonly plugin: PrettierPlugin;

  constructor(app: App, plugin: PrettierPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  public async display(): Promise<void> {
    const { containerEl } = this;
    this.containerEl.empty();

    new Setting(containerEl).setName("Plugin").setHeading();

    new Setting(containerEl)
      .setName("Format on Save")
      .setDesc(
        "If enabled, format the current note when you save the file via hotkey",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.formatOnSave)
          .onChange(async (value) => {
            this.plugin.settings.formatOnSave = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName("Prettier").setHeading();

    const _embeddedLangaugeFormatting = new Setting(containerEl)
      .setName("Format code blocks in Markdown")
      .setDesc(
        "If enabled, format code blocks (supports html, css, ts, js, json, yaml, graphql)",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.embeddedLanguageFormatting)
          .onChange(async (value) => {
            this.plugin.settings.embeddedLanguageFormatting = value;
            await this.plugin.saveSettings();
          }),
      );

    const _proseWrap = new Setting(containerEl)
      .setName("Prose Wrap")
      .setDesc("Wrap prose at print width")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions(ProseWrap)
          .setValue(this.plugin.settings.proseWrap)
          .onChange(async (value) => {
            this.plugin.settings.proseWrap = value as ProseWrap;
            await this.plugin.saveSettings();
          }),
      );

    const printWidth = new Setting(containerEl)
      .setName("Print Width")
      .setDesc(`Current print width ${this.plugin.settings.printWidth}`)
      .addSlider((slider) =>
        slider
          .setLimits(10, 200, 10)
          .setValue(this.plugin.settings.printWidth)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.printWidth = value;
            await this.plugin.saveSettings();
            printWidth.setDesc(
              `Current value ${this.plugin.settings.printWidth}`,
            );
          }),
      );
  }
}

type ProseWrap = Exclude<PrettierOptions["proseWrap"], undefined>;
const ProseWrap = {
  always: "always",
  never: "never",
  preserve: "preserve",
} as const;
type PrintWidth = Exclude<PrettierOptions["printWidth"], undefined>;
type TabWidth = Exclude<PrettierOptions["tabWidth"], undefined>;
type UseTabs = Exclude<PrettierOptions["useTabs"], undefined>;
type EmbeddedLanguageFormatting = Exclude<
  PrettierOptions["embeddedLanguageFormatting"],
  undefined
>;

type PrettierPluginSettings = {
  formatOnSave: boolean;
  embeddedLanguageFormatting: boolean;
  proseWrap: ProseWrap;
  printWidth: PrintWidth;
};

const DEFAULT_SETTINGS: PrettierPluginSettings = {
  formatOnSave: false,
  embeddedLanguageFormatting: false,
  proseWrap: "preserve",
  printWidth: 80,
};

type FormatKind = (typeof FormatKind)[keyof typeof FormatKind];
const FormatKind = {
  document: 0,
  selection: 1,
} as const;

export default class PrettierPlugin extends Plugin {
  settings: PrettierPluginSettings = {} as PrettierPluginSettings;

  async onload(): Promise<void> {
    console.log("Loading Prettier Format plugin");

    await this.loadSettings();

    this.addSettingTab(new PrettierFormatSettingsTab(this.app, this));

    this.addCommand({
      id: "format-note",
      name: "Format the entire note",
      editorCallback: (editor) => this.format(FormatKind.document, editor),
    });

    this.addCommand({
      id: "format-selection",
      name: "Format only the current text selection in the note",
      editorCallback: (editor) => this.format(FormatKind.selection, editor),
    });

    this.hookIntoSaveCmd();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  getPrettierSettings(): PrettierOptions {
    const embeddedLanguageFormatting: EmbeddedLanguageFormatting = this.settings
      .embeddedLanguageFormatting
      ? "auto"
      : "off";

    // just a hack around the obsidian API not exposing this in their types..
    // for these two values we rely on the global editor settings
    type GetConfig<T> = {
      getConfig(setting: string): T | undefined;
    };
    const useTabs: UseTabs =
      (this.app.vault as unknown as GetConfig<boolean>).getConfig("useTabs") ??
      false;
    const tabWidth: TabWidth =
      (this.app.vault as unknown as GetConfig<number>).getConfig("tabSize") ??
      4;

    return {
      embeddedLanguageFormatting,
      proseWrap: this.settings.proseWrap,
      printWidth: this.settings.printWidth,
      useTabs,
      tabWidth,
    };
  }

  async formatDocument(editor: Editor): Promise<void> {
    const text = editor.getValue();
    const cursor = editor.getCursor();
    const position = positionToCursorOffset(text, cursor);
    const { formatted: rawFormatted, cursorOffset } =
      await prettierFormatWithCursor(text, {
        parser: "markdown",
        plugins: prettierPlugins,
        cursorOffset: position,
        ...this.getPrettierSettings(),
      });
    const formatted = rawFormatted;

    if (formatted === text) {
      return;
    }

    const { left, top } = editor.getScrollInfo();
    editor.setValue(formatted);
    editor.setCursor(cursorOffsetToPosition(formatted, cursorOffset));
    editor.scrollTo(left, top);
  }

  async formatSelection(editor: Editor): Promise<void> {
    const text = editor.getSelection();
    const formatted = await prettierFormat(text, {
      parser: "markdown",
      plugins: prettierPlugins,
      ...this.getPrettierSettings(),
    });
    if (formatted === text) {
      return;
    }

    editor.replaceSelection(formatted);
  }

  async format(kind: FormatKind, editor: Editor): Promise<void> {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

    if (activeView) {
      switch (kind) {
        case FormatKind.document:
          return this.formatDocument(editor);
        case FormatKind.selection:
          return this.formatSelection(editor);
      }
    }
  }

  // a hacky way to hook into the save command callback
  hookIntoSaveCmd(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const saveCommandDefinition = (this.app as any).commands?.commands?.[
      "editor:save-file"
    ];
    const save = saveCommandDefinition?.callback;

    if (typeof save === "function") {
      saveCommandDefinition.callback = () => {
        if (this.settings.formatOnSave) {
          const editor =
            this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
          if (editor) this.format(FormatKind.document, editor);
        }
        save();
      };
    }
  }
}
