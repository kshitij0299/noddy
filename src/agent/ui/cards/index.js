/**
 * Agent message cards (M4, #22). Importing this module defines the elements
 * and loads their stylesheet. Presentational only: listen for
 * `agent-card-action` ({ action, cardId, ...extra }) to wire behaviour.
 */
import './agent-cards.css';
import { AgentApprovalCard } from './agent-approval-card.js';
import { AgentPlanCard } from './agent-plan-card.js';
import { AgentReceiptCard } from './agent-receipt-card.js';
import { AgentStepLine } from './agent-step-line.js';

export { CARD_ACTION_EVENT } from './card-shell.js';
export { AgentPlanCard, AgentApprovalCard, AgentReceiptCard, AgentStepLine };
export { summarizeReceipt } from './agent-receipt-card.js';

const ELEMENTS = [
	['agent-step-line', AgentStepLine],
	['agent-plan-card', AgentPlanCard],
	['agent-approval-card', AgentApprovalCard],
	['agent-receipt-card', AgentReceiptCard],
];

/**
 * Defines the card elements once (safe to call repeatedly, e.g. in tests).
 */
export function registerAgentCards() {
	for (const [name, ctor] of ELEMENTS) {
		if (!customElements.get(name)) customElements.define(name, ctor);
	}
}

registerAgentCards();
