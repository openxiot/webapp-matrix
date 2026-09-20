import { Component, OnInit, signal } from '@angular/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonComponent } from 'ng-zorro-antd/button';
import { NzWaveDirective } from 'ng-zorro-antd/core/wave';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { NzColDirective, NzRowDirective } from 'ng-zorro-antd/grid';
import { NzIconDirective } from 'ng-zorro-antd/icon';
import { BreadcrumbTranslateDirective } from '@app/common/components/breadcrumb/breadcrumb-translate.directive';
import { AccountService } from '@app/service/account.service';
import { SpaceEntity } from '@app/typedef/define/space/SpaceEntity';
import { MatrixService } from '@app/service/matrix.service';

@Component({
  selector: 'main-projects',
  standalone: true,
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.less',
  imports: [
    FormsModule,
    NzPageHeaderModule,
    NzBreadCrumbModule,
    BreadcrumbTranslateDirective,
    NzSpinModule,
    NzCardModule,
    NzTabsModule,
    NzTableModule,
    NzDescriptionsModule,
    NzButtonComponent,
    NzWaveDirective,
    RouterLink,
    TranslatePipe,
    NzColDirective,
    NzRowDirective,
    NzIconDirective,
    NzSpinModule,
  ],
})
export class ProjectsComponent implements OnInit {
  loading = signal(true);
  spaces = signal<SpaceEntity[]>([]);

  constructor(
    public account: AccountService,
    private router: Router,
    private service: MatrixService,
    private msg: NzMessageService,
  ) {}

  ngOnInit() {
    this.loadDataFromServer();
  }

  loadDataFromServer(): void {
    this.loading.set(true);
    this.service.getAllSpaces().subscribe({
      next: (data) => {
        this.spaces.set(data);
        this.loading.set(false);
      },
      error: (error) => {
        this.msg.warning(error);
        this.loading.set(false);
      },
    });
  }

  protected setCurrentProject(space: SpaceEntity) {
    this.account.setCurrentProject(space);

    this.router
      .navigate(['/'])
      .then(() => {
        console.log('setCurrentProject ok!');
      })
      .catch((e) => {
        console.log('setCurrentProject failed: ', e);
      });
  }
}
