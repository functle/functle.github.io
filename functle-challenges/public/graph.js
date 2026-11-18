const svgNS = 'http://www.w3.org/2000/svg';

function element(tag, attributes, text) {
	const node = document.createElementNS(svgNS, tag);
	for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
	if (text !== undefined) node.textContent = text;
	return node;
}

export function renderGraph({ paths, label, guides, scale, limit }) {
	const edge = scale * limit;
	const svg = element('svg', { viewBox: [-edge, -edge, edge * 2, edge * 2].join(' '), role: 'img', 'aria-label': label });
	for (let n = -limit; n <= limit; n++) {
		const v = n * scale;
		const stroke = n === 0 ? '#607983' : '#dbe4e8';
		svg.append(element('line', { x1: v, y1: -edge, x2: v, y2: edge, stroke }),
			element('line', { x1: -edge, y1: v, x2: edge, y2: v, stroke }));
		if (n % 2 === 0 && Math.abs(n) < limit && n !== 0) {
			svg.append(element('text', { x: v, y: 12, 'text-anchor': 'middle' }, n),
				element('text', { x: 3, y: -v - 2 }, n));
		}
	}
	if (guides) {
		const [x, y] = guides;
		svg.append(element('line', { x1: x, x2: x, y1: -edge, y2: edge, class: 'guide' }),
			element('line', { x1: -edge, x2: edge, y1: y, y2: y, class: 'guide' }));
	}
	for (const d of paths) svg.append(element('path', { d, fill: 'none', stroke: '#0f4c66', 'stroke-width': 2.5 }));
	return svg;
}
