import { Block } from './element.mjs';

export class Inner extends Block {
	constructor(content) {
		super(content)
	}
}

customElements.define("ui-inner", Inner);