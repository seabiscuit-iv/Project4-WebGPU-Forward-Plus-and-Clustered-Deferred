// CHECKITOUT: this file loads all the shaders and preprocesses them with some common code


import commonRaw from './common.wgsl?raw';

import naiveFragRaw from './naive.fs.wgsl?raw';
import naiveVertRaw from './naive.vs.wgsl?raw';

import forwardPlusFragRaw from './forward_plus.fs.wgsl?raw';

import clusteredDeferredFragRaw from './clustered_deferred.fs.wgsl?raw';
import clusteredDeferredFullscreenFragRaw from './clustered_deferred_fullscreen.fs.wgsl?raw';
import clusteredDeferredFullscreenVertRaw from './clustered_deferred_fullscreen.vs.wgsl?raw';

import clusteringComputeRaw from './clustering.cs.wgsl?raw';
import moveLightsComputeRaw from './move_lights.cs.wgsl?raw';

// CONSTANTS (for use in shaders)
// =================================

// CHECKITOUT: feel free to add more constants here and to refer to them in your shader code

// Note that these are declared in a somewhat roundabout way because otherwise minification will drop variables
// that are unused in host side code.
export const constants = {
    bindGroup_scene: 0,
    bindGroup_model: 1,
    bindGroup_material: 2,

    moveLightsWorkgroupSize: 128,

    lightRadius: 2,

    // clustering constants
    num_clusters_x: 32,
    num_clusters_y: 16,
    num_clusters_z: 64,

    max_cluster_depth: 20,

    maxClusterLights: 511,

    cluster_workgroup_size_x: 16,
    cluster_workgroup_size_y: 16,
    cluster_workgroup_size_z: 1
};

// =================================

function evalShaderRaw(raw: string) {
    const generator = new Function('constants', 'return `' + raw.replaceAll('${', '${constants.') + '`');
    return generator(constants);
}

const commonSrc: string = evalShaderRaw(commonRaw);

function processShaderRaw(raw: string) {
    return commonSrc + evalShaderRaw(raw);
}

export const naiveVertSrc: string = processShaderRaw(naiveVertRaw);
export const naiveFragSrc: string = processShaderRaw(naiveFragRaw);

export const forwardPlusFragSrc: string = processShaderRaw(forwardPlusFragRaw);

export const clusteredDeferredFragSrc: string = processShaderRaw(clusteredDeferredFragRaw);
export const clusteredDeferredFullscreenVertSrc: string = processShaderRaw(clusteredDeferredFullscreenVertRaw);
export const clusteredDeferredFullscreenFragSrc: string = processShaderRaw(clusteredDeferredFullscreenFragRaw);

export const moveLightsComputeSrc: string = processShaderRaw(moveLightsComputeRaw);
export const clusteringComputeSrc: string = processShaderRaw(clusteringComputeRaw);
