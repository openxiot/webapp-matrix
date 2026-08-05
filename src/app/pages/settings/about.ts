import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzIconModule } from 'ng-zorro-antd/icon';
import pkg from '../../../../package.json';

@Component({
  selector: 'app-about',
  imports: [NzButtonModule, NzCardModule, NzIconModule],
  templateUrl: './about.html',
  styleUrl: './about.less',
})
export class About {
  version: string = pkg.version;

  constructor(private router: Router) {}

  routerBack() {
    this.router.navigate(['/settings']);
  }
}
