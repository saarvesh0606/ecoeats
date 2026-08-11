"""
Draws the native launcher icon, the Android adaptive-icon foreground and the
splash mark.

These three images are the first thing the OS shows, before any JS has loaded,
so they have to agree with `src/components/ui/Splash.tsx` — the screen that
takes over a moment later. That component's own docstring explains why: holding
one branded screen across the startup waits makes launch read as a single
moment rather than a stutter. The native splash is simply one step earlier in
that same sequence, which is why every colour below is lifted from the
component and the leaf is the *same* Ionicons glyph rather than a redrawn one.

Regenerate with (Pillow is the only requirement, and only to regenerate):

    python mobile/scripts/generate-icons.py

ImageDraw does not antialias, so everything is composed at SS times the final
size and downsampled once at the end.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
SS = 4
W = SIZE * SS

# Lifted from tailwind.config.js / Splash.tsx.
FOREST_800 = (22, 56, 39)  # #163827 — the ground Splash.tsx sits on
FOREST_600 = (30, 116, 80)  # #1e7450 — the disc behind the leaf
FOREST_300 = (134, 214, 173)  # #86d6ad — the leaf, and the ripple rings

DISC_ALPHA = 102  # bg-forest-600/40
LEAF = chr(62386)  # Ionicons "leaf", per its own glyphmap

HERE = Path(__file__).resolve().parent
MOBILE = HERE.parent
ASSETS = MOBILE / "assets"
IONICONS = (
    MOBILE
    / "node_modules/@expo/vector-icons/build/vendor"
    / "react-native-vector-icons/Fonts/Ionicons.ttf"
)


def leaf(width_px: int) -> Image.Image:
    """The leaf glyph, cropped to its own ink and scaled to `width_px` wide.

    Font metrics carry padding that varies by glyph, so the glyph is measured
    after rasterising rather than trusted from the em box — otherwise the leaf
    lands off-centre by a few percent and the icon looks subtly crooked.
    """
    probe = 1400
    font = ImageFont.truetype(str(IONICONS), probe)
    layer = Image.new("RGBA", (probe * 2, probe * 2), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text(
        (probe // 2, probe // 2), LEAF, font=font, fill=FOREST_300 + (255,)
    )
    glyph = layer.crop(layer.getbbox())
    scale = width_px / max(glyph.size)
    return glyph.resize(
        (round(glyph.width * scale), round(glyph.height * scale)), Image.LANCZOS
    )


def _ink_centre(sprite: Image.Image) -> tuple[float, float]:
    """Centre of mass of the sprite's alpha, via its row and column marginals.

    Averaging each column into a one-pixel-tall image (and each row into a
    one-pixel-wide one) gives both marginals without a per-pixel loop or a
    numpy dependency.
    """
    alpha = sprite.getchannel("A")
    def weighted_mean(values: list[int]) -> float:
        total = sum(values)
        if not total:
            return len(values) / 2
        return sum(i * v for i, v in enumerate(values)) / total

    return (
        weighted_mean(list(alpha.resize((alpha.width, 1), Image.BOX).getdata())),
        weighted_mean(list(alpha.resize((1, alpha.height), Image.BOX).getdata())),
    )


def centred(canvas: Image.Image, sprite: Image.Image) -> None:
    """Place a sprite on its optical centre rather than its bounding box.

    The leaf is a blob with a thin stem trailing to the lower right. That tail
    stretches the bounding box without carrying any visual weight, so box
    centring pushes the blob up and left by a few percent — unmissable once a
    launcher masks the icon to a circle.
    """
    x, y = _ink_centre(sprite)
    canvas.alpha_composite(
        sprite, (round(canvas.width / 2 - x), round(canvas.height / 2 - y))
    )


def ring(canvas: Image.Image, radius: float, alpha: int) -> None:
    """One faint ripple ring.

    Drawn onto its own layer and composited, because ImageDraw *replaces*
    pixels instead of blending them — drawing a low-alpha outline straight onto
    the canvas punches the background out and the ring then reappears at full
    brightness the moment the icon is flattened to RGB.
    """
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    c, r = W // 2, int(radius * W)
    ImageDraw.Draw(layer).ellipse(
        [c - r, c - r, c + r, c + r], outline=FOREST_300 + (alpha,), width=6 * SS
    )
    canvas.alpha_composite(layer)


def finish(canvas: Image.Image, name: str, *, flatten: bool) -> None:
    out = canvas.resize((SIZE, SIZE), Image.LANCZOS)
    # Apple rejects an icon with an alpha channel outright, so that one is
    # flattened to RGB. The other two are composited over a background the OS
    # supplies and must keep their transparency.
    if flatten:
        out = out.convert("RGB")
    out.save(ASSETS / name)
    print(f"{name}: {out.size[0]}x{out.size[1]} {out.mode}")


def build_icon() -> None:
    """Launcher icon: opaque, and legible at 60px."""
    canvas = Image.new("RGBA", (W, W), FOREST_800 + (255,))
    # Two ripple rings, echoing the ones Splash.tsx animates outward. They are
    # texture at full size and invisible at 60px, which is the intent — the
    # leaf alone carries the small sizes. Both sit clear of the leaf; a ring
    # cutting through it just reads as a scratch.
    ring(canvas, 0.325, 26)
    ring(canvas, 0.425, 16)
    centred(canvas, leaf(int(0.40 * W)))
    finish(canvas, "icon.png", flatten=True)


def build_adaptive_icon() -> None:
    """Android foreground. The outer third can be masked away by any launcher,
    so the leaf is kept small enough to survive a circle crop, and the ground
    colour is handed to `android.adaptiveIcon.backgroundColor` instead of being
    painted in."""
    canvas = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    centred(canvas, leaf(int(0.34 * W)))
    finish(canvas, "adaptive-icon.png", flatten=False)


def build_splash_icon() -> None:
    """Splash mark: the disc-and-leaf exactly as Splash.tsx draws it, so the
    handoff to the animated screen changes only scale, never the artwork.

    Transparent, because iOS aspect-fits this over `splash.backgroundColor`.
    The disc keeps its 40% alpha rather than being pre-blended, so it lands on
    the same colour the component's `bg-forest-600/40` produces.
    """
    canvas = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    # iOS aspect-fits this square to the screen *width*, so the fraction below
    # is what sets the on-screen size: 0.22 of a 390pt-wide phone lands the
    # disc near the 64pt one Splash.tsx draws, keeping the handoff close to a
    # straight cut. Nudge it if the mark looks wrong on a real device — this
    # has never been seen on hardware, and the legacy splash key pins
    # imageWidth at 200, so this fraction is the only size control there is.
    disc = int(0.22 * W)
    c = W // 2
    ImageDraw.Draw(canvas).ellipse(
        [c - disc // 2, c - disc // 2, c + disc // 2, c + disc // 2],
        fill=FOREST_600 + (DISC_ALPHA,),
    )
    # Splash.tsx renders a 30px leaf inside a 64px disc.
    centred(canvas, leaf(round(disc * 30 / 64)))
    finish(canvas, "splash-icon.png", flatten=False)


if __name__ == "__main__":
    if not IONICONS.exists():
        raise SystemExit(f"Ionicons.ttf not found at {IONICONS} — run npm install")
    build_icon()
    build_adaptive_icon()
    build_splash_icon()
