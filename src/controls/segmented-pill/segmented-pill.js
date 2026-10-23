import './segmented-pill.css';

/**
 * Class names of the shared SegmentedPill (Figma 61:187). Importing this
 * module loads the stylesheet, so any control that builds a pill gets it.
 *
 * Markup: a track element holding <button> segments. The selected segment
 * carries aria-pressed="true" (toggle group) or aria-checked="true" (radio
 * group). Use `trackIcons` when the segments hold a single icon.
 */
export const SEGMENTED_PILL = Object.freeze({
	track: 'segmented-pill',
	trackIcons: 'segmented-pill segmented-pill--icons',
	segment: 'segmented-pill__segment',
});
