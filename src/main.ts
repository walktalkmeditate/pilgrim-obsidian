import { Notice, Plugin, requestUrl } from 'obsidian'
import { importPilgrim, summaryMessage, type ImportSummary } from './import/orchestrator'
import { nominatimUrl, parseNominatim } from './import/geocode'
import { DEFAULT_SETTINGS, WaymarkSettingTab, type WaymarkSettings } from './settings'
import type { AppLike } from './vault/writer'

const GEOCODE_TIMEOUT_MS = 8000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('geocode timeout')), ms)
  })
  // requestUrl exposes no abort, so the loser keeps running — swallow its late
  // rejection so it can't surface as an unhandled rejection, and clear the timer.
  promise.catch(() => {})
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

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
  async importBuffer(buffer: ArrayBuffer): Promise<ImportSummary> {
    const summary = await importPilgrim(this.app as unknown as AppLike, buffer, {
      walksFolder: this.settings.walksFolder,
      waymarkVersion: this.manifest.version,
      mapboxToken: this.settings.mapboxToken,
      lookupPlaceNames: this.settings.lookupPlaceNames,
      geocodeCache: this.settings.geocodeCache,
      geocode: (lat, lng) => this.reverseGeocode(lat, lng),
    })
    // The geocode step mutates settings.geocodeCache in place — persist it.
    await this.saveSettings()
    return summary
  }

  // Reverse-geocode via Nominatim. Sends an explicit User-Agent (their policy
  // requires one), races a timeout because requestUrl exposes no abort, and
  // returns null on any failure so the import never blocks on the network.
  private async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    try {
      const response = await withTimeout(
        requestUrl({
          url: nominatimUrl(lat, lng),
          headers: {
            'User-Agent': `Waymark/${this.manifest.version} (Obsidian plugin; https://github.com/walktalkmeditate/pilgrim-obsidian)`,
          },
        }),
        GEOCODE_TIMEOUT_MS,
      )
      return parseNominatim(response.json)
    } catch {
      return null
    }
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
      if (summary.dashboardCreated) {
        new Notice(`Waymark dashboard created in ${this.settings.walksFolder}/`)
      }
    } catch (err) {
      notice.setMessage(`Waymark import failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
