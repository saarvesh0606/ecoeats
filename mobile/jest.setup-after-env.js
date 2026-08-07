// Runs after the test framework is installed, which is what Testing Library's
// `configure` needs.
const { configure } = require("@testing-library/react-native");

/**
 * Testing Library gives `findBy*` and `waitFor` 1000ms by default. That is a
 * separate budget from Jest's own `testTimeout`, and it is the tighter of the
 * two here — raising the Jest limit does nothing for it.
 *
 * The first `render` in a suite pays one-time cost the later ones don't: the
 * navigation, animation and font stacks all mount for real. On a cold Babel
 * transform cache — the state CI and every fresh clone are always in — that
 * first mount can take longer than a second, so the opening `findBy*` of a file
 * fails while every identical query after it passes. It surfaced as
 * `ListingDetail` failing to find text that the failure dump printed correctly,
 * which reads as a broken assertion rather than a slow machine.
 *
 * Nothing in the suite waits on anything that can genuinely hang — every fetch
 * is mocked — so a generous ceiling costs nothing and removes a whole class of
 * false failure.
 */
configure({ asyncUtilTimeout: 15_000 });
