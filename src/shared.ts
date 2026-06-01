// Scalar type for frontmatter values, shared by the render layer (which
// produces them) and the vault layer (which writes them) so neither has to
// reach into the other for it.
export type FrontmatterValue = string | number | boolean
