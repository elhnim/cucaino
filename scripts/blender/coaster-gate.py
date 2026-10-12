# The Quiz Coaster's fairground gate, modelled in Blender (no hand work: this script IS the model).
#
#   blender -b --factory-startup --python scripts/blender/coaster-gate.py -- <out.glb>
#   node scripts/glb-pack.mjs <out.glb> public/park-assets/games/coaster/gate.glb
#
# One mesh, six plain-colour materials (pink, white, purple, gold, bulbA, bulbB) and no textures:
# lib/park/rides/quizCoaster.ts bakes the four body colours into one toon mesh and blinks the two
# bulb sets. Blender is Z-up; the track runs along Y, the gate stands across it with the rail at
# the origin. Candy stripes are real twisted geometry, never a colour threshold across flat faces.
import math
import sys

import bmesh
import bpy

OUT = sys.argv[sys.argv.index("--") + 1]

R = 3.4  # half the gate's width = the arch's radius
CZ = 3.0  # where the pillars end and the arch begins, above the rail
ZB = -1.5  # the pillars' feet, below the rail (a beam under the track joins them)
TUBE = 0.42
SEG = 16
TWIST = 2 * math.pi / 5  # one turn of the candy stripe every 5 units
SIGN_Z = CZ + R + 0.3
SIGN_R = 1.35
SIGN_HALF = 0.5  # deeper than the tube, so the arch never pokes out of the sign's face

MATS = {
    "pink": (1.0, 0.37, 0.66),
    "white": (1.0, 0.97, 0.98),
    "purple": (0.62, 0.55, 1.0),
    "gold": (1.0, 0.82, 0.25),
    "bulbA": (1.0, 0.95, 0.63),
    "bulbB": (1.0, 0.62, 0.8),
}
NAMES = list(MATS)

verts, faces, face_mat, face_smooth = [], [], [], []


def add(vs, fs, mats, smooth):
    base = len(verts)
    verts.extend(vs)
    for i, f in enumerate(fs):
        faces.append(tuple(base + k for k in f))
        face_mat.append(NAMES.index(mats[i] if isinstance(mats, list) else mats))
        face_smooth.append(smooth)


def tube(path, radius, stripes):
    """A striped tube along `path` = [(point, normal, binormal)], twisted by arc length."""
    vs, fs, ms = [], [], []
    s = 0.0
    for i, (p, n, b) in enumerate(path):
        if i:
            s += math.dist(p, path[i - 1][0])
        for j in range(SEG):
            a = 2 * math.pi * j / SEG + s * TWIST
            c, d = math.cos(a) * radius, math.sin(a) * radius
            vs.append(tuple(p[k] + n[k] * c + b[k] * d for k in range(3)))
    for i in range(len(path) - 1):
        for j in range(SEG):
            j2 = (j + 1) % SEG
            fs.append((i * SEG + j, i * SEG + j2, (i + 1) * SEG + j2, (i + 1) * SEG + j))
            ms.append(stripes[(j * 4 // SEG) % 2])
    add(vs, fs, ms, True)


def cylinder(centre, axis, radius, height, seg, side, cap, smooth=True):
    """`axis` is "y" or "z"."""
    def at(a, h):
        c, d = math.cos(a) * radius, math.sin(a) * radius
        return (centre[0] + c, centre[1] + h, centre[2] + d) if axis == "y" else (centre[0] + c, centre[1] + d, centre[2] + h)

    ring = [2 * math.pi * j / seg for j in range(seg)]
    add([at(a, -height / 2) for a in ring] + [at(a, height / 2) for a in ring], [(j, (j + 1) % seg, seg + (j + 1) % seg, seg + j) for j in range(seg)], side, smooth)
    add([at(a, -height / 2) for a in ring], [tuple(range(seg))], cap, False)
    add([at(a, height / 2) for a in ring], [tuple(range(seg))], cap, False)


def ring_y(centre, major, minor, seg, mat):
    """A torus facing along Y (the raised frame round the sign)."""
    vs, fs = [], []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        for j in range(8):
            b = 2 * math.pi * j / 8
            r = major + math.cos(b) * minor
            vs.append((centre[0] + math.cos(a) * r, centre[1] + math.sin(b) * minor, centre[2] + math.sin(a) * r))
    for i in range(seg):
        for j in range(8):
            i2, j2 = (i + 1) % seg, (j + 1) % 8
            fs.append((i * 8 + j, i2 * 8 + j, i2 * 8 + j2, i * 8 + j2))
    add(vs, fs, mat, True)


def ball(centre, radius, mat, seg=10, rings=6):
    vs, fs = [(centre[0], centre[1], centre[2] + radius)], []
    for i in range(1, rings):
        t = math.pi * i / rings
        for j in range(seg):
            a = 2 * math.pi * j / seg
            vs.append((centre[0] + math.sin(t) * math.cos(a) * radius, centre[1] + math.sin(t) * math.sin(a) * radius, centre[2] + math.cos(t) * radius))
    vs.append((centre[0], centre[1], centre[2] - radius))
    last = len(vs) - 1
    for j in range(seg):
        j2 = (j + 1) % seg
        fs.append((0, 1 + j, 1 + j2))
        fs.append((last, 1 + (rings - 2) * seg + j2, 1 + (rings - 2) * seg + j))
        for i in range(rings - 2):
            fs.append((1 + i * seg + j, 1 + (i + 1) * seg + j, 1 + (i + 1) * seg + j2, 1 + i * seg + j2))
    add(vs, fs, mat, True)


def box(lo, hi, mat):
    x0, y0, z0 = lo
    x1, y1, z1 = hi
    vs = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    add(vs, [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], mat, False)


def star(centre, outer, inner, half, mat):
    pts = []
    for k in range(10):
        a = math.pi / 2 + math.pi * k / 5
        r = outer if k % 2 == 0 else inner
        pts.append((centre[0] + math.cos(a) * r, centre[2] + math.sin(a) * r))
    vs = [(x, centre[1] - half, z) for x, z in pts] + [(x, centre[1] + half, z) for x, z in pts]
    mid_a, mid_b = len(vs), len(vs) + 1
    vs += [(centre[0], centre[1] - half - 0.08, centre[2]), (centre[0], centre[1] + half + 0.08, centre[2])]
    fs = []
    for k in range(10):
        k2 = (k + 1) % 10
        fs += [(k, k2, 10 + k2, 10 + k), (mid_a, k, k2), (mid_b, 10 + k, 10 + k2)]
    add(vs, fs, mat, False)


# pillars and arch: ONE striped tube, up the left pillar, over the top and down the right
path = []
STEP = 0.25
n_p = round((CZ - ZB) / STEP)
for i in range(n_p):
    path.append(((-R, 0, ZB + (CZ - ZB) * i / n_p), (-1, 0, 0), (0, 1, 0)))
n_a = round(math.pi * R / STEP)
for i in range(n_a + 1):
    t = math.pi * (1 - i / n_a)
    path.append(((R * math.cos(t), 0, CZ + R * math.sin(t)), (math.cos(t), 0, math.sin(t)), (0, 1, 0)))
for i in range(1, n_p + 1):
    path.append(((R, 0, CZ - (CZ - ZB) * i / n_p), (1, 0, 0), (0, 1, 0)))
tube(path, TUBE, ["pink", "white"])

for side in (-1, 1):
    x = side * R
    cylinder((x, 0, ZB - 0.15), "z", 0.66, 0.5, 16, "purple", "purple")  # foot
    cylinder((x, 0, ZB + 0.2), "z", 0.54, 0.2, 16, "gold", "gold")
    cylinder((x, 0, CZ), "z", 0.54, 0.26, 16, "gold", "gold")  # collar where the arch springs
    ball((x, 0, ZB - 0.5), 0.34, "gold")
# the beam under the track that makes the gate one frame bolted round the rail
box((-R, -0.3, ZB - 0.1), (R, 0.3, ZB + 0.3), "purple")

# light bulbs over the arch (two sets that blink in turn), leaving room for the sign
k = 0
for deg in range(12, 169, 12):
    if abs(deg - 90) < 28:
        continue
    t = math.radians(deg)
    r = R + TUBE + 0.1
    ball((r * math.cos(t), 0, CZ + r * math.sin(t)), 0.24, "bulbA" if k % 2 == 0 else "bulbB")
    k += 1

# the round sign at the crown (its number is drawn on by the game), framed in gold, a star on top
cylinder((0, 0, SIGN_Z), "y", SIGN_R, SIGN_HALF * 2, 32, "purple", "white")
for side in (-1, 1):
    ring_y((0, side * SIGN_HALF, SIGN_Z), SIGN_R - 0.04, 0.13, 32, "gold")
star((0, 0, SIGN_Z + SIGN_R + 0.42), 0.62, 0.28, 0.14, "gold")

# ---- into Blender, normals outward, out as GLB ----
bpy.ops.wm.read_factory_settings(use_empty=True)
me = bpy.data.meshes.new("gate")
me.from_pydata(verts, [], faces)
for name in NAMES:
    m = bpy.data.materials.new(name)
    rgba = (*MATS[name], 1.0)
    m.diffuse_color = rgba
    try:
        m.use_nodes = True
    except Exception:
        pass
    if m.node_tree:
        for node in m.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                node.inputs["Base Color"].default_value = rgba
                node.inputs["Roughness"].default_value = 0.6
    me.materials.append(m)
me.polygons.foreach_set("material_index", face_mat)
me.polygons.foreach_set("use_smooth", face_smooth)
bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(me)
bm.free()
me.update()
obj = bpy.data.objects.new("gate", me)
bpy.context.scene.collection.objects.link(obj)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_texcoords=False,
    export_normals=True,
    export_yup=True,
    export_cameras=False,
    export_lights=False,
    export_animations=False,
)
print("gate:", len(verts), "verts", len(faces), "faces ->", OUT)
