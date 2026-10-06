import { z } from 'zod';

// The `variables` argument of run_query: a $variable's value, as pine-lang's
// `variables` field takes it. Its own module so a test can load it without
// starting the relay.

// pine-lang's own limits (src/pine/variables.clj). Checked again there; stated
// here so the schema an agent reads says what will be refused.
export const MAX_VARIABLES = 50;
export const MAX_LIST_ITEMS = 5000;
export const MAX_STRING_LENGTH = 10000;

// A JSON number past 2^53 has already been rounded by the time it gets here,
// so a 64-bit id would quietly match a different row. Refusing it is the only
// safe answer; the same id as a string is converted by its column in pine-lang.
const variableNumber = z
  .number()
  .refine(n => !Number.isInteger(n) || Number.isSafeInteger(n), {
    message: 'This number is too large to pass exactly. Pass large ids as strings, like "9007199254740993".',
  });

export const variableScalar = z.union([z.string().max(MAX_STRING_LENGTH), variableNumber, z.boolean()]);

// What pine-lang accepts as a $name: letters, digits and underscores, not
// starting with a digit. Anything else would never match a `$name` in the
// expression, or would be bound under a different name.
export const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const variablesSchema = z
  .record(
    z.string().regex(VARIABLE_NAME, 'A variable name is letters, digits and underscores, not starting with a digit.'),
    z.union([variableScalar, z.array(variableScalar).max(MAX_LIST_ITEMS)]),
  )
  .refine(v => Object.keys(v).length <= MAX_VARIABLES, { message: `At most ${MAX_VARIABLES} variables can be passed.` });

export type VariableScalar = string | number | boolean;
export type VariableValue = VariableScalar | VariableScalar[];
