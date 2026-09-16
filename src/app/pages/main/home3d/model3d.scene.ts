import * as THREE from 'three';
import { GLTFLoader, type GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

/** 模型局部坐标下的一个点 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * 一次拾取的结果。
 *
 * 注意粒度：这个模型里**没有「一栋楼一个节点」这一层** —— 节点树是
 * `RootNode → KITBASH3D_TOKYO → grp_blocks → Blocks_007..011`，
 * 也就是 5 个「街区」，街区内部再按材质切成 primitive。
 * 所以能稳定给出的就是「哪个街区的哪块材质」，不是「哪栋楼」。
 *
 * 业务上的位置靠 `point`：那是射线命中的精确落点，与模型语义无关（点哪标哪）。
 */
export interface PickResult {
  /** glTF 里的 mesh 名，如 Blocks_007（街区） */
  meshName: string;
  /** 该 mesh 内的 primitive 序号 */
  primitiveIndex: number;
  /** glTF 里的材质名，如 mat_windows_03 */
  materialName: string;
  /** `Blocks_007#3` 形式的稳定标识 */
  pickId: string;
  /** 命中点。**模型根节点的局部坐标** —— 标空间/设备时存的就是它 */
  point: Vec3;
  /** 命中点相对画布左上角的像素坐标，用来把菜单摆在鼠标处 */
  screen: { x: number; y: number };
}

/**
 * 载入时就能确定的拾取身份。`point` / `screen` 要等真的点下去才知道，所以不在这里 ——
 * `pickInfo` 表存的是这个，{@link Model3dScene.pickAt} 再补上那两个字段凑成完整的
 * {@link PickResult}。
 */
type MeshInfo = Omit<PickResult, 'point' | 'screen'>;

/**
 * 场景里的一个标记，一般对应一个标了锚点的空间或设备。
 *
 * `label` / `badge` 由调用方给业务数据（空间名、设备数），**引擎不做任何翻译**。
 */
export interface MarkerSpec {
  /** 业务 id（空间 id / 设备 did），点击回调用它反查 */
  id: string;
  /** 模型根节点的局部坐标 */
  point: Vec3;
  /** 标签文字 */
  label: string;
  /** 角标，如设备数。空则不显示 */
  badge?: string;
  tone?: 'default' | 'active';
}

/** glTF JSON 里我们真正用到的那几段 */
interface GLTFParserJson {
  meshes?: { name?: string }[];
  materials?: { name?: string }[];
}

/** 拖动超过这个像素数就不算点击 —— 否则转一下视角松手就弹卡 */
const CLICK_SLOP_PX = 5;

/** 取景余量：1.0 是刚好贴边。留 15%：右下角要浮信息卡，贴太满会被盖住 */
const FIT_MARGIN = 1.15;

/**
 * glTF 场景的 three.js 封装。**不依赖 Angular**，组件只负责接线。
 *
 * 这样拆是为了让渲染循环、拾取、资源释放这些命令式逻辑跟变更检测彻底隔开，
 * 也让组件那边只剩生命周期。
 */
export class Model3dScene {
  private readonly host: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly envTarget: THREE.WebGLRenderTarget;

  /**
   * 对象身份表，载入时建一次。
   * 用 WeakMap 而不是往 userData 里塞，是为了不动 three 的对象结构。
   */
  private readonly pickInfo = new WeakMap<THREE.Object3D, MeshInfo>();

  /** 标签是 DOM，走它自己的渲染器；与 WebGL 同帧渲染，否则标签会「追着」模型跑 */
  private readonly labelRenderer: CSS2DRenderer;
  private readonly markerGroup = new THREE.Group();
  /** id → 该标记的 DOM 与 three 对象。按 id 复用，不整批重建 */
  private readonly markers = new Map<string, { object: CSS2DObject; element: HTMLElement }>();

  private root?: THREE.Object3D;
  /** 已排队的渲染帧；按需渲染靠它去重 */
  private rafId = 0;
  private disposed = false;

  private pickHandler: ((result: PickResult | null) => void) | null = null;
  private markerHandler: ((id: string, screen: { x: number; y: number }) => void) | null = null;
  /** 模型还没加载完就来的 setMarkers：先存着，load 成功后再灌 */
  private pendingMarkers: MarkerSpec[] | null = null;
  private highlighted: { mesh: THREE.Mesh; original: THREE.Material } | null = null;
  private pointerDownAt: { x: number; y: number } | null = null;

  constructor(host: HTMLElement) {
    this.host = host;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    // 上限压到 2：这模型 119 万三角面，高分屏上按 devicePixelRatio=3 渲染是纯浪费
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10_000);
    this.camera.position.set(1, 1, 1);

    // 模型材质的 metallicFactor 全是 0.4，而它自己不带任何环境贴图 —— 只打平行光的话
    // 金属那部分 BRDF 收不到反射，整体会渲成一片发闷的灰。补一个室内环境球。
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envTarget = this.pmrem.fromScene(room, 0.04);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.8;
    room.dispose();

    this.scene.background = new THREE.Color(0xeef1f5);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa2ad, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(60, 100, 40);
    this.scene.add(sun);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495; // 不让镜头钻到地面以下
    this.controls.minDistance = 1;
    this.controls.maxDistance = 5000;
    this.controls.addEventListener('change', this.requestRender);

    // 标签层。⚠️ CSS2DRenderer 的源码只给 domElement 设了 overflow:hidden —— 不补下面这几条，
    // 这层 div 会盖住整个画布，OrbitControls 直接失灵（拖不动、滚不动）。
    // 故意不设 z-index：让它留在 auto，好被 .scene-mask / .scene-reset / .scene-panel 压住。
    this.labelRenderer = new CSS2DRenderer();
    const labelDom = this.labelRenderer.domElement;
    labelDom.style.position = 'absolute';
    labelDom.style.inset = '0';
    labelDom.style.pointerEvents = 'none';
    this.host.appendChild(labelDom);
    this.scene.add(this.markerGroup);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
  }

  /** 载入 .glb；onProgress 给的是 0~1 的完成度 */
  load(url: string, onProgress?: (ratio: number) => void): Promise<void> {
    const loader = new GLTFLoader();
    // scene.glb 用 EXT_meshopt_compression 压了几何。解码器是自包含的 ES module
    // （wasm 内联在 js 里），所以不需要往 public/ 拷解码器文件、也不用配路径。
    loader.setMeshoptDecoder(MeshoptDecoder);

    return new Promise<void>((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          if (this.disposed) {
            // 组件已经销毁：直接了结，别把调用方的 await 永远挂在那里
            resolve();
            return;
          }
          this.root = gltf.scene;
          this.buildPickInfo(gltf.parser);
          this.scene.add(gltf.scene);
          this.frameObject(gltf.scene);
          // 加载期间来的标记，这时候才能换算到世界坐标上
          if (this.pendingMarkers) {
            const specs = this.pendingMarkers;
            this.pendingMarkers = null;
            this.setMarkers(specs);
          }
          this.requestRender();
          resolve();
        },
        (event) => {
          if (onProgress && event.lengthComputable && event.total > 0) {
            onProgress(event.loaded / event.total);
          }
        },
        (error) => reject(error instanceof Error ? error : new Error(String(error))),
      );
    });
  }

  /** 注册拾取回调；传 null 表示「点了空白处，取消了选中」 */
  onPick(handler: (result: PickResult | null) => void): void {
    this.pickHandler = handler;
  }

  /** 注册标记点击回调；screen 是相对画布左上角的像素坐标，用来摆菜单 */
  onMarkerClick(handler: (id: string, screen: { x: number; y: number }) => void): void {
    this.markerHandler = handler;
  }

  /**
   * 全量替换标记。
   *
   * 不用 add/remove/update 三个方法：标记只有几十个，全量替换消灭了「删一半状态不同步」
   * 这类 bug，调用方直接把 `computed()` 的结果扔进来即可。内部按 id 复用 DOM 节点。
   */
  setMarkers(specs: MarkerSpec[]): void {
    if (!this.root) {
      // 模型还没到，坐标换算不了。先记下来，load 完再灌
      this.pendingMarkers = specs;
      return;
    }

    const seen = new Set<string>();
    for (const spec of specs) {
      seen.add(spec.id);
      let entry = this.markers.get(spec.id);
      if (!entry) {
        const element = document.createElement('button');
        element.type = 'button';
        // 父层是 pointer-events:none，这里必须显式打开，否则标签点不到
        element.style.pointerEvents = 'auto';
        element.addEventListener('click', this.onMarkerDomClick);
        entry = { object: new CSS2DObject(element), element };
        this.markerGroup.add(entry.object);
        this.markers.set(spec.id, entry);
      }

      const { element, object } = entry;
      element.dataset['spaceId'] = spec.id;
      element.className = `h3d-marker h3d-marker--${spec.tone ?? 'default'}`;
      element.textContent = spec.label;
      if (spec.badge) {
        element.dataset['badge'] = spec.badge;
        element.classList.add('h3d-marker--badged');
      }
      // 局部坐标 → 世界坐标。今天 root 没有变换，两者相同；写成换算将来给 root 加
      // 居中/缩放时标记不会跟着错位。
      object.position.copy(
        this.root.localToWorld(new THREE.Vector3(spec.point.x, spec.point.y, spec.point.z)),
      );
    }

    for (const [id, entry] of [...this.markers]) {
      if (!seen.has(id)) {
        this.removeMarker(entry);
        this.markers.delete(id);
      }
    }

    this.requestRender();
  }

  /** 宿主尺寸变了就调它。canvas 的 CSS 尺寸交给样式表，这里只改绘制缓冲 */
  resize(): void {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }
    this.renderer.setSize(width, height, false);
    // 两个渲染器口径必须一致，都是 CSS 像素（上面那个传了 updateStyle=false）
    this.labelRenderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  /** 回到初始取景 */
  resetView(): void {
    if (this.root) {
      this.frameObject(this.root);
      this.requestRender();
    }
  }

  /** 取消高亮（比如信息卡被关掉时） */
  clearSelection(): void {
    this.clearHighlight();
    this.requestRender();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    this.controls.removeEventListener('change', this.requestRender);
    this.controls.dispose();

    // 先还原高亮：它换上去的是我们 clone 的材质，下面那轮 traverse 会连它一起放掉
    this.clearHighlight();

    // 标记：CSS2DRenderer 没有 dispose()，DOM 与监听都得自己清干净 ——
    // 否则下面那套「防 WebGL context 耗尽」的努力会被 DOM 泄漏抵消
    for (const entry of this.markers.values()) {
      this.removeMarker(entry);
    }
    this.markers.clear();
    this.markerGroup.clear();
    this.labelRenderer.domElement.remove();

    this.root?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach(disposeMaterial);
    });
    this.root = undefined;

    this.envTarget.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    // 浏览器同时能持有的 WebGL context 有上限（约 16 个），光靠 GC 回收太慢 ——
    // 来回切几次路由就会把余量耗光，页面直接白屏。主动交还。
    this.renderer.forceContextLoss();
    canvas.remove();
  }

  /**
   * 载入时把「three 对象 → glTF 身份」一次建好。
   *
   * 必须走 `parser.associations`，不能用 object.name 认路：同名 primitive 会被
   * GLTFLoader 的 createUniqueName 加上 `_1`/`_2` 后缀，名字既不稳定也不对应 glTF 索引。
   */
  private buildPickInfo(parser: GLTFParser): void {
    const json = parser.json as GLTFParserJson;
    this.root?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;

      const meshRef = parser.associations.get(mesh);
      const primitiveIndex = meshRef?.primitives ?? 0;
      const meshName = nameAt(json.meshes, meshRef?.meshes) ?? mesh.name ?? 'unknown';

      const materialRef = material ? parser.associations.get(material) : undefined;
      const materialName = nameAt(json.materials, materialRef?.materials) ?? material?.name ?? 'unknown';

      this.pickInfo.set(mesh, {
        meshName,
        primitiveIndex,
        materialName,
        pickId: `${meshName}#${primitiveIndex}`,
      });
    });
  }

  /** 把相机摆到刚好装得下 object 的位置，不写死坐标 */
  private frameObject(object: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) {
      return;
    }
    const size = box.getSize(new THREE.Vector3());
    const diagonal = size.length();

    // 用对角线而不是最长边来定 near/far：转视角时模型的最远角可能在对角线方向上
    this.camera.near = Math.max(diagonal / 1000, 0.1);
    this.camera.far = diagonal * 100;
    this.camera.updateProjectionMatrix();

    // 固定的 3/4 俯视角，比正对好看
    const direction = new THREE.Vector3(0.85, 0.6, 0.85).normalize();
    const corners = boundingBoxCorners(box);
    const fovVertical = (this.camera.fov * Math.PI) / 180;

    // 先按包围球估一个保守的初值
    let distance = diagonal / 2 / Math.sin(fovVertical / 2);
    const focus = box.getCenter(new THREE.Vector3());
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();

    // 把 8 个角点真正投影到 NDC 上迭代收敛，每轮两件事：
    // ① 把投影中心挪到画面中心 —— 透视下靠近相机的角点会被放大，
    //    只 lookAt 包围盒中心的话模型会沉在画面一侧；
    // ② 再按实际投影范围调距离 —— 光用「最长边 / tan(fov)」对细长模型
    //    （这个是 2.4×2.1×6.4）会留出大片空白，这么量才贴得紧，
    //    顺带把窗口宽高比也算了进去。
    for (let pass = 0; pass < 6; pass++) {
      this.placeCamera(focus, direction, distance);
      const before = this.measureNdc(corners);
      const halfHeight = distance * Math.tan(fovVertical / 2);
      right.setFromMatrixColumn(this.camera.matrixWorld, 0);
      up.setFromMatrixColumn(this.camera.matrixWorld, 1);
      focus
        .addScaledVector(right, ((before.minX + before.maxX) / 2) * halfHeight * this.camera.aspect)
        .addScaledVector(up, ((before.minY + before.maxY) / 2) * halfHeight);

      // 站到新位置重新量：距离必须基于移动之后的投影来算，否则两者会互相带偏
      this.placeCamera(focus, direction, distance);
      const after = this.measureNdc(corners);
      distance *= Math.max(after.maxX, -after.minX, after.maxY, -after.minY) * FIT_MARGIN;
    }

    this.placeCamera(focus, direction, distance);
    this.controls.target.copy(focus);
    this.controls.update();
  }

  /** 沿 direction 把相机放到离 focus 距离 distance 处并看向 focus */
  private placeCamera(focus: THREE.Vector3, direction: THREE.Vector3, distance: number): void {
    this.camera.position.copy(focus).addScaledVector(direction, distance);
    this.camera.lookAt(focus);
    this.camera.updateMatrixWorld();
  }

  /** 把角点投到 NDC，返回投影范围。|x| 或 |y| 超过 1 就是出画了 */
  private measureNdc(corners: THREE.Vector3[]): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const corner of corners) {
      const projected = corner.clone().project(this.camera);
      minX = Math.min(minX, projected.x);
      maxX = Math.max(maxX, projected.x);
      minY = Math.min(minY, projected.y);
      maxY = Math.max(maxY, projected.y);
    }
    return { minX, maxX, minY, maxY };
  }

  /** 合并同一帧内的多次请求，且空闲时完全不渲染 */
  private readonly requestRender = (): void => {
    if (this.rafId || this.disposed) {
      return;
    }
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      if (this.disposed) {
        return;
      }
      this.renderer.render(this.scene, this.camera);
      // 必须紧跟其后、同一帧。分开渲染的话，damping 尾段标签会「追着」模型跑，
      // 而且机器越慢越明显 —— 很容易被误判成坐标算错了。
      this.labelRenderer.render(this.scene, this.camera);
    });
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pointerDownAt = { x: event.clientX, y: event.clientY };
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const downAt = this.pointerDownAt;
    this.pointerDownAt = null;
    if (!downAt || !this.pickHandler || !this.root) {
      return;
    }
    // OrbitControls 拖拽结束时同样会冒 pointerup。用位移阈值把「点击」摘出来，
    // 否则每次转视角松手都会弹一次信息卡。
    const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
    if (moved > CLICK_SLOP_PX || event.button !== 0) {
      return;
    }
    this.pickAt(downAt);
  };

  private pickAt(downAt: { x: number; y: number }): void {
    if (!this.root) {
      return;
    }
    // 用按下时的坐标而不是松手时的：松手瞬间可能已经因为手抖偏了几像素
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((downAt.x - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((downAt.y - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    // 119 万三角面是暴力遍历，所以只在点击时做，且只取第一个命中
    const hit = this.raycaster
      .intersectObject(this.root, true)
      .find((intersection) => (intersection.object as THREE.Mesh).isMesh);

    if (!hit) {
      this.clearHighlight();
      this.requestRender();
      this.pickHandler?.(null);
      return;
    }

    const mesh = hit.object as THREE.Mesh;
    const base = this.pickInfo.get(mesh);
    if (!base) {
      return;
    }

    this.applyHighlight(mesh);
    this.requestRender();
    // 存根节点局部坐标：将来给 root 加居中/缩放变换时，已标好的锚点不会整体作废
    const local = this.root.worldToLocal(hit.point.clone());
    this.pickHandler?.({
      ...base,
      point: { x: local.x, y: local.y, z: local.z },
      screen: { x: downAt.x - rect.left, y: downAt.y - rect.top },
    });
  }

  /**
   * 高亮选中的那一块。
   *
   * ⚠️ 材质在 glTF 里是**跨 mesh 共享**的（mat_bldg_06 同时被 Blocks_007/008/009 用），
   * 直接改 material.emissive 会让五个街区里所有同材质的面一起亮。
   * 所以必须先 clone 一份再改，取消时换回原对象并 dispose 掉这份副本。
   */
  private applyHighlight(mesh: THREE.Mesh): void {
    this.clearHighlight();
    if (Array.isArray(mesh.material)) {
      return;
    }
    const original = mesh.material as THREE.MeshStandardMaterial;
    const clone = original.clone();
    if (clone.emissive) {
      clone.emissive = new THREE.Color(0x1668dc);
      clone.emissiveIntensity = 0.5;
    }
    mesh.material = clone;
    this.highlighted = { mesh, original };
  }

  private clearHighlight(): void {
    const current = this.highlighted;
    if (!current) {
      return;
    }
    this.highlighted = null;
    const material = current.mesh.material as THREE.Material;
    current.mesh.material = current.original;
    material.dispose();
  }

  /** 摘掉一个标记的 DOM 与监听。CSS2DRenderer 没有 dispose()，这些得自己清 */
  private removeMarker(entry: { object: CSS2DObject; element: HTMLElement }): void {
    entry.element.removeEventListener('click', this.onMarkerDomClick);
    entry.element.remove();
    this.markerGroup.remove(entry.object);
  }

  private readonly onMarkerDomClick = (event: MouseEvent): void => {
    event.stopPropagation();
    const element = event.currentTarget as HTMLElement;
    const id = element.dataset['spaceId'];
    if (!id) {
      return;
    }
    // 菜单要摆在鼠标处，所以把屏幕坐标一并交出去
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.markerHandler?.(id, { x: event.clientX - rect.left, y: event.clientY - rect.top });
  };
}

/** 包围盒的 8 个角点 */
function boundingBoxCorners(box: THREE.Box3): THREE.Vector3[] {
  const corners: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        corners.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  return corners;
}

/** 按索引取 glTF 定义里的名字，越界或缺失都返回 undefined */
function nameAt(list: { name?: string }[] | undefined, index: number | undefined): string | undefined {
  if (index === undefined || !list) {
    return undefined;
  }
  return list[index]?.name;
}

/** 材质上的贴图槽，释放时要逐个 dispose，否则显存不还 */
const TEXTURE_SLOTS = [
  'map',
  'lightMap',
  'aoMap',
  'emissiveMap',
  'bumpMap',
  'normalMap',
  'displacementMap',
  'roughnessMap',
  'metalnessMap',
  'alphaMap',
  'envMap',
] as const;

function disposeMaterial(material: THREE.Material): void {
  const record = material as unknown as Record<string, unknown>;
  for (const slot of TEXTURE_SLOTS) {
    const texture = record[slot];
    if (texture instanceof THREE.Texture) {
      texture.dispose();
    }
  }
  material.dispose();
}
