import { Effect } from './effect.mjs';

export class Ripple extends Effect {
	constructor() {
		super()
		// animationend
	}
}

customElements.define("effect-ripple", Ripple);