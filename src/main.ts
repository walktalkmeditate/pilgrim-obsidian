import { Plugin } from 'obsidian'

// Obsidian requires the plugin entry point to be a default export extending
// Plugin. Every other module in this codebase uses named exports.
export default class WaymarkPlugin extends Plugin {
  async onload(): Promise<void> {
    // Command, ribbon, and settings wiring land in U7.
  }

  onunload(): void {}
}
