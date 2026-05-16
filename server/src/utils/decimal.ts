export function parseOptionalDecimal(
  value: string | number | null | undefined,
): string | number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return value;
}
