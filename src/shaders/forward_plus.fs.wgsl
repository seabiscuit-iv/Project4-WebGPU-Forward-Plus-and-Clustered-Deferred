// TODO-2: implement the Forward+ fragment shader

// See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights

// ------------------------------------
// Shading process:
// ------------------------------------
// Determine which cluster contains the current fragment.
// Retrieve the number of lights that affect the current fragment from the cluster’s data.
// Initialize a variable to accumulate the total light contribution for the fragment.
// For each light in the cluster:
//     Access the light's properties using its index.
//     Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
//     Add the calculated contribution to the total light accumulation.
// Multiply the fragment’s diffuse color by the accumulated light contribution.
// Return the final color, ensuring that the alpha component is set appropriately (typically to 1).

@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

@group(3) @binding(0) var<uniform> cluster_uniform: ClusterUniform;
@group(3) @binding(1) var<storage, read_write> cluster_data: array<u32>;

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f,
    @builtin(position) frag_pos : vec4<f32>
}

const near_plane : f32 = 0.1;
const far_plane : f32 = 1000;

fn linearize_depth(depth: f32, near: f32, far: f32) -> f32 {
    let z_view = (near * far) / (far - depth * (far - near));
    let fin = clamp(
        (z_view - near) / (far - near),
        0.0,
        0.999999
    );
    return fin;
}

fn linear_depth_to_screen_depth(fin: f32, near: f32, far: f32) -> f32 {
    let z_view = fin * (far - near) + near;
    return (far - (near * far) / z_view) / (far - near);
}

// screen space
fn get_cluster(screen_pos: vec2<f32>, depth: f32) -> vec3<u32> {
    let scaled = screen_pos * vec2<f32>(f32(cluster_uniform.clusters_x), f32(cluster_uniform.clusters_y));
    let floor_s = floor(scaled);

    let scaled_d = depth * f32(cluster_uniform.clusters_z);
    let floor_d = floor(scaled_d);

    return vec3(u32(floor_s.x), u32(floor_s.y), u32(floor_d));
}


fn calculate_cluster_index(cluster: vec3u) -> u32 {
    return 
        cluster.x * cluster_uniform.clusters_y * cluster_uniform.clusters_z +
        cluster.y * cluster_uniform.clusters_z +
        cluster.z; 
}

fn unpack_u32_to_color(packed: u32) -> vec3f {
    let r = f32((packed >> 16u) & 0xFFu) / 255.0;
    let g = f32((packed >> 8u) & 0xFFu) / 255.0;
    let b = f32(packed & 0xFFu) / 255.0;
    return vec3f(r, g, b);
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let uv_t = in.frag_pos.xy / vec2<f32>(f32(cluster_uniform.res_x), f32(cluster_uniform.res_y));
    let uv = vec2(uv_t.x, 1.0 - uv_t.y);
    let real_depth = linearize_depth(in.frag_pos.z, near_plane, far_plane);

    let max_depth: f32 = f32(${max_cluster_depth});
    if real_depth > max_depth {
        return vec4(0.4, 0.4, 0.4, 1.0);
    }

    let depth = linearize_depth(in.frag_pos.z, near_plane, max_depth);

    let cluster = get_cluster(uv, depth);

    let cluster_index = calculate_cluster_index(cluster);
    let cluster_array_index = cluster_index * (cluster_uniform.max_lights_per_cluster + 1);

    let cluster_len = cluster_data[cluster_array_index];

    // if abs(linear_depth_to_screen_depth(depth, near_plane, max_depth) - in.frag_pos.z) < 0.01f {
    //     return vec4(0.0, 1.0, 0.0, 1.0);
    // }
    // else {
    //     // return vec4(1.0, 0.0, 0.0, 1.0);
    //     return vec4(1.0, 0.0, 0.0, 1.0);
    // }

    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    var totalLightContrib = vec3f(0, 0, 0);
    for (var cluster_light_idx = 0u; cluster_light_idx < cluster_len; cluster_light_idx++) {
        let lightIdx = cluster_data[cluster_array_index + 1 + cluster_light_idx];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, in.pos, normalize(in.nor));
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}
