# Functle

A daily puzzle in the spirit of Wordle: read a curve off the graph and guess the function behind it. You get six guesses, and everyone gets the same curve each day.

## How to play

The mystery curve is one of two types:

- **Polynomial:** one of three forms.
  - Cubic: ax³ + bx + c
  - Quadratic: ax² + bx + c
  - Linear: ax + b
- **Rational:** a/(x − h) + k. These come in two branches that bend along a pair of dashed guide lines. The vertical one sits at x = h and the horizontal one at y = k.

The game does not tell you which type it is. Working that out from the graph is part of the puzzle.

The coefficients in these standard forms are whole numbers from −10 to 10. After each guess:

- The type box turns green if you picked the right type and red if you did not.
- Each number is graded on its own. Green means it is right. An orange arrow shows which way to move it: ↑ to go higher, ↓ to go lower.
- If the type is wrong, the numbers are greyed out with a –, since comparing a polynomial's numbers against a rational's would not mean anything.
- Guess a parabola when the answer is a cubic (or the other way round) and a is greyed out, since it belongs to x² in one and x³ in the other. b and c are still graded.

Each guess is drawn on the graph as a dashed line in its own colour. Untick the checkbox on a guess to hide its curve.

## Typing a guess

Type the function as plain text, using `^` for a power and `/` for a fraction: `2x^2-3x+5`, `x^3-2x+1` or `3/(x-2)+1`. Press space to see it formatted as maths, and keep typing to go back to editing the text. Press Enter to submit.

Equivalent forms are accepted. For example, `x^2-4x+3`, `(x-1)(x-3)` (intercept or factored form), and `(x-2)^2-1` (vertex form) all count as the same quadratic. Brackets, implicit multiplication, fractions, and decimals work too: `2(x-3/4)^2-1/8` is equivalent to `2x^2-3x+1`. The game simplifies your expression before checking the coefficient range and grading it.

You can also factor cubics and rearrange rational functions: `x(x-1)(x+1)` becomes `x^3-x`, and `(x+1)/(x-2)` becomes `3/(x-2)+1`. The simplified function must still be one of the supported shapes above, with whole-number coefficients from −10 to 10. Expressions with extra holes caused by cancelled denominators are rejected.

Watch the sign on h. A vertical guide line at x = 2 means h is 2, and the function is written 3/(x − 2) + 1.
