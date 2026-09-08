
// 给可变参数做标记，方便删除
export class ArgValue {

  constructor(
    public key: number = 0,
    public removable: boolean = true,
    public value: any = {},
  ) {
  }
}
