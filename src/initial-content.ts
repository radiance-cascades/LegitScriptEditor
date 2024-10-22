export const initialContent = `[blendmode: multiplicative]
void ColorPass(
  in vec3 color,
  in vec2 c,
  in ivec2 size,
  out vec4 out_color
)
{{
  vec2 complex_sqr(vec2 z) { return vec2(z[0] * z[0] - z[1] * z[1], z[1] * z[0] * 2.); }
  void main()
  {
    ivec2 pixel_idx = ivec2(gl_FragCoord.xy);

    vec2 uv = gl_FragCoord.xy / vec2(size);
    vec2 z = vec2(pixel_idx - size / 2) / float(min(size.x, size.y)) * 2.0;
    int it = 0;
    while (sqrt(dot(z, z)) < 20. && it < 50) {
      z = complex_sqr(z) + c;
      it = it + 1;
    }
    float eps = 1e-7;
    vec4 fractal = vec4(float(it) - log2(max(0.5 * log(dot(z, z)) / log(20.0), eps))) * 0.1;
    fractal.a = 1.;
    out_color.rgb = fractal.xyz * color;
    out_color.a = 1.;
  }
}}

void DEBUGPassUV(in ivec2 size, out vec4 out_color)
{{
  void main()
  {
    vec2 uv = gl_FragCoord.xy / vec2(size);
    out_color = vec4(uv, 0.0, 1.0);
  }
}}

void TwoOutputsShader(out vec4 out_color1, out vec4 out_color2)
{{
  void main()
  {
    out_color1 = vec4(1.0f, 0.5f, 0.0f, 1.0f);
    out_color2 = vec4(0.0f, 0.5f, 1.0f, 1.0f);
  }
}}

[blendmode: alphablend]
void TwoInputsShader(
  in ivec2 size,
  sampler2D tex1,
  sampler2D tex2,
  out vec4 out_color
)
{{
  void main()
  {
    ivec2 pixel_idx = ivec2(gl_FragCoord.xy);
    if (pixel_idx.x > size.x - 200 && pixel_idx.y > size.y - 200) {

      float mult = 0.1;
      ivec2 rel = pixel_idx - (size - 200);
      ivec2 checkerboard = ivec2(rel >> 4);
      vec4 a = texelFetch(tex1, ivec2(rel.xy), 0);
      vec4 b = texelFetch(tex2, ivec2(rel.xy), 0);

      out_color = mix(a, b, float((checkerboard.x + checkerboard.y) % 2));
      return;
    }
    out_color = vec4(0.0);
  }
}}


[declaration: "smoothing"]
{{
  float SmoothOverTime(float val, string name, float ratio = 0.95)
  {
    ContextVec2(name) = ContextVec2(name) * ratio + vec2(val, 1) * (1.0 - ratio);
    return ContextVec2(name).x / (1e-7f + ContextVec2(name).y);
  }
}}
  
[declaration: "fps"]
[include: "smoothing"]
{{
  float GetSmoothFps()
  {
    float dt = GetTime() - ContextFloat("prev_time");
    ContextFloat("prev_time") = GetTime();

    return 1000.0 / (1e-7f + SmoothOverTime(dt, "fps_count"));
  }
}}

[rendergraph]
[include: "fps"]
void RenderGraphMain()
{{
  void main()
  {
    Image sc = GetSwapchainImage();
    int frame_idx = ContextInt("frame_idx")++;
    Text("Frame index:" + frame_idx);



    Image img1 = GetImage(GetSwapchainImage().GetSize(), rgba16f);
    Image img2 = GetImage(GetSwapchainImage().GetSize(), rgba16f);
    TwoOutputsShader(
      img1,
      img2
    );
    DEBUGPassUV(
      sc.GetSize(),
      sc
    );
    ContextFloat("phase") += 1e-2 * SliderFloat("Speed", 0.0f, 2.0f, 0.4f);
    float color = SliderFloat("Color", 0.0f, 1.0f, 0.5f);
    ColorPass(
      vec3(color),
      vec2(-0.8, cos(2.0 * (SliderFloat("P", 0.0f, 2.0f, 0.7f) + ContextFloat("phase")))),
      sc.GetSize(),
      sc
    );

    TwoInputsShader(sc.GetSize(), img1, img2, sc);


    Text("Fps: " + GetSmoothFps());
    Text("dims: " + sc.GetSize().x + ", " + sc.GetSize().y);
  }
}}
`