import { Component, OnInit, computed, signal } from '@angular/core';
import { DatePipe, Location } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslatePipe } from '@ngx-translate/core';
import { BreadcrumbTranslateDirective } from '../../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { AccountService } from '../../../../service/account.service';
import { MatrixService } from '../../../../service/matrix.service';
import { ProductService } from '../../../../service/product.service';
import { MainI18nService } from '../../../../service/i18n.service';
import { DeviceEntity } from '../../../../typedef/define/device/DeviceEntity';
import { SpaceEntity } from '../../../../typedef/define/space/SpaceEntity';
import { UrnUtils } from '../../../../typedef/utils/UrnUtils';

/**
 * 设备详情页（/main/device/detail/:id，路由参数 id = 设备 did）。
 *
 * 只读展示一台设备的注册资料：设备ID / 产品 / 型号与版本 / 设备类型 / 状态 / 协议 / 所在空间 /
 * 父设备 / 根设备 / 最后在线离线，并列出其子设备（同一项目内 parentId = 本设备 did 的设备）。
 * 页头提供「映射」（仅 DTU，且账号启用组织时才显示——映射本质是一次组织管理员操作）与「调试」入口，
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
    NzTableModule,
    NzTagModule,
    NzButtonModule,
    NzDividerModule,
    NzEmptyModule,
    RouterLink,
    TranslatePipe,
    BreadcrumbTranslateDirective,
    DatePipe,
  ],
})
export class DeviceDetailComponent implements OnInit {
  /** 路由参数 id = 设备 did */
  did = signal('');

  loading = signal(false);
  /** 设备本体（GET /matrix/v1/device/one/{spaceId}/{did}） */
  device = signal<DeviceEntity | null>(null);

  /** 当前项目空间图里的空间与设备：解析所在空间名、父设备与子设备 */
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

  /** 是否展示「映射」入口：DTU 且账号已启用组织（映射需组织管理员，口径同设备列表） */
  readonly showMapping = computed(
    () =>
      this.isDtu() &&
      this.account.userSettings().organizationEnabled &&
      !!this.account.organization().id,
  );

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

    this.matrix.getDevice(spaceId, did).subscribe({
      next: (device) => {
        this.device.set(device);
        this.loading.set(false);
        this.resolveProduct(device);
        this.resolveInstance(device);
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
}
