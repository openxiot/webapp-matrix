import { Component, OnInit, signal } from '@angular/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzStepsModule } from 'ng-zorro-antd/steps';
import { NzSpaceModule } from 'ng-zorro-antd/space';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import {
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Location } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AccountService } from '@app/service/account.service';
import { BreadcrumbTranslateDirective } from '@app/common/components/breadcrumb/breadcrumb-translate.directive';
import { SpaceEntity } from '@app/typedef/define/space/SpaceEntity';
import { MatrixService } from '@app/service/matrix.service';

@Component({
  selector: 'projects-create',
  standalone: true,
  templateUrl: './project.create.component.html',
  styleUrl: './project.create.component.less',
  imports: [
    NzPageHeaderModule,
    NzBreadCrumbModule,
    NzSpinModule,
    NzCardModule,
    NzButtonModule,
    NzCheckboxModule,
    NzFormModule,
    NzInputModule,
    NzStepsModule,
    NzSpaceModule,
    NzDividerModule,
    ReactiveFormsModule,
    TranslatePipe,
    BreadcrumbTranslateDirective,
  ],
})
export class ProjectCreateComponent implements OnInit {
  loading = signal(false);

  form: FormGroup<{
    name: FormControl<string>;
  }>;

  constructor(
    protected location: Location,
    private account: AccountService,
    private fb: NonNullableFormBuilder,
    private msg: NzMessageService,
    private service: MatrixService,
    private translate: TranslateService,
  ) {
    this.form = this.fb.group({
      name: this.fb.control('', [Validators.required]),
    });
  }

  ngOnInit() {}

  protected submitForm() {
    if (this.form.invalid) {
      return;
    }

    this.loading.set(true);

    // 项目 = 根空间：name + type=site，parentId 留空（服务端据此判断为根空间）
    const space = new SpaceEntity();
    space.name = this.form.controls.name.value.trim();
    space.type = 'site';
    space.parentId = '';
    space.sortOrder = 0;

    this.service.createSpace(space).subscribe({
      next: (created) => {
        this.loading.set(false);
        this.account.setCurrentProject(created);
        this.msg.success(this.translate.instant('创建项目成功'));
        this.location.back();
      },
      error: (error) => {
        this.msg.warning(error);
        this.loading.set(false);
      },
    });
  }
}
