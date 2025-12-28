// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.

struct FragmentInput
{
    @builtin(position) frag_pos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct FragmentOutput
{
    @location(0) pos: vec4f,
    @location(1) nor: vec4f,
    @location(2) uv: vec2f,
    @location(3) diffuse: vec4f,
}

@group(2) @binding(0) var diffuseTex: texture_2d<f32>;
@group(2) @binding(1) var diffuseTexSampler: sampler;

@fragment
fn main(in: FragmentInput) -> FragmentOutput {
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    return FragmentOutput(vec4f(in.pos, 0.0), vec4f(in.nor, 0.0), in.uv, vec4f(diffuseColor.rgb, 0.0));
}