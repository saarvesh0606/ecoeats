/**
 * Minimal stand-in for react-native-reanimated under Jest.
 *
 * Reanimated's own `mock.js` re-imports its real index, which boots the native
 * Worklets runtime and throws ("Native part of Worklets doesn't seem to be
 * initialized"). These tests assert on rendered output, not motion, so the
 * animated components collapse to plain views and the hooks become no-ops.
 *
 * Covers only what the app actually uses; add to it if new APIs get used.
 */
const React = require("react");
const { View, Text, Image, ScrollView, Pressable } = require("react-native");

/** Entering/exiting descriptors are chainable: FadeInDown.duration(x).delay(y) */
function chainable() {
	const self = {};
	for (const method of [
		"duration",
		"delay",
		"springify",
		"damping",
		"stiffness",
		"withInitialValues",
		"easing",
		"build",
	]) {
		self[method] = () => self;
	}
	return self;
}

const createAnimatedComponent = (Component) => Component;

const Animated = {
	View,
	Text,
	Image,
	ScrollView,
	createAnimatedComponent,
};

module.exports = {
	__esModule: true,
	default: Animated,
	View,
	Text,
	Image,
	ScrollView,
	createAnimatedComponent,

	// Hooks — a shared value is just a mutable box; styles resolve to nothing.
	useSharedValue: (initial) => ({ value: initial }),
	useAnimatedStyle: () => ({}),
	useAnimatedRef: () => React.createRef(),
	useDerivedValue: (fn) => ({ value: fn() }),

	// Animation helpers resolve immediately to their target value.
	withSpring: (toValue) => toValue,
	withTiming: (toValue) => toValue,
	withRepeat: (animation) => animation,
	withSequence: (...animations) => animations[animations.length - 1],
	withDelay: (_delay, animation) => animation,
	cancelAnimation: () => {},
	runOnJS: (fn) => fn,
	runOnUI: (fn) => fn,

	Easing: new Proxy({}, { get: () => () => {} }),

	// Layout animation presets.
	FadeIn: chainable(),
	FadeOut: chainable(),
	FadeInDown: chainable(),
	FadeInUp: chainable(),
	FadeOutDown: chainable(),
	SlideInRight: chainable(),
	SlideOutLeft: chainable(),
	Layout: chainable(),
	LinearTransition: chainable(),
	Pressable,
};
