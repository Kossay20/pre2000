#!/usr/bin/env python3
"""
Generate every store-required icon variant from `assets/icon-source.png`.

Why this exists
---------------
The original artwork is a *pre-rounded* tile: a 1024x1024 canvas holding a
squircle, with the four corners filled flat — near-white at the top, near-black
at the bottom (a leftover drop shadow). `assets/adaptive-icon.png` was a
byte-for-byte copy of it.

Both stores mask the icon themselves:

  - iOS applies its own superellipse. An icon that arrives already rounded shows
    the leftover corner fill as slivers, and Apple asks for a full-square, fully
    opaque icon.
  - Android's adaptive icon keeps only the inner ~66% of the foreground layer
    (the rest is reserved for the launcher's mask shape and parallax). Feeding it
    a full-bleed tile crops the silhouette badly.

So this script derives, from the same artwork:

  assets/icon.png                       1024  opaque, full-bleed        -> iOS + generic
  assets/adaptive-icon.png              1024  alpha, logo in safe zone  -> Android foreground
  assets/adaptive-icon-background.png   1024  opaque, gradient only     -> Android background
  assets/adaptive-icon-monochrome.png   1024  alpha, silhouette only    -> Android 13+ themed
  store/icons/play-icon-512.png          512  32-bit PNG                -> Play listing

Method
------
The corner fill is found empirically — a flood fill from the four image corners
over near-grey pixels — rather than assumed to be a circular arc. That matters:
the real boundary is a squircle whose flat fill is only ~58px deep on the
diagonal, so a circular-arc model with the measured 175px edge radius over-claims
the region by an order of magnitude and ends up resampling the fill onto itself.

The fill is then replaced by nearest-neighbour extension of the surrounding
gradient (exact Euclidean distance transform), softened inside the repaired area
so the Voronoi seams of a raw nearest-neighbour fill never show. Everything
inside the squircle is left untouched, so the full-bleed icon stays faithful to
the artwork the owner approved.

The white silhouette is recovered as an alpha matte by solving the compositing
equation per pixel against a least-squares background plane, using the G and B
channels (R sits at ~252 across the whole gradient and carries no signal).

Run:  python3 scripts/generate-store-icons.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

APP_DIR = Path(__file__).resolve().parent.parent
ASSETS = APP_DIR / "assets"
STORE_OUT = APP_DIR / "store" / "icons"

# Read from a pinned source, never from the generated `icon.png`, so the script
# is idempotent and a second run cannot feed on its own output.
SOURCE = ASSETS / "icon-source.png"
SIZE = 1024

# A pixel is "corner fill" if it is near-grey (the gradient is strongly
# chromatic everywhere) AND reachable from an image corner.
GREY_TOLERANCE = 18
# The fill has an anti-aliased rim against the squircle; grow the mask past it.
RIM_DILATION = 4
# Smoothing applied only inside the repaired area.
REPAIR_BLUR_SIGMA = 8.0
# Width of the border band searched for the drop shadow, and how much darker than
# the background plane a pixel must be to count as shadow.
SHADOW_BAND = 150
SHADOW_DELTA = 6.0
# Below this, a connected component in the alpha matte is rim noise, not artwork.
MIN_COMPONENT_PX = 500
# Android's notification icon baseline is 96x96 (mdpi); ship xxxhdpi-sized art.
NOTIFICATION_ICON_SIZE = 384
# Every Android launcher mask contains the centred 66dp circle of the 108dp
# foreground layer — that disc is the only region guaranteed visible.
ANDROID_SAFE_CIRCLE_FRACTION = 66.0 / 108.0
ANDROID_SAFE_MARGIN = 0.98


def load_source() -> np.ndarray:
    if not SOURCE.exists():
        sys.exit(
            f"missing source artwork: {SOURCE}\n"
            "It is the original pre-rounded tile; keep it in git so this script stays rerunnable."
        )
    img = Image.open(SOURCE).convert("RGB")
    if img.size != (SIZE, SIZE):
        sys.exit(f"expected a {SIZE}x{SIZE} source, got {img.size}")
    return np.asarray(img).astype(np.float64)


def corner_fill_mask(src: np.ndarray) -> np.ndarray:
    """Flat, near-grey area connected to an image corner — i.e. not artwork."""
    greyish = (np.abs(src[..., 0] - src[..., 1]) < GREY_TOLERANCE) & (
        np.abs(src[..., 1] - src[..., 2]) < GREY_TOLERANCE
    )
    labels, _ = ndimage.label(greyish)
    corner_labels = {
        labels[y, x]
        for y, x in ((0, 0), (0, SIZE - 1), (SIZE - 1, 0), (SIZE - 1, SIZE - 1))
        if labels[y, x] != 0
    }
    mask = np.isin(labels, list(corner_labels))
    return ndimage.binary_dilation(mask, iterations=RIM_DILATION)


def shadow_halo_mask(src: np.ndarray, plane: np.ndarray, fill: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """The soft drop shadow hugging the squircle edge.

    The flat corner fill is caught by the grey test, but the shadow fading out of
    it is still chromatic, so it survives — and a nearest-neighbour repair then
    smears it along the border. Catch it as: near the canvas edge, meaningfully
    darker than the background plane, and not part of the silhouette.
    """
    border = np.zeros((SIZE, SIZE), bool)
    border[:SHADOW_BAND, :] = border[-SHADOW_BAND:, :] = True
    border[:, :SHADOW_BAND] = border[:, -SHADOW_BAND:] = True

    darker = (plane[..., 1] - src[..., 1] > SHADOW_DELTA) | (
        plane[..., 2] - src[..., 2] > SHADOW_DELTA
    )
    halo = border & darker & (alpha < 0.15) & ~fill
    return ndimage.binary_dilation(halo, iterations=RIM_DILATION)


def make_full_bleed(src: np.ndarray, fill: np.ndarray) -> np.ndarray:
    """Extend the gradient over the corner fill, leaving the squircle interior intact."""
    # Nearest untouched pixel for every pixel to repair.
    _, (nearest_y, nearest_x) = ndimage.distance_transform_edt(
        fill, return_indices=True
    )
    repaired = src.copy()
    repaired[fill] = src[nearest_y[fill], nearest_x[fill]]

    # A raw nearest-neighbour fill leaves Voronoi spokes; blur, but only where we
    # painted, so no real pixel is softened.
    blurred = np.stack(
        [
            np.asarray(
                Image.fromarray(repaired[..., c].astype(np.uint8)).filter(
                    ImageFilter.GaussianBlur(REPAIR_BLUR_SIGMA)
                )
            ).astype(np.float64)
            for c in range(3)
        ],
        axis=-1,
    )
    # Feather the handover so the blurred patch meets untouched pixels smoothly.
    weight = ndimage.gaussian_filter(fill.astype(np.float64), REPAIR_BLUR_SIGMA / 2)
    weight = np.clip(weight, 0.0, 1.0)[..., None]
    return repaired * (1 - weight) + blurred * weight


def background_plane(src: np.ndarray, fill: np.ndarray) -> np.ndarray:
    """Least-squares plane per channel, fitted on gradient pixels only.

    Used solely as the reference for the alpha matte — the visible icon keeps the
    real pixels, so the plane's few-LSB error never reaches the eye.
    """
    yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float64)
    greyish = (np.abs(src[..., 0] - src[..., 1]) < 20) & (
        np.abs(src[..., 1] - src[..., 2]) < 20
    )
    # Erode so anti-aliased silhouette edges do not pollute the fit.
    gradient_only = ndimage.binary_erosion(~(greyish | fill), iterations=6)

    design = np.c_[xx[gradient_only], yy[gradient_only], np.ones(int(gradient_only.sum()))]
    full = np.c_[xx.ravel(), yy.ravel(), np.ones(SIZE * SIZE)]
    planes = []
    for channel in range(3):
        coef, *_ = np.linalg.lstsq(design, src[..., channel][gradient_only], rcond=None)
        residual = np.abs(design @ coef - src[..., channel][gradient_only])
        print(
            f"  plane fit {'RGB'[channel]}: mean |err| {residual.mean():.2f}"
            f"  p99 {np.percentile(residual, 99):.1f}"
        )
        planes.append((full @ coef).reshape(SIZE, SIZE))
    return np.stack(planes, axis=-1)


def extract_alpha(src: np.ndarray, background: np.ndarray, fill: np.ndarray) -> np.ndarray:
    """Recover the white silhouette's alpha from `obs = a*255 + (1-a)*bg`."""
    alphas = []
    for channel in (1, 2):  # G and B; R is saturated across the whole gradient
        contrast = np.maximum(255.0 - background[..., channel], 1.0)
        alphas.append((src[..., channel] - background[..., channel]) / contrast)
    alpha = np.clip(np.mean(alphas, axis=0), 0.0, 1.0)
    alpha[fill] = 0.0  # corner fill is not artwork

    # A handful of anti-aliased rim pixels survive at the canvas edges (largest
    # stray blob: 12px). They are invisible, but they sit at x=1023 / y=0, so the
    # artwork's bounding box stretches to the full canvas and every downstream
    # "fit to safe zone" computation shrinks the silhouette to a speck. Drop any
    # component too small to be artwork.
    labels, count = ndimage.label(alpha > 0.25)
    if count:
        sizes = np.bincount(labels.ravel())
        keep = np.isin(labels, np.flatnonzero(sizes >= MIN_COMPONENT_PX))
        keep[labels == 0] = False
        alpha = np.where(ndimage.binary_dilation(keep, iterations=2), alpha, 0.0)
    return alpha


def fit_into_safe_zone(alpha: np.ndarray) -> Image.Image:
    """White silhouette on transparency, scaled to Android's guaranteed-safe disc.

    Android's adaptive-icon spec: of the 108dp foreground layer, launcher masks
    vary in shape but every one of them contains the centred 66dp circle. Fitting
    the artwork's *bounding box* to that width is not enough — this silhouette is
    tall and narrow, so a box 66dp wide has a diagonal well past the circle and
    the head gets clipped by a round mask. The constraint is on the diagonal.
    """
    ys, xs = np.where(alpha > 0.25)
    art = alpha[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    art_h, art_w = art.shape

    safe_diameter = SIZE * ANDROID_SAFE_CIRCLE_FRACTION * ANDROID_SAFE_MARGIN
    scale = safe_diameter / float(np.hypot(art_h, art_w))
    new_h, new_w = max(1, round(art_h * scale)), max(1, round(art_w * scale))
    print(
        f"  foreground fitted: {new_w}x{new_h}px"
        f" (diagonal {np.hypot(new_h, new_w):.0f}px ≤ safe disc {SIZE * ANDROID_SAFE_CIRCLE_FRACTION:.0f}px)"
    )

    art_img = Image.fromarray((art * 255).astype(np.uint8), mode="L").resize(
        (new_w, new_h), Image.LANCZOS
    )
    canvas = Image.new("L", (SIZE, SIZE), 0)
    canvas.paste(art_img, ((SIZE - new_w) // 2, (SIZE - new_h) // 2))

    out = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 0))
    out.putalpha(canvas)
    return out


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    print(f"  {path.relative_to(APP_DIR)}  {img.size[0]}x{img.size[1]}  {img.mode}")


def main() -> None:
    src = load_source()
    print(f"source: {SOURCE.relative_to(APP_DIR)}")

    fill = corner_fill_mask(src)
    print(f"  corner fill detected: {fill.sum()} px ({fill.mean() * 100:.1f}% of canvas)")

    background = background_plane(src, fill)
    alpha = extract_alpha(src, background, fill)
    print(f"  silhouette coverage: {(alpha > 0.5).mean() * 100:.1f}% of canvas")

    halo = shadow_halo_mask(src, background, fill, alpha)
    print(f"  drop-shadow halo: {halo.sum()} px ({halo.mean() * 100:.1f}% of canvas)")

    full_bleed = make_full_bleed(src, fill | halo)

    print("writing:")

    # 1. iOS / generic app icon: opaque, square, edge-to-edge.
    icon = Image.fromarray(np.clip(full_bleed, 0, 255).astype(np.uint8), "RGB")
    save(icon, ASSETS / "icon.png")

    # 2. Android adaptive background: the fitted gradient alone.
    #    Not "full-bleed minus the silhouette" — the matte's partial-alpha rim and
    #    the artwork's pink interior lines both survive that subtraction and leave
    #    a visible ghost under the foreground layer. A background layer only has to
    #    be a clean wash, and the plane reproduces the artwork's gradient to ~2/255.
    save(
        Image.fromarray(np.clip(background, 0, 255).astype(np.uint8), "RGB"),
        ASSETS / "adaptive-icon-background.png",
    )

    # 3. Android adaptive foreground + 4. monochrome (Android 13+ themed icons).
    foreground = fit_into_safe_zone(alpha)
    save(foreground, ASSETS / "adaptive-icon.png")
    save(foreground.copy(), ASSETS / "adaptive-icon-monochrome.png")

    # 5. Android status-bar notification icon.
    #    `app.json` pointed expo-notifications at the full-colour icon. Android
    #    ignores every colour in a small notification icon and keeps only the
    #    alpha channel, so a full-bleed tile renders as a solid white square in
    #    the status bar. It needs the silhouette alone, white on transparency.
    save(
        foreground.resize((NOTIFICATION_ICON_SIZE, NOTIFICATION_ICON_SIZE), Image.LANCZOS),
        ASSETS / "notification-icon.png",
    )

    # 6. Play Console listing icon: 512x512, 32-bit PNG.
    save(icon.resize((512, 512), Image.LANCZOS).convert("RGBA"), STORE_OUT / "play-icon-512.png")

    build_splash()


# ---------------------------------------------------------------------------
# Splash screen
# ---------------------------------------------------------------------------

SPLASH_SOURCE = ASSETS / "splash-source.png"
# The artwork sits on a pink panel inset from the canvas edges; sample well inside it.
SPLASH_PANEL_BOX = (200, 0, 820, SIZE)  # x0, y0, x1, y1
SPLASH_ART_WIDTH_FRACTION = 0.62
SPLASH_MIN_COMPONENT_PX = 25


def build_splash() -> None:
    """Turn the square splash mock-up into a transparent mark + a matching colour.

    The shipped `splash-icon.png` was a 1024x1024 *mock-up*: a pale-pink portrait
    panel with the logo and wordmark already composited onto it. With
    `resizeMode: contain` that square gets letterboxed on any real phone
    (~19.5:9), and the letterbox is painted with `splash.backgroundColor` —
    which was `#FF6B9D`, a vivid pink nothing like the artwork's pale panel. Every
    cold start therefore showed two saturated bands framing a pale square.

    A splash image has to be the mark alone on transparency, with the background
    colour supplied separately and actually matching. This extracts that mark and
    prints the colour to put in `app.json`.
    """
    if not SPLASH_SOURCE.exists():
        print(f"  (skipped splash: {SPLASH_SOURCE.name} not found)")
        return

    src = np.asarray(Image.open(SPLASH_SOURCE).convert("RGB")).astype(np.float64)
    x0, y0, x1, y1 = SPLASH_PANEL_BOX

    inside = np.zeros((SIZE, SIZE), bool)
    inside[y0:y1, x0:x1] = True
    yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float64)
    artwork_ish = np.min(src, axis=-1) > 235  # white mark and wordmark
    panel = inside & ~ndimage.binary_dilation(artwork_ish, iterations=4)

    design = np.c_[xx[panel], yy[panel], np.ones(int(panel.sum()))]
    full = np.c_[xx.ravel(), yy.ravel(), np.ones(SIZE * SIZE)]
    planes = []
    for channel in range(3):
        coef, *_ = np.linalg.lstsq(design, src[..., channel][panel], rcond=None)
        planes.append((full @ coef).reshape(SIZE, SIZE))
    background = np.stack(planes, axis=-1)

    alphas = [
        (src[..., c] - background[..., c]) / np.maximum(255.0 - background[..., c], 1.0)
        for c in (1, 2)
    ]
    alpha = np.clip(np.mean(alphas, axis=0), 0.0, 1.0)
    alpha[~inside] = 0.0

    # The wordmark is "Mama & Bébé": both acute accents are their own connected
    # component, ~60px each at this resolution. A denoising threshold set on the
    # generous side silently spells it "Bebe", so keep it well under that.
    labels, count = ndimage.label(alpha > 0.3)
    if count:
        sizes = np.bincount(labels.ravel())
        keep = np.isin(labels, np.flatnonzero(sizes >= SPLASH_MIN_COMPONENT_PX))
        keep[labels == 0] = False
        alpha = np.where(ndimage.binary_dilation(keep, iterations=2), alpha, 0.0)

    ys, xs = np.where(alpha > 0.3)
    art = alpha[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    target_w = round(SIZE * SPLASH_ART_WIDTH_FRACTION)
    target_h = max(1, round(art.shape[0] * target_w / art.shape[1]))

    art_img = Image.fromarray((art * 255).astype(np.uint8), "L").resize(
        (target_w, target_h), Image.LANCZOS
    )
    canvas = Image.new("L", (SIZE, SIZE), 0)
    canvas.paste(art_img, ((SIZE - target_w) // 2, (SIZE - target_h) // 2))
    out = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 0))
    out.putalpha(canvas)
    save(out, ASSETS / "splash-icon.png")

    # Tightly-cropped mark + wordmark, for layouts that size it by height — a
    # splash asset carries deliberate transparent margin, and anything that sets
    # `height:` on it ends up rendering the padding, not the artwork.
    trimmed = Image.new("RGBA", (art.shape[1], art.shape[0]), (255, 255, 255, 0))
    trimmed.putalpha(Image.fromarray((art * 255).astype(np.uint8), "L"))
    save(trimmed, STORE_OUT.parent / "brand" / "wordmark.png")

    r, g, b = (int(round(background[..., c][panel].mean())) for c in range(3))
    print(f"  splash backgroundColor to set in app.json: #{r:02X}{g:02X}{b:02X}")


if __name__ == "__main__":
    main()
