"""Bake original, periodic PBR surfaces (requires numpy and Pillow).

Run from any directory with python artwork/materials.py. Height describes the
surface profile independently of pigment. Packed data is AO/Roughness/Metal.
"""
from pathlib import Path
import numpy as np
from PIL import Image

SIZE = 768
OUT = Path(__file__).resolve().parents[1] / "public/scenery"
y, x = np.indices((SIZE, SIZE), dtype=float) / SIZE
tau = 2 * np.pi


def field(cols, rows, seed):
    """Wrapped, smooth lattice noise with an exact one-tile period."""
    sample = np.random.default_rng(seed).uniform(-1, 1, (rows, cols))
    u, v = x * cols, y * rows
    i, j = u.astype(int), v.astype(int)
    a, b = u - i, v - j
    a, b = a*a*(3-2*a), b*b*(3-2*b)
    top = sample[j, i]*(1-a) + sample[j, (i+1) % cols]*a
    bottom = sample[(j+1) % rows, i]*(1-a) + sample[(j+1) % rows, (i+1) % cols]*a
    return top*(1-b) + bottom*b


def tint(rgb, variance):
    return np.asarray(rgb)[None, None, :] + variance[:, :, None]


def mix(a, b, weight):
    w = weight[:, :, None]
    return a*(1-w) + b*w


def bake(name, albedo, height, roughness, occlusion=1):
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / 2
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / 2
    vector = np.dstack((-dx, dy, np.ones_like(dx)))
    normal = (vector / np.linalg.norm(vector, axis=2, keepdims=True) + 1)*127.5
    orm = np.stack(np.broadcast_arrays(occlusion, roughness, np.zeros_like(height)), axis=-1)*255
    for channel, pixels, size, quality in [('color', albedo, SIZE, 87),
                                            ('normal', normal, 512, 89), ('orm', orm, 384, 91)]:
        image = Image.fromarray(np.round(np.clip(pixels, 0, 255)).astype('uint8'))
        if size != SIZE:
            image = image.resize((size, size), Image.Resampling.LANCZOS)
        image.save(OUT / f'pbr-{name}-{channel}.webp', quality=quality, method=6)


cloud = field(7, 8, 10)*.6 + field(22, 24, 11)*.4
grain = field(180, 164, 12)
fine = field(SIZE, SIZE, 13)
pit = np.clip((-grain-.50)*3, 0, 1)

for name, cols, rows, base in [('limestone', 3, 5, [184, 173, 151]),
                               ('cobbles', 7, 11, [103, 104, 99])]:
    # Staggered joints, with slightly wandered edges and stone-to-stone colour.
    v = y * rows + cloud * .035
    row = np.floor(v)
    u = x * cols + .5*(row % 2) + field(8, 7, 23)*.026
    edge = np.minimum.reduce([u % 1, 1-u % 1, v % 1, 1-v % 1])
    cobble = name == 'cobbles'
    relief = np.clip(edge/(.13 if cobble else .031), 0, 1)
    relief = relief*relief*(3-2*relief)
    stones = np.random.default_rng(24).uniform(-1, 1, (rows, cols))
    individual = stones[row.astype(int) % rows, np.floor(u).astype(int) % cols]
    body = tint(base, individual*(14 if cobble else 5) + 9*cloud + 5*grain + 5*fine - 8*pit)
    joint = tint([68, 65, 58] if cobble else [139, 130, 116], 5*grain)
    pigment = mix(joint, body, relief)
    damp = np.clip((cloud-.08)*2, 0, 1) if cobble else 0
    height = relief*(4.8 if cobble else 2.4) + .28*grain + .15*fine - .32*pit
    bake(name, pigment, height, .87 - damp*.41 + .05*grain, .84+.16*relief)

# Overlapping slate laps show a shallow riven edge, with separate hue and
# specular variation at each shingle. Eight rows preserve stagger at the seam.
row = np.floor(y*8)
u = x*7 + row*.5 + field(13, 8, 50)*.011
v = (y*8 + field(18, 8, 51)*.037) % 1
joint = np.minimum(u % 1, 1-u % 1)
shingle = np.random.default_rng(52).uniform(-1, 1, (8, 7))[row.astype(int) % 8, np.floor(u).astype(int) % 7]
slate_skin = np.clip(joint/.038, 0, 1)*np.clip(v/.032, 0, 1)
riven = field(47, 113, 53)*.6 + grain*.4
slate = tint([77, 83, 86], 9*shingle + 7*riven + 5*cloud + 3*fine - 17*(1-slate_skin))
bake('slate', slate, 2.3*slate_skin + .85*v + .45*riven + .13*fine,
     .64 + .12*shingle + .07*riven, .8+.2*slate_skin)

wave = tau*(y*25 + .32*field(4, 5, 26) + .10*np.sin(tau*x*2))
ring = np.cos(wave) + .33*np.cos(wave*3)
fiber = field(19, 357, 28)
pores = np.clip((-fiber-.48)*2.7, 0, 1)
wood = tint([117, 83, 59], 10*ring + 5*fiber - 12*pores + 13*cloud + 3*fine)
bake('walnut', wood, .38*ring + .4*fiber - .55*pores, .46 + .18*pores + .085*cloud)

wear = np.clip((field(5, 42, 32)*.62 + fiber*.36 + cloud*.22 - .47)*7, 0, 1)
paint = mix(tint([108, 124, 113], 6*cloud + 2.2*ring + 2*fine), wood, wear)
bake('paint', paint, .13*ring + .20*fiber - wear*.65, .63 + .16*wear + .05*grain)

plaster = tint([192, 188, 179], 12*cloud + 4*grain + 3*fine - 5*pit)
bake('plaster', plaster, cloud*1.3 + grain*.28 + fine*.19 - pit*.57, .88 + .045*grain)

speck = np.clip((grain-.43)*2.3, 0, 1)
salt = np.clip((field(13, 7, 41)*.55 + cloud*.42 + fine*.18 - .40)*3.8, 0, 1)
clay = mix(tint([168, 103, 75], 11*cloud + 7*speck + 4*fine - 10*pit),
           tint([201, 174, 143], 5*fine), salt*.74)
bake('terracotta', clay, .42*grain + .18*fine + .24*speck - .45*pit,
     .84 + .06*grain + .045*salt)
