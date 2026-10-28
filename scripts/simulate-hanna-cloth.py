"""Offline Hanna bedding drape, Blender 4.5. No browser cloth solver is used.

The output is a deterministic cache in Three.js world axes (Y up, +Z foot).
Small excess cloth settles against the Hanna mattress/rails, then light filled
thickness and smooth rounded hems are baked for the lift's rigid moving group.
"""
import bpy, math, json, gzip, pathlib, time, random
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parent
START = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.fps=24
scene.frame_end=40
output=[]

def select(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj

def freeze(obj,name):
    select(obj)
    bpy.ops.object.modifier_apply(modifier=name)

def rounded_box(name,size,loc,radius):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    obj=bpy.context.object
    obj.name=name
    obj.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    mod=obj.modifiers.new('Soft support edges','BEVEL')
    mod.width=radius;mod.segments=5
    freeze(obj,mod.name)
    for p in obj.data.polygons:p.use_smooth=True
    return obj

def collision(obj,gap=.004):
    obj.modifiers.new('Collision','COLLISION')
    obj.collision.thickness_outer=gap
    obj.collision.cloth_friction=32

def grid(name,nx,nv,fn):
    vertices=[fn(i/nx,j/nv) for j in range(nv+1) for i in range(nx+1)]
    faces=[]
    for j in range(nv):
        for i in range(nx):
            a=j*(nx+1)+i
            # Y decreases towards the foot, so this order faces upwards.
            faces.append((a,a+nx+1,a+nx+2,a+1))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(vertices,[],faces);mesh.update()
    uv=mesh.uv_layers.new(name='Fabric')
    for face in mesh.polygons:
        face.use_smooth=True
        for li in face.loop_indices:
            vi=mesh.loops[li].vertex_index
            uv.data[li].uv=((vi%(nx+1))/nx,(vi//(nx+1))/nv)
    obj=bpy.data.objects.new(name,mesh)
    scene.collection.objects.link(obj)
    return obj

def simulate(obj,frames,bending,gap,pins=None):
    scene.frame_set(1)
    mod=obj.modifiers.new('Gravity relaxed cloth','CLOTH')
    settings=mod.settings
    settings.quality=7;settings.mass=.26;settings.air_damping=4
    settings.tension_stiffness=22;settings.compression_stiffness=18
    settings.shear_stiffness=10;settings.bending_stiffness=bending
    settings.tension_damping=9;settings.compression_damping=9
    settings.shear_damping=8;settings.bending_damping=3
    if pins:
        group=obj.vertex_groups.new(name='Quiet support points')
        for index,weight in pins:group.add([index],weight,'REPLACE')
        settings.vertex_group_mass=group.name
        settings.pin_stiffness=.7
    mod.collision_settings.distance_min=gap
    mod.collision_settings.collision_quality=5
    mod.collision_settings.use_self_collision=True
    mod.collision_settings.self_distance_min=.006
    mod.point_cache.frame_end=frames
    for frame in range(1,frames+1):
        scene.frame_set(frame);bpy.context.view_layer.update()
        if frame%5==0:print(obj.name,frame,'elapsed',round(time.time()-START,1),flush=True)
    freeze(obj,mod.name)
    sub=obj.modifiers.new('Soft cloth normals','SUBSURF')
    sub.levels=1;sub.subdivision_type='CATMULL_CLARK'
    freeze(obj,sub.name)

def fill(obj,thickness):
    solid=obj.modifiers.new('Soft filled edge','SOLIDIFY')
    solid.thickness=thickness;solid.offset=0;solid.use_even_offset=True
    freeze(obj,solid.name)
    bevel=obj.modifiers.new('Rounded fabric hem','BEVEL')
    bevel.width=thickness*.31;bevel.segments=2
    bevel.limit_method='ANGLE';bevel.angle_limit=.75
    freeze(obj,bevel.name)

def export(obj,name,material,repeat=(1,1),ratio=.70):
    simplify=obj.modifiers.new('Web textile budget','DECIMATE')
    simplify.ratio=ratio
    freeze(obj,simplify.name)
    mesh=obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    mesh.calc_loop_triangles()
    positions=[];normals=[];uvs=[]
    for tri in mesh.loop_triangles:
        for li in tri.loops:
            loop=mesh.loops[li]
            p=obj.matrix_world@mesh.vertices[loop.vertex_index].co
            n=obj.matrix_world.to_3x3()@mesh.corner_normals[li].vector
            n.normalize()
            positions.extend([round(p.x,6),round(p.z,6),round(-p.y,6)])
            normals.extend([round(n.x,6),round(n.z,6),round(-n.y,6)])
            uv=mesh.uv_layers.active.data[li].uv
            uvs.extend([round(uv.x*repeat[0],6),round(uv.y*repeat[1],6)])
    output.append(dict(name=name,material=material,position=positions,normal=normals,uv=uvs))
    obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
    print('Exported',name,len(positions)//9,'triangles',flush=True)

def bell(x,c,w):return math.exp(-((x-c)/w)**2)

# Fixed-seed local cloth slack: different lengths, widths and directions. No
# ridge traverses the whole bed, and no one-dimensional wave can become a row
# of equally spaced roll-like depressions after the gravity step.
rng=random.Random(14037)
slack=[]
for index in range(24):
    slack.append((rng.uniform(-1.02,1.02),rng.uniform(-.18,1.13),
                  rng.uniform(-1.05,1.05),rng.uniform(.10,.37),
                  rng.uniform(.035,.105),rng.uniform(-.015,.020)))
gathers=[]
while len(gathers)<17:
    at=rng.uniform(-.82,.82)
    if any(abs(at-other[0])<.042 for other in gathers):continue
    gathers.append((at,rng.uniform(.007,.018),rng.uniform(.030,.080),
                    rng.uniform(-.65,.65),rng.uniform(.002,.005),
                    rng.uniform(1.100,1.142)))

# Hanna's actual mattress and the closed frame constrain the hanging fabric.
mattress=rounded_box('Hanna mattress collision',(1.60,2.0,.285),(0,0,.490),.035)
collision(mattress)
for x in [-.875,.875]:
    rail=rounded_box('Hanna upholstered rail',( .15,2.10,.415),(x,-.02,.2275),.04)
    collision(rail)
foot=rounded_box('Hanna footboard',(1.90,.16,.415),(0,-1.08,.2275),.04)
collision(foot)

# Unequal short tension folds enter from cloth edges. Broad cloth slack is
# irregular in both directions, never a row of extrusion-like vertical tubes.
def quilt_start(u,v):
    x=(u-.5)*2.23
    z=-.25+v*1.41
    height=.778
    for cx,cz,angle,length,width,amplitude in slack:
        dx,dz=x-cx,z-cz
        along=dx*math.cos(angle)+dz*math.sin(angle)
        across=-dx*math.sin(angle)+dz*math.cos(angle)
        height+=amplitude*bell(along,0,length)*bell(across,0,width)
    height+=.012*bell(x,-.44,.31)*bell(z,.43,.27)
    height+=.009*bell(x,.35,.24)*bell(z,.79,.34)
    x+=.009*bell(x,-.38,.27)*bell(z,.57,.31)
    z-=.007*bell(x,.44,.35)*bell(z,.38,.22)
    return x,-z,height

nx,nv=84,56
quilt=grid('Hanna relaxed quilt',nx,nv,quilt_start)
# Four weak, unequal attachments only prevent wholesale sliding; the surface
# between them remains gravity-draped and can wrinkle in all directions.
pins=[]
for i,weight in [(16,.42),(34,.34),(53,.39),(70,.35)]:pins.append((i,weight))
simulate(quilt,34,.55,.022,pins)

# Sewn fill follows the settled surface rather than generating long cushions.
# The broad front border has tiny short gathers of unequal reach and direction.
mesh=quilt.data
mesh.update()
for vertex in mesh.vertices:
    x,y,h=vertex.co;z=-y
    normal=vertex.normal.normalized()
    d=0
    for at,width,reach,tilt,depth,centre in gathers:
        line=x+(z-centre)*tilt
        profile=-bell(line,at,width)+.38*bell(line,at+width*1.8,width*1.7)
        d+=depth*profile*bell(z,centre,reach)
    # A calm padded foot border, with its stitch placed on the front-facing
    # roll rather than hidden over the mattress shoulder. No long channels.
    d+=.007*bell(z,1.116,.042)
    d-=.0048*bell(z,1.067+.006*math.sin(4*x+.7),.012)
    vertex.co+=normal*d
mesh.update()
fill(quilt,.028)
export(quilt,'Hanna gravity quilt','quilt',(2.23,1.41),.65)
collision(quilt,.003)

# Narrow turned edge behind the striped linen, kept almost hidden as in photo.
def reverse_start(u,v):
    x=(u-.5)*2.12
    z=-.28+v*.28+.012*math.sin(x*5)
    h=.782+.017*math.sin(v*math.pi)+.008*math.sin(11*x+4*v)
    return x,-z,h
reverse=grid('Hanna turned quilt edge',72,14,reverse_start)
simulate(reverse,22,.12,.010)
fill(reverse,.014)
export(reverse,'Hanna turned quilt edge','reverse',(2.12,.28),.62)
collision(reverse,.002)

def stripe_start(u,v):
    # Continuous linen band, with one much longer diagonal end at the left.
    x=-1.16+u*2.25
    left=1/(1+math.exp((u-.25)*23))
    z=-.015+v*.46+left*(.80+.16*v)+.035*math.sin(6*u+.8)
    h=.845+.019*math.sin(21*u+5*v+.4*math.sin(8*v))+.012*math.sin(37*u-9*v)
    h+=.022*bell(u+.08*v,.46,.045)*bell(v,.42,.25)
    x+=.010*math.sin(16*v+2*u)*math.sin(math.pi*u)
    return x,-z,h
nx,nv=96,28
stripe=grid('Hanna loose striped linen',nx,nv,stripe_start)
pins=[(12,.25),(30,.30),(52,.24),(74,.28),(88,.18)]
simulate(stripe,26,.035,.008,pins)
fill(stripe,.0045)
export(stripe,'Hanna loose striped linen','stripe',(1,1),.47)

target=ROOT/'materials/hanna-cloth.json.gz'
with gzip.open(target,'wt',encoding='utf-8') as file:json.dump(output,file,separators=(',',':'))
print('Baked Hanna cloth cache',sum(len(p['position'])//9 for p in output),'triangles',target.stat().st_size,'bytes',round(time.time()-START,1),'seconds',flush=True)
