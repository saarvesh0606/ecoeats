/**
 * Teaches NativeWind how to style Reanimated's animated components.
 *
 * NativeWind only rewrites `className` into `style` for components it has been
 * told about. Reanimated's Animated.* are not among them, so without this every
 * class on an animated element (background, padding, radius) is silently
 * dropped and the element renders unstyled — no error, just a bare box.
 *
 * Imported for its side effect from the root layout, so registration happens
 * once, before any screen renders, rather than depending on import order.
 */
import { cssInterop } from "nativewind";
import Animated from "react-native-reanimated";

cssInterop(Animated.View, { className: "style" });
cssInterop(Animated.Text, { className: "style" });
cssInterop(Animated.ScrollView, { className: "style" });
