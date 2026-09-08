# 增加报表：能耗报表 (节能日 & 非节能日)，细节待思考。

# 报警：管理员可以配置报警规则，用Rule来实现。

# 添加设备

```angular2html
添加DTU设备，怎么验证？物联网卡不支持短信功能，需要插实名认证的手机卡才行。
好像没法验证。
```

步骤：
## 1、添加DTU
## 2、配置DTU

先设计交互界面，再实现接口，再实现web和android。

# Modbus设备映射新思路

## 1. 将Modbus定义的设备，映射成选中设备的一个子设备。

## 2. 设备的添加、删除操作都在 service-matrix。

## 3. 映射后的设备，将自动创建一个产品定义出来，仅这个项目使用。

  * deviceType 中的 ns: modbus-virtual (modbus虚拟出来的设备)
  * deviceType 中的 vendor：父设备DID
  * deviceType 中的 model: 使用 Modbus定义的ID
  * 设备描述：Modbus定义的设备描述。
  * 设备功能定义: 一堆 Action
    * action的代码：随便，比如a0,a1,a2。
    * action的描述：功能名称。
    * 请求：Modbus定义生成的命令。
    * 返回值
      * 读操作：根据Modbus定义来解析。
      * 写操作：Modbus通用写操作的返回值。
