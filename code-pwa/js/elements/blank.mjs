import { Block } from './element.mjs';

export class Blank extends Block {
	constructor(content) {
		super(content)
	}
}

customElements.define("ui-blank", Blank);