import { Provider } from '@angular/core';
import { NZ_ICONS } from 'ng-zorro-antd/icon';

import {
  ApartmentOutline, AppstoreOutline, InboxOutline, UserOutline,
  TeamOutline, SettingOutline, EditOutline, DeleteOutline,
  PlusOutline, CheckCircleFill, RightOutline, LeftOutline,
  MoonOutline, SunOutline, InfoCircleOutline, LogoutOutline,
  SwapOutline, UserAddOutline, AccountBookOutline,
  GithubFill, ShoppingCartOutline, ControlOutline, PoweroffOutline,
  BankOutline, BuildOutline, BarsOutline, BorderInnerOutline,
  EnvironmentOutline, FolderOutline, CloseOutline,
  SearchOutline, MenuOutline, HomeOutline, DownOutline,
  UpOutline, ReloadOutline, QrcodeOutline,
  MenuFoldOutline, MenuUnfoldOutline,
} from '@ant-design/icons-angular/icons';

const icons = [
  ApartmentOutline, AppstoreOutline, InboxOutline, UserOutline,
  TeamOutline, SettingOutline, EditOutline, DeleteOutline,
  PlusOutline, CheckCircleFill, RightOutline, LeftOutline,
  MoonOutline, SunOutline, InfoCircleOutline, LogoutOutline,
  SwapOutline, UserAddOutline, AccountBookOutline,
  GithubFill, ShoppingCartOutline, ControlOutline, PoweroffOutline,
  BankOutline, BuildOutline, BarsOutline, BorderInnerOutline,
  EnvironmentOutline, FolderOutline, CloseOutline,
  SearchOutline, MenuOutline, HomeOutline, DownOutline,
  UpOutline, ReloadOutline, QrcodeOutline,
  MenuFoldOutline, MenuUnfoldOutline,
];

export function provideNzIcons(): Provider {
  return {
    provide: NZ_ICONS,
    useValue: icons,
  };
}
