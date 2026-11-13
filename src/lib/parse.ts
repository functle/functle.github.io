/** Converts equivalent algebraic forms into the canonical slots used to grade
 * guesses. Validation applies after simplification, not to the typed factors. */
import { parseExpression, rationalParameters, type Fraction } from './expression';
import type { Curve } from './types';

export const MIN_COEFF = -10;
export const MAX_COEFF = 10;

export type ParseResult =
  | { ok: true; curve: Curve }
  | { ok: false; error: string };

/** Intermediate factors may use fractions or numbers outside the game range. */
function wholeCoefficient(value: Fraction | undefined): number {
  if (value === undefined) return 0;
  if (value.d !== 1n) {
    throw new Error('After simplifying, the coefficients must be whole numbers — no decimals or fractions.');
  }
  const result = Number(value.n);
  if (result < MIN_COEFF || result > MAX_COEFF) {
    throw new Error(`After simplifying, every coefficient has to be between ${MIN_COEFF} and ${MAX_COEFF}.`);
  }
  return result;
}

function normalize(input: string): string {
  let s = input.toLowerCase()
    .replace(/[−–—‐‑]/g, '-')
    .replace(/[·×•]/g, '*')
    .replace(/[÷∕⁄]/g, '/');

  const superscripts: Record<string, string> = {
    '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
    '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-',
  };
  s = s.replace(/[⁰¹²³⁴-⁹⁻]+/g,
    (run) => '^' + Array.from(run, (ch) => superscripts[ch]).join(''));
  s = s.replace(/^\s*(?:y|f\s*\(\s*x\s*\))\s*=\s*/, '').replace(/\s+/g, '');
  // Preserve the previously accepted shorthand /x for 1/x.
  return s.replace(/^([+-]?)\//, (_, sign: string) => `${sign}1/`);
}

export function parseCurve(input: string): ParseResult {
  const s = normalize(input);
  if (s === '') {
    return { ok: false, error: 'Type a function, like (x-2)^2-1 or 3/(x-2)+1.' };
  }

  try {
    const { top, bottom } = parseExpression(s);
    if (bottom.length === 1) {
      if (top.length > 4) {
        return { ok: false, error: 'After simplifying, x^3 is the most here.' };
      }
      if (top.length === 4 && top[2].n !== 0n) {
        return { ok: false, error: 'A cubic here has no x^2 term, like x^3-2x+1.' };
      }
      return {
        ok: true,
        curve: {
          kind: top.length === 4 ? 'cubic' : 'quadratic',
          a: wholeCoefficient(top[top.length === 4 ? 3 : 2]),
          b: wholeCoefficient(top[1]),
          c: wholeCoefficient(top[0]),
        },
      };
    }
    if (bottom.length !== 2) {
      return { ok: false, error: 'After simplifying, only x to the first power goes on the bottom, like 3/(x-2).' };
    }
    if (top.length > 2) {
      return { ok: false, error: 'That is not a shape I know yet. Try a polynomial or a/(x-h)+k.' };
    }
    const [a, h, k] = rationalParameters(top, bottom).map(wholeCoefficient);
    return { ok: true, curve: { kind: 'rational', a, h, k } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'I could not read that function.' };
  }
}
