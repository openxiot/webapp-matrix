import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  computed,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe, Location } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslatePipe } from '@ngx-translate/core';
import { BreadcrumbTranslateDirective } from '@app/common/components/breadcrumb/breadcrumb-translate.directive';
import { AccountService } from '@app/service/account.service';
import { MatrixService } from '@app/service/matrix.service';
import { ProductService } from '@app/service/product.service';
import { MainI18nService } from '@app/service/i18n.service';
import { DeviceEntity } from '@app/typedef/define/device/DeviceEntity';
import { SpaceEntity } from '@app/typedef/define/space/SpaceEntity';
import { OrganizationMember } from '@app/typedef/define/user/UserOrganization';
import { UrnUtils } from '@app/typedef/utils/UrnUtils';
import { NzIconDirective } from 'ng-zorro-antd/icon';
import { SafePipe } from '@app/common/pipe/safe/SafePipe';
import { environment } from '../../../../../environments/environment';
import { ProductController } from '@openxiot/xiot-core-spec-ts';

/**
 * 内嵌的第三方设备页面（自行开发、自行部署，宿主只负责嵌进来）：地址不再写死，
 * 而是按本设备的 deviceType 从产品服务取控制页列表，挑【最新版本】的控制页 url 作为 iframe 源。
 * 与它约定两条 postMessage：`iframe-height` 上报内容高度、`toast` 请求宿主弹提示 ——
 * 完整契约与注意事项见工程根目录的《跨域加载设备页面.md》。
 */

/**
 * 设备详情页（/main/device/detail/:id，路由参数 id = 设备 did）。
 *
 * 只读展示一台设备的注册资料：设备ID / 产品 / 型号与版本 / 设备类型 / 状态 / 协议 / 所在空间 /
 * 父设备 / 根设备 / 最后在线离线，并列出其子设备（同一项目内 parentId = 本设备 did 的设备）。
 * 页头提供「映射」（仅 DTU，且自己为项目空间管理员时才显示——Modbus 服务按空间鉴权）与「调试」入口，
 * 展示口径与设备列表页一致。
 *
 * 数据来源：设备本体取 GET /matrix/v1/device/one/{spaceId}/{did}（spaceId 用当前项目根空间，同调试页）；
 * 空间名 / 父设备 / 子设备取当前项目的空间图（GET /matrix/v1/space/graph/{rootId}）——空间图失败只让这几项
 * 留空，不影响设备主体的展示。产品显示名按 URN 的 org:model 精确查询，未命中回退类型名。
 */
@Component({
  selector: 'device-detail',
  standalone: true,
  templateUrl: './device.detail.component.html',
  styleUrl: './device.detail.component.less',
  imports: [
    NzPageHeaderModule,
    NzBreadCrumbModule,
    NzSpinModule,
    NzCardModule,
    NzDescriptionsModule,
    NzTagModule,
    NzButtonModule,
    NzEmptyModule,
    RouterLink,
    TranslatePipe,
    BreadcrumbTranslateDirective,
    DatePipe,
    NzIconDirective,
    SafePipe,
  ],
})
export class DeviceDetailComponent implements OnInit {
  /** 路由参数 id = 设备 did */
  did = signal('');

  loading = signal(false);
  /** 设备本体（GET /matrix/v1/device/one/{spaceId}/{did}） */
  device = signal<DeviceEntity | null>(null);

  /** 当前项目空间图里的空间与设备：解析所在空间名（子设备列表已独立成页，见 children/） */
  projectSpaces = signal<SpaceEntity[]>([]);
  projectDevices = signal<DeviceEntity[]>([]);

  /** 产品显示名（按 URN 的 org:model 查询，未命中回退类型名） */
  productName = signal('');

  /** 设备实例描述（多语言文案，产品名缺失时的兜底，见 deviceName） */
  deviceDescription = signal('');

  /** 空间 ID -> 空间 */
  readonly spaceById = computed(() => {
    const map = new Map<string, SpaceEntity>();
    for (const s of this.projectSpaces()) map.set(s.id, s);
    return map;
  });

  /** 设备类型名：URN 第 4 段（如 dtu / chiller），口径同设备列表 */
  readonly typeName = computed(() => UrnUtils.extractTypeName(this.device()?.type ?? ''));

  /** 型号 / 功能版本：实例类型 URN 的第 7 / 8 段，随类型自带，无需回查产品目录 */
  readonly productModel = computed(() => UrnUtils.extractOrgModel(this.device()?.type ?? '').model);
  readonly productVersion = computed(() => {
    const parts = (this.device()?.type ?? '').split(':');
    return parts.length > 7 ? parts[7] : '';
  });

  /**
   * 设备显示名（页头标题与「产品名称」项都用它），优先级同设备列表页：
   * 产品名称 -> 设备实例描述 -> 设备 DeviceType（URN）的 type 段 -> did。
   */
  readonly deviceName = computed(() => {
    const device = this.device();
    if (!device) return '';
    return this.productName() || this.deviceDescription() || this.typeName() || device.did;
  });

  /** 所在空间名（设备的 space.spaceId 命中空间图；无归属或不在图里为空） */
  readonly spaceName = computed(() => {
    const spaceId = this.device()?.space?.spaceId;
    if (!spaceId) return '';
    return this.spaceById().get(spaceId)?.name ?? '';
  });

  /** 子设备：同一项目内 parentId = 本设备 did 的设备（如挂在本 DTU 下的子设备） */
  readonly children = computed(() => {
    const device = this.device();
    if (!device) return [] as DeviceEntity[];
    return this.projectDevices().filter((x) => x.parentId === device.did);
  });

  /** 是否 DTU：只有 DTU 能做设备点表映射（口径同设备列表） */
  readonly isDtu = computed(() => this.typeName().toLowerCase() === 'dtu');

  /** 当前项目根空间与成员（user 访问条目），用于计算项目管理员（isAdmin）。 */
  rootSpace = signal<SpaceEntity | null>(null);
  members = signal<OrganizationMember[]>([]);

  /**
   * 当前账号是否为项目管理员（决定「映射」是否可见）：
   * 1. 自己在项目成员（user 访问条目）中 role=admin；
   * 2. 组织兜底：当前组织命中根空间的 organization 访问条目，且自己为该组织管理员。
   * 口径与 device.component / project.component 的 isAdmin 一致。
   */
  readonly isAdmin = computed(() => {
    const me = this.account.user();
    if (!me?.id) return false;

    const selfEntry = this.members().find((m) => m.userId === me.id);
    if (selfEntry?.role === 'admin') return true;

    const org = this.account.organization();
    const orgEntry = this.rootSpace()?.accesses?.find(
      (a) => a.type === 'organization' && a.id === org.id,
    );
    if (orgEntry) {
      const meInOrg = org.members.find((m) => m.userId === me.id);
      return meInOrg !== undefined && meInOrg.role === 'admin';
    }
    return false;
  });

  /**
   * 是否展示「映射」入口：DTU 且自己为项目空间管理员。
   * Modbus 服务（映射）已按**空间**鉴权，与账号有没有组织无关，故不再要求「已启用组织」。
   */
  readonly showMapping = computed(() => this.isDtu() && this.isAdmin());

  // ---- 第三方设备页面（跨域 iframe）----

  /** 第三方设备页面地址：按 deviceType 取最新控制页后回填（模板里直接绑） */
  readonly frameSrc = signal('');

  /** 该页面的来源，校验 postMessage 用 */
  private readonly frameOrigin = computed(() => {
    const src = this.frameSrc();
    return src ? new URL(src).origin : '';
  });

  /** iframe 的高度：由第三方页面 postMessage 上报（跨域下宿主读不到它的文档，量不了） */
  readonly frameHeight = signal(600);

  /** 模板里的 iframe 引用，用来确认消息确实是它发来的 */
  private readonly frameRef = viewChild<ElementRef<HTMLIFrameElement>>('deviceFrame');

  /**
   * 第三方页面的 postMessage。两种消息：
   * - `iframe-height`：上报内容高度。宿主把 iframe 撑到内容高度，页面内部就不会有自己的滚动条，
   *   由宿主页面的滚动条统管——否则内外两条滚动条。
   * - `toast`：它要弹提示。iframe 是"内容全高"的、固定定位会落到用户视口外，所以交给宿主用 message 弹。
   *
   * 消息必须是**这一个 iframe** 发来的：只比对 origin 的话，同源的其它窗口也能改我们的布局。
   */
  @HostListener('window:message', ['$event'])
  onFrameMessage(e: MessageEvent) {
    const frame = this.frameRef()?.nativeElement;
    const origin = this.frameOrigin();
    if (!frame || e.source !== frame.contentWindow || !origin || e.origin !== origin) {
      return;
    }

    if (e.data?.type === 'iframe-height') {
      const height = Number(e.data.height);
      if (Number.isFinite(height) && height > 0) {
        this.frameHeight.set(height);
      }
    } else if (e.data?.type === 'toast' && typeof e.data.message === 'string') {
      this.msg.info(e.data.message);
    }
  }

  constructor(
    protected location: Location,
    protected i18n: MainI18nService,
    private route: ActivatedRoute,
    private account: AccountService,
    private matrix: MatrixService,
    private product: ProductService,
    private msg: NzMessageService,
  ) {}

  ngOnInit() {
    this.route.params.subscribe((params) => {
      this.did.set(params['id'] || '');
      this.load();
    });
  }

  private load(): void {
    const spaceId = this.account.space().id;
    const did = this.did();
    if (!spaceId) {
      this.msg.warning(this.i18n.translate.instant('请先在项目列表中选择一个项目'));
      return;
    }
    if (!did) {
      return;
    }

    this.loading.set(true);
    this.device.set(null);
    this.productName.set('');
    this.deviceDescription.set('');
    this.frameSrc.set('');

    this.matrix.getDevice(spaceId, did).subscribe({
      next: (device) => {
        this.device.set(device);
        this.loading.set(false);
        this.resolveProduct(device);
        this.resolveInstance(device);
        this.resolveFrameSrc(device);
      },
      error: (e) => {
        this.loading.set(false);
        this.msg.error(e?.message ?? e);
      },
    });

    // 空间图（当前项目全部空间 + 设备）：解析所在空间名、父设备、子设备；
    // 失败只让这几项留空，不影响设备主体
    this.matrix.getSpaceGraph(spaceId).subscribe({
      next: (graph) => {
        this.projectSpaces.set(graph.spaces);
        this.projectDevices.set(graph.devices);
      },
      error: () => {},
    });

    this.loadAdminContext(spaceId);
  }

  /** 加载项目根空间 + 成员，供 isAdmin 判定；非管理员无需展示入口，失败静默即可。 */
  private loadAdminContext(rootId: string): void {
    forkJoin({
      space: this.matrix.getSpace(rootId),
      members: this.matrix.listAccesses(rootId),
    }).subscribe({
      next: ({ space, members }) => {
        this.rootSpace.set(space);
        this.members.set(members);
      },
      error: () => {},
    });
  }

  /** 产品显示名：按 URN 的 org:model 精确查询；未命中沿用类型名兜底（同设备列表页） */
  private resolveProduct(device: DeviceEntity): void {
    const { org, model } = UrnUtils.extractOrgModel(device.type);
    if (!org || !model) {
      return;
    }
    this.product.getProductByOrgModel(org, model).subscribe({
      next: (p) => {
        const lang = this.i18n.getCurrentLang();
        this.productName.set(
          p.name?.value?.get(lang) || p.name?.value?.get('zh-CN') || p.model || '',
        );
      },
      error: () => {},
    });
  }

  /**
   * 设备实例描述（产品名缺失时的兜底显示名）：实例定义按 DeviceType 取，走 product 服务的
   * 实例定义——口径同调试页与设备列表页。
   * 当前语言无文案时回退中文；取不到就沿用类型名兜底，失败静默。
   */
  private resolveInstance(device: DeviceEntity): void {
    const type = device.type;
    if (!type) {
      return;
    }
    this.product.getProductInstance(type).subscribe({
      next: (instance) => {
        const lang = this.i18n.getCurrentLang();
        this.deviceDescription.set(
          instance.description?.get(lang) || instance.description?.get('zh-CN') || '',
        );
      },
      error: () => {},
    });
  }

  /** 内嵌设备页面地址：按 deviceType 取产品控制页列表，挑最新版本带 url 的那个回填，
   *  并追加宿主注入的认证/场景参数（见 {@link decorateFrameUrl}）。 */
  private resolveFrameSrc(device: DeviceEntity): void {
    const type = device.type;
    if (!type) {
      this.frameSrc.set('');
      return;
    }
    this.product.getControllersByDeviceType(type).subscribe({
      next: (controllers) => {
        const url = this.pickLatestController(controllers)?.web?.url ?? '';
        this.frameSrc.set(url ? this.decorateFrameUrl(url, device) : '');
      },
      error: () => this.frameSrc.set(''),
    });
  }

  /**
   * 给控制页 url 追加宿主注入的参数（控制页自行开发、自行部署，靠这 4 个参数知道
   * 自己在哪个 server / 项目 / 设备下、以及拿谁的 token 去调 matrix 的接口）：
   * - `server`：后端服务地址（environment.server），控制页据此拼 API base；
   * - `spaceId`：设备所在的**项目根空间**——取 account.space().id，同本页 getDevice 的入参
   *   （DeviceResource 的 path spaceId 就是它；设备属于当前项目时其 space.rootId 与之相等）；
   * - `did`：设备 did；
   * - `token`：当前登录用户的 token。
   * 注意：token 落入 URL 是既定的跨页/换 iframe 契约（第三方页面拿不到 httpOnly cookie 不行），
   * 只能经 HTTPS 传输，勿在日志里打印。
   */
  private decorateFrameUrl(base: string, device: DeviceEntity): string {
    const u = new URL(base);
    u.searchParams.set('server', environment.server);
    u.searchParams.set('spaceId', this.account.space().id);
    u.searchParams.set('did', device.did);
    u.searchParams.set('token', this.account.user()?.token ?? '');
    return u.toString();
  }

  /** 最新版本 = 版本号最大、且带 web.url 的控制页（跨 category 取最大版本）。 */
  private pickLatestController(controllers: ProductController[]): ProductController | null {
    let best: ProductController | null = null;
    for (const c of controllers) {
      if (!c.web?.url) {
        continue;
      }
      if (!best || (c.version?.code ?? 0) > (best.version?.code ?? 0)) {
        best = c;
      }
    }
    return best;
  }
}
