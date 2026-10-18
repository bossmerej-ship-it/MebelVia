"""Bake the bedding with Blender 4.5, then run npm run build:bed.

No Blender/runtime simulation is required in the browser. The checked-in gzip
mesh cache makes the ordinary Node build deterministic on other machines.
"""
import bpy, math, json, gzip, pathlib, numpy as np
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24
scene.frame_end = 48
output = []

def select(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

def freeze(obj, name):
    select(obj)
    bpy.ops.object.modifier_apply(modifier=name)

def rounded_box(name, size, loc, radius):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = obj.modifiers.new('Soft edges', 'BEVEL')
    mod.width = radius
    mod.segments = 5
    freeze(obj, mod.name)
    for p in obj.data.polygons: p.use_smooth = True
    return obj

def collision(obj):
    obj.modifiers.new('Collision', 'COLLISION')
    obj.collision.thickness_outer = .006
    obj.collision.cloth_friction = 35

def bake_mesh(obj, name, material, repeats=1):
    simplify = obj.modifiers.new('Web mesh budget','DECIMATE')
    simplify.ratio = .48
    freeze(obj,simplify.name)
    mesh = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    mesh.calc_loop_triangles()
    matrix = obj.matrix_world
    positions, normals, uvs = [], [], []
    for tri in mesh.loop_triangles:
        for loop_index in tri.loops:
            loop = mesh.loops[loop_index]
            p = matrix @ mesh.vertices[loop.vertex_index].co
            n = matrix.to_3x3() @ mesh.corner_normals[loop_index].vector
            n.normalize()
            positions.extend([round(p.x,6),round(p.z,6),round(-p.y,6)])
            normals.extend([round(n.x,6),round(n.z,6),round(-n.y,6)])
            uv = mesh.uv_layers.active.data[loop_index].uv
            uvs.extend([round(uv.x*repeats,6),round(uv.y*repeats,6)])
    output.append(dict(name=name,material=material,position=positions,normal=normals,uv=uvs))
    obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()

# The mattress collision surface supports the duvet without a floating gap.
mattress = rounded_box('Mattress collision', (1.78,1.98,.35), (0,-.015,.525), .08)
collision(mattress)

# CC0 sculpted pillows: preserve the baked, non-repeating creases and UVs.
with bpy.data.libraries.load(str(ROOT/'materials/pillow-source.blend')) as (src,dst):
    dst.objects = [name for name in src.objects if 'pillow' in name]
sources = [obj for obj in dst.objects if obj and obj.type == 'MESH']
for obj in sources: scene.collection.objects.link(obj)
for index, (pos, tilt, turn, width, depth, height) in enumerate([
    ((-.43,.70,.92), 42,-4,.88,.55,.26),
    (( .43,.72,.94), 40, 4,.87,.55,.27),
    ((-.42,.37,.85), 18, 4,.85,.52,.26),
    (( .42,.38,.86), 20,-5,.85,.52,.25),
]):
    obj = sources[index%len(sources)].copy()
    obj.data = sources[index%len(sources)].data.copy()
    scene.collection.objects.link(obj)
    obj.name = 'Pillow %d' % index
    obj.modifiers.clear()
    # The source is a posed cushion. Center its mesh before fitting dimensions.
    bounds = [obj.matrix_world @ v.co for v in obj.data.vertices]
    coordinates = np.array(bounds)
    centered = coordinates-coordinates.mean(axis=0)
    values, axes = np.linalg.eigh(centered.T@centered)
    axes = axes[:,np.argsort(values)[::-1]]
    if np.linalg.det(axes)<0: axes[:,2]*=-1
    bounds = [Vector(v) for v in centered@axes]
    low = Vector([min(v[a] for v in bounds) for a in range(3)])
    high = Vector([max(v[a] for v in bounds) for a in range(3)])
    center = (low+high)/2
    for vertex,p in zip(obj.data.vertices,bounds): vertex.co = p-center
    obj.matrix_world.identity()
    size = high-low
    for v in obj.data.vertices:
        v.co.x *= width/size.x
        v.co.y *= depth/size.y
        v.co.z *= height/size.z
    obj.location = pos
    obj.rotation_euler = (math.radians(tilt),0,math.radians(turn))
    sub = obj.modifiers.new('Tailored silhouette','SUBSURF')
    sub.levels = 1
    freeze(obj,sub.name)
    for face in obj.data.polygons: face.use_smooth = True
    bake_mesh(obj,obj.name,'pillow')
for obj in sources: bpy.data.objects.remove(obj,do_unlink=True)

def cloth_grid(name, nx, ny, fn):
    verts = [fn(i/nx,j/ny) for j in range(ny+1) for i in range(nx+1)]
    faces = []
    for j in range(ny):
        for i in range(nx):
            a = j*(nx+1)+i
            faces.append((a,a+1,a+nx+2,a+nx+1))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    uv = mesh.uv_layers.new(name='Fabric')
    for p in mesh.polygons:
        p.use_smooth=True
        for li in p.loop_indices:
            vi=mesh.loops[li].vertex_index
            uv.data[li].uv = ((vi%(nx+1))/nx,(vi//(nx+1))/ny)
    obj=bpy.data.objects.new(name,mesh)
    scene.collection.objects.link(obj)
    return obj

def simulate(obj, frames, bending, gap):
    scene.frame_set(1)
    mod=obj.modifiers.new('Settled textile','CLOTH')
    settings=mod.settings
    settings.quality=7
    settings.mass=.32
    settings.air_damping=3
    settings.tension_stiffness=28
    settings.compression_stiffness=28
    settings.shear_stiffness=12
    settings.bending_stiffness=bending
    settings.tension_damping=8
    settings.compression_damping=8
    settings.shear_damping=8
    settings.bending_damping=2
    mod.collision_settings.distance_min=gap
    mod.collision_settings.collision_quality=4
    mod.collision_settings.use_self_collision=True
    mod.collision_settings.self_distance_min=.006
    mod.point_cache.frame_end=frames
    for frame in range(1,frames+1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        if frame%8==0: print(obj.name,frame,flush=True)
    freeze(obj,mod.name)
    sub=obj.modifiers.new('Smooth cloth','SUBSURF')
    sub.levels=1
    freeze(obj,sub.name)

def duvet_start(u,v):
    x=(u-.5)*2.22
    y=.46-v*1.57
    z=.81+.016*math.sin(x*22+y*9)+.012*math.sin(y*29-x*7)+.007*math.cos(x*37+y*11)
    # Different cloth slack on each edge prevents a mechanically mirrored drape.
    x+=.015*math.sin(v*19)*math.sin(math.pi*u)
    return (x,y,z)

duvet=cloth_grid('Duvet',96,76,duvet_start)
simulate(duvet,40,2,.027)
solid=duvet.modifiers.new('Filled duvet edge','SOLIDIFY')
solid.thickness=.044
solid.offset=0
freeze(duvet,solid.name)
bake_mesh(duvet,'Duvet','linen',8)
collision(duvet)

# A second layer at the head of the duvet makes the turned-back edge tangible.
def fold_start(u,v):
    x=(u-.5)*2.15
    y=.42-v*.30
    return x,y,.86+.01*math.sin(x*16+y*21)+.02*math.sin(v*math.pi)
fold=cloth_grid('Turned duvet',80,18,fold_start)
simulate(fold,24,.28,.012)
solid=fold.modifiers.new('Duvet lip','SOLIDIFY');solid.thickness=.018
freeze(fold,solid.name)
bake_mesh(fold,'Turned duvet','linen',6)

# The diagonal wool throw settles on the finished duvet, independently of it.
def throw_start(u,v):
    x=-1.36+u*2.38
    y=.03-v*.58-u*.31
    return x,y,.88+.009*math.sin(x*19+y*12)+.012*math.sin(v*8+u*9)
runner=cloth_grid('Woven throw',92,30,throw_start)
simulate(runner,32,.06,.009)
solid=runner.modifiers.new('Wool edge','SOLIDIFY');solid.thickness=.004
freeze(runner,solid.name)
bake_mesh(runner,'Woven throw','throw',1)

with gzip.open(ROOT/'materials/bed-cloth.json.gz','wt',encoding='utf-8') as file:
    json.dump(output,file,separators=(',',':'))
print('Baked textile cache',sum(len(m['position'])//9 for m in output),'triangles',flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'materials/bed-cloth.blend'))
