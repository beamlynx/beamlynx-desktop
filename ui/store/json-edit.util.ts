import { pineString } from './util';

/**
 * Editing a key inside a JSON column from the results grid. A path's value
 * arrives as text, so `5` and `"5"` look the same; pine-lang sends each
 * value's JSON type in a hidden column, and these read it.
 */

/** The JSON types pine-lang reports. Missing key: null. */
export type JsonType = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';

/** Why this row's value at `name` (e.g. `companies[0].id`) can't be edited, if it can't. */
export const jsonCellReadOnlyReason = (name: string, type: unknown): string | undefined => {
  const column = name.split(/[.[]/)[0];
  if (type === null || type === undefined) {
    return `This row's ${column} has no ${name}, so there is no value here to change.`;
  }
  if (type === 'object' || type === 'array') {
    return `${name} holds ${type === 'object' ? 'an object' : 'an array'}, which can't be edited here. Select ${column} and edit it there.`;
  }
  if (!['string', 'number', 'boolean', 'null'].includes(String(type))) {
    return `${name} holds a JSON value of a kind that can't be edited here.`;
  }
  return undefined;
};

/** What a boolean cell accepts, and the Pine literal for it. */
const BOOLEAN_TEXT = new Map([
  ['true', 'true'],
  ['false', 'false'],
  ['1', 'true'],
  ['0', 'false'],
]);

/** A number as Pine writes it: whole or decimal, optionally negative. */
const PINE_NUMBER = /^-?[0-9]+(\.[0-9]+)?$/;

/**
 * The Pine literal that writes `text` into a value of JSON type `type`, so
 * the value keeps its type: a number stays a number, a string a string. A
 * JSON null takes whatever is typed as a string. Or why `text` doesn't fit.
 */
export const jsonEditLiteral = (
  name: string,
  type: unknown,
  text: string,
): { literal: string } | { error: string } => {
  switch (type) {
    case 'number': {
      const trimmed = text.trim();
      return PINE_NUMBER.test(trimmed)
        ? { literal: trimmed }
        : { error: `${name} holds a number, and ${JSON.stringify(text)} isn't one.` };
    }
    case 'boolean': {
      // SQLite shows a JSON true or false as 1 or 0, so those are read too.
      const trimmed = text.trim().toLowerCase();
      const literal = BOOLEAN_TEXT.get(trimmed);
      return literal
        ? { literal }
        : { error: `${name} holds true or false, and ${JSON.stringify(text)} is neither.` };
    }
    default:
      return { literal: pineString(text) };
  }
};
