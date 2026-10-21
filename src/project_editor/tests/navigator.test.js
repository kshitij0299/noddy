import { afterEach, beforeEach, describe, it } from 'vitest';
import { Navigator } from '../navigator.js';
import {
	HIDDEN_PAGES,
	resolveVisiblePage,
	setLegacyPagesOverride,
} from '../../app/legacy_pages.js';

describe('Navigator: Page Navigation', () => {
	let navigator;

	beforeEach(() => {
		// These tests exercise the legacy pages themselves, so show them.
		setLegacyPagesOverride(true);
		navigator = new Navigator();
	});

	afterEach(() => {
		setLegacyPagesOverride(null);
	});

	it('Should have a default page of "Workspace"', () => {
		expect(navigator.page).toBe('Workspace');
	});

	it('Should have a default panel of "Attributes"', () => {
		expect(navigator.panel).toBe('Attributes');
	});

	it('Navigate to page: Characters', () => {
		navigator.page = 'Characters';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.id).toBe('app__main-content');
		expect(pageContent.querySelector('.nav-button__title').innerHTML).toBe('Characters');
	});

	it('Navigate to page: Ligatures', () => {
		navigator.page = 'Ligatures';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.id).toBe('app__main-content');
		expect(pageContent.querySelector('.nav-button__title').innerHTML).toBe('Ligatures');
	});

	it('Navigate to page: Components', () => {
		navigator.page = 'Components';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.id).toBe('app__main-content');
		expect(pageContent.querySelector('.nav-button__title').innerHTML).toBe('Components');
	});

	it('Navigate to page: Kerning', () => {
		navigator.page = 'Kerning';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.id).toBe('app__main-content');
		expect(pageContent.querySelector('.nav-button__title').innerHTML).toBe('Kerning');
	});

	// it('Navigate to page: Live preview', () => {
	// 	navigator.page = 'Live preview';
	// 	navigator.navigate(true);
	// 	const pageContent = navigator.makePageContent();
	// 	expect(pageContent.id).toBe('app__main-content');
	// 	expect(pageContent.querySelector('.nav-button__title').innerHTML).toBe('Live preview');
	// });

	it('Navigate to page: Global actions', () => {
		navigator.page = 'Global actions';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.id).toBe('app__main-content');
		expect(pageContent.querySelector('.nav-button__title').innerHTML).toBe('Global actions');
	});

	it('Navigate to page: Settings', () => {
		navigator.page = 'Settings';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.id).toBe('app__main-content');
		expect(pageContent.querySelector('.nav-button__title').innerHTML).toBe('Settings');
	});

	it('Navigate to page: Help', () => {
		navigator.page = 'Help';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.id).toBe('app__main-content');
		expect(pageContent.querySelector('.nav-button__title').innerHTML).toBe('Help');
	});

	it('Navigate to page: About', () => {
		navigator.page = 'About';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.id).toBe('app__main-content');
		expect(pageContent.querySelector('.nav-button__title').innerHTML).toBe('About');
	});
});

/*
describe('Navigator: hidden legacy pages (UI reset)', () => {
	afterEach(() => {
		setLegacyPagesOverride(null);
	});

	it('every legacy page resolves to the Workspace without the flag', () => {
		setLegacyPagesOverride(false);
		for (const page of HIDDEN_PAGES) {
			expect(resolveVisiblePage(page)).toBe('Workspace');
		}
		expect(resolveVisiblePage('Workspace')).toBe('Workspace');
	});

	it('focus mode on the Characters page stays visible', () => {
		setLegacyPagesOverride(false);
		expect(resolveVisiblePage('Characters', { focus: true })).toBe('Characters');
		expect(resolveVisiblePage('Characters', { focus: false })).toBe('Workspace');
	});

	it('the flag or dev mode shows every page', () => {
		setLegacyPagesOverride(true);
		expect(resolveVisiblePage('Kerning')).toBe('Kerning');
		setLegacyPagesOverride(null);
		expect(resolveVisiblePage('Kerning', { devMode: true })).toBe('Kerning');
	});

	it('navigate() lands on the Workspace when a hidden page is requested', () => {
		setLegacyPagesOverride(false);
		const navigator = new Navigator();
		navigator.page = 'Overview';
		navigator.navigate(true);
		expect(navigator.page).toBe('Workspace');
		const pageContent = navigator.makePageContent();
		expect(pageContent.querySelector('#app__page[data-page="workspace"]')).not.toBeNull();
	});

	it('navigate() keeps a hidden page when the flag is on', () => {
		setLegacyPagesOverride(true);
		const navigator = new Navigator();
		navigator.page = 'Overview';
		navigator.navigate(true);
		expect(navigator.page).toBe('Overview');
	});
});

describe('Navigator: Panel Navigation', () => {
	let navigator;

	beforeEach(() => {
		navigator = new Navigator();
	});

	it('Navigate to panel: Layers', () => {
		navigator.page = 'Characters';
		navigator.panel = 'Layers';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.querySelector('#nav-button-l3 .nav-button__title').innerHTML).toBe('Layers');
	});

	it('Navigate to panel: Context characters', () => {
		navigator.page = 'Characters';
		navigator.panel = 'Context characters';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.querySelector('#nav-button-l3 .nav-button__title').innerHTML).toBe('Context characters');
	});

	it('Navigate to panel: History', () => {
		navigator.page = 'Characters';
		navigator.panel = 'History';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.querySelector('#nav-button-l3 .nav-button__title').innerHTML).toBe('History');
	});

	it('Navigate to panel: Guides', () => {
		navigator.page = 'Characters';
		navigator.panel = 'Guides';
		navigator.navigate(true);
		const pageContent = navigator.makePageContent();
		expect(pageContent.querySelector('#nav-button-l3 .nav-button__title').innerHTML).toBe('Guides');
	});
});
*/
