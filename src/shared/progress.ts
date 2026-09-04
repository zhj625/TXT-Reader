export function clampCharOffset(charOffset: number, characterLength: number): number {
  if (!Number.isFinite(charOffset) || !Number.isFinite(characterLength)) {
    return 0;
  }

  return Math.min(
    Math.max(Math.round(charOffset), 0),
    Math.max(Math.round(characterLength), 0),
  );
}

export function calculatePercentage(charOffset: number, characterLength: number): number {
  if (characterLength <= 0) {
    return 0;
  }

  const percentage = (clampCharOffset(charOffset, characterLength) / characterLength) * 100;
  return Math.round(percentage * 10) / 10;
}
