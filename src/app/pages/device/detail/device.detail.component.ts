import { Component, OnInit, signal } from '@angular/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzCardModule } from 'ng-zorro-antd/card';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { BreadcrumbTranslateDirective } from '../../../common/components/breadcrumb/breadcrumb-translate.directive';

@Component({
  selector: 'device-detail',
  standalone: true,
  templateUrl: './device.detail.component.html',
  styleUrl: './device.detail.component.less',
  imports: [
    NzPageHeaderModule,
    NzBreadCrumbModule,
    NzCardModule,
    TranslatePipe,
    BreadcrumbTranslateDirective,
  ],
})
export class DeviceDetailComponent implements OnInit {
  id = signal('');

  constructor(
    protected location: Location,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    this.route.params.subscribe((params) => {
      this.id.set(params['id'] || '');
    });
  }
}
