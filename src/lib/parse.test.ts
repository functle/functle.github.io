import { describe, expect, it } from 'vitest';
import { formatCurve } from './curve';
import { parseCurve } from './parse';
import { gradeGuess } from './grade';
import type { Curve, Quadratic, Rational } from './types';

/** Unwraps a successful parse, failing loudly with the error if it did not. */
function curve(input: string): Curve {
  const result = parseCurve(input);
  if (!result.ok) throw new Error(`"${input}" failed to parse: ${result.error}`);
  return result.curve;
}

/** Same, asserting the family so the test can read the fields directly. */
function quad(input: string): Quadratic {
  const c = curve(input);
  if (c.kind !== 'quadratic') throw new Error(`"${input}" parsed as ${c.kind}`);
  return c;
}

function rat(input: string): Rational {
  const c = curve(input);
  if (c.kind !== 'rational') throw new Error(`"${input}" parsed as ${c.kind}`);
  return c;
}

function errorFor(input: string): string {
  const result = parseCurve(input);
  if (result.ok) throw new Error(`"${input}" parsed but should not have`);
  return result.error;
}

describe('parseCurve on quadratics', () => {
  it('reads a standard quadratic', () => {
    expect(quad('2x^2-3x+5')).toEqual({ kind: 'quadratic', a: 2, b: -3, c: 5 });
  });

  it('does not care what order the terms arrive in', () => {
    expect(quad('5 - 3x + 2x^2')).toEqual({ kind: 'quadratic', a: 2, b: -3, c: 5 });
    expect(quad('-3x + 5 + 2x^2')).toEqual({ kind: 'quadratic', a: 2, b: -3, c: 5 });
  });

  it('accepts a superscript two, since phone keyboards produce it', () => {
    expect(quad('2x²-3x+5')).toEqual({ kind: 'quadratic', a: 2, b: -3, c: 5 });
  });

  it('accepts a Unicode minus, which is what copy-paste from a PDF gives', () => {
    // U+2212, visually identical to a hyphen and a real source of bug reports.
    expect(quad('2x²−3x+5')).toEqual({ kind: 'quadratic', a: 2, b: -3, c: 5 });
  });

  it('treats an implied 1 as 1', () => {
    expect(quad('x')).toEqual({ kind: 'quadratic', a: 0, b: 1, c: 0 });
    expect(quad('-x²')).toEqual({ kind: 'quadratic', a: -1, b: 0, c: 0 });
  });

  it('strips a y= or f(x)= prefix', () => {
    expect(quad('y = 4x - 1')).toEqual({ kind: 'quadratic', a: 0, b: 4, c: -1 });
    expect(quad('f(x) = 4x - 1')).toEqual({ kind: 'quadratic', a: 0, b: 4, c: -1 });
  });

  it('sums repeated terms rather than taking the last one', () => {
    expect(quad('x + x').b).toBe(2);
    expect(quad('3 + 4').c).toBe(7);
  });

  it('reads a bare constant and a lone zero', () => {
    expect(quad('7')).toEqual({ kind: 'quadratic', a: 0, b: 0, c: 7 });
    expect(quad('0')).toEqual({ kind: 'quadratic', a: 0, b: 0, c: 0 });
  });

  it('ignores spaces and explicit multiplication signs', () => {
    expect(quad('2 * x ^ 2 + 3 * x')).toEqual({
      kind: 'quadratic',
      a: 2,
      b: 3,
      c: 0,
    });
  });

  it('rejects powers above three', () => {
    expect(errorFor('x^4')).toMatch(/x\^3 is the most/);
  });
});

describe('parseCurve on depressed cubics', () => {
  it('reads a cubic with its terms in any order', () => {
    const expected = { kind: 'cubic', a: 1, b: -2, c: 1 };
    expect(curve('x^3-2x+1')).toEqual(expected);
    expect(curve('1 - 2x + x³')).toEqual(expected);
  });

  it('reads a bare cubic', () => {
    expect(curve('-2x^3')).toEqual({ kind: 'cubic', a: -2, b: 0, c: 0 });
  });

  it('rejects an x^2 term alongside x^3', () => {
    expect(errorFor('x^3+x^2+1')).toMatch(/no x\^2 term/);
  });

  it('reads an x^3 that cancels out as a quadratic', () => {
    expect(curve('x^3 - x^3 + x^2')).toEqual({ kind: 'quadratic', a: 1, b: 0, c: 0 });
  });

  it('range-checks the x^3 coefficient', () => {
    expect(errorFor('11x^3')).toMatch(/between -10 and 10/);
  });

  it('rejects a variable that is not x', () => {
    expect(errorFor('2y+1')).toMatch(/only understand x/);
  });

  it('rejects decimals, since answers are always whole numbers', () => {
    expect(errorFor('2.5x')).toMatch(/whole numbers/);
  });

  it('rejects coefficients outside the answer range', () => {
    expect(errorFor('11x')).toMatch(/between -10 and 10/);
    // Only catchable after summing: neither term alone is out of range.
    expect(errorFor('6x + 6x')).toMatch(/between -10 and 10/);
  });

  it('rejects a dangling operator instead of silently ignoring it', () => {
    expect(errorFor('2x+')).toMatch(/nothing after it/);
  });

  it('rejects terms that are not joined by an operator', () => {
    expect(errorFor('3x 2')).toMatch(/Separate terms/);
  });

  it('asks for input rather than erroring on an empty box', () => {
    expect(errorFor('')).toMatch(/Type a function/);
  });

  it('accepts negative powers as equivalent rational notation', () => {
    expect(curve('x^-1')).toEqual(curve('1/x'));
    expect(curve('3(x-2)⁻¹+1')).toEqual(curve('3/(x-2)+1'));
  });

  it('accepts brackets around a polynomial', () => {
    expect(curve('(x+1)')).toEqual(curve('x+1'));
  });
});

describe('parseCurve on rationals', () => {
  it('reads the textbook form', () => {
    expect(rat('3/(x-2)+1')).toEqual({ kind: 'rational', a: 3, h: 2, k: 1 });
  });

  it('reads the sign of h from (x − h), not from the digits', () => {
    // A written "+2" means the asymptote is at -2.
    expect(rat('3/(x+2)+1')).toEqual({ kind: 'rational', a: 3, h: -2, k: 1 });
  });

  it('reads a bare 1/x', () => {
    expect(rat('1/x')).toEqual({ kind: 'rational', a: 1, h: 0, k: 0 });
  });

  it('treats an implied numerator as 1', () => {
    expect(rat('/x')).toEqual({ kind: 'rational', a: 1, h: 0, k: 0 });
  });

  it('accepts a redundantly bracketed x', () => {
    expect(rat('5/(x)')).toEqual({ kind: 'rational', a: 5, h: 0, k: 0 });
  });

  it('handles negative numerators and negative k', () => {
    expect(rat('-2/(x+3)-4')).toEqual({ kind: 'rational', a: -2, h: -3, k: -4 });
  });

  it('does not care where the constant sits', () => {
    expect(rat('1 - 2/(x+3)')).toEqual({ kind: 'rational', a: -2, h: -3, k: 1 });
    expect(rat('-2/(x+3) + 1')).toEqual({ kind: 'rational', a: -2, h: -3, k: 1 });
  });

  it('sums loose constants', () => {
    expect(rat('1/x + 2 + 3').k).toBe(5);
  });

  it('normalizes a reversed denominator, since n − x = −(x − n)', () => {
    // 3/(2-x) is the same curve as -3/(x-2), and grading them differently would
    // punish a player for writing it the other way round.
    expect(rat('3/(2-x)')).toEqual({ kind: 'rational', a: -3, h: 2, k: 0 });
    expect(rat('3/(-2+x)')).toEqual({ kind: 'rational', a: 3, h: 2, k: 0 });
  });

  it('accepts a Unicode division slash', () => {
    expect(rat('3÷(x-2)+1')).toEqual({ kind: 'rational', a: 3, h: 2, k: 1 });
  });

  it('applies standard precedence: 3/x-2 is 3/x minus 2', () => {
    // Not 3/(x-2). The brackets are what move the asymptote, and reading it the
    // other way would silently change which curve was guessed.
    expect(rat('3/x-2')).toEqual({ kind: 'rational', a: 3, h: 0, k: -2 });
  });

  it('rejects a numerator of zero, which is a flat line', () => {
    expect(errorFor('0/(x-2)+1')).toMatch(/flat line/);
  });

  it('requires a constant fraction to simplify to a whole number', () => {
    expect(errorFor('3/2')).toMatch(/whole numbers/);
    expect(curve('6/2')).toEqual(curve('3'));
  });

  it('rejects a squared denominator', () => {
    expect(errorFor('3/(x^2)')).toMatch(/first power/);
  });

  it('rejects fractions that do not simplify to a supported curve', () => {
    expect(errorFor('1/x + 1/(x-1)')).toMatch(/first power/);
    expect(curve('1/x+2/x')).toEqual(curve('3/x'));
  });

  it('rejects an x term alongside the fraction', () => {
    expect(errorFor('x + 1/x')).toMatch(/not a shape I know/);
  });

  it('rejects unbalanced brackets', () => {
    expect(errorFor('3/(x-2')).toMatch(/brackets do not match/);
  });

  it('rejects parameters outside the answer range', () => {
    expect(errorFor('3/(x-11)')).toMatch(/between -10 and 10/);
    expect(errorFor('11/(x-2)')).toMatch(/between -10 and 10/);
    expect(errorFor('3/(x-2)+11')).toMatch(/between -10 and 10/);
  });

  it('rejects decimals', () => {
    expect(errorFor('2.5/(x-1)')).toMatch(/whole numbers/);
  });
});

describe('equivalent function forms', () => {
  it.each([
    ['x^2-4x+3', '(x-1)(x-3)', '(x-2)^2-1'],
    ['2x^2-8x+6', '2*(x-1)*(x-3)', '2(x-2)^2-2'],
    ['-x^2+4x-3', '-(x-1)(x-3)', '-(x-2)^2+1'],
    ['2x^2-3x+1', '(2x-1)(x-1)', '2(x-3/4)^2-1/8'],
    ['2x^2-3x+1', '2(x-0.5)(x-1)', '2(x-.75)^2-.125'],
    ['x^2+2x+1', '(x+1)(x+1)', '(x+1)²'],
    ['x^2', 'x*x', '(x-0)^2+0'],
    ['x^3-x', 'x(x-1)(x+1)', '(x+1)^3-3x(x+1)-x-1'],
    ['2x+3', '2(x+1.5)', '(4x+6)/2'],
    ['3/(x-2)+1', '(x+1)/(x-2)', '(2x+2)/(2x-4)'],
    ['-3/(x-2)+1', '(x-5)/(x-2)', '1+3/(2-x)'],
  ])('grades all forms of %s identically', (expanded, ...forms) => {
    const answer = curve(expanded);
    for (const form of forms) {
      const parsed = curve(form);
      expect(parsed).toEqual(answer);
      expect(gradeGuess(parsed, answer).won).toBe(true);
      expect(gradeGuess(parsed, curve('2x^2-3x+5')))
        .toEqual(gradeGuess(answer, curve('2x^2-3x+5')));
    }
  });

  it('accepts exact fractional vertex forms across the coefficient range', () => {
    for (let a = -10; a <= 10; a++) {
      if (a === 0) continue;
      for (const b of [-10, -3, 0, 3, 10]) {
        for (const c of [-10, -3, 0, 3, 10]) {
          const form = `${a}(x+(${b})/(${2 * a}))^2+(${4 * a * c - b * b})/(${4 * a})`;
          expect(curve(form)).toEqual({ kind: 'quadratic', a, b, c });
        }
      }
    }
  });

  it('checks the simplified coefficients rather than the typed numbers', () => {
    expect(curve('(x-11)^2+22x-120')).toEqual(curve('x^2+1'));
    expect(errorFor('(x-6)^2')).toMatch(/between -10 and 10/);
    expect(errorFor('(x-.1)^2')).toMatch(/whole numbers/);
    expect(curve('3*(x/3)+.1+.2+.7')).toEqual(curve('x+1'));
    expect(errorFor('x^2+1.00000000000000001')).toMatch(/whole numbers/);
  });

  it('follows operator precedence and keeps multiplication explicit when needed', () => {
    expect(curve('-2(x-1)^2')).toEqual(curve('-2x^2+4x-2'));
    expect(curve('(-2x)^2')).toEqual(curve('4x^2'));
    expect(curve('2/2*x^2')).toEqual(curve('x^2'));
    expect(curve('x^2--2x+-1')).toEqual(curve('x^2+2x-1'));
    expect(errorFor('2**x')).toMatch(/stuck/);
    expect(errorFor('x2')).toMatch(/Separate terms/);
  });

  it.each(['(x-1)(x+1', 'x+1)', '()', '(x+)^2', 'x^', 'x/0', 'x/(x-x)', '1/(0x)', '0^-1'])
    ('rejects malformed or undefined input: %s', (input) => {
      expect(parseCurve(input).ok).toBe(false);
    });

  it('does not erase holes when cancelling fractions', () => {
    expect(errorFor('(x^2-1)/(x-1)')).toMatch(/hole/);
    expect(errorFor('1/(1/x)')).toMatch(/hole/);
    expect(errorFor('1/x-1/x+x^2')).toMatch(/hole/);
    expect(errorFor('(x-3)/((x-2)(x-3))')).toMatch(/hole/);
    expect(curve('(x-2)/(x-2)^2')).toEqual(curve('1/(x-2)'));
    expect(curve('(x^2+1)/(x^2+1)')).toEqual(curve('1'));
    expect(curve('(x^4+1)/(x^4+1)')).toEqual(curve('1'));
    expect(curve('(x^2+1)/((x-2)(x^2+1))')).toEqual(curve('1/(x-2)'));
    expect(errorFor('(x^2-2)/(x^2-2)')).toMatch(/hole/);
    expect(errorFor('(x^2-2)^2/(x^2-2)^2')).toMatch(/hole/);
  });

  it('rejects unsupported final shapes after expansion', () => {
    expect(errorFor('(x+1)^3')).toMatch(/no x\^2 term/);
    expect(errorFor('(x+1)^4')).toMatch(/x\^3 is the most/);
    expect(errorFor('(x+1)/(x-2)^2')).toMatch(/first power/);
    expect(errorFor('2(x+y)')).toMatch(/only understand x/);
  });

  it('bounds work while parsing live input', () => {
    expect(errorFor('('.repeat(33) + 'x' + ')'.repeat(33))).toMatch(/nested brackets/);
    expect(errorFor('x+'.repeat(300) + '1')).toMatch(/too long/);
    expect(errorFor('x^9999999')).toMatch(/power is too large/);
    expect(errorFor('x^12*x')).toMatch(/too complicated/);
  });
});

describe('formatCurve round-trips through the parser', () => {
  it('re-reads its own quadratic output', () => {
    for (const original of [
      { kind: 'quadratic', a: 2, b: -3, c: 5 },
      { kind: 'quadratic', a: -1, b: 0, c: 7 },
      { kind: 'quadratic', a: 0, b: 10, c: -10 },
      { kind: 'quadratic', a: 0, b: 0, c: 0 },
    ] as const) {
      expect(curve(formatCurve(original))).toEqual(original);
    }
  });

  it('re-reads its own rational output, Unicode minus and all', () => {
    for (const original of [
      { kind: 'rational', a: 3, h: 2, k: 1 },
      { kind: 'rational', a: -3, h: -2, k: -1 },
      { kind: 'rational', a: 1, h: 0, k: 0 },
      { kind: 'rational', a: -6, h: 6, k: -6 },
      { kind: 'rational', a: 4, h: 1, k: 0 },
    ] as const) {
      expect(curve(formatCurve(original))).toEqual(original);
    }
  });
});
