import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import MatchBoard, { type BoardProps } from './MatchBoard';
import 'katex/dist/katex.min.css';
import '../styles.css';

export function mountBoard(container: HTMLElement) {
  const root = createRoot(container);
  return (props: BoardProps | null) => root.render(
    props && createElement(MatchBoard, { ...props, key: props.view.startsAt }),
  );
}
