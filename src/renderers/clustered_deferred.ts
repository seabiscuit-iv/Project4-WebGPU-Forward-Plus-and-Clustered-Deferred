import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    gbuffer_pos: GPUTexture;
    gbuffer_pos_view: GPUTextureView;

    gbuffer_nor: GPUTexture;
    gbuffer_nor_view: GPUTextureView;

    gbuffer_uv: GPUTexture;
    gbuffer_uv_view: GPUTextureView;

    gbuffer_diffuse: GPUTexture;
    gbuffer_diffuse_view: GPUTextureView;

    gbuffer_bind_group: GPUBindGroup;
    gbuffer_bind_group_layout: GPUBindGroupLayout;

    gbuffer_sampler: GPUSampler;

    geometry_pipeline: GPURenderPipeline;
    lighting_pipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                { // lightSet
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" },
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
            ]
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                }
            ]
        });

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();

        // gbuffer texture creations
        {
            this.gbuffer_pos = renderer.device.createTexture({
                size: [renderer.canvas.width, renderer.canvas.height],
                format: "rgba16float",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            })
            this.gbuffer_pos_view = this.gbuffer_pos.createView();

            this.gbuffer_nor = renderer.device.createTexture({
                size: [renderer.canvas.width, renderer.canvas.height],
                format: "rgba16float",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            })
            this.gbuffer_nor_view = this.gbuffer_nor.createView();

            this.gbuffer_uv = renderer.device.createTexture({
                size: [renderer.canvas.width, renderer.canvas.height],
                format: "rg16float",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            })
            this.gbuffer_uv_view = this.gbuffer_uv.createView();

            this.gbuffer_diffuse = renderer.device.createTexture({
                size: [renderer.canvas.width, renderer.canvas.height],
                format: "rgba16float",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            })
            this.gbuffer_diffuse_view = this.gbuffer_diffuse.createView();

            this.gbuffer_sampler = renderer.device.createSampler({});
        }

        // gbuffer bind group creation
        {
            this.gbuffer_bind_group_layout = renderer.device.createBindGroupLayout({
                entries: [
                    { // gbuffer_pos
                        binding: 0,
                        visibility: GPUShaderStage.FRAGMENT,
                        texture: {}
                    },
                    { // gbuffer_nor
                        binding: 1,
                        visibility: GPUShaderStage.FRAGMENT,
                        texture: {}
                    },
                    { // gbuffer_uv
                        binding: 2,
                        visibility: GPUShaderStage.FRAGMENT,
                        texture: {}
                    },
                    { // gbuffer_diffuse
                        binding: 3,
                        visibility: GPUShaderStage.FRAGMENT,
                        texture: {}
                    },
                    { // gbuffer_sampler
                        binding: 4,
                        visibility: GPUShaderStage.FRAGMENT,
                        sampler: {}
                    },
                    {
                        binding: 5,
                        visibility: GPUShaderStage.FRAGMENT,
                        texture: {
                            sampleType: 'depth',
                            viewDimension: '2d'
                        }
                    }
                ]
            });

            this.gbuffer_bind_group = renderer.device.createBindGroup({
                layout: this.gbuffer_bind_group_layout,
                entries: [
                    {
                        binding: 0,
                        resource: this.gbuffer_pos_view
                    },
                    {
                        binding: 1,
                        resource: this.gbuffer_nor_view
                    },
                    {
                        binding: 2,
                        resource: this.gbuffer_uv_view
                    },
                    {
                        binding: 3,
                        resource: this.gbuffer_diffuse_view
                    },
                    {
                        binding: 4,
                        resource: this.gbuffer_sampler
                    },
                    {
                        binding: 5,
                        resource: this.depthTextureView
                    }
                ]
            });
        }

        this.geometry_pipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "clustered deferred geometry pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout,
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred geometry vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred geometry frag shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    {
                        format: this.gbuffer_pos.format
                    },
                    {
                        format: this.gbuffer_nor.format
                    },
                    {
                        format: this.gbuffer_uv.format
                    },
                    {
                        format: this.gbuffer_diffuse.format
                    }
                ]
            }
        });

        this.lighting_pipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "clustered deferred lighting pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.lights.clustering_bind_group_layout,
                    this.gbuffer_bind_group_layout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred lighting vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                })
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred lighting frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat
                    }
                ]
            }
        });
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        renderer.device.queue.writeBuffer(
            this.lights.clustering_uniform_buffer, 
            4*4, 
            new Uint32Array([renderer.canvas.width, renderer.canvas.height])
        );

        this.lights.doLightClustering(encoder);

        // geometry render pass
        {
            const geometry_render_pass = encoder.beginRenderPass({
                label: "geometry render pass",
                colorAttachments: [
                    {
                        view: this.gbuffer_pos_view,
                        clearValue: [0, 0, 0, 0],
                        loadOp: "clear",
                        storeOp: "store"
                    },
                    {
                        view: this.gbuffer_nor_view,
                        clearValue: [0, 0, 0, 0],
                        loadOp: "clear",
                        storeOp: "store"
                    },                
                    {
                        view: this.gbuffer_uv_view,
                        clearValue: [0, 0, 0, 0],
                        loadOp: "clear",
                        storeOp: "store"
                    },
                    {
                        view: this.gbuffer_diffuse_view,
                        clearValue: [0, 0, 0, 0],
                        loadOp: "clear",
                        storeOp: "store"
                    }
                ],
                depthStencilAttachment: {
                    view: this.depthTextureView,
                    depthClearValue: 1.0,
                    depthLoadOp: "clear",
                    depthStoreOp: "store"
                }
            });
            geometry_render_pass.setPipeline(this.geometry_pipeline);

            geometry_render_pass.setBindGroup(0, this.sceneUniformsBindGroup);

            this.scene.iterate(node => {
                geometry_render_pass.setBindGroup(1, node.modelBindGroup);
            }, material => {
                geometry_render_pass.setBindGroup(2, material.materialBindGroup);
            }, primitive => {
                geometry_render_pass.setVertexBuffer(0, primitive.vertexBuffer);
                geometry_render_pass.setIndexBuffer(primitive.indexBuffer, 'uint32');
                geometry_render_pass.drawIndexed(primitive.numIndices);
            });

            geometry_render_pass.end();
        }

        // lighting render pass
        {  
            const lighting_render_pass = encoder.beginRenderPass({
                colorAttachments: [
                    {
                        view: canvasTextureView,
                        loadOp: 'clear',
                        storeOp: 'store',
                        clearValue: { r: 0, g: 0, b: 0, a: 1.0 }
                    }
                ]
            })

            lighting_render_pass.setPipeline(this.lighting_pipeline);

            lighting_render_pass.setBindGroup(0, this.sceneUniformsBindGroup);
            lighting_render_pass.setBindGroup(1, this.lights.clustering_bind_group);
            lighting_render_pass.setBindGroup(2, this.gbuffer_bind_group);

            lighting_render_pass.draw(6);

            lighting_render_pass.end();
        }

        renderer.device.queue.submit([encoder.finish()]);
    }
}
