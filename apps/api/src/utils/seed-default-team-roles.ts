// Back-compat no-op. Custom team roles were removed when the
// organization plugin was dropped; the team model uses the fixed
// `owner`/`member` roles defined in `@kaneo/permissions`.
export async function seedDefaultTeamRoles() {
  // intentionally empty
}
