/** The row for a d6 face in a face-indexed table. */
export function faceRow<T extends { face: number }>(rows: readonly T[], face: number): T {
  const row = rows.find((r) => r.face === face);
  if (!row) throw new RangeError(`No row for face ${face}`);
  return row;
}

/** The row whose `min`..`max` range holds `value` (result bands, Signals). */
export function rangeRow<T extends { min: number; max: number }>(rows: readonly T[], value: number): T {
  const row = rows.find((r) => value >= r.min && value <= r.max);
  if (!row) throw new RangeError(`No row for ${value}`);
  return row;
}

/** The category and row for a d66 roll (11..66) in a table split into one category per tens digit. */
export function d66Row<R extends { roll: number }, C extends { rows: readonly R[] }>(
  categories: readonly C[],
  roll: number
): { category: C; row: R } {
  for (const category of categories) {
    const row = category.rows.find((r) => r.roll === roll);
    if (row) return { category, row };
  }
  throw new RangeError(`No d66 row for ${roll}`);
}
