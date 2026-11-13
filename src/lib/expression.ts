/** Exact algebra for guesses; input is never evaluated as JavaScript. */
export interface Fraction { n: bigint; d: bigint }
type Polynomial = Fraction[]; // constant first
interface Expression { top: Polynomial; bottom: Polynomial }

const ZERO: Fraction = { n: 0n, d: 1n };
const ONE: Fraction = { n: 1n, d: 1n };
const MAX_DEGREE = 12;

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}

function fraction(n: bigint, d = 1n): Fraction {
  if (d === 0n) throw new Error('You cannot divide by zero.');
  const divisor = gcd(n, d) * (d < 0n ? -1n : 1n);
  const result = { n: n / divisor, d: d / divisor };
  if (result.n.toString().length > 512 || result.d.toString().length > 512) {
    throw new Error('That expression is too complicated. Try a simpler form.');
  }
  return result;
}

function add(a: Fraction, b: Fraction): Fraction {
  return fraction(a.n * b.d + b.n * a.d, a.d * b.d);
}
function negate(a: Fraction): Fraction { return { n: -a.n, d: a.d }; }
function multiply(a: Fraction, b: Fraction): Fraction {
  return fraction(a.n * b.n, a.d * b.d);
}
function divide(a: Fraction, b: Fraction): Fraction {
  return fraction(a.n * b.d, a.d * b.n);
}

function trim(p: Polynomial): Polynomial {
  while (p.length > 1 && p[p.length - 1].n === 0n) p.pop();
  return p;
}
function isZero(p: Polynomial): boolean { return p.length === 1 && p[0].n === 0n; }
function sum(a: Polynomial, b: Polynomial): Polynomial {
  return trim(Array.from({ length: Math.max(a.length, b.length) },
    (_, i) => add(a[i] ?? ZERO, b[i] ?? ZERO)));
}
function product(a: Polynomial, b: Polynomial): Polynomial {
  if (isZero(a) || isZero(b)) return [ZERO];
  if (a.length + b.length - 2 > MAX_DEGREE) {
    throw new Error('That expression is too complicated. Try a simpler form.');
  }
  const result = Array<Fraction>(a.length + b.length - 1).fill(ZERO);
  a.forEach((x, i) => b.forEach((y, j) => {
    result[i + j] = add(result[i + j], multiply(x, y));
  }));
  return trim(result);
}

function divmod(a: Polynomial, b: Polynomial): [Polynomial, Polynomial] {
  if (isZero(b)) throw new Error('You cannot divide by zero.');
  const remainder = [...a];
  const quotient = Array<Fraction>(Math.max(1, a.length - b.length + 1)).fill(ZERO);
  while (!isZero(remainder) && remainder.length >= b.length) {
    const offset = remainder.length - b.length;
    const coefficient = divide(remainder[remainder.length - 1], b[b.length - 1]);
    quotient[offset] = coefficient;
    b.forEach((value, i) => {
      remainder[offset + i] = add(remainder[offset + i], negate(multiply(coefficient, value)));
    });
    trim(remainder);
  }
  return [trim(quotient), remainder];
}

function reduce(value: Expression): Expression {
  let a = value.top;
  let b = value.bottom;
  if (isZero(b)) throw new Error('You cannot divide by zero.');
  while (!isZero(b)) [a, b] = [b, divmod(a, b)[1]];
  const top = divmod(value.top, a)[0];
  const bottom = divmod(value.bottom, a)[0];
  const scale = bottom[bottom.length - 1];
  return { top: top.map((x) => divide(x, scale)), bottom: bottom.map((x) => divide(x, scale)) };
}

function constant(value: Fraction): Expression { return { top: [value], bottom: [ONE] }; }

/** Sturm's theorem counts real roots exactly, including repeated roots. A
 * cancelled denominator like x^2+1 does not actually exclude any real inputs. */
function hasRealRoots(p: Polynomial): boolean {
  if (p.length === 1) return isZero(p);
  const sequence = [p, p.slice(1).map((value, i) => multiply(value, fraction(BigInt(i + 1))))];
  while (true) {
    const remainder = divmod(sequence[sequence.length - 2], sequence[sequence.length - 1])[1];
    if (isZero(remainder)) break;
    sequence.push(remainder.map(negate));
  }
  function variations(negativeInfinity: boolean): number {
    const signs = sequence.map((poly) => {
      const leadingSign = poly[poly.length - 1].n < 0n ? -1 : 1;
      return negativeInfinity && poly.length % 2 === 0 ? -leadingSign : leadingSign;
    });
    return signs.slice(1).filter((sign, i) => sign !== signs[i]).length;
  }
  return variations(true) > variations(false);
}

/** Cancelled factors must not introduce extra holes in the curve's domain. */
function sameDomain(exclusions: Polynomial[], bottom: Polynomial): boolean {
  return exclusions.every((excluded) => {
    let remaining = excluded;
    if (bottom.length === 2) {
      while (remaining.length > 1) {
        const [quotient, remainder] = divmod(remaining, bottom);
        if (!isZero(remainder)) break;
        remaining = quotient;
      }
    }
    return !hasRealRoots(remaining);
  });
}

export interface AlgebraResult {
  top: Fraction[];
  bottom: Fraction[];
}

export function parseExpression(source: string): AlgebraResult {
  if (source.length > 512) throw new Error('That expression is too long. Try a simpler form.');
  let position = 0;
  let depth = 0;
  const exclusions: Polynomial[] = [];
  const peek = () => source[position] ?? '';
  const take = () => source[position++];

  function combine(left: Expression, right: Expression, operator: string): Expression {
    if (operator === '+' || operator === '-') {
      const rightTop = operator === '-' ? right.top.map(negate) : right.top;
      return reduce({
        top: sum(product(left.top, right.bottom), product(rightTop, left.bottom)),
        bottom: product(left.bottom, right.bottom),
      });
    }
    if (operator === '/') {
      if (isZero(right.top)) throw new Error('You cannot divide by zero.');
      exclusions.push(right.top);
      return reduce({ top: product(left.top, right.bottom), bottom: product(left.bottom, right.top) });
    }
    return reduce({ top: product(left.top, right.top), bottom: product(left.bottom, right.bottom) });
  }

  function primary(): Expression {
    if (peek() === '(') {
      take();
      if (++depth > 32) throw new Error('Too many nested brackets. Try a simpler form.');
      const value = expression();
      if (take() !== ')') throw new Error('The brackets do not match up.');
      depth--;
      return value;
    }
    if (peek() === 'x') {
      take();
      return { top: [ZERO, ONE], bottom: [ONE] };
    }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(source.slice(position));
    if (number) {
      position += number[0].length;
      const [whole, decimal = ''] = number[0].split('.');
      return constant(fraction(BigInt(whole + decimal), 10n ** BigInt(decimal.length)));
    }
    if (/[a-z]/.test(peek()) && peek() !== '') {
      throw new Error(`I only understand x as the variable, not "${peek()}".`);
    }
    if (peek() === ')') throw new Error('The brackets are empty or do not match up.');
    if (peek() === '') throw new Error('The expression ends with an operator and nothing after it.');
    throw new Error(`I got stuck at "${peek()}".`);
  }

  function power(): Expression {
    const base = primary();
    if (peek() !== '^') return base;
    take();
    const exponent = /^[+-]?\d+/.exec(source.slice(position));
    if (!exponent) throw new Error('Use a whole-number power, like (x-2)^2.');
    position += exponent[0].length;
    const n = Number(exponent[0]);
    if (Math.abs(n) > MAX_DEGREE) throw new Error('That power is too large. Try a simpler form.');
    let result = constant(ONE);
    for (let i = 0; i < Math.abs(n); i++) result = combine(result, base, '*');
    return n < 0 ? combine(constant(ONE), result, '/') : result;
  }

  function unary(): Expression {
    // Signs bind less tightly than powers: -x^2 means -(x^2).
    let negative = false;
    while (peek() === '+' || peek() === '-') {
      if (take() === '-') negative = !negative;
    }
    const value = power();
    return negative ? { ...value, top: value.top.map(negate) } : value;
  }

  function term(): Expression {
    let left = unary();
    while (position < source.length) {
      if (peek() === '*' || peek() === '/') {
        const operator = take();
        left = combine(left, unary(), operator);
      } else if (peek() === '(' || peek() === 'x') {
        // Adjacent factors: 2(x-1), (x-1)(x+1), or 2x.
        left = combine(left, unary(), '*');
      } else break;
    }
    return left;
  }

  function expression(): Expression {
    let left = term();
    while (peek() === '+' || peek() === '-') {
      const operator = take();
      left = combine(left, term(), operator);
    }
    return left;
  }

  const result = expression();
  if (position !== source.length) {
    if (peek() === ')') throw new Error('The brackets do not match up.');
    if (/[\d.]/.test(peek())) throw new Error('Separate terms with + or -, or use * to multiply.');
    if (/[a-z]/.test(peek())) throw new Error(`I only understand x as the variable, not "${peek()}".`);
    throw new Error(`I got stuck at "${peek()}".`);
  }
  if (result.bottom.length <= 2 && !sameDomain(exclusions, result.bottom)) {
    throw new Error('Cancelling that fraction leaves a hole or a flat line. Try a form with the same domain as the curve.');
  }
  return result;
}

export function rationalParameters(top: Polynomial, bottom: Polynomial): Fraction[] {
  // reduce() makes the linear denominator monic: (kx+b)/(x-h).
  const k = top[1] ?? ZERO;
  const h = negate(bottom[0]);
  const a = add(top[0], multiply(k, h));
  return [a, h, k];
}
