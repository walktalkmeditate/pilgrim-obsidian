import { Notice, Plugin } from 'obsidian'
import { importPilgrim, summaryMessage, type ImportSummary } from './import/orchestrator'
import { DEFAULT_SETTINGS, WaymarkSettingTab, type WaymarkSettings } from './settings'
import type { AppLike } from './vault/writer'

// Obsidian requires the plugin entry point to be a default export extending
// Plugin. Every other module in this codebase uses named exports.
export default class WaymarkPlugin extends Plugin {
  settings: WaymarkSettings = { ...DEFAULT_SETTINGS }

  async onload(): Promise<void> {
    await this.loadSettings()
    this.addSettingTab(new WaymarkSettingTab(this.app, this))
    this.addRibbonIcon('footprints', 'Import .pilgrim file', () => this.pickAndImport())
    this.addCommand({
      id: 'import-pilgrim-file',
      name: 'Import .pilgrim file…',
      callback: () => this.pickAndImport(),
    })
  }

  onunload(): void {}

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }

  private pickAndImport(): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pilgrim,.zip'
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (file) void this.runImport(file)
    })
    input.click()
  }

  // Import a .pilgrim archive's bytes into the vault. Public so other plugins,
  // scripts, or tests can drive an import without going through the file picker.
  importBuffer(buffer: ArrayBuffer): Promise<ImportSummary> {
    return importPilgrim(this.app as unknown as AppLike, buffer, {
      walksFolder: this.settings.walksFolder,
      waymarkVersion: this.manifest.version,
    })
  }

  private async runImport(file: File): Promise<void> {
    const notice = new Notice(`Importing ${file.name}…`, 0)
    try {
      const summary = await this.importBuffer(await file.arrayBuffer())
      notice.setMessage(summaryMessage(summary))
      if (summary.skippedEdited.length > 0) {
        new Notice(`Not updated (edited since import): ${summary.skippedEdited.join(', ')}`, 10000)
      }
      if (summary.skippedNoMarkers.length > 0) {
        new Notice(`Markers missing, left untouched: ${summary.skippedNoMarkers.join(', ')}`, 10000)
      }
    } catch (err) {
      notice.setMessage(`Waymark import failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
