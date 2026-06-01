import { App, PluginSettingTab, Setting } from 'obsidian'
import type WaymarkPlugin from './main'

export interface WaymarkSettings {
  walksFolder: string
  // Mapbox public token for the in-note Leaflet map tiles (opt-in; empty = no map).
  mapboxToken: string
  // Opt-in: reverse-geocode walk start coordinates to place names via OpenStreetMap.
  lookupPlaceNames: boolean
  // Persisted geocode cache (rounded-coord key -> place name) so re-imports don't
  // re-hit the geocoder. Not shown in the settings UI.
  geocodeCache: Record<string, string>
}

export const DEFAULT_SETTINGS: WaymarkSettings = {
  walksFolder: 'Waymark',
  mapboxToken: '',
  lookupPlaceNames: false,
  geocodeCache: {},
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
          .onChange((value) => {
            this.plugin.settings.walksFolder = value.trim() || DEFAULT_SETTINGS.walksFolder
            this.plugin
              .saveSettings()
              .catch((e) => console.error('Waymark: failed to save settings', e))
          }),
      )

    new Setting(containerEl)
      .setName('Mapbox access token')
      .setDesc(
        createFragment((frag) => {
          frag.appendText(
            'Enables an interactive map in each note (also needs the obsidian-leaflet plugin). Get a free token at ',
          )
          frag.createEl('a', {
            text: 'account.mapbox.com',
            attr: { href: 'https://account.mapbox.com/access-tokens/' },
          })
          frag.appendText(
            '. The token is written into your notes and data.json and travels with your vault — treat it as public and set a usage cap.',
          )
        }),
      )
      .addText((text) => {
        text.inputEl.type = 'password'
        text
          .setPlaceholder('pk.…')
          .setValue(this.plugin.settings.mapboxToken)
          .onChange((value) => {
            this.plugin.settings.mapboxToken = value.trim()
            this.plugin
              .saveSettings()
              .catch((e) => console.error('Waymark: failed to save settings', e))
          })
      })

    new Setting(containerEl)
      .setName('Look up place names')
      .setDesc(
        createFragment((frag) => {
          frag.appendText(
            'When on, the approximate start of each walk (which may be your home) is sent to OpenStreetMap to add a place backlink. Results are cached locally and attributed to © OpenStreetMap contributors.',
          )
        }),
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.lookupPlaceNames).onChange((value) => {
          this.plugin.settings.lookupPlaceNames = value
          this.plugin
            .saveSettings()
            .catch((e) => console.error('Waymark: failed to save settings', e))
        }),
      )
  }
}
