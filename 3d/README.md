# 3D 模型源文件（不入库）

这个目录放**原始**模型，体积大（`001/` 有 25MB），只在本地保留，**不提交**。
见同目录 `.gitignore`。

仓库里真正被引用的是压缩后的产物：**`public/3d/001/scene.glb`（3.9MB）**。
`Home3dComponent` 加载的是它，不是这里的原始文件。

## 原始模型

`001/` 是一个 KITBASH3D 东京街区模型，glTF 2.0 **分离**格式：

```
a7e7253039354e9583c70e2fdfddb107.gltf   54KB   场景描述
buffer.bin                              20MB   几何（430,726 顶点 / 1,189,110 索引）
kb_texture_*.jpg  ×11                   ~6MB   贴图（全部是 baseColor）
```

结构上是 `RootNode → KITBASH3D_TOKYO → grp_blocks → Blocks_007..011` 五个街区，
每个街区按材质再切成若干 primitive（共 62 个 / 17 种材质）。
**没有「一栋楼一个节点」这一层** —— 页面上的点选因此只能到材质级。

## 重新生成 scene.glb

一次性工具，**故意不进 devDependencies**（不是构建依赖，只是资产管线）：

```bash
npm exec --yes -- @gltf-transform/cli@4.5.0 <命令>
```

三步，**顺序不能改**：

```bash
SRC=3d/001/a7e7253039354e9583c70e2fdfddb107.gltf

# 1. 打包成单文件 .glb
npx --yes @gltf-transform/cli@4.5.0 copy        "$SRC"                    /tmp/1.glb

# 2. 删掉没被任何材质引用的顶点属性（这里省掉的是 TEXCOORD_1）
npx --yes @gltf-transform/cli@4.5.0 prune       /tmp/1.glb               /tmp/2.glb

# 3. 贴图转 WebP
npx --yes @gltf-transform/cli@4.5.0 webp        /tmp/2.glb               /tmp/3.glb

# 4. 几何量化 + meshopt 压缩（必须最后）
npx --yes @gltf-transform/cli@4.5.0 meshopt     /tmp/3.glb  public/3d/001/scene.glb
```

各步体积（实测）：

| 步骤 | 产物 | 大小 |
|---|---|---|
| — | 原始 `001/` | 25.0 MB |
| 1 `copy` | 单文件 glb | 26.3 MB |
| 2 `prune` | 删 TEXCOORD_1（-75 个 accessor） | 20.3 MB |
| 3 `webp` | 11 张贴图转 WebP | 15.5 MB |
| 4 `meshopt` | 量化 + 压缩几何 | **3.9 MB** |

### ⚠️ 重新生成后必须改 `MODEL_REV`

空间和设备在模型上的位置（`SpaceEntity.anchor` / `DeviceEntity.anchor`）存的是
**模型根节点的局部坐标**。同一个 URL 的 glb 内容一变，所有已存的坐标就整体错位 ——
不报错、不崩溃，只是标记悄悄跑到别处，比直接失败难查得多。

所以 `src/app/pages/main/home3d/home3d.anchor.ts` 里有一对常量：

```ts
export const MODEL_ID = '001';    // 模型标识，与 3d/001/ 对应
export const MODEL_REV = '001.1'; // 模型内容版本，重新生成 scene.glb 后手工 +1
```

渲染前会拿锚点里的 `model`/`rev` 跟这两个常量比对，**不符就一律不画**（宁可缺，不可错）。
于是重新生成 `scene.glb` 之后，最后一步是：

1. 把 `MODEL_REV` 递增（`001.1` → `001.2`）
2. 到页面上把受影响的标记重新标一遍 —— 旧锚点的 `rev` 对不上，已经不再显示了

> 忘了改的后果是「标记还在，但位置全错」；改了没重标则是「标记消失」。后者是安全的失败方向，
> 这正是用 `rev` 强校验而不是靠人工核对的原因。

### ⚠️ 两个踩过的坑

**① meshopt 必须放最后。** 贴图类命令（`webp`/`jpeg`/`resize`…）处理时会解开
`EXT_meshopt_compression` 再重写整个文件，体积反而会涨。实测把 `webp` 放在 `meshopt`
之后：8.9MB → **10.3MB**，白忙一场。日志里的提示是
`warn: Decoded EXT_meshopt_compression. Further compression will be lossy.`

**② `TEXCOORD_0` 不会被量化**，日志会警告 `Skipping TEXCOORD_0; out of [0,1] range.`
这是**正常的、也是想要的** —— 该模型的 UV 超出 [0,1]（贴图平铺），量化会破坏平铺。
meshopt 仍然会对它做无损压缩。

### 没用 `gltf-transform optimize`

`optimize` 会顺手做 weld / simplify / instance，那会**真的改动网格**，
「有没有走样」就变成需要逐处比对的事。上面四步只做无损 / 近无损压缩。
（`meshopt` 的量化默认是 POSITION 14bit / NORMAL 10bit / TEXCOORD 12bit。）

## 产物用了哪三个扩展

`public/3d/001/scene.glb` 的 `extensionsRequired`：

- `EXT_meshopt_compression` — three 的解码器是自包含 ES module
  （`three/addons/libs/meshopt_decoder.module.js`，wasm 内联 base64），
  `loader.setMeshoptDecoder()` 即可，**不需要往 public/ 里拷解码器文件**。
  这是选 meshopt 而不是 Draco 的原因（Draco 要另分发 wasm + wrapper 并配 decoder path）。
- `EXT_texture_webp` — GLTFLoader 原生支持。
- `KHR_mesh_quantization` — 量化带来的，GLTFLoader 原生支持。
