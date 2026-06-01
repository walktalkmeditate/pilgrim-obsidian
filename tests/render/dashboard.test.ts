import { describe, it, expect } from 'vitest'
import { buildDashboard, DASHBOARD_FILENAME } from '../../src/render/dashboard'

describe('buildDashboard', () => {
  it('emits dataview blocks with the row[] escape-hatch, scoped to the walks folder', () => {
    // #given a walks folder
    const md = buildDashboard('Waymark')

    // #then it carries the dashboard type, the install hint, and the three queries
    expect(md).toContain('waymark-type: dashboard')
    expect(md).toContain('Requires the **Dataview**')
    expect(md).toContain('```dataview')
    expect(md).toContain('row["waymark-distance-km"]')
    expect(md).toContain('row["waymark-moon"] = "Full Moon"')
    expect(md).toContain('row["waymark-reflection-words"]')
    expect(md).toContain('FROM "Waymark"')
  })

  it('exposes a stable filename', () => {
    expect(DASHBOARD_FILENAME).toBe('Waymark Dashboard.md')
  })
})
