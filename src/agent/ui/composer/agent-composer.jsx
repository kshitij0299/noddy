/**
 * The agent composer island (#126), on ui-sdk. One box: attachments on top, the textarea, then
 * one row: + menu · Target · spacer · Model · Send. Typing `/` opens the + menu's list as a
 * filterable trigger menu ("two doors, same room").
 *
 * State comes from the vanilla facade (../agent-panel-composer.js) through `store`; Mode, chaos,
 * Telephone and Target are read from and written to ../../agent-controls.js, which stays the
 * source of truth for readAgentControls().
 */
import { useRef, useState, useSyncExternalStore } from 'react';
import {
	Menu,
	MenuCheckboxItem,
	MenuContent,
	MenuGroup,
	MenuGroupLabel,
	MenuItem,
	MenuItemIcon,
	MenuItemIndicator,
	MenuRadioGroup,
	MenuRadioItem,
	MenuSeparator,
	MenuTrigger,
} from '@ui-sdk/react/menu';
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverTitle,
	createPopoverController,
} from '@ui-sdk/react/popover';
import {
	Slider,
	SliderControl,
	SliderIndicator,
	SliderThumb,
	SliderTrack,
	SliderValue,
} from '@ui-sdk/react/slider';
import { Textarea } from '@ui-sdk/react/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@ui-sdk/react/tooltip';
import {
	TriggerMenu,
	TriggerMenuContent,
	TriggerMenuEmpty,
	TriggerMenuGroup,
	TriggerMenuGroupLabel,
	TriggerMenuInput,
	TriggerMenuItem,
	TriggerMenuItemIcon,
	TriggerMenuList,
	TriggerMenuStatus,
} from '@ui-sdk/react/trigger-menu';
import {
	MODES,
	MODE_HINTS,
	MODE_LABELS,
	SCOPES,
	SCOPE_LABELS,
	getModeSettings,
	getTarget,
	scopeOptions,
	setChaos,
	setMode,
	setScope,
	setTelephone,
} from '../../agent-controls.js';
import { charOf } from '../../run/review.js';

function Icon({ name, className = '' }) {
	return (
		<span className={`material-symbols-rounded nd-icon ${className}`.trim()} aria-hidden="true">
			{name}
		</span>
	);
}

/** 'A', '3 glyphs', 'Whole set' */
export function targetShort(target) {
	if (target.scope === 'glyph') return charOf(target.glyphIds[0]) || 'This glyph';
	if (target.scope === 'selected') return `${target.glyphIds.length} glyphs`;
	return 'Whole set';
}

export function targetSpoken(target) {
	if (target.scope === 'glyph') return `This glyph, ${targetShort(target)}`;
	if (target.scope === 'selected') return `${target.glyphIds.length} selected glyphs`;
	return `Whole set, ${target.glyphIds.length} glyphs`;
}

/** 'Exact', 'Remix 50' */
export function modeShort({ mode, chaos }) {
	return mode === 'exact' ? MODE_LABELS[mode] : `${MODE_LABELS[mode]} ${chaos}`;
}

function scopeRows(editor) {
	const options = scopeOptions(editor);
	return SCOPES.map((scope) => {
		const ids = options[scope];
		const meta =
			scope === 'glyph' ? (ids.length ? charOf(ids[0]) : '') : ids.length ? String(ids.length) : '';
		const hint = ids.length
			? ''
			: scope === 'glyph'
			? 'Open a glyph, or Cmd-click one in the grid'
			: 'Cmd-click or Shift-click glyphs in the grid';
		return { scope, title: SCOPE_LABELS[scope], meta, hint, disabled: !ids.length };
	});
}

/**
 * The commands the + menu and `/` share.
 * @returns {Array<{value: String, label: String, icon: String, hint?: String, disabled?: Boolean, group: String}>}
 */
export function composerCommands({ busy, settings, starters }) {
	const list = [
		{
			group: 'Add',
			value: 'attach',
			label: 'Add a sketch or image',
			icon: 'add_photo_alternate',
			disabled: busy,
		},
		...MODES.map((mode) => ({
			group: 'Mode',
			value: `mode:${mode}`,
			label: `${MODE_LABELS[mode]} mode`,
			icon: mode === settings.mode ? 'radio_button_checked' : 'radio_button_unchecked',
			hint: MODE_HINTS[mode],
		})),
	];
	if (settings.mode !== 'exact') {
		list.push(
			{
				group: 'Mode',
				value: 'chaos',
				label: `Chaos ${settings.chaos}`,
				icon: 'tune',
				hint: 'How far each glyph strays',
			},
			{
				group: 'Mode',
				value: 'telephone',
				label: `Telephone ${settings.telephone ? 'on' : 'off'}`,
				icon: settings.telephone ? 'toggle_on' : 'toggle_off',
				hint: 'Each glyph riffs on the last',
			}
		);
	}
	for (const text of starters)
		list.push({ group: 'Start with', value: `starter:${text}`, label: text, icon: 'edit' });
	return list;
}

function groupsOf(commands) {
	const groups = [];
	for (const command of commands) {
		let group = groups.find((entry) => entry.label === command.group);
		if (!group) groups.push((group = { label: command.group, items: [] }));
		group.items.push(command);
	}
	return groups;
}

/**
 * @param {Object} props
 * @param {{get: Function, subscribe: Function}} props.store
 * @param {() => any} props.getEditor
 * @param {Element} props.container - where popups render (inside the panel, so its key guard holds)
 * @param {Object} props.inputController - from createInputController()
 * @param {Object} props.actions
 */
export function AgentComposer({ store, getEditor, container, inputController, actions }) {
	const state = useSyncExternalStore(store.subscribe, store.get);
	const [chaosPopover] = useState(() => createPopoverController());
	const [plus, setPlus] = useState(/** @type {HTMLElement|null} */ (null));
	const [box, setBox] = useState(/** @type {HTMLElement|null} */ (null));
	const chaosAfterClose = useRef(false);

	const editor = getEditor();
	const settings = getModeSettings(editor);
	const target = getTarget(editor);
	const { busy, attachments, starters, model } = state;
	const empty = !state.hasText && !attachments.length;
	const sendDisabled = state.disposed || (!busy && (empty || state.preparing));
	const commands = composerCommands({ busy, settings, starters });

	function openChaos() {
		chaosPopover.open({ anchor: box || plus || undefined });
	}

	/** @param {String} value @param {'menu'|'slash'} from */
	function run(value, from) {
		if (value === 'attach') actions.openChooser();
		else if (value.startsWith('mode:')) setMode(getEditor(), value.slice(5));
		else if (value === 'telephone') setTelephone(getEditor(), !settings.telephone);
		else if (value === 'chaos') {
			// From the + menu, wait until it has closed and handed focus back.
			if (from === 'menu') chaosAfterClose.current = true;
			else openChaos();
		} else if (value.startsWith('starter:') && from === 'menu')
			actions.useStarter(value.slice(8));
	}

	const modeLabel = modeShort(settings);
	const plusName =
		settings.mode === 'exact' ? 'Add and settings' : `Add and settings, ${modeLabel} mode`;

	return (
		<div className="agent-composer__box" ref={setBox}>
			{attachments.length > 0 && (
				<ul className="agent-composer__attachments" aria-label="Attachments">
					{attachments.map((attachment) => (
						<li key={attachment.id} className="agent-attachment text-label">
							<Icon name={attachment.kind === 'font' ? 'font_download' : 'image'} />
							<span className="agent-attachment__name">{attachment.name}</span>
							<Tooltip>
								<TooltipTrigger
									render={
										<button
											type="button"
											className="nd-control nd-control--icon agent-attachment__remove"
											aria-label={`Remove ${attachment.name}`}
											disabled={busy}
											onClick={() => actions.removeAttachment(attachment.id)}
										/>
									}
								>
									<Icon name="close" />
								</TooltipTrigger>
								<TooltipContent container={container} className="agent-tooltip text-label">
									Remove
								</TooltipContent>
							</Tooltip>
						</li>
					))}
				</ul>
			)}

			<TriggerMenu
				triggers={[{ char: '/', maxLength: 40, spaces: 3 }]}
				container={container}
				onSelect={(value, details) => {
					const text = String(value);
					if (text.startsWith('starter:')) details.insert(`${text.slice(8)} `);
					else details.insert('');
					run(text, 'slash');
				}}
			>
				<TriggerMenuInput
					render={
						<Textarea
							autoResize
							submitShortcut="enter"
							onSubmit={() => actions.submitFromKeyboard()}
							rows={1}
							maxLength={12000}
							spellCheck
							controller={inputController}
							placeholder={state.placeholder}
							aria-label={state.placeholder}
							className="agent-composer__input"
						/>
					}
				/>
				<div className="agent-sr-only">
					<TriggerMenuStatus />
				</div>
				<TriggerMenuContent
					side="top"
					align="start"
					sideOffset={8}
					anchor={box}
					container={container}
					className="nd-popup agent-menu agent-menu--slash"
				>
					<TriggerMenuEmpty className="agent-menu__empty text-body-small">
						Nothing matches
					</TriggerMenuEmpty>
					<TriggerMenuList className="agent-menu__list">
						{groupsOf(commands).map((group) => (
							<TriggerMenuGroup key={group.label} className="agent-menu__group">
								<TriggerMenuGroupLabel className="agent-menu__label text-meta">
									{group.label}
								</TriggerMenuGroupLabel>
								{group.items.map((command) => (
									<TriggerMenuItem
										key={command.value}
										value={command.value}
										label={command.label}
										keywords={command.hint ? [command.hint] : undefined}
										disabled={command.disabled}
										className="nd-item agent-menu__item"
									>
										<TriggerMenuItemIcon className="agent-menu__icon">
											<Icon name={command.icon} />
										</TriggerMenuItemIcon>
										<span className="agent-menu__text">
											<span className="agent-menu__title text-label">{command.label}</span>
											{command.hint && (
												<span className="agent-menu__hint text-body-small">{command.hint}</span>
											)}
										</span>
									</TriggerMenuItem>
								))}
							</TriggerMenuGroup>
						))}
					</TriggerMenuList>
				</TriggerMenuContent>
			</TriggerMenu>

			<div className="agent-composer__bar">
				<Menu
					onAction={(value) => run(String(value), 'menu')}
					onOpenChangeComplete={(open) => {
						if (!open && chaosAfterClose.current) {
							chaosAfterClose.current = false;
							openChaos();
						}
					}}
				>
					<Tooltip>
						<TooltipTrigger
							render={
								<MenuTrigger
									ref={setPlus}
									className="nd-control nd-control--icon agent-composer__plus"
									aria-label={plusName}
									data-mode={settings.mode}
								/>
							}
						>
							<Icon name="add" />
							{settings.mode !== 'exact' && <span className="agent-composer__plus-dot" />}
						</TooltipTrigger>
						<TooltipContent container={container} className="agent-tooltip text-label">
							{settings.mode === 'exact'
								? 'Sketch, mode and starters · type /'
								: `${modeLabel} · sketch, mode and starters`}
						</TooltipContent>
					</Tooltip>
					<MenuContent
						side="top"
						align="start"
						sideOffset={8}
						anchor={box}
						container={container}
						className="nd-popup agent-menu"
					>
						<MenuItem value="attach" disabled={busy} className="nd-item agent-menu__item">
							<MenuItemIcon className="agent-menu__icon">
								<Icon name="add_photo_alternate" />
							</MenuItemIcon>
							<span className="agent-menu__title text-label">Add a sketch or image</span>
						</MenuItem>
						<MenuSeparator className="agent-menu__separator" />
						<MenuRadioGroup
							value={settings.mode}
							onValueChange={(value) => setMode(getEditor(), String(value))}
							className="agent-menu__group"
						>
							<MenuGroupLabel className="agent-menu__label text-meta">Mode</MenuGroupLabel>
							{MODES.map((mode) => (
								<MenuRadioItem
									key={mode}
									value={mode}
									label={MODE_LABELS[mode]}
									className="nd-item agent-menu__item"
								>
									<MenuItemIndicator keepMounted className="agent-menu__check">
										<Icon name="check" />
									</MenuItemIndicator>
									<span className="agent-menu__text">
										<span className="agent-menu__title text-label">{MODE_LABELS[mode]}</span>
										<span className="agent-menu__hint text-body-small">{MODE_HINTS[mode]}</span>
									</span>
								</MenuRadioItem>
							))}
						</MenuRadioGroup>
						{settings.mode !== 'exact' && (
							<MenuGroup className="agent-menu__group">
								<MenuItem value="chaos" label="Chaos" className="nd-item agent-menu__item">
									<MenuItemIcon className="agent-menu__icon">
										<Icon name="tune" />
									</MenuItemIcon>
									<span className="agent-menu__title text-label">Chaos…</span>
									<span className="agent-menu__meta text-mono-small">{settings.chaos}</span>
								</MenuItem>
								<MenuCheckboxItem
									value="telephone"
									label="Telephone"
									checked={settings.telephone}
									onCheckedChange={(on) => setTelephone(getEditor(), on)}
									className="nd-item agent-menu__item"
								>
									<MenuItemIndicator keepMounted className="agent-menu__check">
										<Icon name="check" />
									</MenuItemIndicator>
									<span className="agent-menu__text">
										<span className="agent-menu__title text-label">Telephone</span>
										<span className="agent-menu__hint text-body-small">
											Each glyph riffs on the last
										</span>
									</span>
								</MenuCheckboxItem>
							</MenuGroup>
						)}
						{starters.length > 0 && (
							<>
								<MenuSeparator className="agent-menu__separator" />
								<MenuGroup className="agent-menu__group">
									<MenuGroupLabel className="agent-menu__label text-meta">Start with</MenuGroupLabel>
									{starters.map((text) => (
										<MenuItem
											key={text}
											value={`starter:${text}`}
											label={text}
											className="nd-item agent-menu__item"
										>
											<MenuItemIcon className="agent-menu__icon">
												<Icon name="edit" />
											</MenuItemIcon>
											<span className="agent-menu__title text-label">{text}</span>
										</MenuItem>
									))}
								</MenuGroup>
							</>
						)}
					</MenuContent>
				</Menu>

				<Menu>
					<MenuTrigger
						className="nd-control agent-composer__chip agent-composer__target text-label"
						aria-label={`Target: ${targetSpoken(target)}`}
						data-scope={target.scope}
					>
						<Icon name="filter_center_focus" className="agent-composer__chip-icon" />
						<span className="agent-composer__chip-label">{targetShort(target)}</span>
						<Icon name="expand_more" className="agent-composer__caret" />
					</MenuTrigger>
					<MenuContent
						side="top"
						align="start"
						sideOffset={8}
						anchor={box}
						container={container}
						className="nd-popup agent-menu"
					>
						<MenuRadioGroup
							value={target.scope}
							onValueChange={(value) => setScope(getEditor(), String(value))}
							className="agent-menu__group"
						>
							<MenuGroupLabel className="agent-menu__label text-meta">Target</MenuGroupLabel>
							{scopeRows(editor).map((row) => (
								<MenuRadioItem
									key={row.scope}
									value={row.scope}
									label={row.title}
									disabled={row.disabled}
									closeOnSelect
									className="nd-item agent-menu__item"
								>
									<MenuItemIndicator keepMounted className="agent-menu__check">
										<Icon name="check" />
									</MenuItemIndicator>
									<span className="agent-menu__text">
										<span className="agent-menu__title text-label">{row.title}</span>
										{row.hint && (
											<span className="agent-menu__hint text-body-small">{row.hint}</span>
										)}
									</span>
									{row.meta && (
										<span className="agent-menu__meta text-mono-small">{row.meta}</span>
									)}
								</MenuRadioItem>
							))}
						</MenuRadioGroup>
					</MenuContent>
				</Menu>

				<span className="agent-composer__spacer" />

				<Tooltip type="description">
					<TooltipTrigger
						render={
							<button
								type="button"
								className="nd-control agent-composer__chip agent-composer__model text-label"
								data-local={model.local ? '' : undefined}
								aria-label={
									model.local
										? model.label
										: `Model: ${model.label}${
												model.tier ? (model.tier === 'free' ? ', Free' : ', Paid') : ''
										  }`
								}
							/>
						}
					>
						<span className="agent-composer__chip-label">{model.label}</span>
						{model.tier && !model.local && (
							<span className="agent-composer__badge" data-badge={model.tier}>
								<Icon name={model.tier === 'free' ? 'money_off' : 'paid'} />
							</span>
						)}
						{!model.local && <Icon name="expand_more" className="agent-composer__caret" />}
					</TooltipTrigger>
					<TooltipContent container={container} className="agent-tooltip text-label">
						{model.local ? 'Turn off Local agent to use a model' : 'Change model'}
					</TooltipContent>
				</Tooltip>

				<Tooltip disabled={sendDisabled}>
					<TooltipTrigger
						render={
							<button
								type="submit"
								className={`nd-control nd-control--icon nd-control--accent agent-composer__send${
									busy ? ' is-stop' : ''
								}`}
								aria-label={busy ? 'Stop the agent' : 'Send'}
								disabled={sendDisabled}
							/>
						}
					>
						<Icon name={busy ? 'stop' : 'arrow_upward'} />
					</TooltipTrigger>
					<TooltipContent container={container} className="agent-tooltip text-label">
						{busy ? 'Stop' : 'Send · Enter'}
					</TooltipContent>
				</Tooltip>
			</div>

			<Popover controller={chaosPopover}>
				<PopoverContent
					side="top"
					align="start"
					sideOffset={8}
					container={container}
					className="nd-popup agent-chaos-popover"
				>
					<PopoverTitle className="agent-chaos-popover__title text-label">
						{MODE_LABELS[settings.mode]} · Chaos
					</PopoverTitle>
					<PopoverDescription className="agent-chaos-popover__hint text-body-small">
						How far each glyph strays from the reference
					</PopoverDescription>
					<Slider
						value={settings.chaos}
						onValueChange={(value) => setChaos(getEditor(), value)}
						min={0}
						max={100}
						step={5}
						className="agent-slider"
					>
						<div className="agent-slider__head">
							<span className="text-label">Chaos</span>
							<SliderValue className="agent-slider__value text-mono-small" />
						</div>
						<SliderControl className="agent-slider__control">
							<SliderTrack className="agent-slider__track">
								<SliderIndicator className="agent-slider__indicator" />
								<SliderThumb aria-label="Chaos" className="agent-slider__thumb" />
							</SliderTrack>
						</SliderControl>
					</Slider>
				</PopoverContent>
			</Popover>
		</div>
	);
}
