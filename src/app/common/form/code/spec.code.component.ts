import {Component, EventEmitter, Input, Output, signal} from '@angular/core';
import {ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule} from '@angular/forms';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzTooltipModule} from 'ng-zorro-antd/tooltip';
import {NzIconModule} from 'ng-zorro-antd/icon';
import {NzTagModule} from 'ng-zorro-antd/tag';
import {LifeCycle} from "@openxiot/xiot-core-spec-ts";

@Component({
  selector: 'spec-code',
  templateUrl: './spec.code.component.html',
  styleUrl: './spec.code.component.less',
  standalone: true,
  imports: [
    NzButtonModule,
    NzInputModule,
    NzTooltipModule,
    NzIconModule,
    NzTagModule,
    FormsModule,
    ReactiveFormsModule
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: SpecCodeComponent,
      multi: true
    }
  ]
})
export class SpecCodeComponent implements ControlValueAccessor {

  protected readonly LifeCycle = LifeCycle;

  @Input() updatable: boolean = false;
  @Input() lifecycle: LifeCycle = LifeCycle.DEVELOPMENT;
  @Output() changed: EventEmitter<void> = new EventEmitter<void>();

  // 组件内部维护的值
  private _value = signal<string>('');

  // 禁用状态
  isDisabled = false;

  // 定义变化回调和触摸回调
  onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  constructor(
  ) {
  }

  // 获取当前值
  get value(): string {
    return this._value();
  }

  // 设置当前值，并通知外部变化
  set value(val: string) {
    if (val !== this._value()) {
      this._value.set(val);
      this.onChange(val); // 重要：通知外部表单值已变化
      this.changed.emit();
    }
    this.onTouched(); // 标记为已触摸
  }

  // --- ControlValueAccessor 接口方法 ---

  // 外部程序设置表单值（如 patchValue、setValue）时，Angular 会调用此方法
  writeValue(obj: any): void {
    if (obj !== undefined && obj !== null && obj !== this._value()) {
      this._value.set(obj);
    }
  }

  // 注册变化回调：Angular 提供给你一个函数，当内部值变化时，你需要调用它来通知外部
  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  // 注册触摸回调：Angular 提供给你一个函数，当组件被触摸（如blur）时，你需要调用它
  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  // 当表单控件的禁用状态变更时（如调用 control.disable()），Angular 会调用此方法
  setDisabledState?(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
  }
}
