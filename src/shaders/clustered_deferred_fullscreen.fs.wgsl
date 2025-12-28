// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

struct FragmentInput {
    @builtin(position) frag_pos: vec4f,
    @location(0) uv: vec2f
}

@group(2) @binding(0) var pos_tex: texture_2d<f32>;
@group(2) @binding(1) var nor_tex: texture_2d<f32>;
@group(2) @binding(2) var uv_tex: texture_2d<f32>;
@group(2) @binding(3) var diffuse_tex: texture_2d<f32>;
@group(2) @binding(4) var gbuffer_sampler: sampler;
@group(2) @binding(5) var depth_tex: texture_depth_2d;

@group(0) @binding(1) var<storage, read> lightSet: LightSet;

@group(1) @binding(0) var<uniform> cluster_uniform: ClusterUniform;
@group(1) @binding(1) var<storage, read_write> cluster_data: array<u32>;




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
fn main(in: FragmentInput) -> @location(0) vec4f {
    let pos = textureSample(pos_tex, gbuffer_sampler, in.uv).xyz;
    let nor = textureSample(nor_tex, gbuffer_sampler, in.uv).xyz;
    let tex_uv = textureSample(uv_tex, gbuffer_sampler, in.uv).xy;
    let diffuse = textureSample(diffuse_tex, gbuffer_sampler, in.uv);
    let in_depth = textureSample(depth_tex, gbuffer_sampler, in.uv);

    let uv_t = in.frag_pos.xy / vec2<f32>(f32(cluster_uniform.res_x), f32(cluster_uniform.res_y));
    let uv = vec2(uv_t.x, 1.0 - uv_t.y);
    let real_depth = linearize_depth(in_depth, near_plane, far_plane);

    let max_depth: f32 = f32(${max_cluster_depth});
    if real_depth > max_depth {
        return vec4(0.4, 0.4, 0.4, 1.0);
    }

    let depth = linearize_depth(in_depth, near_plane, max_depth);

    let cluster = get_cluster(uv, depth);

    let cluster_index = calculate_cluster_index(cluster);
    let cluster_array_index = cluster_index * (cluster_uniform.max_lights_per_cluster + 1);

    let cluster_len = cluster_data[cluster_array_index];

    var totalLightContrib = vec3f(0, 0, 0);
    for (var cluster_light_idx = 0u; cluster_light_idx < cluster_len; cluster_light_idx++) {
        let lightIdx = cluster_data[cluster_array_index + 1 + cluster_light_idx];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, pos, normalize(nor));
    }

    var finalColor = diffuse.rgb * totalLightContrib;
    return vec4(finalColor, 1);

    return vec4(0.0);
}
