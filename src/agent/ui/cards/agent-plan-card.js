/**
 * <agent-plan-card>: the plan before a run (Figma flow-03, 71:422).
 *
 * data = {
 *   cardId, spendCap: 'up to $1.20',
 *   specs: [{ label: 'x-height', value: 1117 }, ...],
 *   order: [{ label: 'noHO', selected: true }, { label: 'a–z' }, ...],
 * }
 * actions: 'start' | 'adjust'
 */
import { AgentCard, cardButton, cardHeader, chip, el, icon } from './card-shell.js';

export class AgentPlanCard extends AgentCard {
	build(data) {
		const specs = Array.isArray(data.specs) ? data.specs : [];
		const order = Array.isArray(data.order) ? data.order : [];

		const specRow = el('div', 'agent-card__row agent-plan__specs');
		specRow.setAttribute('aria-label', 'Spec');
		specs.forEach((spec) => specRow.append(chip(`${spec.label} ${spec.value}`)));

		const orderRow = el('div', 'agent-card__row agent-plan__order');
		orderRow.setAttribute('aria-label', 'Drawing order');
		order.forEach((group, index) => {
			if (index > 0) orderRow.append(icon('chevron_right', 'agent-plan__chevron'));
			orderRow.append(chip(group.label, { selected: Boolean(group.selected) }));
		});

		const actions = el('div', 'agent-card__actions');
		actions.append(
			cardButton({ label: 'Start', action: 'start', variant: 'primary' }),
			cardButton({ label: 'Adjust', action: 'adjust', iconName: 'tune', variant: 'ghost' })
		);

		const nodes = [cardHeader('Plan', data.spendCap || '', 'meta')];
		if (specs.length) nodes.push(specRow);
		if (order.length) nodes.push(orderRow);
		nodes.push(actions);
		return nodes;
	}

	extraFor(action) {
		if (action !== 'start') return {};
		const first = this._data?.order?.find((g) => g.selected) || this._data?.order?.[0];
		return { first: first?.label ?? null, spendCap: this._data?.spendCap ?? null };
	}

	stepCopyFor(action, extra) {
		if (action === 'start') {
			const parts = [];
			if (extra.first) parts.push(`${extra.first} first`);
			if (extra.spendCap) parts.push(extra.spendCap);
			return { tone: 'kept', text: parts.length ? `Plan started · ${parts.join(', ')}` : 'Plan started' };
		}
		if (action === 'adjust') return { tone: 'yours', text: 'Adjusting the plan' };
		return null;
	}
}
