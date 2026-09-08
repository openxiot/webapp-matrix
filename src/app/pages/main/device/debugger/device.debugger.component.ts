import {Component, OnInit, ChangeDetectionStrategy, signal} from '@angular/core';
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
import {ActivatedRoute, Router} from '@angular/router';
import {NzTabsModule} from 'ng-zorro-antd/tabs';
import {NzSpaceModule} from 'ng-zorro-antd/space';
import {NzTagModule} from 'ng-zorro-antd/tag';
import {MatrixService} from '../../../../service/matrix.service';
import {AccountService} from '../../../../service/account.service';
import {ProductService} from '../../../../service/product.service';
import {DeviceInstance} from '@openxiot/xiot-core-spec-ts';
import {DeviceEntity} from '../../../../typedef/define/device/DeviceEntity';
import {NzDescriptionsModule} from 'ng-zorro-antd/descriptions';
import {NzSegmentedModule} from 'ng-zorro-antd/segmented';
import {DebuggerSliderComponent} from './device/sider/debugger.slider.component';
import {DebuggerWaterfallComponent} from './device/waterfall/debugger.waterfall.component';
import {DebuggerTabsComponent} from './device/tabs/debugger.tabs.component';
import {MainI18nService} from '../../../../service/i18n.service';
import {BreadcrumbTranslateDirective} from '../../../../common/components/breadcrumb/breadcrumb-translate.directive';

@Component({
    selector: 'device-debugger',
    templateUrl: './device.debugger.component.html',
    styleUrls: ['./device.debugger.component.less'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
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
    ]
})
export class DeviceDebuggerComponent implements OnInit {

    // 设备展现风格：nz-segmented 的 ngModel 绑定的是 option 的 value(非下标)，故选项需显式给出数值 value
    deviceDisplayOptions = [
        {label: '分栏', value: 0},
        {label: '瀑布', value: 1},
        {label: '标签页', value: 2},
    ];
    deviceDisplayStyle: number = 0;

    // 服务展现风格（设备展现风格为'分栏'时有效）
    serviceDisplayOptions = [
        {label: '标签页', value: 0},
        {label: '瀑布', value: 1},
    ];
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
        private router: Router,
        private matrix: MatrixService,
        private product: ProductService,
        private account: AccountService,
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

                    if (this.device()?.type) {
                        this.loadInstance(this.device()!.type);
                    }
                },
                error: error => {
                    this.msg.warning('Failed to getDevice', error);
                    this.loadingDetail.set(false);
                }
            });
    }

    private loadInstance(type: string): void {
        this.loadingInstance.set(true);
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

    protected onBack() {
        this.router.navigate(['/main/device']).then(() => {
        });
    }
}
