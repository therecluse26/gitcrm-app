// Release versions (spec 11). A release tag is vMAJOR.MINOR.PATCH. A copy's version is
// MAJOR.MINOR.PATCH, from its package.json.

function parseVersion(text: string): number[] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
  return match && match.slice(1).map(Number);
}

export function isNewer(tag: string, current: string): boolean {
  const release = tag.startsWith('v') ? parseVersion(tag.slice(1)) : null;
  if (!release) throw new Error(`The release tag ${tag} is not vMAJOR.MINOR.PATCH`);
  const copy = parseVersion(current);
  if (!copy) throw new Error(`The version ${current} in package.json is not MAJOR.MINOR.PATCH`);
  const i = release.findIndex((n, at) => n !== copy[at]);
  return i !== -1 && release[i] > copy[i];
}
