import { Element } from './element.mjs';

export class Icon extends Element {
	constructor(content) {
		super(content)
	}
}

customElements.define("ui-icon", Icon);