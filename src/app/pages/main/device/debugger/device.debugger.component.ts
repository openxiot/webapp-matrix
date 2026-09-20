import {
    Component,
    OnInit,
    ChangeDetectionStrategy,
    computed,
    inject,
    signal,
    ViewContainerRef
} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {NzPageHeaderModule} from 'ng-zorro-antd/page-header';
import {NzBreadCrumbModule} from 'ng-zorro-antd/breadcrumb';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {NzMessageService} from 'ng-zorro-antd/message';
import {NzCardModule} from 'ng-zorro-antd/card';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzCheckboxModule} from 'ng-zorro-antd/checkbox';
import {NzFormModule} from 'ng-zorro-antd/form';
import {NzInputModule} from 'ng-zorro-antd/input';
import {Location} from '@angular/common';
import {ActivatedRoute} from '@angular/router';
import {NzTabsModule} from 'ng-zorro-antd/tabs';
import {NzSpaceModule} from 'ng-zorro-antd/space';
import {NzTagModule} from 'ng-zorro-antd/tag';
import {NzModalService} from 'ng-zorro-antd/modal';
import {MatrixService} from '@app/service/matrix.service';
import {AccountService} from '@app/service/account.service';
import {ProductService} from '@app/service/product.service';
import {DeviceInstance, DeviceInstanceCodec} from '@openxiot/xiot-core-spec-ts';
import {DeviceInstanceViewJsonComponent} from './dialog/device.instance.view.json.component';
import {DeviceEntity} from '@app/typedef/define/device/DeviceEntity';
import {NzDescriptionsModule} from 'ng-zorro-antd/descriptions';
import {NzSegmentedModule} from 'ng-zorro-antd/segmented';
import {DebuggerSliderComponent} from './device/sider/debugger.slider.component';
import {DebuggerWaterfallComponent} from './device/waterfall/debugger.waterfall.component';
import {DebuggerTabsComponent} from './device/tabs/debugger.tabs.component';
import {TranslateService} from '@ngx-translate/core';
import {MainI18nService} from '@app/service/i18n.service';
import {BreadcrumbTranslateDirective} from '@app/common/components/breadcrumb/breadcrumb-translate.directive';
import {TranslatePipe} from '@ngx-translate/core';

@Component({
    selector: 'device-debugger',
    templateUrl: './device.debugger.component.html',
    styleUrls: ['./device.debugger.component.less'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        TranslatePipe,
        ReactiveFormsModule,
        NzPageHeaderModule,
        NzBreadCrumbModule,
        NzSpinModule,
        NzCardModule,
        NzButtonModule,
        NzCheckboxModule,
        NzTabsModule,
        NzFormModule,
        NzInputModule,
        NzSpaceModule,
        NzTagModule,
        NzDescriptionsModule,
        NzSegmentedModule,
        FormsModule,
        DebuggerSliderComponent,
        DebuggerWaterfallComponent,
        DebuggerTabsComponent,
        BreadcrumbTranslateDirective,
    ],
    providers: [
        NzModalService
    ]
})
export class DeviceDebuggerComponent implements OnInit {

    /** 语言切换信号：nz-segmented 的选项文案只能在 TS 里翻，靠它驱动重算。 */
    private langChange = toSignal(inject(TranslateService).onLangChange);

    /**
     * 页头的返回箭头：退回**来处**（浏览器历史），不是写死的某个路由 ——
     * 从设备列表、从空间树、从搜索结果点进来的都该回到各自那一条路径上。
     */
    protected readonly location = inject(Location);

    // 设备展现风格：nz-segmented 的 ngModel 绑定的是 option 的 value(非下标)，故选项需显式给出数值 value
    deviceDisplayOptions = computed(() => {
        this.langChange();
        const t = this.i18n.translate;
        return [
            {label: t.instant('分栏'), value: 0},
            {label: t.instant('瀑布'), value: 1},
            {label: t.instant('标签页'), value: 2},
        ];
    });
    deviceDisplayStyle: number = 0;

    // 服务展现风格（设备展现风格为'分栏'时有效）
    serviceDisplayOptions = computed(() => {
        this.langChange();
        const t = this.i18n.translate;
        return [
            {label: t.instant('标签页'), value: 0},
            {label: t.instant('瀑布'), value: 1},
        ];
    });
    serviceDisplayStyle: number = 0;

    did: string = '';

    loadingDetail = signal(true);
    device = signal<DeviceEntity | undefined>(undefined);

    loadingInstance = signal(true);
    instance = signal<DeviceInstance | undefined>(undefined);

    constructor(
        protected i18n: MainI18nService,
        private route: ActivatedRoute,
        private msg: NzMessageService,
        private matrix: MatrixService,
        private product: ProductService,
        private account: AccountService,
        private modal: NzModalService,
        private viewContainerRef: ViewContainerRef,
    ) {
    }

    ngOnInit() {
        this.route.params.subscribe(params => {
            this.did = params['did'];
            this.loadDetail(this.did);
        });
    }

    private loadDetail(did: string): void {
        this.loadingDetail.set(true);
        this.matrix.getDevice(this.account.space().id, did)
            .subscribe({
                next: data => {
                    this.device.set(data);
                    this.loadingDetail.set(false);
                    if (data?.type) {
                        this.loadInstance(data);
                    }
                },
                error: error => {
                    this.msg.warning('Failed to getDevice', error);
                    this.loadingDetail.set(false);
                }
            });
    }

    /** 取设备实例定义：按 DeviceType 走 product 服务的实例定义。 */
    private loadInstance(device: DeviceEntity): void {
        this.loadingInstance.set(true);
        const type = device.type;
        this.product.getProductInstance(type).subscribe({
            next: data => {
                this.instance.set(data);
                this.loadingInstance.set(false);
            },
            error: error => {
                this.msg.warning('Failed to getInstance', error);
                this.loadingInstance.set(false);
            }
        });
    }

    /**
     * 页头「设备类型: 查看」：弹出设备实例定义 JSON 对话框，底部有「下载 / 关闭」。
     * 实现与用法参考 webapp-product 的 ProductInstanceViewJsonComponent。
     */
    protected onViewJson(): void {
        const instance = this.instance();
        if (!instance) {
            return;
        }
        const modal = this.modal.create<DeviceInstanceViewJsonComponent, any, any>({
            nzWidth: 1024,
            nzTitle: this.i18n.translate.instant('设备实例定义'),
            nzContent: DeviceInstanceViewJsonComponent,
            nzViewContainerRef: this.viewContainerRef,
            nzData: DeviceInstanceCodec.encode(instance),
            nzFooter: [
                {
                    label: this.i18n.translate.instant('下载'),
                    onClick: component => component!.ok()
                },
                {
                    label: this.i18n.translate.instant('关闭'),
                    type: 'primary',
                    onClick: component => component!.cancel()
                }
            ],
        });

        modal.afterClose.subscribe(result => {
            if (result) {
                this.onDownload(result, instance.type.version || 0);
            }
        });
    }

    /**
     * 下载：把设备实例定义 JSON 对象格式化为缩进字符串并以 JSON 文件下载。
     */
    protected onDownload(data: any, version: number): void {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        // did 为 设备ID（hex/UUID），type model 提供版本区分
        link.download = `device-instance-${this.did}-${version}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }
}
