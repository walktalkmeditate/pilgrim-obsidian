import { App, PluginSettingTab, Setting } from 'obsidian'
import type WaymarkPlugin from './main'

export interface WaymarkSettings {
  walksFolder: string
}

export const DEFAULT_SETTINGS: WaymarkSettings = {
  walksFolder: 'Waymark',
}

export class WaymarkSettingTab extends PluginSettingTab {
  private readonly plugin: WaymarkPlugin

  constructor(app: App, plugin: WaymarkPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    new Setting(containerEl)
      .setName('Walks folder')
      .setDesc('Folder where imported walk notes are created.')
      .addText((text) =>
        text
          .setPlaceholder('Waymark')
          .setValue(this.plugin.settings.walksFolder)
          .onChange(async (value) => {
            this.plugin.settings.walksFolder = value.trim() || DEFAULT_SETTINGS.walksFolder
            await this.plugin.saveSettings()
          }),
      )
  }
}
