import { vec3 } from "wgpu-matrix";
import { device } from "../renderer";

import * as shaders from '../shaders/shaders';
import { Camera } from "./camera";

// h in [0, 1]
function hueToRgb(h: number) {
    let f = (n: number, k = (n + h * 6) % 6) => 1 - Math.max(Math.min(k, 4 - k, 1), 0);
    return vec3.lerp(vec3.create(1, 1, 1), vec3.create(f(5), f(3), f(1)), 0.8);
}

class ClusterUniform {
    readonly buffer = new ArrayBuffer(8 * 4);
    private readonly int_view = new Uint32Array(this.buffer);

    set clusterUniformData(data: [number, number, number, number, number, number]) {
        this.int_view.set(data);
    }
}


export class Lights {
    private camera: Camera;

    numLights = 500;
    static readonly maxNumLights = 5000;
    static readonly numFloatsPerLight = 8; // vec3f is aligned at 16 byte boundaries

    static readonly lightIntensity = 0.1;

    lightsArray = new Float32Array(Lights.maxNumLights * Lights.numFloatsPerLight);
    lightSetStorageBuffer: GPUBuffer;

    timeUniformBuffer: GPUBuffer;

    moveLightsComputeBindGroupLayout: GPUBindGroupLayout;
    moveLightsComputeBindGroup: GPUBindGroup;
    moveLightsComputePipeline: GPUComputePipeline;

    // clustering
    max_lights_per_cluster = shaders.constants.maxClusterLights;
    num_froxels = shaders.constants.num_clusters_x * shaders.constants.num_clusters_y * shaders.constants.num_clusters_z;
    
    // need to pass in the following:
    //     - num clusters x, y, z
    //     - max lights per cluster
    // 
    //     - num lights per cluster
    clustering_bind_group_layout: GPUBindGroupLayout;
    clustering_bind_group: GPUBindGroup;
    clustering_compute_pipeline: GPUComputePipeline;

    clustering_uniform_buffer: GPUBuffer;

    // Per-froxel layout:
    // [count, lightIndex0, lightIndex1, ...]
    clustering_data_buffer: GPUBuffer;

    
    camera_bind_group_layout: GPUBindGroupLayout;
    camera_bind_group: GPUBindGroup;
    

    // TODO-2: add layouts, pipelines, textures, etc. needed for light clustering here

    constructor(camera: Camera) {
        this.camera = camera;

        this.lightSetStorageBuffer = device.createBuffer({
            label: "lights",
            size: 16 + this.lightsArray.byteLength, // 16 for numLights + padding
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.populateLightsBuffer();
        this.updateLightSetUniformNumLights();

        this.timeUniformBuffer = device.createBuffer({
            label: "time uniform",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.moveLightsComputeBindGroupLayout = device.createBindGroupLayout({
            label: "move lights compute bind group layout",
            entries: [
                { // lightSet
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                },
                { // time
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.moveLightsComputeBindGroup = device.createBindGroup({
            label: "move lights compute bind group",
            layout: this.moveLightsComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.lightSetStorageBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.timeUniformBuffer }
                }
            ]
        });

        this.moveLightsComputePipeline = device.createComputePipeline({
            label: "move lights compute pipeline",
            layout: device.createPipelineLayout({
                label: "move lights compute pipeline layout",
                bindGroupLayouts: [ this.moveLightsComputeBindGroupLayout ]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "move lights compute shader",
                    code: shaders.moveLightsComputeSrc
                }),
                entryPoint: "main"
            }
        });

        // Clustering
        this.clustering_uniform_buffer = device.createBuffer({
            label: "clustering uniform buffer",
            size: 8 * 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM
        })

        const clusterUniform = new ClusterUniform();
        clusterUniform.clusterUniformData = [
            shaders.constants.num_clusters_x,
            shaders.constants.num_clusters_y,
            shaders.constants.num_clusters_z,
            this.max_lights_per_cluster,
            1920,
            1080 //placeholder values
        ];

        device.queue.writeBuffer(
            this.clustering_uniform_buffer,
            0,
            clusterUniform.buffer
        );

        this.clustering_data_buffer = device.createBuffer({
            label: "clustering data buffer",
            size: 4 * (this.max_lights_per_cluster + 1) * this.num_froxels,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.clustering_bind_group_layout = device.createBindGroupLayout({
            label: "clustering bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                    buffer: { type: "storage" }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        this.clustering_bind_group = device.createBindGroup({
            label: "clustering bind group",
            layout: this.clustering_bind_group_layout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.clustering_uniform_buffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.clustering_data_buffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.lightSetStorageBuffer }
                }
            ]
        });

        this.camera_bind_group_layout = device.createBindGroupLayout({
            label: "camera bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.camera_bind_group = device.createBindGroup({
            label: "camera bind group",
            layout: this.camera_bind_group_layout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
            ]
        });

        this.clustering_compute_pipeline = device.createComputePipeline({
            label: "clustering pipeline",
            layout: device.createPipelineLayout({
                label: "clustering pipeline",
                bindGroupLayouts: [ this.clustering_bind_group_layout, this.camera_bind_group_layout ]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "clustering compute shader",
                    code: shaders.clusteringComputeSrc
                }),
                entryPoint: "main"
            }
        });
    }

    private populateLightsBuffer() {
        for (let lightIdx = 0; lightIdx < Lights.maxNumLights; ++lightIdx) {
            // light pos is set by compute shader so no need to set it here
            const lightColor = vec3.scale(hueToRgb(Math.random()), Lights.lightIntensity);
            this.lightsArray.set(lightColor, (lightIdx * Lights.numFloatsPerLight) + 4);
        }

        device.queue.writeBuffer(this.lightSetStorageBuffer, 16, this.lightsArray);
    }

    updateLightSetUniformNumLights() {
        device.queue.writeBuffer(this.lightSetStorageBuffer, 0, new Uint32Array([this.numLights]));
    }

    doLightClustering(encoder: GPUCommandEncoder) {
        // TODO-2: run the light clustering compute pass(es) here
        // implementing clustering here allows for reusing the code in both Forward+ and Clustered Deferred
        const compute_pass = encoder.beginComputePass();

        compute_pass.setPipeline(this.clustering_compute_pipeline);
        compute_pass.setBindGroup(0, this.clustering_bind_group);
        compute_pass.setBindGroup(1, this.camera_bind_group);

        compute_pass.dispatchWorkgroups(
            Math.ceil(shaders.constants.num_clusters_x / shaders.constants.cluster_workgroup_size_x), 
            Math.ceil(shaders.constants.num_clusters_y / shaders.constants.cluster_workgroup_size_y), 
            Math.ceil(shaders.constants.num_clusters_z / shaders.constants.cluster_workgroup_size_z), 
        );

        compute_pass.end();
    }

    // CHECKITOUT: this is where the light movement compute shader is dispatched from the host
    onFrame(time: number) {
        device.queue.writeBuffer(this.timeUniformBuffer, 0, new Float32Array([time]));

        // not using same encoder as render pass so this doesn't interfere with measuring actual rendering performance
        const encoder = device.createCommandEncoder();

        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.moveLightsComputePipeline);

        computePass.setBindGroup(0, this.moveLightsComputeBindGroup);

        const workgroupCount = Math.ceil(this.numLights / shaders.constants.moveLightsWorkgroupSize);
        computePass.dispatchWorkgroups(workgroupCount);

        computePass.end();

        device.queue.submit([encoder.finish()]);
    }
}
