/**
 * Typesets a TeX string with KaTeX.
 *
 * The HTML is injected directly. Pass fixed examples or strings built by
 * latexCurve from parsed integers. Never pass raw player input.
 */

import katex from 'katex';

export default function TeX({ source }: { source: string }) {
  const html = katex.renderToString(source, {
    // KaTeX's MathML copy is what a screen reader reads; the visual HTML beside
    // it is hidden from assistive tech.
    output: 'htmlAndMathml',
    throwOnError: false,
  });
  return <span className="tex" dangerouslySetInnerHTML={{ __html: html }} />;
}
