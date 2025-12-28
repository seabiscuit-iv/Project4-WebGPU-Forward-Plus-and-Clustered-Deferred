// TODO-2: implement the light clustering compute shader

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.

// ------------------------------------
// Assigning lights to clusters:
// ------------------------------------
// For each cluster:
//     - Initialize a counter for the number of lights in this cluster.

//     For each light:
//         - Check if the light intersects with the cluster’s bounding box (AABB).
//         - If it does, add the light to the cluster's light list.
//         - Stop adding lights if the maximum number of lights is reached.

//     - Store the number of lights assigned to this cluster.


@group(0) @binding(0) var<uniform> cluster_uniform: ClusterUniform;
@group(0) @binding(1) var<storage, read_write> cluster_data: array<u32>;
@group(0) @binding(2) var<storage, read> lightSet: LightSet;

@group(1) @binding(0) var<uniform> camera_uniforms: CameraUniforms;

const near_plane : f32 = 0.1;
const far_plane : f32 = 1000;

fn calculate_cluster_index(cluster: vec3u) -> u32 {
    return 
        cluster.x * cluster_uniform.clusters_y * cluster_uniform.clusters_z +
        cluster.y * cluster_uniform.clusters_z +
        cluster.z; 
}

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

fn pack_color_to_u32(color: vec3f) -> u32 {
    let r = u32(clamp(color.r, 0.0, 1.0) * 255.0);
    let g = u32(clamp(color.g, 0.0, 1.0) * 255.0);
    let b = u32(clamp(color.b, 0.0, 1.0) * 255.0);
    return (r << 16u) | (g << 8u) | b;
}




fn get_cluster_world_space_pos(cluster: vec3u) -> vec3f {
    // 1. Calculate normalized cluster coordinates [0, 1]
    let xy = vec2f(cluster.xy) / vec2f(f32(cluster_uniform.clusters_x), f32(cluster_uniform.clusters_y));
    
    // 2. Use the same depth distribution as your fragment shader
    let depth_lin = f32(cluster.z) / f32(cluster_uniform.clusters_z);
    let screen_depth = linear_depth_to_screen_depth(depth_lin, near_plane, f32(${max_cluster_depth}));

    // 3. Correct NDC: WebGPU Y is up. 
    // If xy.y is 0 (bottom of screen), NDC Y should be -1.0
    let xy_ndc = vec2f(2.0 * xy.x - 1.0, 2.0 * xy.y - 1.0);

    let ndc = vec4f(xy_ndc, screen_depth, 1.0);

    // 4. Unproject
    let inv_proj_pos = camera_uniforms.inv_view_proj * ndc;
    return inv_proj_pos.xyz / inv_proj_pos.w;
}

@compute
@workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let cluster = globalIdx;

    if cluster.x >= cluster_uniform.clusters_x || cluster.y >= cluster_uniform.clusters_y || cluster.z >=  cluster_uniform.clusters_z {
        return;
    }

    let cluster_index = calculate_cluster_index(cluster);
    let cluster_array_index = cluster_index * (cluster_uniform.max_lights_per_cluster + 1);

    var num_lights : u32 = 0u;

    var cluster_min = vec3f(1e38); // Start at infinity
    var cluster_max = vec3f(-1e38); // Start at negative infinity

    for (var i = 0u; i < 8u; i++) {
        // Generate corners (0,0,0), (1,0,0), (0,1,0)... (1,1,1)
        let offset = vec3u(i & 1u, (i >> 1u) & 1u, (i >> 2u) & 1u);
        let corner_pos = get_cluster_world_space_pos(cluster + offset);
        
        cluster_min = min(cluster_min, corner_pos);
        cluster_max = max(cluster_max, corner_pos);
    }

    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        let light = lightSet.lights[lightIdx];

        let closest_point = clamp(light.pos, cluster_min, cluster_max);

        let range = rangeAttenuation(length(light.pos - closest_point));
        
        if range > 0.01f && num_lights < cluster_uniform.max_lights_per_cluster {
            cluster_data[cluster_array_index + 1u + num_lights] = lightIdx;
            num_lights++;
        }
    }


    cluster_data[cluster_array_index] = num_lights;
}