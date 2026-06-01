export const DASHBOARD_FILENAME = 'Waymark Dashboard.md'

// Build the starter dashboard note. Queries use the row["waymark-…"] escape-hatch
// because bare hyphenated frontmatter keys parse as subtraction in Dataview. The
// install hint is always present (harmless when Dataview is installed; the blocks
// degrade to inert text without it), so no runtime plugin detection is needed.
export function buildDashboard(walksFolder: string): string {
  const from = JSON.stringify(walksFolder)
  const block = (lines: string[]): string => ['```dataview', ...lines, '```', ''].join('\n')

  return [
    '---',
    'waymark-type: dashboard',
    '---',
    '',
    '# Waymark — Walks Dashboard',
    '',
    '> Requires the **Dataview** community plugin to render the tables below.',
    '',
    '## All walks',
    '',
    block([
      'TABLE WITHOUT ID file.link AS "Walk", row["waymark-date"] AS "Date", row["waymark-distance-km"] AS "km", row["waymark-pace-min-km"] AS "min/km", row["waymark-moon"] AS "Moon"',
      `FROM ${from}`,
      'WHERE row["waymark-type"] = "walk"',
      'SORT row["waymark-date"] DESC',
    ]),
    '## Full-moon walks',
    '',
    block([
      'TABLE WITHOUT ID file.link AS "Walk", row["waymark-date"] AS "Date"',
      `FROM ${from}`,
      'WHERE row["waymark-type"] = "walk" AND row["waymark-moon"] = "Full Moon"',
      'SORT row["waymark-date"] DESC',
    ]),
    '## Longest reflections',
    '',
    block([
      'TABLE WITHOUT ID file.link AS "Walk", row["waymark-reflection-words"] AS "Words"',
      `FROM ${from}`,
      'WHERE row["waymark-type"] = "walk"',
      'SORT row["waymark-reflection-words"] DESC',
      'LIMIT 10',
    ]),
  ].join('\n')
}
