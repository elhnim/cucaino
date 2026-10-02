import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applySafeShaders } from "./safeShaders";

describe("safe shaders", () => {
  it("guards flat shading's derivative normal, so a too-thin face can't output NaN", () => {
    applySafeShaders();
    const src = (THREE.ShaderChunk as unknown as Record<string, string>).normal_fragment_begin;
    // (a three.js upgrade that rewords the chunk would silently drop the guard: fail loudly instead)
    expect(src).not.toContain("vec3 normal = normalize( cross( fdx, fdy ) );");
    expect(src).toContain("dot( flatN, flatN ) > 0.0");
  });
});
