// The "storybook diorama" finish, applied last to the whole frame (after tone mapping, so it
// works on the colours you actually see):
//   - ink outlines where the depth jumps (silhouettes of trees, hills, clouds, buildings) and,
//     softer, where the colour jumps (roof edges, paths, shadows) — the ink is a dark shade of the
//     colour underneath, not pure black, like hand-inked pixel art
//   - colour stepped into a few bands with a little ordered dither (flat, printed-looking shading)
// The chunky-pixel part comes from rendering at a low pixel ratio and letting the canvas upscale
// with `image-rendering: pixelated` (see ParkWorld) — which also makes every frame far cheaper.
import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

export function makeDioramaPass(depth: THREE.DepthTexture, camera: THREE.PerspectiveCamera): ShaderPass {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: depth },
      uRes: { value: new THREE.Vector2(1, 1) },
      uNear: { value: camera.near },
      uFar: { value: camera.far },
      uLevels: { value: 12 },
      uInk: { value: 0.85 },
      uOn: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform vec2 uRes;
      uniform float uNear; uniform float uFar; uniform float uLevels; uniform float uInk; uniform float uOn;
      varying vec2 vUv;
      float viewZ(vec2 uv) {
        float d = texture2D(tDepth, uv).r;
        float z = d * 2.0 - 1.0;
        return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
      }
      float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
      float bayer4(vec2 p) {
        vec2 q = mod(floor(p), 4.0);
        int i = int(q.x + q.y * 4.0);
        // 4x4 Bayer matrix / 16
        float m[16];
        m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0; m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
        m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0; m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
        for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16.0;
        return 0.0;
      }
      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        if (uOn < 0.5) { gl_FragColor = vec4(c, 1.0); return; }
        // sunny, saturated storybook colour (the filmic render reads a little washed-out)
        c = clamp(mix(vec3(luma(c)), c, 1.35), 0.0, 1.0);
        c = clamp((c - 0.5) * 1.08 + 0.5, 0.0, 1.0);
        vec2 px = 1.0 / uRes;
        float d0 = viewZ(vUv);
        if (uOn > 1.5) { gl_FragColor = vec4(vec3(fract(d0 / 20.0)), 1.0); return; } // debug: show depth
        float dl = viewZ(vUv - vec2(px.x, 0.0));
        float dr = viewZ(vUv + vec2(px.x, 0.0));
        float du = viewZ(vUv + vec2(0.0, px.y));
        float dd = viewZ(vUv - vec2(0.0, px.y));
        // only the nearer side of a jump gets the line (so lines hug the object, one pixel wide)
        float jump = max(max(dl - d0, dr - d0), max(du - d0, dd - d0)) / max(d0, 0.001);
        float edgeD = smoothstep(0.035, 0.09, jump);
        vec3 cl = texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb;
        vec3 cu = texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb;
        float edgeC = smoothstep(0.12, 0.26, max(abs(luma(c) - luma(cl)), abs(luma(c) - luma(cu))));
        // outlines fade out into the distance and the haze
        float near = 1.0 - smoothstep(90.0, 320.0, d0);
        float edge = max(edgeD, edgeC * 0.45) * near;
        // stepped colour with a little ordered dither
        float b = bayer4(gl_FragCoord.xy) - 0.5;
        vec3 q = floor(c * uLevels + 0.5 + b * 0.35) / uLevels;
        // ink = a deep shade of what's underneath (dark green on trees, dark brown on paths)
        vec3 ink = c * vec3(0.26, 0.3, 0.34);
        gl_FragColor = vec4(mix(q, ink, edge * uInk), 1.0);
      }`,
  });
  // ShaderPass clones its uniforms — including textures — so point it at the real depth again
  pass.uniforms.tDepth.value = depth;
  return pass;
}
