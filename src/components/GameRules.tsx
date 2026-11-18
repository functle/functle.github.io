export default function GameRules() {
  return (
    <details className="rules">
      <summary>How it works</summary>
      <ul className="rules__lines">
        <li>Guess the function on the graph in 6 tries.</li>
        <li>It is either a polynomial or a rational function.</li>
        <li>Green means a number is right. ↑ or ↓ shows which way to move it.</li>
      </ul>
    </details>
  );
}
