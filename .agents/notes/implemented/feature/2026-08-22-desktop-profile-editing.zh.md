# Agent Note: 桌面端与 UnieAI Copilot 的个人资料双向同步

Status: implemented

[English](2026-08-22-desktop-profile-editing.md) | 中文

## Problem

桌面端的「账户」分区从 `/auth/account` 取出用户名称，完全不画头像，而它的「个人资料」卡片则明写着这两者都在网页版更改。所有者希望个人资料可从桌面端编辑，且两侧显示同一份值。

读取所需的一切早已存在——设备码会话、只由 host 持有的 API key，以及由 `resolveIdentity` 守卫的 `/api/desktop/*` 路由。不存在的是：一条能把该 key 留在 host 上的写入路径、桌面端账号图景中任何位置的头像，以及产品桌面接口上根本没有的资料路由。

真正塑造设计的约束是 `copilot-v2` 只能新增：既有的 `app/api/user/profile/route.ts` 拥有那套校验规则并把它们保持为模块私有，因此无法导入。

## Decision

**产品新增一条纯增量路由。** `app/api/desktop/profile`（`GET`/`PATCH`）建立在 `lib/desktop/profile.ts` 之上，沿用 `lib/desktop/usage.ts` 立下的做法：把浏览器路由的规则逐字抄进一个模块，并逐条说明它是抄件、以及为什么不得偏离。头像的存储就是同一个存储——`user_photos.image`，每用户一行，text 列中的 `data:` URL——因此没有为图片发明任何新去处，在任一侧设置的照片就是另一侧显示的照片。

被抄写的规则正是浏览器路由的规则：名称去掉首尾空白后必填，且**没有**长度上限；非空图片必须匹配一个受支持的 MIME 类型**或**一个受支持的扩展名，必须确实声明它所宣称的 MIME 类型，且必须是 `data:` URL；并且**没有**字节上限，因为那条路由也没有。`image` 保留三种可分的意图——字符串设置、`null` 清除、缺失则不动——桌面端三者都依赖：把缺失并入 null 会在每次只改名称的保存中删掉头像。

**写入走读取的路径，方向相同。** `packages/unieai/web-gate` 新增 `GET`/`POST /auth/profile`，建立在 `src/profile.ts` 之上。浏览器向自己的源发起请求，host 解析会话并花费 API key，而该 key 不出现在任何答复中——这正是 `/auth/account` 已有的性质，且测试是对整段序列化正文检查，而不是只检查它预期存在的字段。产品接受的保存之后会有一次回读，因此页面被告知的是存下的内容，而不是它请求的内容。`fetchAccountSnapshot` 也加上了同一次资料调用，`user.avatarUrl` 现在正来自那里；`/api/desktop/me` 不回报照片。

host 自己加的唯一规则是请求体 12 MiB 的缓冲上限，且被记录为传输限制而非校验规则，因为产品不限制图片大小。

**网关新增 `saveProfile`，契约也随之新增这道缝。** `UnieAiAccountGateway` 现在是 `getSnapshot`/`subscribe` 加 `signIn`/`signOut`/`saveProfile`。`saved` 意味着已发布的快照就携带存下的值，因为网关在作答前重新读取了 `/auth/account`——因此分区从不把自己的编辑并入它正在绘制的账号。头像属于状态键的一部分，否则只更换照片的保存将什么也不发布。

`UnieAiProfileSaveResult` 刻意**不**携带信息文本。契约中其余由供给方拥有的字符串命名的都是只有供给方才知道的事物——一项额度、一个方案、账号为何无法读取。保存失败则是分区自身表单文案中的一行，把同一个表单的措辞拆到两个包里必然导致漂移。

**表单复刻参考实现，且不保存它所编辑内容的任何副本。** `ProfileForm` 与 `AvatarEditorDialog` 在结构与文案上都遵循 `copilot-v2/components/settings/profile-form.tsx`，文案逐字取自该产品 `Settings` 消息在四种随附语言中的原文。字段与头像都回退到正在渲染的账号，只有真正做出的编辑才会覆盖它们；因此无论保存落在何处，快照一动即被采纳，也没有任何本地副本能与之相左。

裁切之所以被复刻，是因为它并非装饰：头像以 base64 内联传输并存储，未经裁切的手机照片会把数 MB 写进账号行，并在两侧此后的每次读取中重复传输。除动图 GIF 之外的一切都变成中心裁切的 512px PNG；GIF 整份透传，因为经画布重新编码只会留下其中一帧。

Tailwind 被解析成取值而非照抄：`border-zinc-200`／`white/10` 变成 `--dsw-alias-border-l2`，`text-zinc-400` 变成 `--dsw-alias-label-tertiary`，头像底板变成 `--dsw-alias-bg-module-platform`。样式表不写任何字面颜色。

## Alternatives considered

**在浏览器或 host 上做校验。** 二者因同一个理由被否决：合法的名称与合法的头像由产品定义，再写一份规则只会做出不同的判断。唯一的本地检查是空白名称，因为该字段必填，不经往返就地告知更快——产品仍然会拒绝它。

**转发产品的拒绝原因。** `app/api/desktop/profile` 以面向直接调用方的英文说明拒绝（`Name is required`、`Unsupported avatar format`）。只有浏览器知道读者的语言，因此表单对任何拒绝都显示参考实现自己的「更新失败，请稍后再试」。若要像 `/auth/providers` 那样转发结构化原因码，需要产品先发布一套。

**仅凭 `PATCH` 的响应作答。** 它携带名称与图片，却不含邮箱地址，页面会收到一份残缺的资料。回读只多花一次调用，却能把产品实际保留的内容交给页面。

**加一个「移除头像」控件。** 参考表单没有，因此本表单也没有。缝与 host 路由都能表达清除（`image: null`），因为那是产品自身路由划出的区分；而按钮会是它唯一的消费者。

## Consequences

- 一次资料保存要花两次产品调用，`/auth/account` 现在发出四次而非三次。
- 头像在每次账号读取时都内联重传。512px 裁切正是把它压到几百 KB 的原因。
- 不提供 2D 绘图上下文的文档无法产出那个正方形；对话框会回报头像保存失败，而不是把未裁切的原图存下。
- `copilot-v2` 那一半是纯增量的，但**尚未部署**——面对任何早于 `app/api/desktop/profile` 的部署，桌面端的资料路由都会回答 `failed`，这与产品不肯描述账号时的姿态相同。
